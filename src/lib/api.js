import { supabase } from './supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Database not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.')
}

// ── Agents ──────────────────────────────────────────

export async function fetchAgents() {
  requireSupabase()
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, category, description, tags, icon, color, featured, popularity, tools, model, capabilities, content, usage_count')
    .order('popularity', { ascending: false })

  if (error) throw error
  return data
}

// Fire-and-forget: bumps the persistent usage counter for an agent. The
// `event` label is currently advisory (both events bump the same counter) but
// is forwarded so it shows up in Supabase's request logs for ad-hoc analytics.
// Resolves with the new count on success and `null` on failure — callers
// should not block UI on this and should not surface the error to the user.
export async function trackAgentUsage(agentId, event) {
  if (!agentId || !supabase) return null
  try {
    const { data, error } = await supabase.rpc('increment_agent_usage', {
      p_agent_id: agentId,
    })
    if (error) {
      console.warn(`[trackAgentUsage] ${event || 'unknown'} for ${agentId} failed:`, error.message)
      return null
    }
    return typeof data === 'number' ? data : null
  } catch (err) {
    console.warn(`[trackAgentUsage] ${event || 'unknown'} for ${agentId} threw:`, err)
    return null
  }
}

export async function fetchAgent(id) {
  requireSupabase()
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createAgent(agent) {
  requireSupabase()
  const { data, error } = await supabase
    .from('agents')
    .insert(agent)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateAgent(id, updates) {
  requireSupabase()
  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteAgent(id) {
  requireSupabase()
  const { error } = await supabase
    .from('agents')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Lightweight fetch for cross-cutting checks (e.g. agent-deletion warnings).
// Selects only what callers need to inspect plans + status. The Kanban
// board still reads `select('*')` from its own internal helper because it
// also needs run/error fields.
export async function fetchAllTasks() {
  requireSupabase()
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, plan')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

// ── Teams ───────────────────────────────────────────

export async function fetchTeams() {
  requireSupabase()
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function fetchTeam(id) {
  requireSupabase()
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createTeam(team) {
  requireSupabase()
  const { data, error } = await supabase
    .from('teams')
    .insert(team)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTeam(id) {
  requireSupabase()
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function updateTeam(id, updates) {
  requireSupabase()
  const { data, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Tools ───────────────────────────────────────────

export async function fetchTools() {
  requireSupabase()
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('enabled', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data
}
