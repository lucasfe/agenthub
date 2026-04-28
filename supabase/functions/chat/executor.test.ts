import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'jsr:@std/assert@1'
import { TOOL_HANDLERS } from './executor.ts'

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
