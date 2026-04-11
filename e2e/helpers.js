import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

function getClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'E2E cleanup requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be set. ' +
      'These are normally loaded from .env.local — make sure the test runner has access to them.',
    )
  }
  return createClient(supabaseUrl, supabaseKey)
}

/**
 * Bulk-delete any rows in `table` whose `id` matches the given LIKE pattern.
 * This runs both before and after e2e specs to make test runs idempotent —
 * even if a previous run was killed mid-flight (CI timeout, abort, crash),
 * the next run starts from a clean slate.
 *
 * @param {'agents' | 'teams'} table
 * @param {string} pattern A Postgres LIKE pattern, e.g. 'e2e-%'
 */
export async function cleanupByPrefix(table, pattern) {
  const supabase = getClient()
  const { error } = await supabase.from(table).delete().like('id', pattern)
  if (error) {
    throw new Error(`Failed to clean up ${table} with pattern "${pattern}": ${error.message}`)
  }
}
