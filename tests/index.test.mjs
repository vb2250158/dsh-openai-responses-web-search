import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, mapResponse, OPENAI_RESPONSES_WEB_SEARCH_PROVIDER_ID, resolveConfig } from '../lib/index.js'

test('model-native routes simultaneous Grok and Codex initiators without contacting the fallback', async () => {
  const providers = new Map()
  let initiating = { provider: 'grok', model: 'grok-4.7' }
  const calls = []
  const ctx = {
    web: { registerSearchProvider(p) { providers.set(p.id, p) } },
    get(name) {
      if (name === 'agents') return { currentInitiator: () => ({ session: { requestContext: () => initiating } }) }
      if (name === 'subscriptionWebSearch') return { search: async (...args) => { calls.push(args); return { sources: [], content: args[0], truncated: false } } }
      throw new Error('fallback must not resolve credentials')
    },
  }
  apply(ctx, { baseURL: 'https://api.example.test/v1' })
  const router = providers.get('model-native')
  const grok = router.search({ query: 'grok query' })
  initiating = { provider: 'codex', model: 'gpt-6.1-sol' }
  const codex = router.search({ query: 'codex query' })
  assert.deepEqual((await Promise.all([grok, codex])).map(r => r.content), ['grok', 'codex'])
  assert.deepEqual(calls.map(c => c.slice(0, 2)), [['grok', 'grok-4.7'], ['codex', 'gpt-6.1-sol']])
})

test('HTTP 502 keeps status and service context even with an empty or invalid body', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 502 })
  let provider
  try {
    apply({ web: { registerSearchProvider(p) { if (p.id === 'openai-responses') provider = p } }, get: () => ({ resolve: async () => ({ value: 'fixture-key' }) }) }, { baseURL: 'https://api.example.test/v1' })
    await assert.rejects(provider.search({ query: 'fixture' }), error => error.code === 'WEB_PROVIDER_ERROR' && /HTTP 502/.test(error.message) && /gateway/i.test(error.message) && /api.example.test/.test(error.message))
  } finally { globalThis.fetch = previousFetch }
})

test('a missing native service fails explicitly without switching to another account or gateway', async () => {
  const providers = new Map()
  apply({ web: { registerSearchProvider(p) { providers.set(p.id, p) } }, get(name) {
    if (name === 'agents') return { currentInitiator: () => ({ session: { requestContext: () => ({ provider: 'grok', model: 'grok-4.7' }) } }) }
    return undefined
  } }, { baseURL: 'https://api.example.test/v1' })
  await assert.rejects(providers.get('model-native').search({ query: 'fixture' }), { code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
})

test('a failed gateway tries configured subscriptions in order and keeps the successful result', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 502 })
  const providers = new Map()
  const calls = []
  try {
    apply({ web: { registerSearchProvider(p) { providers.set(p.id, p) } }, get(name) {
      if (name === 'agents') return { currentInitiator: () => ({ session: { requestContext: () => ({ provider: 'opencode', model: 'deepseek-v4' }) } }) }
      if (name === 'credentials') return { resolve: async () => ({ value: 'fixture' }) }
      if (name === 'subscriptionWebSearch') return { async search(provider, model) {
        calls.push([provider, model])
        if (provider === 'codex') throw Object.assign(new Error('unavailable'), { code: 'WEB_PROVIDER_ERROR' })
        return { sources: [{ url: 'https://example.test' }], truncated: false }
      } }
    } }, { baseURL: 'https://api.example.test/v1', fallbackSearches: [{ provider: 'codex', model: 'codex-model' }, { provider: 'grok', model: 'grok-model' }] })
    assert.deepEqual((await providers.get('model-native').search({ query: 'fixture' })).sources, [{ url: 'https://example.test' }])
    assert.deepEqual(calls, [['codex', 'codex-model'], ['grok', 'grok-model']])
  } finally { globalThis.fetch = previousFetch }
})

test('cancellation and unexpected defects do not trigger fallback', async () => {
  for (const error of [Object.assign(new Error('cancelled'), { code: 'WEB_ABORTED' }), new TypeError('bug')]) {
    const providers = new Map()
    let calls = 0
    apply({ web: { registerSearchProvider(p) { providers.set(p.id, p) } }, get(name) {
      if (name === 'agents') return { currentInitiator: () => ({ session: { requestContext: () => ({ provider: 'grok', model: 'grok-model' }) } }) }
      if (name === 'subscriptionWebSearch') return { search: async () => { calls++; throw error } }
    } }, { baseURL: 'https://api.example.test', fallbackSearches: [{ provider: 'codex', model: 'codex-model' }] })
    await assert.rejects(providers.get('model-native').search({ query: 'fixture' }), error)
    assert.equal(calls, 1)
  }
})

test('native failure falls back once per provider and reports all failures', async () => {
  const providers = new Map()
  const calls = []
  apply({ web: { registerSearchProvider(p) { providers.set(p.id, p) } }, get(name) {
    if (name === 'agents') return { currentInitiator: () => ({ session: { requestContext: () => ({ provider: 'grok', model: 'original' }) } }) }
    if (name === 'subscriptionWebSearch') return { search: async (provider, model) => {
      calls.push([provider, model])
      throw Object.assign(new Error('unavailable'), { code: 'WEB_PROVIDER_ERROR' })
    } }
  } }, { baseURL: 'https://api.example.test', fallbackSearches: [{ provider: 'grok', model: 'other' }, { provider: 'codex', model: 'codex-model' }] })
  await assert.rejects(providers.get('model-native').search({ query: 'fixture' }), error =>
    error.code === 'WEB_PROVIDER_ERROR' && error.cause instanceof AggregateError && error.cause.errors.length === 2)
  assert.deepEqual(calls, [['grok', 'original'], ['codex', 'codex-model']])
})

test('a timed-out search gives the next provider its own budget', async () => {
  const providers = new Map()
  const calls = []
  apply({ web: { registerSearchProvider(p) { providers.set(p.id, p) } }, get(name) {
    if (name === 'agents') return { currentInitiator: () => ({ session: { requestContext: () => ({ provider: 'grok', model: 'grok-model' }) } }) }
    if (name === 'subscriptionWebSearch') return { search: async (provider, _model, _request, signal) => {
      calls.push(provider)
      if (provider === 'grok') return await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 1000)
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('aborted'), { code: 'WEB_ABORTED' })) }, { once: true })
      })
      assert.equal(signal.aborted, false)
      return { sources: [{ url: 'https://example.test' }], truncated: false }
    } }
  } }, { baseURL: 'https://api.example.test', attemptTimeoutMs: 10, fallbackSearches: [{ provider: 'codex', model: 'codex-model' }] })
  assert.equal((await providers.get('model-native').search({ query: 'fixture' })).sources.length, 1)
  assert.deepEqual(calls, ['grok', 'codex'])
})

test('outer cancellation stops a pending attempt without invoking fallback', async () => {
  const providers = new Map()
  let calls = 0
  const controller = new AbortController()
  apply({ web: { registerSearchProvider(p) { providers.set(p.id, p) } }, get(name) {
    if (name === 'agents') return { currentInitiator: () => ({ session: { requestContext: () => ({ provider: 'grok', model: 'grok-model' }) } }) }
    if (name === 'subscriptionWebSearch') return { search: async (_provider, _model, _request, signal) => {
      calls++
      return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    } }
  } }, { baseURL: 'https://api.example.test', fallbackSearches: [{ provider: 'codex', model: 'codex-model' }] })
  const pending = providers.get('model-native').search({ query: 'fixture' }, controller.signal)
  controller.abort()
  await assert.rejects(pending, { code: 'WEB_ABORTED' })
  assert.equal(calls, 1)
})

test('validates and normalizes deployment configuration', () => {
  assert.deepEqual(resolveConfig({ baseURL: 'https://api.example.test/v1/' }), {
    baseURL: 'https://api.example.test/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    model: 'gpt-5.6-luna',
  })
  assert.throws(() => resolveConfig({ baseURL: '' }), /absolute URL/)
  assert.throws(() => resolveConfig({ baseURL: 'https://api.example.test', apiKeyEnv: ' ' }), /apiKeyEnv/)
})

test('maps annotations and explicit fallback URLs without inventing sources', () => {
  assert.deepEqual(mapResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer', annotations: [{ type: 'url_citation', url: 'https://example.test/a', title: 'A' }] }] }] }), {
    content: 'Answer',
    sources: [{ url: 'https://example.test/a', title: 'A' }],
    truncated: false,
  })
  assert.deepEqual(mapResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'See https://example.test/b.' }] }] }).sources, [{ url: 'https://example.test/b' }])
})

test('registers the provider and resolves credentials for each search', async () => {
  let provider
  let request
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    request = { url, init }
    return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Found', annotations: [] }] }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const ctx = {
      web: { registerSearchProvider(value) { if (value.id === OPENAI_RESPONSES_WEB_SEARCH_PROVIDER_ID) provider = value; return () => {} } },
      get(name) {
        assert.equal(name, 'credentials')
        return { resolve: async key => key === 'SEARCH_API_KEY' ? { value: 'test-key' } : undefined }
      },
    }
    apply(ctx, { baseURL: 'https://api.example.test/v1', apiKeyEnv: 'SEARCH_API_KEY', model: 'search-model' })
    assert.equal(provider.id, OPENAI_RESPONSES_WEB_SEARCH_PROVIDER_ID)
    assert.equal(provider.available(), true)
    assert.deepEqual(await provider.search({ query: 'DSH plugins' }), { content: 'Found', sources: [], truncated: false })
    assert.equal(request.url, 'https://api.example.test/v1/responses')
    assert.equal(request.init.headers.authorization, 'Bearer test-key')
    assert.deepEqual(JSON.parse(request.init.body).tools, [{ type: 'web_search' }])
  } finally {
    globalThis.fetch = previousFetch
  }
})
