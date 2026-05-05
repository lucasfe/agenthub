// Unit tests for the Zernio API client used by the `zernio_publish` tool.
//
// The client is a deep, narrow module: it knows how to talk to
// https://zernio.com/api/v1/posts, how to mint 24h signed URLs for each
// `media[].storage_path`, and how to build the body for every Instagram
// content type the pipeline supports (feed carousel, story, reels). It does
// NOT decide approval — that is the executor's job — and never reaches Deno
// global state.

// deno-lint-ignore-file no-explicit-any

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'jsr:@std/assert@1'
import {
  buildScheduleBody,
  publishToZernio,
  validateScheduledFor,
  ZernioApiError,
} from './zernioClient.ts'

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

interface CapturedSignedUrl {
  bucket: string
  path: string
  ttlSeconds: number
}

function makeSupabase(opts: {
  signedUrlError?: { message: string }
  signedUrls?: Record<string, string>
} = {}): { client: any; calls: CapturedSignedUrl[] } {
  const calls: CapturedSignedUrl[] = []
  const client = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl(path: string, ttlSeconds: number) {
            calls.push({ bucket, path, ttlSeconds })
            if (opts.signedUrlError) {
              return Promise.resolve({ data: null, error: opts.signedUrlError })
            }
            const signedUrl =
              opts.signedUrls?.[path] ??
              `https://signed.example/${bucket}/${path}?token=abc`
            return Promise.resolve({
              data: { signedUrl },
              error: null,
            })
          },
        }
      },
    },
  }
  return { client, calls }
}

const FUTURE_ISO = '2026-12-01T22:00:00Z'
const PAST_ISO = '2020-01-01T00:00:00Z'
const FIXED_NOW = () => new Date('2026-05-01T00:00:00Z')

const baseRequest = {
  account_id: 'acct_123',
  caption: 'Hello, world!',
  hashtags: '#ansiedade #psicologia',
  scheduled_for: FUTURE_ISO,
}

function jsonBody(call: MockCall): any {
  return JSON.parse(call.init?.body as string)
}

// ─── validateScheduledFor ────────────────────────────────────────────────────

Deno.test('validateScheduledFor — returns null for an ISO timestamp in the future', () => {
  assertEquals(
    validateScheduledFor(FUTURE_ISO, () => new Date('2026-05-01T00:00:00Z')),
    null,
  )
})

Deno.test('validateScheduledFor — rejects timestamps in the past', () => {
  const error = validateScheduledFor(PAST_ISO, FIXED_NOW)
  assert(typeof error === 'string')
  assertStringIncludes(error!, 'past')
})

Deno.test('validateScheduledFor — rejects empty / missing input', () => {
  assert(validateScheduledFor('', FIXED_NOW))
  assert(validateScheduledFor(undefined as any, FIXED_NOW))
})

Deno.test('validateScheduledFor — rejects unparseable strings', () => {
  const error = validateScheduledFor('next tuesday', FIXED_NOW)
  assert(typeof error === 'string')
})

// ─── buildScheduleBody ───────────────────────────────────────────────────────

Deno.test('buildScheduleBody — feed carousel: every media item is type=image, no platformSpecificData', () => {
  const body = buildScheduleBody({
    accountId: 'acct_x',
    contentType: 'feed',
    mediaUrls: [
      'https://signed.example/a.jpg',
      'https://signed.example/b.jpg',
      'https://signed.example/c.jpg',
    ],
    caption: 'caption text',
    hashtags: '#a #b',
    scheduledFor: FUTURE_ISO,
  })
  assertEquals(body.content, 'caption text\n\n#a #b')
  assertEquals(body.mediaItems, [
    { type: 'image', url: 'https://signed.example/a.jpg' },
    { type: 'image', url: 'https://signed.example/b.jpg' },
    { type: 'image', url: 'https://signed.example/c.jpg' },
  ])
  assertEquals(body.platforms, [
    { platform: 'instagram', accountId: 'acct_x' },
  ])
  assertEquals(body.scheduledFor, FUTURE_ISO)
})

Deno.test('buildScheduleBody — story: image media + platformSpecificData.contentType=story', () => {
  const body = buildScheduleBody({
    accountId: 'acct_x',
    contentType: 'story',
    mediaUrls: ['https://signed.example/story.jpg'],
    caption: 'ignored for story API',
    hashtags: '',
    scheduledFor: FUTURE_ISO,
  })
  assertEquals(body.mediaItems, [
    { type: 'image', url: 'https://signed.example/story.jpg' },
  ])
  assertEquals(body.platforms, [
    {
      platform: 'instagram',
      accountId: 'acct_x',
      platformSpecificData: { contentType: 'story' },
    },
  ])
})

Deno.test('buildScheduleBody — reels: video media + platformSpecificData.contentType=reels', () => {
  const body = buildScheduleBody({
    accountId: 'acct_x',
    contentType: 'reels',
    mediaUrls: ['https://signed.example/reel.mp4'],
    caption: 'reel caption',
    hashtags: '#reels',
    scheduledFor: FUTURE_ISO,
  })
  assertEquals(body.mediaItems, [
    { type: 'video', url: 'https://signed.example/reel.mp4' },
  ])
  assertEquals(body.platforms[0].platformSpecificData, { contentType: 'reels' })
})

Deno.test('buildScheduleBody — feed without hashtags emits caption alone (no trailing newlines)', () => {
  const body = buildScheduleBody({
    accountId: 'acct_x',
    contentType: 'feed',
    mediaUrls: ['https://signed.example/a.jpg'],
    caption: 'just a caption',
    hashtags: '',
    scheduledFor: FUTURE_ISO,
  })
  assertEquals(body.content, 'just a caption')
})

Deno.test('buildScheduleBody — feed with no caption nor hashtags omits content field entirely', () => {
  const body = buildScheduleBody({
    accountId: 'acct_x',
    contentType: 'feed',
    mediaUrls: ['https://signed.example/a.jpg'],
    caption: '',
    hashtags: '',
    scheduledFor: FUTURE_ISO,
  })
  assertEquals(Object.prototype.hasOwnProperty.call(body, 'content'), false)
})

// ─── publishToZernio ─────────────────────────────────────────────────────────

Deno.test('publishToZernio — feed carousel: mints signed URLs and posts to Zernio', async () => {
  const supa = makeSupabase()
  const { calls, restore } = installFetchMock(() =>
    new Response(
      JSON.stringify({
        post_id: 'post_42',
        platform_url: 'https://instagram.com/p/abc',
        scheduled_for: FUTURE_ISO,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  )
  try {
    const out = await publishToZernio(
      { token: 'tok_xyz', supabase: supa.client, now: FIXED_NOW },
      {
        ...baseRequest,
        content_type: 'feed',
        media: [
          { storage_path: 'u/t/step-1/a.jpg' },
          { storage_path: 'u/t/step-1/b.jpg' },
        ],
      },
    )
    assertEquals(out.post_id, 'post_42')
    assertEquals(out.platform_url, 'https://instagram.com/p/abc')
    assertEquals(out.scheduled_for, FUTURE_ISO)

    // Two signed URLs minted at 24h TTL on the task-outputs bucket.
    assertEquals(supa.calls.length, 2)
    assertEquals(supa.calls[0].bucket, 'task-outputs')
    assertEquals(supa.calls[0].path, 'u/t/step-1/a.jpg')
    assertEquals(supa.calls[0].ttlSeconds, 24 * 60 * 60)
    assertEquals(supa.calls[1].path, 'u/t/step-1/b.jpg')

    // Single Zernio HTTP call with the right URL, headers, and body shape.
    assertEquals(calls.length, 1)
    assertEquals(calls[0].url, 'https://zernio.com/api/v1/posts')
    assertEquals(calls[0].init?.method, 'POST')
    const headers = new Headers(calls[0].init?.headers as HeadersInit)
    assertEquals(headers.get('Authorization'), 'Bearer tok_xyz')
    assertEquals(headers.get('Content-Type'), 'application/json')

    const body = jsonBody(calls[0])
    assertEquals(body.platforms[0].platform, 'instagram')
    assertEquals(body.platforms[0].accountId, baseRequest.account_id)
    assertEquals(body.mediaItems.length, 2)
    assertEquals(body.mediaItems[0].type, 'image')
    assertEquals(body.scheduledFor, FUTURE_ISO)
    // No publishNow ever — the upstream safety rule is hard-coded.
    assertEquals(
      Object.prototype.hasOwnProperty.call(body, 'publishNow'),
      false,
    )
  } finally {
    restore()
  }
})

Deno.test('publishToZernio — story uses contentType=story and a single image item', async () => {
  const supa = makeSupabase()
  const { calls, restore } = installFetchMock(() =>
    new Response(
      JSON.stringify({
        post_id: 'post_story',
        platform_url: 'https://instagram.com/stories/abc',
        scheduled_for: FUTURE_ISO,
      }),
      { status: 200 },
    ),
  )
  try {
    await publishToZernio(
      { token: 'tok', supabase: supa.client, now: FIXED_NOW },
      {
        ...baseRequest,
        content_type: 'story',
        media: [{ storage_path: 'u/t/step-2/story.jpg' }],
      },
    )
    const body = jsonBody(calls[0])
    assertEquals(body.mediaItems[0].type, 'image')
    assertEquals(body.platforms[0].platformSpecificData?.contentType, 'story')
  } finally {
    restore()
  }
})

Deno.test('publishToZernio — reels uses contentType=reels and a video item', async () => {
  const supa = makeSupabase()
  const { calls, restore } = installFetchMock(() =>
    new Response(
      JSON.stringify({
        post_id: 'post_reel',
        platform_url: 'https://instagram.com/reel/abc',
        scheduled_for: FUTURE_ISO,
      }),
      { status: 200 },
    ),
  )
  try {
    await publishToZernio(
      { token: 'tok', supabase: supa.client, now: FIXED_NOW },
      {
        ...baseRequest,
        content_type: 'reels',
        media: [{ storage_path: 'u/t/step-3/clip.mp4' }],
      },
    )
    const body = jsonBody(calls[0])
    assertEquals(body.mediaItems[0].type, 'video')
    assertEquals(body.platforms[0].platformSpecificData?.contentType, 'reels')
  } finally {
    restore()
  }
})

Deno.test('publishToZernio — rejects past scheduled_for before any HTTP call', async () => {
  const supa = makeSupabase()
  const { calls, restore } = installFetchMock(() => new Response('{}', { status: 200 }))
  try {
    await assertRejects(
      () =>
        publishToZernio(
          { token: 'tok', supabase: supa.client, now: FIXED_NOW },
          {
            ...baseRequest,
            content_type: 'feed',
            media: [{ storage_path: 'u/t/step-1/a.jpg' }],
            scheduled_for: PAST_ISO,
          },
        ),
      Error,
      'past',
    )
    // Crucially: no HTTP call and no signed URL minted.
    assertEquals(calls.length, 0)
    assertEquals(supa.calls.length, 0)
  } finally {
    restore()
  }
})

Deno.test('publishToZernio — rejects empty media array before any HTTP call', async () => {
  const supa = makeSupabase()
  const { calls, restore } = installFetchMock(() => new Response('{}', { status: 200 }))
  try {
    await assertRejects(
      () =>
        publishToZernio(
          { token: 'tok', supabase: supa.client, now: FIXED_NOW },
          { ...baseRequest, content_type: 'feed', media: [] },
        ),
      Error,
      'media',
    )
    assertEquals(calls.length, 0)
  } finally {
    restore()
  }
})

Deno.test('publishToZernio — bubbles ZernioApiError on non-2xx response with status + truncated body', async () => {
  const supa = makeSupabase()
  const { restore } = installFetchMock(() =>
    new Response('rate limit exceeded', { status: 429 }),
  )
  try {
    const err = await assertRejects(
      () =>
        publishToZernio(
          { token: 'tok', supabase: supa.client, now: FIXED_NOW },
          {
            ...baseRequest,
            content_type: 'feed',
            media: [{ storage_path: 'u/t/step-1/a.jpg' }],
          },
        ),
      ZernioApiError,
    )
    assertEquals(err.status, 429)
    assertStringIncludes(err.message, 'rate limit')
  } finally {
    restore()
  }
})

Deno.test('publishToZernio — surfaces signed-URL errors with bucket/path context', async () => {
  const supa = makeSupabase({ signedUrlError: { message: 'object not found' } })
  const { calls, restore } = installFetchMock(() => new Response('{}', { status: 200 }))
  try {
    await assertRejects(
      () =>
        publishToZernio(
          { token: 'tok', supabase: supa.client, now: FIXED_NOW },
          {
            ...baseRequest,
            content_type: 'feed',
            media: [{ storage_path: 'u/t/step-1/missing.jpg' }],
          },
        ),
      Error,
      'object not found',
    )
    // No HTTP call once the signed-URL minting failed.
    assertEquals(calls.length, 0)
  } finally {
    restore()
  }
})

Deno.test('publishToZernio — accepts injected fetchImpl (no global mutation needed)', async () => {
  const supa = makeSupabase()
  const localCalls: MockCall[] = []
  const fakeFetch = ((url: any, init?: RequestInit) => {
    localCalls.push({ url: typeof url === 'string' ? url : url.toString(), init })
    return Promise.resolve(
      new Response(
        JSON.stringify({
          post_id: 'p1',
          platform_url: 'https://x',
          scheduled_for: FUTURE_ISO,
        }),
        { status: 200 },
      ),
    )
  }) as typeof fetch

  const out = await publishToZernio(
    {
      token: 'tok',
      supabase: supa.client,
      now: FIXED_NOW,
      fetchImpl: fakeFetch,
    },
    {
      ...baseRequest,
      content_type: 'feed',
      media: [{ storage_path: 'u/t/step-1/a.jpg' }],
    },
  )
  assertEquals(out.post_id, 'p1')
  assertEquals(localCalls.length, 1)
  assertEquals(localCalls[0].url, 'https://zernio.com/api/v1/posts')
})
