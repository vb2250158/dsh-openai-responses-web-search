import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, mapResponse, OPENAI_RESPONSES_WEB_SEARCH_PROVIDER_ID, resolveConfig } from '../lib/index.js'

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
      web: { registerSearchProvider(value) { provider = value; return () => {} } },
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
