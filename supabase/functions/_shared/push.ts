// Web Push helper shared by Edge Functions that need to notify users.
//
// Loads every push_subscriptions row for the given user, sends a payload to
// each via the Web Push protocol with VAPID auth, and prunes rows whose
// endpoint is permanently expired (HTTP 410 Gone or 404 Not Found). Other
// transport failures are logged and skipped — a single bad subscription must
// never break the chat stream that triggered the push.
//
// Design notes:
// - Pure deep module: callers pass the Supabase client they already hold and
//   the function never reads cookies, headers, or hidden state. This keeps
//   the unit tests trivially mockable.
// - The actual Web Push transport (`webpushClient`) is dependency-injected.
//   Tests pass a stub; production uses `npm:web-push@3.6.7` lazy-loaded on
//   first send so type-checking and `deno test` do not require the npm
//   module to resolve.
// - The function never throws. Error signalling is via the `{ sent, deleted }`
//   counters and the injectable logger. Callers (chat/index.ts in slice 8)
//   rely on this contract to safely fire-and-forget.

// deno-lint-ignore-file no-explicit-any

export interface PushPayload {
  title: string
  body: string
  deepLink: string
}

export interface PushSubscriptionLike {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface WebPushClient {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  sendNotification(
    subscription: PushSubscriptionLike,
    payload: string,
  ): Promise<{ statusCode?: number } | unknown>
}

export interface SendPushLogger {
  error(msg: string, ...args: unknown[]): void
}

export interface SendPushArgs {
  supabase: any
  userId: string
  title: string
  body: string
  deepLink: string
  vapidSubject?: string
  vapidPublicKey?: string
  vapidPrivateKey?: string
  webpushClient?: WebPushClient
  logger?: SendPushLogger
}

export interface SendPushResult {
  sent: number
  deleted: number
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

const EXPIRED_STATUSES = new Set([404, 410])

export async function sendPush(args: SendPushArgs): Promise<SendPushResult> {
  const log = args.logger ?? console

  const subject =
    args.vapidSubject ?? safeEnv('VAPID_SUBJECT')
  const publicKey =
    args.vapidPublicKey ?? safeEnv('VITE_VAPID_PUBLIC_KEY')
  const privateKey =
    args.vapidPrivateKey ?? safeEnv('VAPID_PRIVATE_KEY')

  if (!subject || !publicKey || !privateKey) {
    log.error(
      '[sendPush] missing VAPID configuration — set VAPID_SUBJECT, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY',
    )
    return { sent: 0, deleted: 0 }
  }

  const { data, error } = await args.supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', args.userId)

  if (error) {
    log.error('[sendPush] failed to load subscriptions', error)
    return { sent: 0, deleted: 0 }
  }

  const subscriptions: SubscriptionRow[] = Array.isArray(data) ? data : []
  if (subscriptions.length === 0) {
    return { sent: 0, deleted: 0 }
  }

  let client: WebPushClient
  try {
    client = args.webpushClient ?? (await loadDefaultClient())
  } catch (err) {
    log.error('[sendPush] failed to load web-push client', err)
    return { sent: 0, deleted: 0 }
  }

  try {
    client.setVapidDetails(subject, publicKey, privateKey)
  } catch (err) {
    log.error('[sendPush] invalid VAPID configuration', err)
    return { sent: 0, deleted: 0 }
  }

  const payload: PushPayload = {
    title: args.title,
    body: args.body,
    deepLink: args.deepLink,
  }
  const payloadJson = JSON.stringify(payload)

  let sent = 0
  let deleted = 0

  for (const sub of subscriptions) {
    try {
      await client.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadJson,
      )
      sent++
    } catch (err: any) {
      const status =
        typeof err?.statusCode === 'number' ? err.statusCode : undefined
      if (status !== undefined && EXPIRED_STATUSES.has(status)) {
        const { error: delErr } = await args.supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id)
        if (delErr) {
          log.error(
            '[sendPush] failed to delete expired subscription',
            { id: sub.id, endpoint: sub.endpoint, status },
            delErr,
          )
        } else {
          deleted++
        }
      } else {
        log.error('[sendPush] send failed', {
          endpoint: sub.endpoint,
          status,
          err,
        })
      }
    }
  }

  return { sent, deleted }
}

function safeEnv(name: string): string {
  try {
    return Deno.env.get(name) ?? ''
  } catch {
    return ''
  }
}

let _defaultClientPromise: Promise<WebPushClient> | null = null

async function loadDefaultClient(): Promise<WebPushClient> {
  if (!_defaultClientPromise) {
    _defaultClientPromise = (async () => {
      const mod: any = await import('npm:web-push@3.6.7')
      const wp = mod?.default ?? mod
      if (
        typeof wp?.setVapidDetails !== 'function' ||
        typeof wp?.sendNotification !== 'function'
      ) {
        throw new Error('web-push module did not expose the expected API')
      }
      return {
        setVapidDetails: wp.setVapidDetails.bind(wp),
        sendNotification: wp.sendNotification.bind(wp),
      } as WebPushClient
    })()
  }
  return _defaultClientPromise
}
