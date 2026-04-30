// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from 'jsr:@std/assert@1'
import { sendPush } from './push.ts'

interface Sub {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

function makeSupabase(opts: {
  subscriptions?: Sub[]
  loadError?: unknown
  deleteError?: unknown
}) {
  const calls: {
    selects: { table: string; userId?: string }[]
    deletes: { id: string }[]
  } = { selects: [], deletes: [] }
  const subs = opts.subscriptions ?? []
  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, val: string) {
              calls.selects.push({ table, userId: val })
              return Promise.resolve({
                data: subs,
                error: opts.loadError ?? null,
              })
            },
          }
        },
        delete() {
          return {
            eq(_col: string, val: string) {
              calls.deletes.push({ id: val })
              return Promise.resolve({
                data: null,
                error: opts.deleteError ?? null,
              })
            },
          }
        },
      }
    },
  }
  return { calls, client }
}

type SendOutcome = { ok: true } | { error: { statusCode?: number; message?: string } }

function makeWebPush(opts: {
  resultByEndpoint?: Record<string, SendOutcome>
  defaultResult?: SendOutcome
}) {
  const calls: {
    vapid: { subject: string; publicKey: string; privateKey: string }[]
    sends: { endpoint: string; keys: any; payload: string }[]
  } = { vapid: [], sends: [] }
  const client = {
    setVapidDetails(subject: string, publicKey: string, privateKey: string) {
      calls.vapid.push({ subject, publicKey, privateKey })
    },
    sendNotification(sub: any, payload: string) {
      calls.sends.push({ endpoint: sub.endpoint, keys: sub.keys, payload })
      const outcome =
        opts.resultByEndpoint?.[sub.endpoint] ?? opts.defaultResult ?? { ok: true }
      if ('error' in outcome) {
        return Promise.reject(outcome.error)
      }
      return Promise.resolve({ statusCode: 201 })
    },
  }
  return { calls, client }
}

const VAPID = {
  vapidSubject: 'mailto:test@example.com',
  vapidPublicKey: 'PUB',
  vapidPrivateKey: 'PRIV',
}

function makeLogger() {
  const errors: { msg: string; args: unknown[] }[] = []
  return {
    errors,
    logger: {
      error(msg: string, ...args: unknown[]) {
        errors.push({ msg, args })
      },
    },
  }
}

Deno.test('sendPush — no subscriptions returns { sent: 0, deleted: 0 }', async () => {
  const supabase = makeSupabase({ subscriptions: [] })
  const webpush = makeWebPush({})
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'user-1',
    title: 'Hello',
    body: 'World',
    deepLink: '/mobile/chat',
    ...VAPID,
    webpushClient: webpush.client,
  })
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(webpush.calls.sends.length, 0)
})

Deno.test('sendPush — single subscription success', async () => {
  const supabase = makeSupabase({
    subscriptions: [
      { id: 'sub-a', endpoint: 'https://fcm.googleapis.com/abc', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({ defaultResult: { ok: true } })
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'user-1',
    title: 'Hello',
    body: 'World',
    deepLink: '/mobile/chat',
    ...VAPID,
    webpushClient: webpush.client,
  })
  assertEquals(result, { sent: 1, deleted: 0 })
  assertEquals(webpush.calls.sends.length, 1)
})

Deno.test('sendPush — multiple subscriptions all succeed', async () => {
  const supabase = makeSupabase({
    subscriptions: [
      { id: 'sub-a', endpoint: 'https://a', p256dh: 'pk', auth: 'au' },
      { id: 'sub-b', endpoint: 'https://b', p256dh: 'pk', auth: 'au' },
      { id: 'sub-c', endpoint: 'https://c', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({ defaultResult: { ok: true } })
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'user-1',
    title: 'Hi',
    body: 'B',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
  })
  assertEquals(result, { sent: 3, deleted: 0 })
  assertEquals(webpush.calls.sends.length, 3)
})

Deno.test('sendPush — 410 Gone deletes the subscription row', async () => {
  const supabase = makeSupabase({
    subscriptions: [
      { id: 'sub-good', endpoint: 'https://good', p256dh: 'pk', auth: 'au' },
      { id: 'sub-gone', endpoint: 'https://gone', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({
    resultByEndpoint: {
      'https://good': { ok: true },
      'https://gone': { error: { statusCode: 410, message: 'Gone' } },
    },
  })
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'user-1',
    title: 'Hi',
    body: 'B',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
  })
  assertEquals(result, { sent: 1, deleted: 1 })
  assertEquals(supabase.calls.deletes, [{ id: 'sub-gone' }])
})

Deno.test('sendPush — 404 also deletes the subscription row', async () => {
  const supabase = makeSupabase({
    subscriptions: [
      { id: 'sub-x', endpoint: 'https://x', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({
    resultByEndpoint: { 'https://x': { error: { statusCode: 404 } } },
  })
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'user-1',
    title: 'Hi',
    body: 'B',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
  })
  assertEquals(result, { sent: 0, deleted: 1 })
  assertEquals(supabase.calls.deletes, [{ id: 'sub-x' }])
})

Deno.test('sendPush — non-410 errors are logged and do not delete', async () => {
  const { errors, logger } = makeLogger()
  const supabase = makeSupabase({
    subscriptions: [
      { id: 'sub-1', endpoint: 'https://x', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({
    resultByEndpoint: { 'https://x': { error: { statusCode: 500, message: 'boom' } } },
  })
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'user-1',
    title: 'Hi',
    body: 'B',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
    logger,
  })
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(supabase.calls.deletes.length, 0)
  assert(errors.length > 0, 'expected at least one error log')
})

Deno.test('sendPush — network error (no statusCode) logged and continues', async () => {
  const { errors, logger } = makeLogger()
  const supabase = makeSupabase({
    subscriptions: [
      { id: 'sub-1', endpoint: 'https://a', p256dh: 'pk', auth: 'au' },
      { id: 'sub-2', endpoint: 'https://b', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({
    resultByEndpoint: {
      'https://a': { error: { message: 'network down' } },
      'https://b': { ok: true },
    },
  })
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'user-1',
    title: 'Hi',
    body: 'B',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
    logger,
  })
  assertEquals(result, { sent: 1, deleted: 0 })
  assertEquals(supabase.calls.deletes.length, 0)
  assert(errors.length > 0, 'expected at least one error log')
})

Deno.test('sendPush — payload JSON includes title, body, deepLink', async () => {
  const supabase = makeSupabase({
    subscriptions: [
      { id: 's', endpoint: 'https://x', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({ defaultResult: { ok: true } })
  await sendPush({
    supabase: supabase.client,
    userId: 'u',
    title: 'Run finished',
    body: '5 steps',
    deepLink: '/mobile/chat?session=42',
    ...VAPID,
    webpushClient: webpush.client,
  })
  assertEquals(webpush.calls.sends.length, 1)
  const payload = JSON.parse(webpush.calls.sends[0].payload)
  assertEquals(payload, {
    title: 'Run finished',
    body: '5 steps',
    deepLink: '/mobile/chat?session=42',
  })
})

Deno.test('sendPush — VAPID details applied with subject and keys', async () => {
  const supabase = makeSupabase({
    subscriptions: [
      { id: 's', endpoint: 'https://x', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({ defaultResult: { ok: true } })
  await sendPush({
    supabase: supabase.client,
    userId: 'u',
    title: 't',
    body: 'b',
    deepLink: '/m',
    vapidSubject: 'mailto:lucasfe@gmail.com',
    vapidPublicKey: 'PUB123',
    vapidPrivateKey: 'PRIV123',
    webpushClient: webpush.client,
  })
  assertEquals(webpush.calls.vapid, [
    { subject: 'mailto:lucasfe@gmail.com', publicKey: 'PUB123', privateKey: 'PRIV123' },
  ])
})

Deno.test('sendPush — passes subscription endpoint and keys to webpush', async () => {
  const supabase = makeSupabase({
    subscriptions: [
      { id: 's', endpoint: 'https://endpoint.test', p256dh: 'pk-val', auth: 'auth-val' },
    ],
  })
  const webpush = makeWebPush({ defaultResult: { ok: true } })
  await sendPush({
    supabase: supabase.client,
    userId: 'u',
    title: 't',
    body: 'b',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
  })
  const call = webpush.calls.sends[0]
  assertEquals(call.endpoint, 'https://endpoint.test')
  assertEquals(call.keys, { p256dh: 'pk-val', auth: 'auth-val' })
})

Deno.test('sendPush — missing VAPID config returns 0 with no sends', async () => {
  const { errors, logger } = makeLogger()
  const supabase = makeSupabase({
    subscriptions: [
      { id: 's', endpoint: 'https://x', p256dh: 'pk', auth: 'au' },
    ],
  })
  const webpush = makeWebPush({})
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'u',
    title: 't',
    body: 'b',
    deepLink: '/m',
    vapidSubject: '',
    vapidPublicKey: '',
    vapidPrivateKey: '',
    webpushClient: webpush.client,
    logger,
  })
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(webpush.calls.sends.length, 0)
  assert(errors.length > 0, 'expected an error log when VAPID config is missing')
})

Deno.test('sendPush — supabase load error returns 0 and logs', async () => {
  const { errors, logger } = makeLogger()
  const supabase = makeSupabase({
    subscriptions: [],
    loadError: { message: 'db down' },
  })
  const webpush = makeWebPush({})
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'u',
    title: 't',
    body: 'b',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
    logger,
  })
  assertEquals(result, { sent: 0, deleted: 0 })
  assertEquals(webpush.calls.sends.length, 0)
  assert(errors.length > 0, 'expected an error log when loading subscriptions fails')
})

Deno.test('sendPush — queries push_subscriptions for the given userId', async () => {
  const supabase = makeSupabase({ subscriptions: [] })
  const webpush = makeWebPush({})
  await sendPush({
    supabase: supabase.client,
    userId: 'user-xyz',
    title: 't',
    body: 'b',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
  })
  assertEquals(supabase.calls.selects, [
    { table: 'push_subscriptions', userId: 'user-xyz' },
  ])
})

Deno.test('sendPush — failed delete on 410 still counts the row as not sent', async () => {
  const { errors, logger } = makeLogger()
  const supabase = makeSupabase({
    subscriptions: [
      { id: 'sub-gone', endpoint: 'https://gone', p256dh: 'pk', auth: 'au' },
    ],
    deleteError: { message: 'delete failed' },
  })
  const webpush = makeWebPush({
    resultByEndpoint: { 'https://gone': { error: { statusCode: 410 } } },
  })
  const result = await sendPush({
    supabase: supabase.client,
    userId: 'u',
    title: 't',
    body: 'b',
    deepLink: '/m',
    ...VAPID,
    webpushClient: webpush.client,
    logger,
  })
  assertEquals(result.sent, 0)
  assertEquals(result.deleted, 0)
  assert(errors.length > 0, 'expected an error log when delete fails')
})
