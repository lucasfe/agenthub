// deno-lint-ignore-file no-explicit-any
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'jsr:@std/assert@1'
import {
  captureHtmlToTaskOutput,
  fetchBrowserlessPng,
} from './htmlScreenshotter.ts'

interface MockCall {
  url: string
  init?: RequestInit
}

function installFetchMock(
  responder: (call: MockCall) => Response | Promise<Response>,
): { calls: MockCall[]; restore: () => void } {
  const calls: MockCall[] = []
  const original = globalThis.fetch
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

function pngResponse(status: number, bytes: Uint8Array): Response {
  return new Response(bytes, {
    status,
    headers: { 'Content-Type': 'image/png' },
  })
}

const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const FAKE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])

interface CapturedUpload {
  bucket: string
  path: string
  body: unknown
  options?: { contentType?: string; upsert?: boolean }
}

interface CapturedSignedUrl {
  bucket: string
  path: string
  ttlSeconds: number
}

function makeSupabase(opts: {
  uploadError?: { message: string }
  signedUrl?: string
  signedUrlError?: { message: string }
} = {}): {
  client: any
  uploads: CapturedUpload[]
  signedUrls: CapturedSignedUrl[]
} {
  const uploads: CapturedUpload[] = []
  const signedUrls: CapturedSignedUrl[] = []
  const client = {
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, body: unknown, options?: any) {
            uploads.push({ bucket, path, body, options })
            if (opts.uploadError) {
              return Promise.resolve({
                data: null,
                error: opts.uploadError,
              })
            }
            return Promise.resolve({
              data: { path },
              error: null,
            })
          },
          createSignedUrl(path: string, ttlSeconds: number) {
            signedUrls.push({ bucket, path, ttlSeconds })
            if (opts.signedUrlError) {
              return Promise.resolve({
                data: null,
                error: opts.signedUrlError,
              })
            }
            return Promise.resolve({
              data: {
                signedUrl:
                  opts.signedUrl ??
                  `https://signed.example/${bucket}/${path}?token=abc`,
              },
              error: null,
            })
          },
        }
      },
    },
  }
  return { client, uploads, signedUrls }
}

// ─── fetchBrowserlessPng ─────────────────────────────────────────────────────

Deno.test('fetchBrowserlessPng — POSTs to chrome.browserless.io/screenshot with token', async () => {
  const { calls, restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  try {
    await fetchBrowserlessPng('TOK', {
      html: '<h1>hi</h1>',
      width: 1080,
      height: 1080,
    })
  } finally {
    restore()
  }
  assertEquals(calls.length, 1)
  const url = new URL(calls[0].url)
  assertEquals(url.origin + url.pathname, 'https://chrome.browserless.io/screenshot')
  assertEquals(url.searchParams.get('token'), 'TOK')
  assertEquals(calls[0].init?.method, 'POST')
})

Deno.test('fetchBrowserlessPng — sends html + viewport + png type in JSON body', async () => {
  const { calls, restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  try {
    await fetchBrowserlessPng('TOK', {
      html: '<h1>hi</h1>',
      width: 1080,
      height: 1350,
    })
  } finally {
    restore()
  }
  const body = JSON.parse(String(calls[0].init?.body ?? '{}'))
  assertEquals(body.html, '<h1>hi</h1>')
  assertEquals(body.viewport, { width: 1080, height: 1350 })
  assertEquals(body.options?.type, 'png')
})

Deno.test('fetchBrowserlessPng — sets Content-Type: application/json', async () => {
  const { calls, restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  try {
    await fetchBrowserlessPng('TOK', {
      html: '<h1>hi</h1>',
      width: 800,
      height: 600,
    })
  } finally {
    restore()
  }
  const headers = new Headers(calls[0].init?.headers)
  assertEquals(headers.get('Content-Type'), 'application/json')
})

Deno.test('fetchBrowserlessPng — returns the response bytes as Uint8Array', async () => {
  const { restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  try {
    const out = await fetchBrowserlessPng('TOK', {
      html: '<h1>hi</h1>',
      width: 800,
      height: 600,
    })
    assert(out instanceof Uint8Array)
    assertEquals(Array.from(out), Array.from(FAKE_PNG))
  } finally {
    restore()
  }
})

Deno.test('fetchBrowserlessPng — retries once on 5xx then returns the retry payload', async () => {
  let attempt = 0
  const { calls, restore } = installFetchMock(() => {
    attempt += 1
    if (attempt === 1) {
      return new Response('upstream boom', { status: 503 })
    }
    return pngResponse(200, FAKE_PNG)
  })
  try {
    const out = await fetchBrowserlessPng('TOK', {
      html: '<h1>hi</h1>',
      width: 800,
      height: 600,
    })
    assertEquals(Array.from(out), Array.from(FAKE_PNG))
    assertEquals(calls.length, 2)
  } finally {
    restore()
  }
})

Deno.test('fetchBrowserlessPng — surfaces 5xx error after the retry also fails', async () => {
  const { calls, restore } = installFetchMock(
    () => new Response('still down', { status: 502 }),
  )
  try {
    const err = await assertRejects(
      () =>
        fetchBrowserlessPng('TOK', {
          html: '<h1>hi</h1>',
          width: 800,
          height: 600,
        }),
      Error,
    )
    assertStringIncludes(err.message, '502')
    assertEquals(calls.length, 2)
  } finally {
    restore()
  }
})

Deno.test('fetchBrowserlessPng — does NOT retry on 4xx', async () => {
  const { calls, restore } = installFetchMock(
    () => new Response('bad token', { status: 401 }),
  )
  try {
    const err = await assertRejects(
      () =>
        fetchBrowserlessPng('TOK', {
          html: '<h1>hi</h1>',
          width: 800,
          height: 600,
        }),
      Error,
    )
    assertStringIncludes(err.message, '401')
    assertEquals(calls.length, 1)
  } finally {
    restore()
  }
})

Deno.test('fetchBrowserlessPng — rejects empty token at the boundary', async () => {
  await assertRejects(
    () =>
      fetchBrowserlessPng('', {
        html: '<h1>hi</h1>',
        width: 800,
        height: 600,
      }),
    Error,
    'Browserless token is required',
  )
})

Deno.test('fetchBrowserlessPng — rejects empty html at the boundary', async () => {
  await assertRejects(
    () =>
      fetchBrowserlessPng('TOK', {
        html: '',
        width: 800,
        height: 600,
      }),
    Error,
    'html is required',
  )
})

Deno.test('fetchBrowserlessPng — rejects non-positive viewport dimensions', async () => {
  await assertRejects(
    () =>
      fetchBrowserlessPng('TOK', {
        html: '<h1>hi</h1>',
        width: 0,
        height: 600,
      }),
    Error,
    'width',
  )
  await assertRejects(
    () =>
      fetchBrowserlessPng('TOK', {
        html: '<h1>hi</h1>',
        width: 800,
        height: -10,
      }),
    Error,
    'height',
  )
})

// ─── captureHtmlToTaskOutput ─────────────────────────────────────────────────

Deno.test('captureHtmlToTaskOutput — happy path: fetches PNG, converts JPEG, uploads, signs URL', async () => {
  const { calls, restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  const supabase = makeSupabase()
  let convertCalled = false
  let convertedQuality = 0
  try {
    const result = await captureHtmlToTaskOutput(
      {
        token: 'TOK',
        supabase: supabase.client,
        pngToJpeg: async (png, quality) => {
          convertCalled = true
          convertedQuality = quality
          assertEquals(Array.from(png), Array.from(FAKE_PNG))
          return FAKE_JPEG
        },
      },
      {
        html: '<h1>hi</h1>',
        width: 1080,
        height: 1080,
        filenamePrefix: 'cover',
      },
      {
        userId: 'user-1',
        taskId: 'task-2',
        stepOrder: 3,
      },
    )
    assertEquals(calls.length, 1, 'one Browserless call')
    assert(convertCalled, 'pngToJpeg called')
    assertEquals(convertedQuality, 95)

    assertEquals(supabase.uploads.length, 1)
    assertEquals(supabase.uploads[0].bucket, 'task-outputs')
    assert(
      supabase.uploads[0].path.startsWith('user-1/task-2/step-3/cover-'),
      `expected path to start with user-1/task-2/step-3/cover-, got ${supabase.uploads[0].path}`,
    )
    assert(
      supabase.uploads[0].path.endsWith('.jpg'),
      `expected path to end with .jpg, got ${supabase.uploads[0].path}`,
    )
    assertEquals(supabase.uploads[0].options?.contentType, 'image/jpeg')

    assertEquals(supabase.signedUrls.length, 1)
    assertEquals(supabase.signedUrls[0].bucket, 'task-outputs')
    assertEquals(supabase.signedUrls[0].path, supabase.uploads[0].path)
    assertEquals(supabase.signedUrls[0].ttlSeconds, 86400)

    assertEquals(result.storage_path, supabase.uploads[0].path)
    assertEquals(result.mime_type, 'image/jpeg')
    assertEquals(result.width, 1080)
    assertEquals(result.height, 1080)
    assert(result.signed_url.startsWith('https://'))
  } finally {
    restore()
  }
})

Deno.test('captureHtmlToTaskOutput — uses default filename prefix when none provided', async () => {
  const { restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  const supabase = makeSupabase()
  try {
    await captureHtmlToTaskOutput(
      {
        token: 'TOK',
        supabase: supabase.client,
        pngToJpeg: async () => FAKE_JPEG,
      },
      { html: '<p>x</p>', width: 800, height: 600 },
      { userId: 'u', taskId: 't', stepOrder: 1 },
    )
    assertEquals(supabase.uploads.length, 1)
    const path = supabase.uploads[0].path
    assert(
      path.startsWith('u/t/step-1/screenshot-'),
      `expected default prefix, got ${path}`,
    )
    assert(path.endsWith('.jpg'))
  } finally {
    restore()
  }
})

Deno.test('captureHtmlToTaskOutput — uploads JPEG bytes (not PNG) to Storage', async () => {
  const { restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  const supabase = makeSupabase()
  try {
    await captureHtmlToTaskOutput(
      {
        token: 'TOK',
        supabase: supabase.client,
        pngToJpeg: async () => FAKE_JPEG,
      },
      { html: '<p>x</p>', width: 800, height: 600 },
      { userId: 'u', taskId: 't', stepOrder: 1 },
    )
    const body = supabase.uploads[0].body as Uint8Array
    assertEquals(Array.from(body), Array.from(FAKE_JPEG))
  } finally {
    restore()
  }
})

Deno.test('captureHtmlToTaskOutput — surfaces upload error', async () => {
  const { restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  const supabase = makeSupabase({
    uploadError: { message: 'bucket disabled' },
  })
  try {
    const err = await assertRejects(
      () =>
        captureHtmlToTaskOutput(
          {
            token: 'TOK',
            supabase: supabase.client,
            pngToJpeg: async () => FAKE_JPEG,
          },
          { html: '<p>x</p>', width: 800, height: 600 },
          { userId: 'u', taskId: 't', stepOrder: 1 },
        ),
      Error,
    )
    assertStringIncludes(err.message, 'bucket disabled')
  } finally {
    restore()
  }
})

Deno.test('captureHtmlToTaskOutput — surfaces signedUrl error', async () => {
  const { restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  const supabase = makeSupabase({
    signedUrlError: { message: 'object missing' },
  })
  try {
    const err = await assertRejects(
      () =>
        captureHtmlToTaskOutput(
          {
            token: 'TOK',
            supabase: supabase.client,
            pngToJpeg: async () => FAKE_JPEG,
          },
          { html: '<p>x</p>', width: 800, height: 600 },
          { userId: 'u', taskId: 't', stepOrder: 1 },
        ),
      Error,
    )
    assertStringIncludes(err.message, 'object missing')
  } finally {
    restore()
  }
})

Deno.test('captureHtmlToTaskOutput — rejects empty userId / taskId', async () => {
  const supabase = makeSupabase()
  await assertRejects(
    () =>
      captureHtmlToTaskOutput(
        {
          token: 'TOK',
          supabase: supabase.client,
          pngToJpeg: async () => FAKE_JPEG,
        },
        { html: '<p>x</p>', width: 800, height: 600 },
        { userId: '', taskId: 't', stepOrder: 1 },
      ),
    Error,
    'userId',
  )
  await assertRejects(
    () =>
      captureHtmlToTaskOutput(
        {
          token: 'TOK',
          supabase: supabase.client,
          pngToJpeg: async () => FAKE_JPEG,
        },
        { html: '<p>x</p>', width: 800, height: 600 },
        { userId: 'u', taskId: '', stepOrder: 1 },
      ),
    Error,
    'taskId',
  )
})

Deno.test('captureHtmlToTaskOutput — sanitises filenamePrefix to safe chars', async () => {
  const { restore } = installFetchMock(() => pngResponse(200, FAKE_PNG))
  const supabase = makeSupabase()
  try {
    await captureHtmlToTaskOutput(
      {
        token: 'TOK',
        supabase: supabase.client,
        pngToJpeg: async () => FAKE_JPEG,
      },
      {
        html: '<p>x</p>',
        width: 800,
        height: 600,
        filenamePrefix: '../etc/passwd weird name!',
      },
      { userId: 'u', taskId: 't', stepOrder: 1 },
    )
    const path = supabase.uploads[0].path
    assert(
      !path.includes('..'),
      `path must not contain "..", got ${path}`,
    )
    assert(
      !path.includes(' '),
      `path must not contain spaces, got ${path}`,
    )
  } finally {
    restore()
  }
})
