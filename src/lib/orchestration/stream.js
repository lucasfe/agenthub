// Low-level HTTP + SSE streaming client for the `chat` Edge Function.
//
// Speaks the namespaced event protocol (Decision 15). Every event emitted by
// the server is expected to have at least `{ type, session_id, timestamp, ... }`.
// This module does NOT know about Sessions or state — it just opens a POST,
// parses the SSE stream, and forwards each event to a callback.
//
// Usage:
//   await streamOrchestration({
//     mode: 'chat' | 'planned' | 'execute' | 'direct' | 'team',
//     sessionId,
//     messages,
//     agents,
//     tools,
//     refinement,     // optional: { previous_plan, instructions }
//     plan,           // optional: approved plan (mode='execute')
//     originalTask,   // optional: original user task (mode='execute')
//     signal,
//     onEvent: (evt) => { ... },
//   })

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isOrchestrationConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export async function streamOrchestration({
  mode = 'chat',
  sessionId,
  messages,
  agents,
  tools,
  refinement,
  plan,
  originalTask,
  signal,
  onEvent,
}) {
  if (!isOrchestrationConfigured()) {
    throw new Error('Orchestration is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  let response
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        mode,
        session_id: sessionId,
        messages,
        agents_context: Array.isArray(agents)
          ? agents.map((a) => ({
              id: a.id,
              name: a.name,
              category: a.category,
              description: a.description,
              tags: a.tags,
              model: a.model,
              tools: a.tools,
              capabilities: a.capabilities,
            }))
          : undefined,
        tools_context: Array.isArray(tools)
          ? tools.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              category: t.category,
              requires_approval: t.requires_approval,
            }))
          : undefined,
        refinement: refinement || undefined,
      }),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') return
    throw err
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new Error(`orchestration request failed: ${response.status} ${text}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const raw of events) {
        const line = raw.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        const jsonStr = line.slice(5).trim()
        if (!jsonStr) continue

        let evt
        try {
          evt = JSON.parse(jsonStr)
        } catch {
          continue
        }

        if (evt && typeof evt.type === 'string') {
          onEvent?.(evt)
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err
  }
}
