// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { signReadUrl } from './signedUrls.ts'

interface CreateSignedUrlCall {
  bucket: string
  path: string
  ttlSeconds: number
}

function makeSupabase(opts: {
  signedUrl?: string
  error?: { message: string }
}) {
  const calls: CreateSignedUrlCall[] = []
  const client = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl(path: string, ttlSeconds: number) {
            calls.push({ bucket, path, ttlSeconds })
            if (opts.error) {
              return Promise.resolve({ data: null, error: opts.error })
            }
            return Promise.resolve({
              data: { signedUrl: opts.signedUrl ?? 'https://signed.example/x' },
              error: null,
            })
          },
        }
      },
    },
  }
  return { calls, client }
}

Deno.test('signReadUrl — returns the signed URL for template-references bucket', async () => {
  const supabase = makeSupabase({
    signedUrl: 'https://signed.example/template-references/foo.png',
  })
  const url = await signReadUrl(
    supabase.client,
    'template-references',
    'foo.png',
    60,
  )
  assertEquals(url, 'https://signed.example/template-references/foo.png')
})

Deno.test('signReadUrl — returns the signed URL for task-outputs bucket', async () => {
  const supabase = makeSupabase({
    signedUrl: 'https://signed.example/task-outputs/bar.png',
  })
  const url = await signReadUrl(
    supabase.client,
    'task-outputs',
    'bar.png',
    60,
  )
  assertEquals(url, 'https://signed.example/task-outputs/bar.png')
})

Deno.test('signReadUrl — passes bucket, path, ttlSeconds through to storage', async () => {
  const supabase = makeSupabase({ signedUrl: 'https://x' })
  await signReadUrl(supabase.client, 'template-references', 'a/b/c.png', 120)
  assertEquals(supabase.calls.length, 1)
  assertEquals(supabase.calls[0].bucket, 'template-references')
  assertEquals(supabase.calls[0].path, 'a/b/c.png')
  assertEquals(supabase.calls[0].ttlSeconds, 120)
})

Deno.test('signReadUrl — rejects unknown bucket', async () => {
  const supabase = makeSupabase({})
  await assertRejects(
    () =>
      signReadUrl(
        supabase.client,
        'random-bucket' as unknown as 'template-references',
        'foo.png',
        60,
      ),
    Error,
    'unsupported bucket',
  )
  assertEquals(supabase.calls.length, 0)
})

Deno.test('signReadUrl — rejects empty path', async () => {
  const supabase = makeSupabase({})
  await assertRejects(
    () => signReadUrl(supabase.client, 'template-references', '', 60),
    Error,
    'path is required',
  )
  assertEquals(supabase.calls.length, 0)
})

Deno.test('signReadUrl — rejects whitespace-only path', async () => {
  const supabase = makeSupabase({})
  await assertRejects(
    () => signReadUrl(supabase.client, 'template-references', '   ', 60),
    Error,
    'path is required',
  )
})

Deno.test('signReadUrl — rejects zero ttlSeconds', async () => {
  const supabase = makeSupabase({})
  await assertRejects(
    () => signReadUrl(supabase.client, 'template-references', 'x.png', 0),
    Error,
    'ttlSeconds must be a positive integer',
  )
})

Deno.test('signReadUrl — rejects negative ttlSeconds', async () => {
  const supabase = makeSupabase({})
  await assertRejects(
    () => signReadUrl(supabase.client, 'template-references', 'x.png', -10),
    Error,
    'ttlSeconds must be a positive integer',
  )
})

Deno.test('signReadUrl — rejects non-integer ttlSeconds', async () => {
  const supabase = makeSupabase({})
  await assertRejects(
    () => signReadUrl(supabase.client, 'template-references', 'x.png', 1.5),
    Error,
    'ttlSeconds must be a positive integer',
  )
})

Deno.test('signReadUrl — surfaces Supabase storage error message', async () => {
  const supabase = makeSupabase({ error: { message: 'object not found' } })
  const err = await assertRejects(
    () =>
      signReadUrl(supabase.client, 'template-references', 'missing.png', 60),
    Error,
  )
  assert(err.message.includes('object not found'))
  assert(err.message.includes('template-references'))
  assert(err.message.includes('missing.png'))
})

Deno.test('signReadUrl — rejects when supabase returns no signedUrl', async () => {
  const client: any = {
    storage: {
      from(_bucket: string) {
        return {
          createSignedUrl(_path: string, _ttl: number) {
            return Promise.resolve({ data: {}, error: null })
          },
        }
      },
    },
  }
  await assertRejects(
    () => signReadUrl(client, 'template-references', 'x.png', 60),
    Error,
    'no signed URL',
  )
})

Deno.test('signReadUrl — rejects when supabase returns null data', async () => {
  const client: any = {
    storage: {
      from(_bucket: string) {
        return {
          createSignedUrl(_path: string, _ttl: number) {
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
    },
  }
  await assertRejects(
    () => signReadUrl(client, 'task-outputs', 'x.png', 60),
    Error,
    'no signed URL',
  )
})
