// Pure helpers for Anthropic native server-side web research tools
// (`web_search_20250305` and `web_fetch_20250910`).
//
// The executor and selected-agent branches use `buildNativeWebTools` to inject
// these tool definitions into the Anthropic request when the agent declares
// the matching client-side tool ids (`web_search` / `web_fetch`).
//
// After receiving a response, `findFailedNativeSearches` scans the content
// blocks for `web_search_tool_result` blocks that came back empty or with an
// error code, returning the original query so the caller can fall back to the
// Tavily client-side handler.
//
// deno-lint-ignore-file no-explicit-any

export interface NativeToolDef {
  type: string
  name: string
}

export const NATIVE_WEB_SEARCH_TOOL_DEF: NativeToolDef = {
  type: 'web_search_20250305',
  name: 'web_search',
}

export const NATIVE_WEB_FETCH_TOOL_DEF: NativeToolDef = {
  type: 'web_fetch_20250910',
  name: 'web_fetch',
}

export function buildNativeWebTools(declaredIds: Iterable<string>): NativeToolDef[] {
  const set = declaredIds instanceof Set
    ? (declaredIds as Set<string>)
    : new Set(declaredIds)
  const tools: NativeToolDef[] = []
  if (set.has('web_search')) tools.push({ ...NATIVE_WEB_SEARCH_TOOL_DEF })
  if (set.has('web_fetch')) tools.push({ ...NATIVE_WEB_FETCH_TOOL_DEF })
  return tools
}

export type FailureReason = 'no_results' | 'error'

export interface FailedNativeSearch {
  tool_use_id: string
  query: string
  reason: FailureReason
}

export function findFailedNativeSearches(content: any[]): FailedNativeSearch[] {
  if (!Array.isArray(content)) return []

  // First pass: index server_tool_use blocks so we can recover the query that
  // triggered each web_search_tool_result.
  const queries = new Map<string, string>()
  for (const b of content) {
    if (
      b &&
      b.type === 'server_tool_use' &&
      b.name === 'web_search' &&
      typeof b.id === 'string' &&
      b.input &&
      typeof b.input.query === 'string'
    ) {
      queries.set(b.id, b.input.query)
    }
  }

  const failures: FailedNativeSearch[] = []
  for (const b of content) {
    if (!b || b.type !== 'web_search_tool_result' || typeof b.tool_use_id !== 'string') {
      continue
    }
    const query = queries.get(b.tool_use_id) ?? ''
    const c = b.content
    if (Array.isArray(c)) {
      if (c.length === 0) {
        failures.push({ tool_use_id: b.tool_use_id, query, reason: 'no_results' })
      }
      continue
    }
    if (
      c &&
      typeof c === 'object' &&
      (c.type === 'web_search_tool_result_error' || typeof c.error_code === 'string')
    ) {
      failures.push({ tool_use_id: b.tool_use_id, query, reason: 'error' })
    }
  }
  return failures
}
