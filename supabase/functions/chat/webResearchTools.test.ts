import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  buildNativeWebTools,
  findFailedNativeSearches,
  NATIVE_WEB_FETCH_TOOL_DEF,
  NATIVE_WEB_SEARCH_TOOL_DEF,
} from './webResearchTools.ts'

// ─── buildNativeWebTools ────────────────────────────────────────────────────

Deno.test('buildNativeWebTools — returns web_search native def when declared', () => {
  const tools = buildNativeWebTools(['web_search'])
  assertEquals(tools, [NATIVE_WEB_SEARCH_TOOL_DEF])
  assertEquals(tools[0].type, 'web_search_20250305')
  assertEquals(tools[0].name, 'web_search')
})

Deno.test('buildNativeWebTools — returns web_fetch native def when declared', () => {
  const tools = buildNativeWebTools(['web_fetch'])
  assertEquals(tools, [NATIVE_WEB_FETCH_TOOL_DEF])
  assertEquals(tools[0].type, 'web_fetch_20250910')
  assertEquals(tools[0].name, 'web_fetch')
})

Deno.test('buildNativeWebTools — returns both when both declared', () => {
  const tools = buildNativeWebTools(['web_search', 'web_fetch'])
  assertEquals(tools.length, 2)
  assert(tools.some((t) => t.type === 'web_search_20250305'))
  assert(tools.some((t) => t.type === 'web_fetch_20250910'))
})

Deno.test('buildNativeWebTools — returns empty array when neither declared', () => {
  const tools = buildNativeWebTools(['list_github_repos', 'create_github_issue'])
  assertEquals(tools, [])
})

Deno.test('buildNativeWebTools — accepts a Set as input', () => {
  const tools = buildNativeWebTools(new Set(['web_search']))
  assertEquals(tools.length, 1)
  assertEquals(tools[0].type, 'web_search_20250305')
})

// ─── findFailedNativeSearches ───────────────────────────────────────────────

Deno.test('findFailedNativeSearches — returns empty when no web_search_tool_result blocks', () => {
  const content = [
    { type: 'text', text: 'hello' },
    { type: 'tool_use', id: 't1', name: 'fetch_url', input: { url: 'https://x.com' } },
  ]
  assertEquals(findFailedNativeSearches(content), [])
})

Deno.test('findFailedNativeSearches — flags zero-result web_search_tool_result', () => {
  const content = [
    { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: { query: 'foo' } },
    { type: 'web_search_tool_result', tool_use_id: 'srv1', content: [] },
  ]
  const failures = findFailedNativeSearches(content)
  assertEquals(failures.length, 1)
  assertEquals(failures[0].tool_use_id, 'srv1')
  assertEquals(failures[0].query, 'foo')
  assertEquals(failures[0].reason, 'no_results')
})

Deno.test('findFailedNativeSearches — flags errored web_search_tool_result', () => {
  const content = [
    { type: 'server_tool_use', id: 'srv2', name: 'web_search', input: { query: 'bar' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'srv2',
      content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
    },
  ]
  const failures = findFailedNativeSearches(content)
  assertEquals(failures.length, 1)
  assertEquals(failures[0].query, 'bar')
  assertEquals(failures[0].reason, 'error')
})

Deno.test('findFailedNativeSearches — does not flag successful results', () => {
  const content = [
    { type: 'server_tool_use', id: 'srv3', name: 'web_search', input: { query: 'baz' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'srv3',
      content: [
        { type: 'web_search_result', url: 'https://example.com', title: 'Example' },
      ],
    },
  ]
  assertEquals(findFailedNativeSearches(content), [])
})

Deno.test('findFailedNativeSearches — handles multiple searches mixed', () => {
  const content = [
    { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'q1' } },
    { type: 'server_tool_use', id: 's2', name: 'web_search', input: { query: 'q2' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 's1',
      content: [{ type: 'web_search_result', url: 'u', title: 't' }],
    },
    { type: 'web_search_tool_result', tool_use_id: 's2', content: [] },
  ]
  const failures = findFailedNativeSearches(content)
  assertEquals(failures.length, 1)
  assertEquals(failures[0].query, 'q2')
})

Deno.test('findFailedNativeSearches — tolerates missing query metadata', () => {
  const content = [
    { type: 'web_search_tool_result', tool_use_id: 'orphan', content: [] },
  ]
  const failures = findFailedNativeSearches(content)
  assertEquals(failures.length, 1)
  assertEquals(failures[0].query, '')
  assertEquals(failures[0].reason, 'no_results')
})

Deno.test('findFailedNativeSearches — tolerates non-array input', () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(findFailedNativeSearches(null as any), [])
  // deno-lint-ignore no-explicit-any
  assertEquals(findFailedNativeSearches(undefined as any), [])
  // deno-lint-ignore no-explicit-any
  assertEquals(findFailedNativeSearches('not an array' as any), [])
})
