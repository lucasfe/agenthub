// Mirrors AI Assistant chat plans onto the Kanban board's `tasks` table.
//
// Every helper takes the Supabase client as the first argument so it can
// be mocked in tests and tolerates a null client (the app falls back to
// no-op when Supabase is not configured, matching the BoardPage helpers).

const TITLE_MAX = 80
const FALLBACK_TITLE = 'AI Assistant task'
const DEFAULT_CANCEL_REASON = 'Cancelled by user'
const DEFAULT_ERROR_REASON = 'Run failed'

export function deriveTitle(text) {
  const raw = (text || '').toString().trim()
  if (!raw) return FALLBACK_TITLE
  const firstLine = raw.split(/\r?\n/)[0].trim() || FALLBACK_TITLE
  if (firstLine.length <= TITLE_MAX) return firstLine
  return firstLine.slice(0, TITLE_MAX - 3) + '...'
}

export async function createTaskFromPlan(supabase, { plan, originalTask }) {
  if (!supabase) return null
  const title = deriveTitle(originalTask)
  const description = (originalTask || '').toString()
  const { data, error } = await supabase
    .from('tasks')
    .insert({ title, description, status: 'todo', plan })
    .select()
    .single()
  if (error) {
    console.error('[plan-task-sync] createTaskFromPlan', error)
    return null
  }
  return data
}

export async function updateTaskPlan(supabase, taskId, plan) {
  if (!supabase || !taskId) return
  const { error } = await supabase.from('tasks').update({ plan }).eq('id', taskId)
  if (error) console.error('[plan-task-sync] updateTaskPlan', error)
}

export async function markTaskApproved(supabase, taskId) {
  if (!supabase || !taskId) return
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'executing', error_message: null })
    .eq('id', taskId)
  if (error) console.error('[plan-task-sync] markTaskApproved', error)
}

export async function markTaskDone(supabase, taskId) {
  if (!supabase || !taskId) return
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done' })
    .eq('id', taskId)
  if (error) console.error('[plan-task-sync] markTaskDone', error)
}

export async function markTaskCancelled(supabase, taskId, reason = DEFAULT_CANCEL_REASON) {
  if (!supabase || !taskId) return
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'cancelled', error_message: reason || DEFAULT_CANCEL_REASON })
    .eq('id', taskId)
  if (error) console.error('[plan-task-sync] markTaskCancelled', error)
}

export async function markTaskError(supabase, taskId, errorMessage) {
  if (!supabase || !taskId) return
  const message = (errorMessage && String(errorMessage)) || DEFAULT_ERROR_REASON
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'error', error_message: message })
    .eq('id', taskId)
  if (error) console.error('[plan-task-sync] markTaskError', error)
}
