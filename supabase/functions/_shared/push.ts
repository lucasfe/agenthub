// Web Push delivery helper, shared by Edge Functions that need to notify a
// user (mobile slice 8 wires this into chat triggers — approval gate, run.done,
// run.error). The module has three layers, each independently swappable:
//
//   1. sendPush — orchestration. Loads subscriptions for a user, fans out,
//      handles 410/404 by deleting the row, and never throws on per-row
//      delivery failures. The caller gets a `{sent, deleted}` summary.
//   2. deliverWebPush — the per-subscription HTTP request. Builds VAPID
//      headers + the encrypted body and POSTs to the push endpoint.
//   3. defaultSignVapidJwt + defaultEncryptPayload — the crypto layer.
//      ECDSA P-256 SHA-256 for the JWT (RFC 8292) and aes128gcm content
//      encoding (RFC 8291) for the payload. Both are pure Web Crypto so the
//      module runs in Deno without npm interop.
//
// Every layer accepts dependency overrides so tests can stub fetch and the
// crypto helpers without exercising the real cryptography.

// deno-lint-ignore-file no-explicit-any

// ---------- Types ----------

export interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  deepLink?: string
}

export interface VapidConfig {
  /** Uncompressed P-256 public key, base64url-encoded (65 bytes raw). */
  publicKey: string
  /** Raw P-256 private key, base64url-encoded (32 bytes raw). */
  privateKey: string
  /** Contact URL — typically `mailto:you@example.com`. */
  subject: string
}

export interface DeliveryResult {
  status: number
}

export interface VapidJwtParams {
  audience: string
  subject: string
  publicKey: string
  privateKey: string
  /** Unix seconds. */
  expiresAt: number
}

export interface EncryptPayloadParams {
  payload: Uint8Array
  p256dh: string
  auth: string
}

export interface DeliverDeps {
  fetch?: typeof fetch
  signVapidJwt?: (params: VapidJwtParams) => Promise<string>
  encryptPayload?: (params: EncryptPayloadParams) => Promise<Uint8Array>
  now?: () => number
}

export interface SendPushArgs {
  userId: string
  title: string
  body: string
  deepLink?: string
}

export interface SendPushDeps {
  supabase: any
  vapid: VapidConfig
  deliver?: (
    params: {
      subscription: PushSubscriptionRow
      payload: PushPayload
      vapid: VapidConfig
    },
  ) => Promise<DeliveryResult>
  log?: {
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
}

// ---------- Public API: sendPush ----------

export async function sendPush(
  args: SendPushArgs,
  deps: SendPushDeps,
): Promise<{ sent: number; deleted: number }> {
  const log = deps.log ?? console
  const deliver = deps.deliver ?? deliverWebPush

  const { data, error } = await deps.supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', args.userId)

  if (error) {
    log.error('[push] failed to load subscriptions', error)
    return { sent: 0, deleted: 0 }
  }
  const subs = (data ?? []) as PushSubscriptionRow[]
  if (subs.length === 0) return { sent: 0, deleted: 0 }

  const payload: PushPayload = { title: args.title, body: args.body }
  if (args.deepLink) payload.deepLink = args.deepLink

  let sent = 0
  let deleted = 0
  for (const sub of subs) {
    let result: DeliveryResult
    try {
      result = await deliver({ subscription: sub, payload, vapid: deps.vapid })
    } catch (err) {
      log.error('[push] delivery threw', {
        endpoint: sub.endpoint,
        error: String(err),
      })
      continue
    }
    if (result.status === 410 || result.status === 404) {
      const { error: delErr } = await deps.supabase
        .from('push_subscriptions')
        .delete()
        .eq('id', sub.id)
      if (delErr) {
        log.error('[push] failed to delete expired subscription', {
          id: sub.id,
          error: delErr,
        })
      } else {
        deleted += 1
      }
    } else if (result.status >= 200 && result.status < 300) {
      sent += 1
    } else {
      log.warn('[push] non-2xx push response', {
        endpoint: sub.endpoint,
        status: result.status,
      })
    }
  }
  return { sent, deleted }
}

// ---------- Delivery: deliverWebPush ----------

export async function deliverWebPush(
  params: {
    subscription: PushSubscriptionRow
    payload: PushPayload
    vapid: VapidConfig
  },
  deps: DeliverDeps = {},
): Promise<DeliveryResult> {
  const fetchImpl = deps.fetch ?? fetch
  const signJwt = deps.signVapidJwt ?? defaultSignVapidJwt
  const encrypt = deps.encryptPayload ?? defaultEncryptPayload
  const now = deps.now ?? Date.now

  const audience = new URL(params.subscription.endpoint).origin
  const expiresAt = Math.floor(now() / 1000) + 12 * 3600
  const jwt = await signJwt({
    audience,
    subject: params.vapid.subject,
    publicKey: params.vapid.publicKey,
    privateKey: params.vapid.privateKey,
    expiresAt,
  })

  const payloadBytes = new TextEncoder().encode(JSON.stringify(params.payload))
  const body = await encrypt({
    payload: payloadBytes,
    p256dh: params.subscription.p256dh,
    auth: params.subscription.auth,
  })

  const res = await fetchImpl(params.subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${params.vapid.publicKey}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Content-Length': String(body.byteLength),
    },
    body,
  })
  return { status: res.status }
}

// ---------- Crypto: VAPID JWT (RFC 8292) ----------

export async function defaultSignVapidJwt(
  params: VapidJwtParams,
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = {
    aud: params.audience,
    exp: params.expiresAt,
    sub: params.subject,
  }
  const headerB64 = b64urlEncode(
    new TextEncoder().encode(JSON.stringify(header)),
  )
  const claimsB64 = b64urlEncode(
    new TextEncoder().encode(JSON.stringify(claims)),
  )
  const signingInput = new TextEncoder().encode(`${headerB64}.${claimsB64}`)

  const privateKeyBytes = b64urlDecode(params.privateKey)
  const publicKeyBytes = b64urlDecode(params.publicKey)
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) {
    throw new Error(
      'VAPID public key must be 65 bytes uncompressed P-256 (0x04 prefix)',
    )
  }
  const x = publicKeyBytes.slice(1, 33)
  const y = publicKeyBytes.slice(33, 65)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: b64urlEncode(privateKeyBytes),
    x: b64urlEncode(x),
    y: b64urlEncode(y),
    ext: true,
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signingInput,
  )
  return `${headerB64}.${claimsB64}.${b64urlEncode(new Uint8Array(signature))}`
}

// ---------- Crypto: aes128gcm payload (RFC 8291) ----------

export async function defaultEncryptPayload(
  params: EncryptPayloadParams,
): Promise<Uint8Array> {
  const recipientPubBytes = b64urlDecode(params.p256dh)
  const authSecret = b64urlDecode(params.auth)
  if (recipientPubBytes.length !== 65 || recipientPubBytes[0] !== 0x04) {
    throw new Error('Recipient p256dh must be 65 bytes uncompressed P-256')
  }

  // Generate ephemeral ECDH key pair (sender side).
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const ephemeralPubJwk = await crypto.subtle.exportKey(
    'jwk',
    ephemeralKeyPair.publicKey,
  )
  const ephemeralPubRaw = jwkToUncompressedP256(ephemeralPubJwk as JsonWebKey)

  // Import recipient public key as ECDH peer.
  const recipientPub = await crypto.subtle.importKey(
    'raw',
    recipientPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  // Shared secret via ECDH.
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: recipientPub },
      ephemeralKeyPair.privateKey,
      256,
    ),
  )

  // Per RFC 8291:
  //   PRK_key = HKDF-Extract(authSecret, sharedSecret)
  //   key_info = "WebPush: info\0" || recipient_pub || ephemeral_pub
  //   IKM     = HKDF-Expand(PRK_key, key_info, 32)
  const prkKey = await hkdfExtract(authSecret, sharedSecret)
  const keyInfo = concatBytes(
    new TextEncoder().encode('WebPush: info\0'),
    recipientPubBytes,
    ephemeralPubRaw,
  )
  const ikm = await hkdfExpand(prkKey, keyInfo, 32)

  // Random 16-byte salt; PRK = HKDF-Extract(salt, IKM).
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hkdfExtract(salt, ikm)

  // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  // Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const cek = await hkdfExpand(
    prk,
    new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
    16,
  )
  const nonce = await hkdfExpand(
    prk,
    new TextEncoder().encode('Content-Encoding: nonce\0'),
    12,
  )

  // Single-record padding: payload || 0x02
  const padded = concatBytes(params.payload, new Uint8Array([0x02]))

  const cekKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      cekKey,
      padded,
    ),
  )

  // RFC 8188 framing: salt(16) || rs(4 BE) || idlen(1) || keyid(idlen) || ciphertext
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]) // 4096
  const idlen = new Uint8Array([ephemeralPubRaw.length])
  return concatBytes(salt, rs, idlen, ephemeralPubRaw, ciphertext)
}

// ---------- Crypto helpers ----------

async function hkdfExtract(
  salt: Uint8Array,
  ikm: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    salt,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm))
}

async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    prk,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  let t = new Uint8Array(0)
  let okm = new Uint8Array(0)
  let counter = 1
  while (okm.length < length) {
    const data = new Uint8Array(t.length + info.length + 1)
    data.set(t, 0)
    data.set(info, t.length)
    data[data.length - 1] = counter
    t = new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
    okm = concatBytes(okm, t)
    counter += 1
  }
  return okm.slice(0, length)
}

function jwkToUncompressedP256(jwk: JsonWebKey): Uint8Array {
  if (!jwk.x || !jwk.y) {
    throw new Error('JWK missing x/y for P-256 public key')
  }
  const x = b64urlDecode(jwk.x)
  const y = b64urlDecode(jwk.y)
  if (x.length !== 32 || y.length !== 32) {
    throw new Error('P-256 JWK x/y must be 32 bytes each')
  }
  const out = new Uint8Array(65)
  out[0] = 0x04
  out.set(x, 1)
  out.set(y, 33)
  return out
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// ---------- base64url ----------

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin)
  return b64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function b64urlDecode(str: string): Uint8Array {
  const padded = str.replaceAll('-', '+').replaceAll('_', '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const b64 = padded + '='.repeat(padLen)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
