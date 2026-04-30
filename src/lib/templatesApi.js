// Thin Supabase CRUD wrapper for the `task_templates` table.
//
// Mirrors the inline helpers BoardPage.jsx uses for `tasks`. Trivial
// pass-through — there is no isolated unit test, only transitive
// coverage from the page-level component tests.

import { supabase } from './supabase'

export async function fetchTemplates() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
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
