import {
  assert,
  assertEquals,
  assertExists,
  assertStringIncludes,
} from 'jsr:@std/assert@1'
import {
  _renderHtmlInternals,
  describeUnavailableReason,
  getAvailableTools,
  runStep,
  setCreateAdminClientForTests,
  TOOL_HANDLERS,
} from './executor.ts'

interface MockCall {
  url: string
  init?: RequestInit
}

function installFetchMock(
  responder: (call: MockCall) => Response | Promise<Response>,
): { calls: MockCall[]; restore: () => void } {
  const calls: MockCall[] = []
  const original = globalThis.fetch
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    const call: MockCall = { url, init }
    calls.push(call)
    return await responder(call)
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function withGithubToken(token: string | null): () => void {
  const previous = Deno.env.get('GITHUB_TOKEN')
  if (token === null) {
    Deno.env.delete('GITHUB_TOKEN')
  } else {
    Deno.env.set('GITHUB_TOKEN', token)
  }
  return () => {
    if (previous === undefined) {
      Deno.env.delete('GITHUB_TOKEN')
    } else {
      Deno.env.set('GITHUB_TOKEN', previous)
    }
  }
}

function withEnv(key: string, value: string | null): () => void {
  const previous = Deno.env.get(key)
  if (value === null) Deno.env.delete(key)
  else Deno.env.set(key, value)
  return () => {
    if (previous === undefined) Deno.env.delete(key)
    else Deno.env.set(key, previous)
  }
}

function makeCtx() {
  return {
    signal: new AbortController().signal,
    agentsContext: [],
    stepId: 0,
    toolCallId: 'test',
  }
}

// ─── list_github_repos ──────────────────────────────────────────────────────

Deno.test('list_github_repos — returns slim repos on happy path', async () => {
  const restoreToken = withGithubToken('tok')
  const { restore } = installFetchMock(() =>
    jsonResponse(200, [
      {
        name: 'agenthub',
        full_name: 'lucasfe/agenthub',
        description: 'AI hub',
        pushed_at: '2026-04-20T00:00:00Z',
        archived: false,
        fork: false,
        size: 1200,
        owner: { login: 'lucasfe' },
        default_branch: 'main',
      },
      {
        name: 'archived-thing',
        full_name: 'lucasfe/archived-thing',
        description: null,
        pushed_at: '2024-01-01T00:00:00Z',
        archived: true,
        fork: false,
        size: 500,
      },
      {
        name: 'fork-of-something',
        full_name: 'lucasfe/fork-of-something',
        description: null,
        pushed_at: '2025-01-01T00:00:00Z',
        archived: false,
        fork: true,
        size: 500,
      },
    ]),
  )
  try {
    const result = await TOOL_HANDLERS.list_github_repos({}, makeCtx())
    assert(result.ok)
    assertEquals(result.result, {
      repos: [
        {
          name: 'agenthub',
          full_name: 'lucasfe/agenthub',
          description: 'AI hub',
          pushed_at: '2026-04-20T00:00:00Z',
        },
      ],
    })
    assertStringIncludes(result.summary ?? '', '1 owned repo')
  } finally {
    restore()
    restoreToken()
  }
})

Deno.test('list_github_repos — returns missing-token error when GITHUB_TOKEN is unset', async () => {
  const restoreToken = withGithubToken(null)
  try {
    const result = await TOOL_HANDLERS.list_github_repos({}, makeCtx())
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'GITHUB_TOKEN')
    // Result payload carries the structured error code so the LLM can
    // reason about the failure in the same shape as other gated tools.
    assertEquals(
      (result.result as { error?: string } | undefined)?.error,
      'not_configured',
    )
  } finally {
    restoreToken()
  }
})

Deno.test('list_github_repos — surfaces upstream GitHub error', async () => {
  const restoreToken = withGithubToken('tok')
  const { restore } = installFetchMock(() =>
    jsonResponse(401, { message: 'Bad credentials' }),
  )
  try {
    const result = await TOOL_HANDLERS.list_github_repos({}, makeCtx())
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'Bad credentials')
  } finally {
    restore()
    restoreToken()
  }
})

// ─── create_github_issue ────────────────────────────────────────────────────

Deno.test('create_github_issue — returns { url, number } on happy path', async () => {
  const restoreToken = withGithubToken('tok')
  const { calls, restore } = installFetchMock(() =>
    jsonResponse(201, {
      html_url: 'https://github.com/lucasfe/agenthub/issues/99',
      number: 99,
    }),
  )
  try {
    const result = await TOOL_HANDLERS.create_github_issue(
      { repo: 'lucasfe/agenthub', title: 'Bug', body: 'Something broke' },
      makeCtx(),
    )
    assert(result.ok)
    assertEquals(result.result, {
      url: 'https://github.com/lucasfe/agenthub/issues/99',
      number: 99,
    })
    assertEquals(
      calls[0].url,
      'https://api.github.com/repos/lucasfe/agenthub/issues',
    )
    assertEquals(calls[0].init?.method, 'POST')
  } finally {
    restore()
    restoreToken()
  }
})

Deno.test('create_github_issue — returns missing-token error when GITHUB_TOKEN is unset', async () => {
  const restoreToken = withGithubToken(null)
  try {
    const result = await TOOL_HANDLERS.create_github_issue(
      { repo: 'lucasfe/agenthub', title: 'Bug', body: 'Body' },
      makeCtx(),
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'GITHUB_TOKEN')
    assertEquals(
      (result.result as { error?: string } | undefined)?.error,
      'not_configured',
    )
  } finally {
    restoreToken()
  }
})

Deno.test('create_github_issue — rejects empty repo before hitting GitHub', async () => {
  const restoreToken = withGithubToken('tok')
  let fetchCalled = false
  const { restore } = installFetchMock(() => {
    fetchCalled = true
    return jsonResponse(201, {})
  })
  try {
    const result = await TOOL_HANDLERS.create_github_issue(
      { repo: '', title: 'T', body: 'B' },
      makeCtx(),
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'repo')
    assertEquals(fetchCalled, false)
  } finally {
    restore()
    restoreToken()
  }
})

Deno.test('create_github_issue — rejects missing title', async () => {
  const restoreToken = withGithubToken('tok')
  const { restore } = installFetchMock(() => jsonResponse(201, {}))
  try {
    const result = await TOOL_HANDLERS.create_github_issue(
      { repo: 'lucasfe/agenthub', body: 'B' },
      makeCtx(),
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'title')
  } finally {
    restore()
    restoreToken()
  }
})

Deno.test('create_github_issue — rejects whitespace-only body', async () => {
  const restoreToken = withGithubToken('tok')
  const { restore } = installFetchMock(() => jsonResponse(201, {}))
  try {
    const result = await TOOL_HANDLERS.create_github_issue(
      { repo: 'lucasfe/agenthub', title: 'T', body: '   ' },
      makeCtx(),
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'body')
  } finally {
    restore()
    restoreToken()
  }
})

Deno.test('create_github_issue — surfaces upstream 422 validation error', async () => {
  const restoreToken = withGithubToken('tok')
  const { restore } = installFetchMock(() =>
    jsonResponse(422, { message: 'Validation Failed' }),
  )
  try {
    const result = await TOOL_HANDLERS.create_github_issue(
      { repo: 'lucasfe/agenthub', title: 'T', body: 'B' },
      makeCtx(),
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'Validation Failed')
  } finally {
    restore()
    restoreToken()
  }
})

// ─── runStep — native web_search/web_fetch wiring ───────────────────────────

const RESEARCHER_AGENT = {
  id: 'researcher',
  name: 'Researcher',
  content: 'You are a researcher. Use web_search to find information.',
  tools: ['web_search'],
  model: 'claude-sonnet-4-6',
}

const WEB_SEARCH_TOOL_META = {
  id: 'web_search',
  name: 'Web search',
  description: 'Search the web',
  input_schema: { type: 'object', properties: { query: { type: 'string' } } },
}

function makeStep(toolsUsed: string[]) {
  return {
    id: 1,
    agent_id: 'researcher',
    agent_name: 'Researcher',
    task: 'Find python web frameworks',
    tools_used: toolsUsed,
    inputs: ['original_task'],
  }
}

function findAnthropicCalls(calls: MockCall[]): MockCall[] {
  return calls.filter((c) => c.url === 'https://api.anthropic.com/v1/messages')
}

function getRequestBody(call: MockCall): any {
  return JSON.parse(call.init?.body as string)
}

Deno.test('runStep — injects native web_search_20250305 tool def when agent declares web_search', async () => {
  const restoreAnthropic = withEnv('ANTHROPIC_API_KEY', 'sk-test')
  const { calls, restore } = installFetchMock(() =>
    jsonResponse(200, {
      content: [{ type: 'text', text: 'done' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  )
  try {
    await runStep(
      makeStep(['web_search']),
      [RESEARCHER_AGENT],
      [WEB_SEARCH_TOOL_META],
      'context',
      {},
      () => {},
      'sk-test',
      new AbortController().signal,
    )
    const anthropicCalls = findAnthropicCalls(calls)
    assertEquals(anthropicCalls.length, 1)
    const body = getRequestBody(anthropicCalls[0])
    assertExists(body.tools)
    const native = body.tools.find(
      (t: { type?: string }) => t.type === 'web_search_20250305',
    )
    assertExists(native, 'expected native web_search_20250305 tool def in request body')
    assertEquals(native.name, 'web_search')
    // Client-side web_search def must NOT be sent (would collide on `name`).
    const clientSide = body.tools.find(
      (t: { type?: string; name?: string }) =>
        t.name === 'web_search' && t.type !== 'web_search_20250305',
    )
    assertEquals(clientSide, undefined)
  } finally {
    restore()
    restoreAnthropic()
  }
})

Deno.test('runStep — falls back to Tavily when native web_search returns zero results', async () => {
  const restoreAnthropic = withEnv('ANTHROPIC_API_KEY', 'sk-test')
  const restoreTavily = withEnv('TAVILY_API_KEY', 'tv-test')
  let anthropicCallCount = 0
  let tavilyCallCount = 0
  let tavilyQuery = ''
  const { restore } = installFetchMock((call) => {
    if (call.url === 'https://api.anthropic.com/v1/messages') {
      anthropicCallCount++
      if (anthropicCallCount === 1) {
        return jsonResponse(200, {
          content: [
            {
              type: 'server_tool_use',
              id: 'srvtoolu_1',
              name: 'web_search',
              input: { query: 'python web frameworks' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_1',
              content: [],
            },
            { type: 'text', text: 'I could not find anything.' },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        })
      }
      // Second turn after fallback — model emits final text only.
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'done with tavily' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      })
    }
    if (call.url === 'https://api.tavily.com/search') {
      tavilyCallCount++
      const body = JSON.parse(call.init?.body as string)
      tavilyQuery = body.query
      return jsonResponse(200, {
        results: [
          {
            title: 'Django',
            url: 'https://www.djangoproject.com/',
            content: 'High-level Python web framework.',
          },
        ],
      })
    }
    return jsonResponse(404, {})
  })
  try {
    await runStep(
      makeStep(['web_search']),
      [RESEARCHER_AGENT],
      [WEB_SEARCH_TOOL_META],
      'context',
      {},
      () => {},
      'sk-test',
      new AbortController().signal,
    )
    assertEquals(tavilyCallCount, 1)
    assertEquals(tavilyQuery, 'python web frameworks')
    assertEquals(anthropicCallCount, 2)
  } finally {
    restore()
    restoreAnthropic()
    restoreTavily()
  }
})

Deno.test('runStep — falls back to Tavily when native web_search errors', async () => {
  const restoreAnthropic = withEnv('ANTHROPIC_API_KEY', 'sk-test')
  const restoreTavily = withEnv('TAVILY_API_KEY', 'tv-test')
  let tavilyCallCount = 0
  let tavilyQuery = ''
  let anthropicCallCount = 0
  const { restore } = installFetchMock((call) => {
    if (call.url === 'https://api.anthropic.com/v1/messages') {
      anthropicCallCount++
      if (anthropicCallCount === 1) {
        return jsonResponse(200, {
          content: [
            {
              type: 'server_tool_use',
              id: 'srvtoolu_2',
              name: 'web_search',
              input: { query: 'fastapi performance' },
            },
            {
              type: 'web_search_tool_result',
              tool_use_id: 'srvtoolu_2',
              content: {
                type: 'web_search_tool_result_error',
                error_code: 'max_uses_exceeded',
              },
            },
            { type: 'text', text: 'Search errored.' },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        })
      }
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'done' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      })
    }
    if (call.url === 'https://api.tavily.com/search') {
      tavilyCallCount++
      const body = JSON.parse(call.init?.body as string)
      tavilyQuery = body.query
      return jsonResponse(200, { results: [] })
    }
    return jsonResponse(404, {})
  })
  try {
    await runStep(
      makeStep(['web_search']),
      [RESEARCHER_AGENT],
      [WEB_SEARCH_TOOL_META],
      'context',
      {},
      () => {},
      'sk-test',
      new AbortController().signal,
    )
    assertEquals(tavilyCallCount, 1)
    assertEquals(tavilyQuery, 'fastapi performance')
  } finally {
    restore()
    restoreAnthropic()
    restoreTavily()
  }
})

Deno.test('runStep — does NOT add native web tools when agent does not declare them', async () => {
  const restoreAnthropic = withEnv('ANTHROPIC_API_KEY', 'sk-test')
  const restoreGithub = withEnv('GITHUB_TOKEN', 'tok')
  const { calls, restore } = installFetchMock((call) => {
    if (call.url === 'https://api.anthropic.com/v1/messages') {
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'done' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      })
    }
    return jsonResponse(404, {})
  })
  try {
    const issueAgent = {
      id: 'issuer',
      name: 'Issuer',
      content: 'You file issues.',
      tools: ['create_github_issue'],
      model: 'claude-sonnet-4-6',
    }
    const issueStep = {
      id: 1,
      agent_id: 'issuer',
      task: 'File an issue',
      tools_used: ['create_github_issue'],
      inputs: ['original_task'],
    }
    const issueToolMeta = {
      id: 'create_github_issue',
      name: 'Create issue',
      description: 'Create a GitHub issue',
      input_schema: { type: 'object', properties: {} },
    }
    await runStep(
      issueStep,
      [issueAgent],
      [issueToolMeta],
      'context',
      {},
      () => {},
      'sk-test',
      new AbortController().signal,
    )
    const body = getRequestBody(findAnthropicCalls(calls)[0])
    const hasNativeWebSearch = (body.tools || []).some(
      (t: { type?: string }) => t.type === 'web_search_20250305',
    )
    const hasNativeWebFetch = (body.tools || []).some(
      (t: { type?: string }) => t.type === 'web_fetch_20250910',
    )
    assertEquals(hasNativeWebSearch, false)
    assertEquals(hasNativeWebFetch, false)
  } finally {
    restore()
    restoreAnthropic()
    restoreGithub()
  }
})

Deno.test('runStep — successful native web_search does NOT trigger Tavily fallback', async () => {
  const restoreAnthropic = withEnv('ANTHROPIC_API_KEY', 'sk-test')
  const restoreTavily = withEnv('TAVILY_API_KEY', 'tv-test')
  let tavilyCallCount = 0
  const { restore } = installFetchMock((call) => {
    if (call.url === 'https://api.anthropic.com/v1/messages') {
      return jsonResponse(200, {
        content: [
          {
            type: 'server_tool_use',
            id: 'srvtoolu_ok',
            name: 'web_search',
            input: { query: 'q' },
          },
          {
            type: 'web_search_tool_result',
            tool_use_id: 'srvtoolu_ok',
            content: [
              { type: 'web_search_result', url: 'https://x.com', title: 't' },
            ],
          },
          { type: 'text', text: 'Found something.' },
        ],
        usage: { input_tokens: 5, output_tokens: 5 },
      })
    }
    if (call.url === 'https://api.tavily.com/search') {
      tavilyCallCount++
      return jsonResponse(200, { results: [] })
    }
    return jsonResponse(404, {})
  })
  try {
    await runStep(
      makeStep(['web_search']),
      [RESEARCHER_AGENT],
      [WEB_SEARCH_TOOL_META],
      'context',
      {},
      () => {},
      'sk-test',
      new AbortController().signal,
    )
    assertEquals(tavilyCallCount, 0)
  } finally {
    restore()
    restoreAnthropic()
    restoreTavily()
  }
})

Deno.test('runStep — adds anthropic-beta header when native web_fetch declared', async () => {
  const restoreAnthropic = withEnv('ANTHROPIC_API_KEY', 'sk-test')
  const { calls, restore } = installFetchMock(() =>
    jsonResponse(200, {
      content: [{ type: 'text', text: 'done' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    }),
  )
  try {
    const fetcherAgent = {
      id: 'fetcher',
      name: 'Fetcher',
      content: 'You fetch URLs.',
      tools: ['web_fetch'],
      model: 'claude-sonnet-4-6',
    }
    const fetchStep = {
      id: 1,
      agent_id: 'fetcher',
      task: 'Fetch a URL',
      tools_used: ['web_fetch'],
      inputs: ['original_task'],
    }
    const webFetchToolMeta = {
      id: 'web_fetch',
      name: 'Web fetch',
      description: 'Fetch a URL',
      input_schema: { type: 'object', properties: {} },
    }
    await runStep(
      fetchStep,
      [fetcherAgent],
      [webFetchToolMeta],
      'context',
      {},
      () => {},
      'sk-test',
      new AbortController().signal,
    )
    const anthropicCall = findAnthropicCalls(calls)[0]
    const headers = (anthropicCall.init?.headers ?? {}) as Record<string, string>
    assertEquals(headers['anthropic-beta'], 'web-fetch-2025-09-10')
    const body = getRequestBody(anthropicCall)
    const native = body.tools.find(
      (t: { type?: string }) => t.type === 'web_fetch_20250910',
    )
    assertExists(native)
  } finally {
    restore()
    restoreAnthropic()
  }
})

// ─── render_html_to_image ───────────────────────────────────────────────────

Deno.test('render_html_to_image — registered in TOOL_HANDLERS', () => {
  assert(typeof TOOL_HANDLERS.render_html_to_image === 'function')
})

Deno.test('render_html_to_image — returns not_configured when BROWSERLESS_TOKEN is missing', async () => {
  const restoreEnv = withEnv('BROWSERLESS_TOKEN', null)
  try {
    const result = await TOOL_HANDLERS.render_html_to_image(
      { html: '<h1>hi</h1>', width: 800, height: 600 },
      { ...makeCtx(), userId: 'user-1' },
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'BROWSERLESS_TOKEN')
    assertEquals(
      (result.result as { error?: string } | undefined)?.error,
      'not_configured',
    )
  } finally {
    restoreEnv()
  }
})

Deno.test('render_html_to_image — rejects empty html before hitting Browserless', async () => {
  const restoreToken = withEnv('BROWSERLESS_TOKEN', 'TOK')
  let fetchCalled = false
  const { restore } = installFetchMock(() => {
    fetchCalled = true
    return new Response(new Uint8Array([1, 2, 3]).buffer)
  })
  try {
    const result = await TOOL_HANDLERS.render_html_to_image(
      { html: '   ', width: 800, height: 600 },
      { ...makeCtx(), userId: 'user-1' },
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'html')
    assertEquals(fetchCalled, false)
  } finally {
    restore()
    restoreToken()
  }
})

Deno.test('render_html_to_image — rejects non-positive viewport dimensions', async () => {
  const restoreToken = withEnv('BROWSERLESS_TOKEN', 'TOK')
  try {
    const result = await TOOL_HANDLERS.render_html_to_image(
      { html: '<h1>hi</h1>', width: 0, height: 600 },
      { ...makeCtx(), userId: 'user-1' },
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'width')
  } finally {
    restoreToken()
  }
})

Deno.test('render_html_to_image — refuses to run without ctx.userId', async () => {
  const restoreToken = withEnv('BROWSERLESS_TOKEN', 'TOK')
  try {
    const result = await TOOL_HANDLERS.render_html_to_image(
      { html: '<h1>hi</h1>', width: 800, height: 600 },
      makeCtx(),
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'userId')
  } finally {
    restoreToken()
  }
})

Deno.test('render_html_to_image — returns not_configured when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
  const restoreToken = withEnv('BROWSERLESS_TOKEN', 'TOK')
  const restoreUrl = withEnv('SUPABASE_URL', 'https://x.supabase.co')
  const restoreKey = withEnv('SUPABASE_SERVICE_ROLE_KEY', null)
  try {
    const result = await TOOL_HANDLERS.render_html_to_image(
      { html: '<h1>hi</h1>', width: 800, height: 600 },
      { ...makeCtx(), userId: 'user-1' },
    )
    assertEquals(result.ok, false)
    assertStringIncludes(result.error ?? '', 'SUPABASE_SERVICE_ROLE_KEY')
    assertEquals(
      (result.result as { error?: string } | undefined)?.error,
      'not_configured',
    )
  } finally {
    restoreKey()
    restoreUrl()
    restoreToken()
  }
})

Deno.test('render_html_to_image — happy path returns storage_path + signed_url', async () => {
  const restoreToken = withEnv('BROWSERLESS_TOKEN', 'TOK')
  const restoreUrl = withEnv('SUPABASE_URL', 'https://x.supabase.co')
  const restoreKey = withEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc')

  let captureCalls = 0
  let capturedPath: { userId: string; taskId: string; stepOrder: number } | null = null
  const previousCapture = _renderHtmlInternals.capture
  _renderHtmlInternals.capture = async (_deps, request, path) => {
    captureCalls += 1
    capturedPath = path
    return {
      storage_path: `${path.userId}/${path.taskId}/step-${path.stepOrder}/x.jpg`,
      signed_url: 'https://signed.example/x.jpg?token=abc',
      mime_type: 'image/jpeg',
      width: request.width,
      height: request.height,
    }
  }
  const restoreClient = setCreateAdminClientForTests(((..._args: unknown[]) =>
    ({}) as never) as never)
  try {
    const result = await TOOL_HANDLERS.render_html_to_image(
      { html: '<h1>hi</h1>', width: 1080, height: 1080, filename_prefix: 'cover' },
      {
        ...makeCtx(),
        userId: 'user-1',
        taskId: 'task-2',
        stepOrder: 3,
      },
    )
    assert(result.ok, `expected ok, got ${result.error}`)
    assertEquals(captureCalls, 1)
    assertEquals(capturedPath, { userId: 'user-1', taskId: 'task-2', stepOrder: 3 })
    const r = result.result as {
      storage_path: string
      signed_url: string
      mime_type: string
      width: number
      height: number
    }
    assertEquals(r.storage_path, 'user-1/task-2/step-3/x.jpg')
    assertEquals(r.mime_type, 'image/jpeg')
    assertEquals(r.width, 1080)
    assertEquals(r.height, 1080)
    assertStringIncludes(r.signed_url, 'signed.example')
  } finally {
    _renderHtmlInternals.capture = previousCapture
    restoreClient()
    restoreKey()
    restoreUrl()
    restoreToken()
  }
})

Deno.test('render_html_to_image — falls back to chat-toolCallId / stepId when no template ctx', async () => {
  const restoreToken = withEnv('BROWSERLESS_TOKEN', 'TOK')
  const restoreUrl = withEnv('SUPABASE_URL', 'https://x.supabase.co')
  const restoreKey = withEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc')

  let capturedPath: { userId: string; taskId: string; stepOrder: number } | null = null
  const previousCapture = _renderHtmlInternals.capture
  _renderHtmlInternals.capture = async (_deps, request, path) => {
    capturedPath = path
    return {
      storage_path: `${path.userId}/${path.taskId}/step-${path.stepOrder}/x.jpg`,
      signed_url: 'https://signed.example/x.jpg',
      mime_type: 'image/jpeg',
      width: request.width,
      height: request.height,
    }
  }
  const restoreClient = setCreateAdminClientForTests(((..._args: unknown[]) =>
    ({}) as never) as never)
  try {
    const ctx = makeCtx()
    ctx.stepId = 7
    ctx.toolCallId = 'tool-call-xyz'
    const result = await TOOL_HANDLERS.render_html_to_image(
      { html: '<h1>hi</h1>', width: 800, height: 600 },
      { ...ctx, userId: 'user-1' },
    )
    assert(result.ok, `expected ok, got ${result.error}`)
    assertEquals(capturedPath?.userId, 'user-1')
    assertEquals(capturedPath?.taskId, 'chat-tool-call-xyz')
    assertEquals(capturedPath?.stepOrder, 7)
  } finally {
    _renderHtmlInternals.capture = previousCapture
    restoreClient()
    restoreKey()
    restoreUrl()
    restoreToken()
  }
})

// ─── available tool gating ──────────────────────────────────────────────────

Deno.test('getAvailableTools — drops render_html_to_image when BROWSERLESS_TOKEN missing', () => {
  const restoreEnv = withEnv('BROWSERLESS_TOKEN', null)
  try {
    const available = getAvailableTools()
    assertEquals(available.has('render_html_to_image'), false)
  } finally {
    restoreEnv()
  }
})

Deno.test('getAvailableTools — keeps render_html_to_image when BROWSERLESS_TOKEN present', () => {
  const restoreEnv = withEnv('BROWSERLESS_TOKEN', 'TOK')
  try {
    const available = getAvailableTools()
    assertEquals(available.has('render_html_to_image'), true)
  } finally {
    restoreEnv()
  }
})

Deno.test('describeUnavailableReason — names BROWSERLESS_TOKEN for render_html_to_image', () => {
  assertStringIncludes(
    describeUnavailableReason('render_html_to_image'),
    'BROWSERLESS_TOKEN',
  )
})
