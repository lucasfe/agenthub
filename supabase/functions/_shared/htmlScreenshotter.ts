// HTML → JPEG screenshot pipeline backed by Browserless.
//
// Deep, narrow module: knows everything about driving Browserless, converting
// the resulting PNG to a JPEG (default q95 via sharp), uploading it to the
// `task-outputs` private Storage bucket, and minting a 24h signed URL. Reads
// no global state — both the Browserless token and the Supabase client are
// passed in by the caller, and the JPEG converter is dependency-injected so
// unit tests never trigger sharp's native binary install.
//
// Two seams the consumer / tests can override:
//   - pngToJpeg(png, quality)  — defaults to a lazy `npm:sharp` import
//   - fetchImpl                — defaults to global `fetch`
//
// Storage layout:
//   task-outputs/{userId}/{taskId}/step-{stepOrder}/{filenamePrefix}-{uuid}.jpg
//
// Browserless API: `POST https://chrome.browserless.io/screenshot?token=<TOK>`
// with JSON body `{ html, viewport: { width, height }, options: { type: 'png' } }`.
// 5xx responses are retried once before bubbling up; 4xx surfaces immediately.

// deno-lint-ignore-file no-explicit-any

import { signReadUrl } from './signedUrls.ts'

const BROWSERLESS_URL = 'https://chrome.browserless.io/screenshot'
const DEFAULT_JPEG_QUALITY = 95
const DEFAULT_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60
const TASK_OUTPUTS_BUCKET = 'task-outputs'
const DEFAULT_FILENAME_PREFIX = 'screenshot'
const FILENAME_SAFE_PATTERN = /[^a-zA-Z0-9_-]+/g

export interface ScreenshotRequest {
  html: string
  width: number
  height: number
  filenamePrefix?: string
}

export interface ScreenshotPath {
  userId: string
  taskId: string
  stepOrder: number
}

export interface ScreenshotResult {
  storage_path: string
  signed_url: string
  mime_type: 'image/jpeg'
  width: number
  height: number
}

export type PngToJpegFn = (
  png: Uint8Array,
  quality: number,
) => Promise<Uint8Array>

export interface CaptureDeps {
  token: string
  supabase: any
  pngToJpeg?: PngToJpegFn
  fetchImpl?: typeof fetch
  signedUrlTtlSeconds?: number
  jpegQuality?: number
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`)
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`)
  }
}

function sanitizeFilename(prefix: string): string {
  const trimmed = prefix.trim()
  const cleaned = trimmed.replace(FILENAME_SAFE_PATTERN, '-').replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 64) : DEFAULT_FILENAME_PREFIX
}

export async function fetchBrowserlessPng(
  token: string,
  request: ScreenshotRequest,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Browserless token is required.')
  }
  assertNonEmptyString(request.html, 'html')
  assertPositiveInteger(request.width, 'width')
  assertPositiveInteger(request.height, 'height')

  const url = `${BROWSERLESS_URL}?token=${encodeURIComponent(token)}`
  const body = JSON.stringify({
    html: request.html,
    viewport: { width: request.width, height: request.height },
    options: { type: 'png' },
  })

  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  }

  let res = await fetchImpl(url, init)
  if (res.status >= 500 && res.status < 600) {
    // One retry on transient upstream failures. We deliberately do not delay —
    // the Edge Function wall-clock budget is tight and Browserless cold-start
    // recovery is well under a second in practice.
    res = await fetchImpl(url, init)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Browserless screenshot failed (${res.status}): ${text.slice(0, 200)}`,
    )
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

// Lazy default JPEG converter. Imported only when no override is supplied so
// unit tests never resolve `npm:sharp` (whose native binaries are slow / can
// fail to install in stripped-down sandboxes).
async function defaultPngToJpeg(
  png: Uint8Array,
  quality: number,
): Promise<Uint8Array> {
  const mod: any = await import('npm:sharp@0.33.5')
  const sharp = (mod && (mod.default ?? mod)) as (
    input: Uint8Array,
  ) => { jpeg(opts: { quality: number; mozjpeg?: boolean }): { toBuffer(): Promise<Uint8Array> } }
  const out = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer()
  return out instanceof Uint8Array ? out : new Uint8Array(out)
}

export async function captureHtmlToTaskOutput(
  deps: CaptureDeps,
  request: ScreenshotRequest,
  path: ScreenshotPath,
  signal?: AbortSignal,
): Promise<ScreenshotResult> {
  assertNonEmptyString(path.userId, 'userId')
  assertNonEmptyString(path.taskId, 'taskId')
  if (
    typeof path.stepOrder !== 'number' ||
    !Number.isInteger(path.stepOrder) ||
    path.stepOrder < 0
  ) {
    throw new Error('stepOrder must be a non-negative integer.')
  }

  const png = await fetchBrowserlessPng(
    deps.token,
    request,
    deps.fetchImpl ?? fetch,
    signal,
  )

  const quality = deps.jpegQuality ?? DEFAULT_JPEG_QUALITY
  const convert = deps.pngToJpeg ?? defaultPngToJpeg
  const jpeg = await convert(png, quality)

  const safePrefix = sanitizeFilename(request.filenamePrefix ?? DEFAULT_FILENAME_PREFIX)
  const uniqueSuffix = crypto.randomUUID()
  const storagePath =
    `${path.userId}/${path.taskId}/step-${path.stepOrder}/${safePrefix}-${uniqueSuffix}.jpg`

  const { error: uploadError } = await deps.supabase.storage
    .from(TASK_OUTPUTS_BUCKET)
    .upload(storagePath, jpeg, {
      contentType: 'image/jpeg',
      upsert: false,
    })
  if (uploadError) {
    const message =
      typeof uploadError?.message === 'string'
        ? uploadError.message
        : String(uploadError)
    throw new Error(
      `Storage upload failed for ${TASK_OUTPUTS_BUCKET}/${storagePath}: ${message}`,
    )
  }

  const ttl = deps.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS
  const signedUrl = await signReadUrl(
    deps.supabase,
    TASK_OUTPUTS_BUCKET,
    storagePath,
    ttl,
  )

  return {
    storage_path: storagePath,
    signed_url: signedUrl,
    mime_type: 'image/jpeg',
    width: request.width,
    height: request.height,
  }
}
