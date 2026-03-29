import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

/**
 * Delete test data created during E2E runs.
 * Matches entries whose ID starts with the given prefix.
 */
export async function cleanupTestData(table, idPrefix) {
  if (!supabaseUrl || !supabaseKey) return
  const supabase = createClient(supabaseUrl, supabaseKey)
  await supabase.from(table).delete().like('id', `${idPrefix}%`)
}
