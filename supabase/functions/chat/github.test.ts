import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'jsr:@std/assert@1'
import { createIssue, listRepos } from './github.ts'

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

// ─── listRepos ──────────────────────────────────────────────────────────────

Deno.test('listRepos — builds correct URL with all four query params', async () => {
  const { calls, restore } = installFetchMock(() => jsonResponse(200, []))
  try {
    await listRepos('tok')
  } finally {
    restore()
  }
  assertEquals(calls.length, 1)
  const url = new URL(calls[0].url)
  assertEquals(url.origin + url.pathname, 'https://api.github.com/user/repos')
  assertEquals(url.searchParams.get('affiliation'), 'owner')
  assertEquals(url.searchParams.get('type'), null)
  assertEquals(url.searchParams.get('sort'), 'pushed')
  assertEquals(url.searchParams.get('per_page'), '50')
})

Deno.test('listRepos — sets Authorization and Accept headers', async () => {
  const { calls, restore } = installFetchMock(() => jsonResponse(200, []))
  try {
    await listRepos('mytoken')
  } finally {
    restore()
  }
  const headers = new Headers(calls[0].init?.headers)
  assertEquals(headers.get('Authorization'), 'Bearer mytoken')
  assertEquals(headers.get('Accept'), 'application/vnd.github+json')
})

Deno.test('listRepos — returns parsed JSON array', async () => {
  const repos = [
    { name: 'r1', full_name: 'lucasfe/r1' },
    { name: 'r2', full_name: 'lucasfe/r2' },
  ]
  const { restore } = installFetchMock(() => jsonResponse(200, repos))
  try {
    const out = await listRepos('tok')
    assertEquals(out, repos)
  } finally {
    restore()
  }
})

Deno.test('listRepos — surfaces 401 with GitHub error message', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(401, { message: 'Bad credentials' }),
  )
  try {
    const err = await assertRejects(() => listRepos('bad'), Error)
    assertStringIncludes(err.message, '401')
    assertStringIncludes(err.message, 'Bad credentials')
  } finally {
    restore()
  }
})

Deno.test('listRepos — surfaces 5xx with GitHub error message', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(503, { message: 'Service Unavailable' }),
  )
  try {
    const err = await assertRejects(() => listRepos('tok'), Error)
    assertStringIncludes(err.message, '503')
    assertStringIncludes(err.message, 'Service Unavailable')
  } finally {
    restore()
  }
})

Deno.test('listRepos — rejects empty token at the boundary', async () => {
  await assertRejects(() => listRepos(''), Error, 'GitHub token is required')
})

Deno.test('listRepos — rejects whitespace-only token at the boundary', async () => {
  await assertRejects(() => listRepos('   '), Error, 'GitHub token is required')
})

Deno.test('listRepos — rejects non-array response shape', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(200, { not: 'an array' }),
  )
  try {
    await assertRejects(() => listRepos('tok'), Error, 'non-array')
  } finally {
    restore()
  }
})

// ─── createIssue ────────────────────────────────────────────────────────────

Deno.test('createIssue — POSTs to /repos/{owner}/{repo}/issues', async () => {
  const { calls, restore } = installFetchMock(() =>
    jsonResponse(201, { html_url: 'https://github.com/lucasfe/r1/issues/1', number: 1 }),
  )
  try {
    await createIssue('tok', 'lucasfe/r1', 'Hi', 'Body')
  } finally {
    restore()
  }
  assertEquals(calls.length, 1)
  assertEquals(calls[0].url, 'https://api.github.com/repos/lucasfe/r1/issues')
  assertEquals(calls[0].init?.method, 'POST')
})

Deno.test('createIssue — sends JSON body with exactly title and body', async () => {
  const { calls, restore } = installFetchMock(() =>
    jsonResponse(201, { html_url: 'https://github.com/lucasfe/r1/issues/2', number: 2 }),
  )
  try {
    await createIssue('tok', 'lucasfe/r1', 'My Title', 'My Body')
  } finally {
    restore()
  }
  const body = JSON.parse(String(calls[0].init?.body ?? ''))
  assertEquals(body, { title: 'My Title', body: 'My Body' })
})

Deno.test('createIssue — sets Authorization, Accept, Content-Type headers', async () => {
  const { calls, restore } = installFetchMock(() =>
    jsonResponse(201, { html_url: 'https://github.com/lucasfe/r1/issues/3', number: 3 }),
  )
  try {
    await createIssue('tok', 'lucasfe/r1', 'T', 'B')
  } finally {
    restore()
  }
  const headers = new Headers(calls[0].init?.headers)
  assertEquals(headers.get('Authorization'), 'Bearer tok')
  assertEquals(headers.get('Accept'), 'application/vnd.github+json')
  assertEquals(headers.get('Content-Type'), 'application/json')
})

Deno.test('createIssue — returns { url, number } from response', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(201, {
      html_url: 'https://github.com/lucasfe/r1/issues/42',
      number: 42,
    }),
  )
  try {
    const out = await createIssue('tok', 'lucasfe/r1', 'T', 'B')
    assertEquals(out, {
      url: 'https://github.com/lucasfe/r1/issues/42',
      number: 42,
    })
  } finally {
    restore()
  }
})

Deno.test('createIssue — surfaces 404 with GitHub error message', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(404, { message: 'Not Found' }),
  )
  try {
    const err = await assertRejects(
      () => createIssue('tok', 'lucasfe/missing', 'T', 'B'),
      Error,
    )
    assertStringIncludes(err.message, '404')
    assertStringIncludes(err.message, 'Not Found')
  } finally {
    restore()
  }
})

Deno.test('createIssue — surfaces 422 with GitHub validation message', async () => {
  const { restore } = installFetchMock(() =>
    jsonResponse(422, { message: 'Validation Failed' }),
  )
  try {
    const err = await assertRejects(
      () => createIssue('tok', 'lucasfe/r1', 'T', 'B'),
      Error,
    )
    assertStringIncludes(err.message, '422')
    assertStringIncludes(err.message, 'Validation Failed')
  } finally {
    restore()
  }
})

Deno.test('createIssue — rejects empty token at the boundary', async () => {
  await assertRejects(
    () => createIssue('', 'lucasfe/r1', 'T', 'B'),
    Error,
    'GitHub token is required',
  )
})

Deno.test('createIssue — rejects empty repo at the boundary', async () => {
  await assertRejects(
    () => createIssue('tok', '', 'T', 'B'),
    Error,
    'repo is required',
  )
})

Deno.test('createIssue — rejects empty title at the boundary', async () => {
  await assertRejects(
    () => createIssue('tok', 'lucasfe/r1', '', 'B'),
    Error,
    'title is required',
  )
})

Deno.test('createIssue — rejects empty body at the boundary', async () => {
  await assertRejects(
    () => createIssue('tok', 'lucasfe/r1', 'T', ''),
    Error,
    'body is required',
  )
})

Deno.test('createIssue — rejects unexpected response shape', async () => {
  const { restore } = installFetchMock(() => jsonResponse(201, { unexpected: true }))
  try {
    await assertRejects(
      () => createIssue('tok', 'lucasfe/r1', 'T', 'B'),
      Error,
      'unexpected response shape',
    )
  } finally {
    restore()
  }
})

Deno.test('createIssue — falls back to text when GitHub returns no JSON message', async () => {
  const { restore } = installFetchMock(
    () => new Response('plain text error', { status: 500 }),
  )
  try {
    const err = await assertRejects(
      () => createIssue('tok', 'lucasfe/r1', 'T', 'B'),
      Error,
    )
    assert(err.message.includes('500'))
  } finally {
    restore()
  }
})
