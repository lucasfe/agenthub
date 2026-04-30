// Edge Function: push-subscribe
//
// Persists a Web Push subscription for the authenticated user. Used by the
// mobile shell at /mobile to register the browser's PushManager subscription
// so the backend can send notifications later (slices 6 and 8). This function
// only stores subscriptions — it never sends pushes.
//
// Auth: caller must present a valid Supabase JWT. The user's identity is
// derived from `auth.getUser()` and used as the `user_id` of the persisted
// row, so a client cannot register a subscription against another account
// even if it tries to set `user_id` in the body. RLS in the migration makes
// this defense-in-depth: the INSERT policy requires `auth.uid() = user_id`.

// deno-lint-ignore-file no-explicit-any

import { createClient as defaultCreateClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export interface SubscribeDeps {
  createClient: typeof defaultCreateClient
  supabaseUrl: string
  supabaseAnonKey: string
}

export async function handlePushSubscribe(
  req: Request,
  deps: SubscribeDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401)
  }

  const userClient = deps.createClient(deps.supabaseUrl, deps.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : ''
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : ''
  if (!endpoint || !p256dh || !auth) {
    return jsonResponse(
      { error: 'Missing endpoint, keys.p256dh, or keys.auth' },
      400,
    )
  }

  const { data, error } = await userClient
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh, auth },
      { onConflict: 'user_id,endpoint' },
    )
    .select('id')
    .single()

  if (error) {
    console.error('[push-subscribe] upsert error', error)
    return jsonResponse({ error: 'Failed to store subscription' }, 500)
  }

  return jsonResponse({ id: (data as any)?.id ?? null }, 200)
}

if (import.meta.main) {
  Deno.serve((req) =>
    handlePushSubscribe(req, {
      createClient: defaultCreateClient,
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    }),
  )
}
