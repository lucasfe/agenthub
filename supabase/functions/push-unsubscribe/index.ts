// Edge Function: push-unsubscribe
//
// Removes a stored Web Push subscription for the authenticated user. The
// client calls this when the user opts out of notifications or when its
// browser-side `PushManager` subscription was rotated/expired.
//
// The delete is scoped to `auth.uid() = user_id AND endpoint = ?`, so a
// client cannot unsubscribe another user's device even by guessing endpoints.
// 404 is returned when no row matched, which keeps the operation idempotent
// from the client's perspective: re-sending an unsubscribe never errors.

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

export interface UnsubscribeDeps {
  createClient: typeof defaultCreateClient
  supabaseUrl: string
  supabaseAnonKey: string
}

export async function handlePushUnsubscribe(
  req: Request,
  deps: UnsubscribeDeps,
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
  if (!endpoint) {
    return jsonResponse({ error: 'Missing endpoint' }, 400)
  }

  const { error, count } = await userClient
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) {
    console.error('[push-unsubscribe] delete error', error)
    return jsonResponse({ error: 'Failed to delete subscription' }, 500)
  }

  if (typeof count === 'number' && count === 0) {
    return jsonResponse({ ok: true, deleted: 0 }, 404)
  }
  return jsonResponse({ ok: true, deleted: count ?? null }, 200)
}

if (import.meta.main) {
  Deno.serve((req) =>
    handlePushUnsubscribe(req, {
      createClient: defaultCreateClient,
      supabaseUrl: Deno.env.get('SUPABASE_URL')!,
      supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    }),
  )
}
