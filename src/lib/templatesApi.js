// Thin Supabase CRUD wrapper for the `task_templates` table.
//
// Mirrors the inline helpers BoardPage.jsx uses for `tasks`.

import { supabase } from './supabase'

// Postgres 42P01 ("relation does not exist") and Postgrest PGRST205
// ("schema cache miss") both mean the table is unreachable. From the
// user's perspective the page should render the empty state instead
// of a confusing schema error — see issue #340.
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

// Defensive fallback: if Supabase returns an unrecognized error code
// (e.g. an upstream version bump), fall back to matching the message
// against task_templates-specific phrasing. Matches the two upstream
// shapes we know — Postgres ("relation \"public.task_templates\" does
// not exist") and PostgREST ("Could not find the table
// 'public.task_templates' in the schema cache"). Restricted to the
// task_templates table so unrelated failures still surface.
const MISSING_TABLE_MESSAGE_PATTERN =
  /(relation\s+"?public\.task_templates"?\s+does\s+not\s+exist|table\s+'?public\.task_templates'?[^']*schema\s+cache)/i

function isMissingTableError(error) {
  if (!error) return false
  if (MISSING_TABLE_CODES.has(error.code)) return true
  if (typeof error.message === 'string' && MISSING_TABLE_MESSAGE_PATTERN.test(error.message)) {
    return true
  }
  return false
}

export async function fetchTemplates() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingTableError(error)) {
      console.warn('[templates] task_templates table not reachable, treating as empty', error)
      return []
    }
    console.error('[templates] fetch', error)
    throw error
  }
  return data || []
}

export async function insertTemplate(template) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('task_templates')
    .insert(template)
    .select()
    .single()
  if (error) {
    console.error('[templates] insert', error)
    throw error
  }
  return data
}

export async function updateTemplate(id, updates) {
  if (!supabase) return null
  const payload = { ...updates, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('task_templates')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('[templates] update', error)
    throw error
  }
  return data
}

export async function deleteTemplate(id) {
  if (!supabase) return
  const { error } = await supabase.from('task_templates').delete().eq('id', id)
  if (error) {
    console.error('[templates] delete', error)
    throw error
  }
}
