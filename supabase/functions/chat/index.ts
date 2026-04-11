// Supabase Edge Function: chat
//
// Proxies chat requests to the Anthropic API with streaming. The Anthropic
// messages endpoint natively returns SSE when `stream: true` is set; this
// function parses those events and re-emits a simpler protocol to the browser:
//
//   data: {"type":"text","value":"..."}\n\n  (one per token chunk)
//   data: {"type":"done"}\n\n               (final event)
//   data: {"type":"error","value":"..."}\n\n (on failure)
//
// Deployment:
//   supabase functions deploy chat
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Invocation from the frontend uses the anon key via the Authorization header,
// which is the default behavior of supabase.functions.invoke / fetch.

// deno-lint-ignore-file no-explicit-any

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

const SYSTEM_PROMPT = `You are the AI assistant for Lucas AI Hub, an internal web app for browsing, creating, and managing AI agent templates.

Users of this hub can:
- Browse agents across categories like "Development Team" and "AI Specialists"
- Stack multiple agents into a cart and download them as a ZIP of markdown system prompts
- Create their own agents and teams
- Bundle agents into named "teams" for reuse
- Use ⌘K to jump to any agent or team by name

Help users discover agents, explain what each agent does, suggest which agents to stack for a given task, and answer general questions about using the hub. Be concise and friendly. If the user asks something unrelated to the hub, answer helpfully but briefly.`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function sseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let body: { messages?: Array<{ role: string; content: string }> }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  const cleanMessages = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }))

  if (cleanMessages.length === 0) {
    return new Response(JSON.stringify({ error: 'At least one user message is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Call Anthropic with streaming enabled
  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: cleanMessages,
      stream: true,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => 'unknown error')
    return new Response(
      JSON.stringify({ error: `Anthropic API error: ${upstream.status} ${errText}` }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Bridge Anthropic's SSE stream → simplified SSE for the client
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // SSE events are separated by double newlines
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const raw of events) {
            // Each event can have multiple `data:` lines; we only care about the data
            const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
            if (!dataLine) continue
            const jsonStr = dataLine.slice(5).trim()
            if (!jsonStr) continue

            let evt: any
            try {
              evt = JSON.parse(jsonStr)
            } catch {
              continue
            }

            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              controller.enqueue(sseEvent({ type: 'text', value: evt.delta.text }))
            } else if (evt.type === 'message_stop') {
              controller.enqueue(sseEvent({ type: 'done' }))
            } else if (evt.type === 'error') {
              controller.enqueue(sseEvent({ type: 'error', value: evt.error?.message ?? 'stream error' }))
            }
          }
        }
        controller.close()
      } catch (err) {
        controller.enqueue(sseEvent({ type: 'error', value: (err as Error).message }))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
