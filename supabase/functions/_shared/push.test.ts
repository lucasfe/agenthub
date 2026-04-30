// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  deliverWebPush,
  sendPush,
  type PushSubscriptionRow,
  type SendPushDeps,
  type VapidConfig,
} from './push.ts'

// ---------- Mocks ----------

interface SupabaseCalls {
  selects: { table: string; columns: string; userId: string }[]
  deletes: { table: string; id: string }[]
}

function makeMockSupabase(opts: {
  rows?: PushSubscriptionRow[]
  loadError?: { message: string } | null
  deleteError?: { message: string } | null
}) {
  const calls: SupabaseCalls = { selects: [], deletes: [] }
  const supabase = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq: (col: string, val: string) => {
              if (col !== 'user_id') {
                throw new Error(`unexpected select filter ${col}`)
              }
              calls.selects.push({ table, columns, userId: val })
              return Promise.resolve({
                data: opts.rows ?? [],
                error: opts.loadError ?? null,
              })
            },
          }
        },
        delete() {
          return {
            eq: (col: string, val: string) => {
              if (col !== 'id') {
                throw new Error(`unexpected delete filter ${col}`)
              }
              calls.deletes.push({ table, id: val })
              return Promise.resolve({ error: opts.deleteError ?? null })
            },
          }
        },
      }
    },
  }
  return { supabase, calls }
}

interface CapturedLog {
  warn: any[][]
  error: any[][]
}

function makeLog(): { log: SendPushDeps['log']; captured: CapturedLog } {
  const captured: CapturedLog = { warn: [], error: [] }
  return {
    log: {
      warn: (...args: unknown[]) => captured.warn.push(args),
      error: (...args: unknown[]) => captured.error.push(args),
    },
    captured,
  }
}

const VAPID: VapidConfig = {
  publicKey: 'BNn-fake-public-key',
  privateKey: 'fake-private-key',
  subject: 'mailto:lucasfe@example.com',
}

const SUB_A: PushSubscriptionRow = {
  id: 'sub-a',
  endpoint: 'https://fcm.googleapis.com/fcm/send/AAAA',
  p256dh: 'p256dh-a',
  auth: 'auth-a',
}

const SUB_B: PushSubscriptionRow = {
  id: 'sub-b',
  endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/BBBB',
  p256dh: 'p256dh-b',
  auth: 'auth-b',
}

// ---------- sendPush orchestration ----------

Deno.test('sendPush — no subscriptions returns {sent:0,deleted:0} no-op', async () => {
  const { supabase, calls } = makeMockSupabase({ rows: [] })
  let deliverCalls = 0
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async () => {
        deliverCalls += 1
        return { status: 200 }
      },
    },
  )
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(deliverCalls, 0)
  assertEquals(calls.selects.length, 1)
  assertEquals(calls.deletes.length, 0)
})

Deno.test('sendPush — supabase load error returns {0,0} and logs without throwing', async () => {
  const { supabase } = makeMockSupabase({ loadError: { message: 'boom' } })
  const { log, captured } = makeLog()
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async () => ({ status: 200 }),
      log,
    },
  )
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(captured.error.length, 1)
})

Deno.test('sendPush — single subscription success returns {sent:1}', async () => {
  const { supabase } = makeMockSupabase({ rows: [SUB_A] })
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async () => ({ status: 201 }),
    },
  )
  assertEquals(result, { sent: 1, deleted: 0 })
})

Deno.test('sendPush — multiple subscriptions: each delivered with same payload+vapid', async () => {
  const { supabase } = makeMockSupabase({ rows: [SUB_A, SUB_B] })
  const seen: any[] = []
  const result = await sendPush(
    { userId: 'u1', title: 'Hi', body: 'World', deepLink: '/mobile/chat?session=42' },
    {
      supabase,
      vapid: VAPID,
      deliver: async (params) => {
        seen.push(params)
        return { status: 200 }
      },
    },
  )
  assertEquals(result, { sent: 2, deleted: 0 })
  assertEquals(seen.length, 2)
  assertEquals(seen[0].subscription.endpoint, SUB_A.endpoint)
  assertEquals(seen[1].subscription.endpoint, SUB_B.endpoint)
  // payload includes title/body/deepLink
  assertEquals(seen[0].payload, {
    title: 'Hi',
    body: 'World',
    deepLink: '/mobile/chat?session=42',
  })
  assertEquals(seen[1].payload, {
    title: 'Hi',
    body: 'World',
    deepLink: '/mobile/chat?session=42',
  })
  // vapid threaded through unchanged
  assertEquals(seen[0].vapid, VAPID)
})

Deno.test('sendPush — payload omits deepLink when absent', async () => {
  const { supabase } = makeMockSupabase({ rows: [SUB_A] })
  let seenPayload: any
  await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async (params) => {
        seenPayload = params.payload
        return { status: 200 }
      },
    },
  )
  assertEquals(seenPayload, { title: 'T', body: 'B' })
  assertEquals('deepLink' in seenPayload, false)
})

Deno.test('sendPush — 410 Gone response deletes the subscription row', async () => {
  const { supabase, calls } = makeMockSupabase({ rows: [SUB_A] })
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async () => ({ status: 410 }),
    },
  )
  assertEquals(result, { sent: 0, deleted: 1 })
  assertEquals(calls.deletes, [{ table: 'push_subscriptions', id: SUB_A.id }])
})

Deno.test('sendPush — 404 response also deletes the subscription row', async () => {
  const { supabase, calls } = makeMockSupabase({ rows: [SUB_A] })
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async () => ({ status: 404 }),
    },
  )
  assertEquals(result, { sent: 0, deleted: 1 })
  assertEquals(calls.deletes, [{ table: 'push_subscriptions', id: SUB_A.id }])
})

Deno.test('sendPush — mixed: A=200 success, B=410 deleted', async () => {
  const { supabase, calls } = makeMockSupabase({ rows: [SUB_A, SUB_B] })
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async ({ subscription }) =>
        subscription.id === SUB_A.id ? { status: 200 } : { status: 410 },
    },
  )
  assertEquals(result, { sent: 1, deleted: 1 })
  assertEquals(calls.deletes, [{ table: 'push_subscriptions', id: SUB_B.id }])
})

Deno.test('sendPush — network error from deliver is logged + does not throw', async () => {
  const { supabase } = makeMockSupabase({ rows: [SUB_A, SUB_B] })
  const { log, captured } = makeLog()
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async ({ subscription }) => {
        if (subscription.id === SUB_A.id) throw new Error('ECONNRESET')
        return { status: 200 }
      },
      log,
    },
  )
  // SUB_A failed, SUB_B succeeded — fanout continues
  assertEquals(result, { sent: 1, deleted: 0 })
  assertEquals(captured.error.length, 1)
})

Deno.test('sendPush — non-2xx non-410 response is logged but neither sent nor deleted', async () => {
  const { supabase, calls } = makeMockSupabase({ rows: [SUB_A] })
  const { log, captured } = makeLog()
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async () => ({ status: 500 }),
      log,
    },
  )
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(calls.deletes.length, 0)
  assertEquals(captured.warn.length, 1)
})

Deno.test('sendPush — querying scopes by user_id', async () => {
  const { supabase, calls } = makeMockSupabase({ rows: [SUB_A] })
  await sendPush(
    { userId: 'real-user-7', title: 'T', body: 'B' },
    { supabase, vapid: VAPID, deliver: async () => ({ status: 200 }) },
  )
  assertEquals(calls.selects[0].userId, 'real-user-7')
  assertEquals(calls.selects[0].table, 'push_subscriptions')
})

Deno.test('sendPush — delete failure on a 410 subscription is logged + does not throw', async () => {
  const { supabase, calls } = makeMockSupabase({
    rows: [SUB_A],
    deleteError: { message: 'rls denied' },
  })
  const { log, captured } = makeLog()
  const result = await sendPush(
    { userId: 'u1', title: 'T', body: 'B' },
    {
      supabase,
      vapid: VAPID,
      deliver: async () => ({ status: 410 }),
      log,
    },
  )
  // delete attempted but errored → not counted as deleted, error logged
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(calls.deletes.length, 1)
  assertEquals(captured.error.length, 1)
})

// ---------- deliverWebPush — VAPID headers + fetch contract ----------

Deno.test('deliverWebPush — POSTs to subscription endpoint with VAPID + aes128gcm headers', async () => {
  let captured: { url: string; init: RequestInit } | null = null
  const fakeFetch: typeof fetch = (url, init) => {
    captured = { url: String(url), init: init ?? {} }
    return Promise.resolve(new Response(null, { status: 201 }))
  }
  const result = await deliverWebPush(
    {
      subscription: SUB_A,
      payload: { title: 'T', body: 'B' },
      vapid: VAPID,
    },
    {
      fetch: fakeFetch,
      signVapidJwt: async () => 'fake.jwt.sig',
      encryptPayload: async () => new Uint8Array([1, 2, 3, 4]),
      now: () => 1_700_000_000_000,
    },
  )
  assertEquals(result.status, 201)
  assert(captured, 'fetch was not called')
  assertEquals((captured as any).url, SUB_A.endpoint)
  assertEquals((captured as any).init.method, 'POST')
  const headers = new Headers((captured as any).init.headers)
  // VAPID header present and well-formed
  assertEquals(
    headers.get('Authorization'),
    `vapid t=fake.jwt.sig, k=${VAPID.publicKey}`,
  )
  assertEquals(headers.get('Content-Encoding'), 'aes128gcm')
  assertEquals(headers.get('Content-Type'), 'application/octet-stream')
  assertEquals(headers.get('TTL'), '86400')
  // Body is the encrypted payload bytes
  const body = (captured as any).init.body as Uint8Array
  assertEquals(Array.from(body), [1, 2, 3, 4])
})

Deno.test('deliverWebPush — JWT audience is endpoint origin, exp is +12h, subject is mailto', async () => {
  let signSeen: any
  await deliverWebPush(
    {
      subscription: SUB_A,
      payload: { title: 'T', body: 'B' },
      vapid: VAPID,
    },
    {
      fetch: () => Promise.resolve(new Response(null, { status: 201 })),
      signVapidJwt: async (params) => {
        signSeen = params
        return 'jwt'
      },
      encryptPayload: async () => new Uint8Array(),
      now: () => 1_700_000_000_000,
    },
  )
  assertEquals(signSeen.audience, 'https://fcm.googleapis.com')
  assertEquals(signSeen.subject, VAPID.subject)
  assertEquals(signSeen.publicKey, VAPID.publicKey)
  assertEquals(signSeen.privateKey, VAPID.privateKey)
  // 12 hours from 1_700_000_000 (seconds) = +43200
  assertEquals(signSeen.expiresAt, 1_700_000_000 + 12 * 3600)
})

Deno.test('deliverWebPush — encryption is called with the JSON-stringified payload + recipient keys', async () => {
  let encSeen: any
  await deliverWebPush(
    {
      subscription: SUB_A,
      payload: { title: 'Hi', body: 'World', deepLink: '/x' },
      vapid: VAPID,
    },
    {
      fetch: () => Promise.resolve(new Response(null, { status: 201 })),
      signVapidJwt: async () => 'jwt',
      encryptPayload: async (params) => {
        encSeen = params
        return new Uint8Array()
      },
    },
  )
  const decoded = new TextDecoder().decode(encSeen.payload)
  assertEquals(JSON.parse(decoded), {
    title: 'Hi',
    body: 'World',
    deepLink: '/x',
  })
  assertEquals(encSeen.p256dh, SUB_A.p256dh)
  assertEquals(encSeen.auth, SUB_A.auth)
})

Deno.test('deliverWebPush — surfaces non-2xx status to caller', async () => {
  const result = await deliverWebPush(
    { subscription: SUB_A, payload: { title: 'T', body: 'B' }, vapid: VAPID },
    {
      fetch: () => Promise.resolve(new Response(null, { status: 410 })),
      signVapidJwt: async () => 'jwt',
      encryptPayload: async () => new Uint8Array(),
    },
  )
  assertEquals(result.status, 410)
})
