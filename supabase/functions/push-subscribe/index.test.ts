// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'jsr:@std/assert@1'
import { handlePushSubscribe } from './index.ts'

interface MockClientCalls {
  authHeader?: string
  from: { table: string }[]
  upsert: { values: any; options: any }[]
}

function makeMockClient(opts: {
  user?: { id: string } | null
  authError?: { message: string } | null
  upsertResult?: { data: any; error: any }
}) {
  const calls: MockClientCalls = { from: [], upsert: [] }
  let captured = ''
  const factory = (_url: string, _key: string, init?: any) => {
    captured = init?.global?.headers?.Authorization ?? ''
    calls.authHeader = captured
    const upsertChain: any = {
      select(_cols: string) {
        return this
      },
      single() {
        return Promise.resolve(
          opts.upsertResult ?? { data: { id: 'sub-1' }, error: null },
        )
      },
    }
    return {
      auth: {
        getUser: async () => ({
          data: { user: opts.user ?? null },
          error: opts.authError ?? null,
        }),
      },
      from(table: string) {
        calls.from.push({ table })
        return {
          upsert(values: any, options: any) {
            calls.upsert.push({ values, options })
            return upsertChain
          },
        }
      },
    } as any
  }
  return { factory, calls }
}

const baseDeps = (factory: any) => ({
  createClient: factory as any,
  supabaseUrl: 'http://localhost',
  supabaseAnonKey: 'anon',
})

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

Deno.test('push-subscribe — rejects missing Authorization header with 401', async () => {
  const { factory } = makeMockClient({})
  const res = await handlePushSubscribe(
    new Request('http://localhost/push-subscribe', { method: 'POST' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 401)
})

Deno.test('push-subscribe — rejects invalid JWT with 401', async () => {
  const { factory } = makeMockClient({
    user: null,
    authError: { message: 'invalid jwt' },
  })
  const res = await handlePushSubscribe(
    makeReq({ endpoint: 'https://x', keys: { p256dh: 'a', auth: 'b' } }, {
      Authorization: 'Bearer bad',
    }),
    baseDeps(factory),
  )
  assertEquals(res.status, 401)
})

Deno.test('push-subscribe — rejects non-POST with 405', async () => {
  const { factory } = makeMockClient({})
  const res = await handlePushSubscribe(
    new Request('http://localhost/push-subscribe', {
      method: 'GET',
      headers: { Authorization: 'Bearer x' },
    }),
    baseDeps(factory),
  )
  assertEquals(res.status, 405)
})

Deno.test('push-subscribe — handles OPTIONS preflight', async () => {
  const { factory } = makeMockClient({})
  const res = await handlePushSubscribe(
    new Request('http://localhost/push-subscribe', { method: 'OPTIONS' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 200)
  assertEquals(
    res.headers.get('Access-Control-Allow-Methods')?.includes('POST'),
    true,
  )
})

Deno.test('push-subscribe — rejects missing endpoint with 400', async () => {
  const { factory } = makeMockClient({ user: { id: 'u1' } })
  const res = await handlePushSubscribe(
    makeReq({ keys: { p256dh: 'a', auth: 'b' } }, { Authorization: 'Bearer t' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 400)
})

Deno.test('push-subscribe — rejects missing keys.p256dh with 400', async () => {
  const { factory } = makeMockClient({ user: { id: 'u1' } })
  const res = await handlePushSubscribe(
    makeReq({ endpoint: 'https://x', keys: { auth: 'b' } }, {
      Authorization: 'Bearer t',
    }),
    baseDeps(factory),
  )
  assertEquals(res.status, 400)
})

Deno.test('push-subscribe — rejects missing keys.auth with 400', async () => {
  const { factory } = makeMockClient({ user: { id: 'u1' } })
  const res = await handlePushSubscribe(
    makeReq({ endpoint: 'https://x', keys: { p256dh: 'a' } }, {
      Authorization: 'Bearer t',
    }),
    baseDeps(factory),
  )
  assertEquals(res.status, 400)
})

Deno.test('push-subscribe — rejects invalid JSON body with 400', async () => {
  const { factory } = makeMockClient({ user: { id: 'u1' } })
  const res = await handlePushSubscribe(
    makeReq('{not-json', { Authorization: 'Bearer t' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 400)
})

Deno.test('push-subscribe — upserts with user_id from auth, returns id', async () => {
  const { factory, calls } = makeMockClient({
    user: { id: 'user-42' },
    upsertResult: { data: { id: 'row-9' }, error: null },
  })
  const res = await handlePushSubscribe(
    makeReq(
      {
        endpoint: 'https://fcm.googleapis.com/abc',
        keys: { p256dh: 'pk', auth: 'auth-secret' },
      },
      { Authorization: 'Bearer good' },
    ),
    baseDeps(factory),
  )
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json, { id: 'row-9' })
  assertEquals(calls.from, [{ table: 'push_subscriptions' }])
  assertEquals(calls.upsert.length, 1)
  assertEquals(calls.upsert[0].values, {
    user_id: 'user-42',
    endpoint: 'https://fcm.googleapis.com/abc',
    p256dh: 'pk',
    auth: 'auth-secret',
  })
  assertEquals(calls.upsert[0].options, { onConflict: 'user_id,endpoint' })
})

Deno.test('push-subscribe — forwards Authorization header to supabase client', async () => {
  const { factory, calls } = makeMockClient({ user: { id: 'u1' } })
  await handlePushSubscribe(
    makeReq(
      { endpoint: 'https://x', keys: { p256dh: 'a', auth: 'b' } },
      { Authorization: 'Bearer abc.def.ghi' },
    ),
    baseDeps(factory),
  )
  assertEquals(calls.authHeader, 'Bearer abc.def.ghi')
})

Deno.test('push-subscribe — ignores client-supplied user_id (RLS-safe)', async () => {
  const { factory, calls } = makeMockClient({ user: { id: 'real-user' } })
  await handlePushSubscribe(
    makeReq(
      {
        endpoint: 'https://x',
        keys: { p256dh: 'a', auth: 'b' },
        user_id: 'attacker-target',
      },
      { Authorization: 'Bearer t' },
    ),
    baseDeps(factory),
  )
  assertEquals(calls.upsert[0].values.user_id, 'real-user')
})

Deno.test('push-subscribe — surfaces 500 when upsert fails', async () => {
  const { factory } = makeMockClient({
    user: { id: 'u1' },
    upsertResult: { data: null, error: { message: 'boom' } },
  })
  const res = await handlePushSubscribe(
    makeReq(
      { endpoint: 'https://x', keys: { p256dh: 'a', auth: 'b' } },
      { Authorization: 'Bearer t' },
    ),
    baseDeps(factory),
  )
  assertEquals(res.status, 500)
})
