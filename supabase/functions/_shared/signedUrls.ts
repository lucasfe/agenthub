// Mints time-bounded signed URLs for the private Storage buckets owned by the
// task-templates feature. Deep, narrow module: knows nothing about callers,
// reads no global state, and accepts the Supabase client as the first argument
// so unit tests can mock storage and never hit the network.
//
// Both buckets are private (Storage RLS rejects anonymous access), so signed
// URLs are the only safe way to expose objects to the browser without leaking
// a service-role token.

// deno-lint-ignore-file no-explicit-any

export type SignedUrlBucket = 'template-references' | 'task-outputs'

const SUPPORTED_BUCKETS: ReadonlySet<string> = new Set([
  'template-references',
  'task-outputs',
])

export async function signReadUrl(
  supabase: any,
  bucket: SignedUrlBucket,
  path: string,
  ttlSeconds: number,
): Promise<string> {
  if (!SUPPORTED_BUCKETS.has(bucket as string)) {
    throw new Error(
      `signReadUrl: unsupported bucket "${bucket}" (allowed: template-references, task-outputs).`,
    )
  }
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new Error('signReadUrl: path is required.')
  }
  if (
    typeof ttlSeconds !== 'number' ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds <= 0
  ) {
    throw new Error('signReadUrl: ttlSeconds must be a positive integer.')
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds)

  if (error) {
    const message =
      typeof error?.message === 'string' ? error.message : String(error)
    throw new Error(
      `signReadUrl failed for ${bucket}/${path}: ${message}`,
    )
  }
  if (
    !data ||
    typeof data.signedUrl !== 'string' ||
    data.signedUrl.length === 0
  ) {
    throw new Error(
      `signReadUrl returned no signed URL for ${bucket}/${path}.`,
    )
  }
  return data.signedUrl
}
