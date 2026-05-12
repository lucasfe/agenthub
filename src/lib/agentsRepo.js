import { supabase } from './supabase'

const SELECT_COLUMNS =
  'id, name, category, description, tags, icon, color, featured, popularity, tools, model, capabilities, content, usage_count'

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Database not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.',
    )
  }
}

export async function listAgents() {
  requireSupabase()
  const { data, error } = await supabase
    .from('agents')
    .select(SELECT_COLUMNS)
    .order('popularity', { ascending: false })

  if (error) throw error
  return data
}

export async function getAgent(id) {
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
  const { error } = await supabase.from('agents').delete().eq('id', id)
  if (error) throw error
}
