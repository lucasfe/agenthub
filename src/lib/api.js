import { supabase } from './supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Database not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.')
}

// ── Agents ──────────────────────────────────────────

export async function fetchAgents() {
  requireSupabase()
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, category, description, tags, icon, color, featured, popularity')
    .order('popularity', { ascending: false })

  if (error) throw error
  return data
}

export async function fetchAgent(id) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createAgent(agent) {
  const { data, error } = await supabase
    .from('agents')
    .insert(agent)
    .select()
    .single()

  if (error) throw error
  return data
}

// ── Teams ───────────────────────────────────────────

export async function fetchTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function fetchTeam(id) {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createTeam(team) {
  const { data, error } = await supabase
    .from('teams')
    .insert(team)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateTeam(id, updates) {
  const { data, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}
