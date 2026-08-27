import z from '@deepseek-ai/schemastery'

export const name = 'openai-responses-web-search'
export const inject = ['web']
export const OPENAI_RESPONSES_WEB_SEARCH_PROVIDER_ID = 'openai-responses'

export const Config = z.object({
  baseURL: z.string(),
  apiKeyEnv: z.string().default('OPENAI_API_KEY'),
  model: z.string().default('gpt-5.6-luna'),
})

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gu

function providerError(message, code, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.code = code
  return error
}

/** Validate the provider configuration at plugin load. */
export function resolveConfig(config = {}) {
  const baseURL = String(config.baseURL || '').replace(/\/+$/u, '')
  if (!URL.canParse(baseURL)) throw providerError('OpenAI Responses web search baseURL must be an absolute URL', 'WEB_PROVIDER_ERROR')
  const apiKeyEnv = String(config.apiKeyEnv || 'OPENAI_API_KEY').trim()
  if (apiKeyEnv === '') throw providerError('OpenAI Responses web search apiKeyEnv must be non-empty', 'WEB_PROVIDER_ERROR')
  const model = String(config.model || 'gpt-5.6-luna').trim()
  if (model === '') throw providerError('OpenAI Responses web search model must be non-empty', 'WEB_PROVIDER_ERROR')
  return Object.freeze({ baseURL, apiKeyEnv, model })
}

function addSource(sources, seen, url, title) {
  if (typeof url !== 'string' || url.length === 0 || seen.has(url)) return
  try {
    new URL(url)
  } catch {
    return
  }
  seen.add(url)
  sources.push({ url, ...(typeof title === 'string' && title.length > 0 ? { title } : {}) })
}

function stripTrailingUrlPunctuation(url) {
  return url.replace(/[),.!?:;\]}]+$/u, '')
}

/** Convert one OpenAI Responses payload into DSH web search output. */
export function mapResponse(payload) {
  const sources = []
  const seen = new Set()
  const texts = []
  const output = Array.isArray(payload?.output) ? payload.output : []

  for (const item of output) {
    if (item?.type === 'web_search_call' && Array.isArray(item.action?.sources)) {
      for (const source of item.action.sources) addSource(sources, seen, source?.url, source?.title)
    }
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (content?.type !== 'output_text' || typeof content.text !== 'string') continue
      texts.push(content.text)
      if (Array.isArray(content.annotations)) {
        for (const annotation of content.annotations) {
          if (annotation?.type === 'url_citation') addSource(sources, seen, annotation.url, annotation.title)
        }
      }
    }
  }

  const content = texts.join('\n\n')
  if (sources.length === 0) {
    for (const match of content.matchAll(URL_PATTERN)) addSource(sources, seen, stripTrailingUrlPunctuation(match[0]), undefined)
  }
  if (content.length === 0) throw providerError('OpenAI Responses web search returned no response content', 'WEB_PROVIDER_ERROR')
  return { content, sources, truncated: false }
}

/** Register a configurable OpenAI Responses web search provider. */
export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  ctx.web.registerSearchProvider({
    id: OPENAI_RESPONSES_WEB_SEARCH_PROVIDER_ID,
    available: () => ctx.get('credentials') !== undefined,
    async search(request, signal) {
      const credentials = ctx.get('credentials')
      const credential = credentials === undefined ? undefined : await credentials.resolve(resolved.apiKeyEnv)
      if (credential === undefined) {
        throw providerError(`OpenAI Responses web search has no API key for "${resolved.apiKeyEnv}"`, 'WEB_PROVIDER_CREDENTIAL_MISSING')
      }

      let response
      try {
        response = await fetch(`${resolved.baseURL}/responses`, {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${credential.value}`,
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: resolved.model,
            tools: [{ type: 'web_search' }],
            include: ['web_search_call.action.sources'],
            input: `Search the web for the following query. Return a concise factual answer with source URLs: ${request.query}`,
          }),
          ...(signal === undefined ? {} : { signal }),
        })
      } catch (error) {
        if (signal?.aborted === true || error instanceof DOMException && error.name === 'AbortError') {
          throw providerError('OpenAI Responses web search aborted', 'WEB_ABORTED', error)
        }
        throw providerError(`OpenAI Responses web search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', error)
      }

      if (!response.ok) {
        let message = `OpenAI Responses API error (HTTP ${response.status})`
        try {
          const payload = await response.json()
          const detail = payload?.error?.message ?? payload?.error ?? payload?.message
          if (typeof detail === 'string' && detail.length > 0) message = detail
        } catch (error) {
          if (signal?.aborted === true || error instanceof DOMException && error.name === 'AbortError') {
            throw providerError('OpenAI Responses web search aborted', 'WEB_ABORTED', error)
          }
        }
        throw providerError(message, 'WEB_PROVIDER_ERROR')
      }

      try {
        return mapResponse(await response.json())
      } catch (error) {
        if (signal?.aborted === true || error instanceof DOMException && error.name === 'AbortError') {
          throw providerError('OpenAI Responses web search aborted', 'WEB_ABORTED', error)
        }
        throw providerError(`OpenAI Responses web search returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', error)
      }
    },
  })
}
