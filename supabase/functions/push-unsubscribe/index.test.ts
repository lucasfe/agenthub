// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'jsr:@std/assert@1'
import { handlePushUnsubscribe } from './index.ts'

interface MockClientCalls {
  authHeader?: string
  from: { table: string }[]
  delete: number
  filters: { col: string; val: any }[]
}

function makeMockClient(opts: {
  user?: { id: string } | null
  authError?: { message: string } | null
  deleteResult?: { error: any; count?: number; data?: any }
}) {
  const calls: MockClientCalls = { from: [], delete: 0, filters: [] }
  const factory = (_url: string, _key: string, init?: any) => {
    calls.authHeader = init?.global?.headers?.Authorization ?? ''
    const result = opts.deleteResult ?? { error: null, count: 1, data: null }
    const chain: any = {
      _filters: calls.filters,
      eq(col: string, val: any) {
        calls.filters.push({ col, val })
        return this
      },
      then(onFulfilled: any, onRejected: any) {
        return Promise.resolve(result).then(onFulfilled, onRejected)
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
          delete(_opts?: any) {
            calls.delete += 1
            return chain
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
  return new Request('http://localhost/push-unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

Deno.test('push-unsubscribe — rejects missing Authorization header with 401', async () => {
  const { factory } = makeMockClient({})
  const res = await handlePushUnsubscribe(
    new Request('http://localhost/push-unsubscribe', { method: 'POST' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 401)
})

Deno.test('push-unsubscribe — rejects invalid JWT with 401', async () => {
  const { factory } = makeMockClient({
    user: null,
    authError: { message: 'invalid jwt' },
  })
  const res = await handlePushUnsubscribe(
    makeReq({ endpoint: 'https://x' }, { Authorization: 'Bearer bad' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 401)
})

Deno.test('push-unsubscribe — rejects non-POST with 405', async () => {
  const { factory } = makeMockClient({})
  const res = await handlePushUnsubscribe(
    new Request('http://localhost/push-unsubscribe', {
      method: 'GET',
      headers: { Authorization: 'Bearer x' },
    }),
    baseDeps(factory),
  )
  assertEquals(res.status, 405)
})

Deno.test('push-unsubscribe — handles OPTIONS preflight', async () => {
  const { factory } = makeMockClient({})
  const res = await handlePushUnsubscribe(
    new Request('http://localhost/push-unsubscribe', { method: 'OPTIONS' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 200)
})

Deno.test('push-unsubscribe — rejects missing endpoint with 400', async () => {
  const { factory } = makeMockClient({ user: { id: 'u1' } })
  const res = await handlePushUnsubscribe(
    makeReq({}, { Authorization: 'Bearer t' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 400)
})

Deno.test('push-unsubscribe — rejects invalid JSON with 400', async () => {
  const { factory } = makeMockClient({ user: { id: 'u1' } })
  const res = await handlePushUnsubscribe(
    makeReq('{not-json', { Authorization: 'Bearer t' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 400)
})

Deno.test('push-unsubscribe — deletes scoped to user_id and endpoint, returns 200', async () => {
  const { factory, calls } = makeMockClient({
    user: { id: 'user-7' },
    deleteResult: { error: null, count: 1 },
  })
  const res = await handlePushUnsubscribe(
    makeReq(
      { endpoint: 'https://fcm.googleapis.com/xyz' },
      { Authorization: 'Bearer good' },
    ),
    baseDeps(factory),
  )
  assertEquals(res.status, 200)
  assertEquals(calls.from, [{ table: 'push_subscriptions' }])
  assertEquals(calls.delete, 1)
  // Order matters less than presence — both filters must be applied
  assertEquals(calls.filters.length, 2)
  const byCol: Record<string, any> = {}
  for (const f of calls.filters) byCol[f.col] = f.val
  assertEquals(byCol.user_id, 'user-7')
  assertEquals(byCol.endpoint, 'https://fcm.googleapis.com/xyz')
})

Deno.test('push-unsubscribe — returns 404 when no row matched (idempotent)', async () => {
  const { factory } = makeMockClient({
    user: { id: 'user-7' },
    deleteResult: { error: null, count: 0 },
  })
  const res = await handlePushUnsubscribe(
    makeReq(
      { endpoint: 'https://nope' },
      { Authorization: 'Bearer good' },
    ),
    baseDeps(factory),
  )
  assertEquals(res.status, 404)
})

Deno.test('push-unsubscribe — surfaces 500 when delete fails', async () => {
  const { factory } = makeMockClient({
    user: { id: 'u1' },
    deleteResult: { error: { message: 'boom' }, count: null },
  })
  const res = await handlePushUnsubscribe(
    makeReq({ endpoint: 'https://x' }, { Authorization: 'Bearer t' }),
    baseDeps(factory),
  )
  assertEquals(res.status, 500)
})

Deno.test('push-unsubscribe — forwards Authorization header to supabase client', async () => {
  const { factory, calls } = makeMockClient({ user: { id: 'u1' } })
  await handlePushUnsubscribe(
    makeReq(
      { endpoint: 'https://x' },
      { Authorization: 'Bearer abc.def.ghi' },
    ),
    baseDeps(factory),
  )
  assertEquals(calls.authHeader, 'Bearer abc.def.ghi')
})

Deno.test('push-unsubscribe — ignores client-supplied user_id (RLS-safe)', async () => {
  const { factory, calls } = makeMockClient({ user: { id: 'real-user' } })
  await handlePushUnsubscribe(
    makeReq(
      { endpoint: 'https://x', user_id: 'attacker-target' },
      { Authorization: 'Bearer t' },
    ),
    baseDeps(factory),
  )
  const byCol: Record<string, any> = {}
  for (const f of calls.filters) byCol[f.col] = f.val
  assertEquals(byCol.user_id, 'real-user')
})
