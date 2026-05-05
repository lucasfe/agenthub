// Supabase wrapper for the `template_references` table and the
// private `template-references` Storage bucket. Mirrors the shape of
// `templatesApi.js` so the two CRUD surfaces feel identical.
//
// Reads return `[]` when supabase is null (e.g. dev without env vars).
// Missing-table errors degrade to the empty list — same fail-safe used
// by `templatesApi.fetchTemplates`.

import { supabase } from './supabase'

const BUCKET = 'template-references'
const TABLE = 'template_references'

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

function isMissingTableError(error) {
  return Boolean(error && MISSING_TABLE_CODES.has(error.code))
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function extractExtension(filename, fallback = '') {
  if (typeof filename !== 'string') return fallback
  const idx = filename.lastIndexOf('.')
  if (idx === -1 || idx === filename.length - 1) return fallback
  return filename.slice(idx)
}

export async function fetchReferences(templateId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('template_id', templateId)
    .order('created_at', { ascending: true })
  if (error) {
    if (isMissingTableError(error)) {
      console.warn('[template_references] table not reachable, returning []', error)
      return []
    }
    throw new Error(error.message || 'Failed to load references')
  }
  return data || []
}

export async function createTextReference(templateId, payload) {
  if (!supabase) return null
  const row = {
    template_id: templateId,
    key: payload.key,
    kind: 'text',
    content_text: payload.content_text ?? null,
    mime_type: payload.mime_type ?? 'text/markdown',
    original_filename: payload.original_filename ?? null,
  }
  const { data, error } = await supabase.from(TABLE).insert(row).select().single()
  if (error) throw new Error(error.message || 'Failed to create text reference')
  return data
}

export async function createImageReference(templateId, payload) {
  if (!supabase) return null
  const { file, key, mime_type, original_filename } = payload
  const ext = extractExtension(original_filename) || extractExtension(file?.name) || ''
  const path = `${templateId}/${randomId()}${ext}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: mime_type,
      upsert: false,
    })
  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload reference image')
  }

  const storagePath = uploadData?.path ?? path
  const row = {
    template_id: templateId,
    key,
    kind: 'image',
    storage_path: storagePath,
    mime_type,
    original_filename: original_filename ?? null,
  }
  const { data, error } = await supabase.from(TABLE).insert(row).select().single()
  if (error) throw new Error(error.message || 'Failed to create image reference')
  return data
}

export async function updateReference(id, updates) {
  if (!supabase) return null
  const allowed = {}
  if (typeof updates.key === 'string') allowed.key = updates.key
  if (typeof updates.content_text === 'string') {
    allowed.content_text = updates.content_text
  }
  if (typeof updates.original_filename === 'string') {
    allowed.original_filename = updates.original_filename
  }
  allowed.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from(TABLE)
    .update(allowed)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to update reference')
  return data
}

export async function deleteReference(id) {
  if (!supabase) return
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete reference')
}

export async function getReferenceSignedUrl(storagePath, ttlSeconds = 3600) {
  if (!supabase) return null
  if (typeof storagePath !== 'string' || storagePath.length === 0) return null
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttlSeconds)
  if (error) throw new Error(error.message || 'Failed to mint signed URL')
  return data?.signedUrl ?? null
}

export async function fetchTemplateById(id) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null // single row not found
    if (isMissingTableError(error)) return null
    throw new Error(error.message || 'Failed to load template')
  }
  return data
}
