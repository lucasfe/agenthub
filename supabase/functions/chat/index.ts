// Supabase Edge Function: chat
//
// Proxies chat requests to the Anthropic API with streaming and tool use.
// Anthropic's messages endpoint returns SSE when `stream: true`; this function
// parses those events and re-emits a simpler protocol to the browser:
//
//   data: {"type":"text","value":"..."}\n\n               (one per token chunk)
//   data: {"type":"tool_call","name":"...","input":{...}}\n\n  (when a tool block finishes)
//   data: {"type":"done"}\n\n                             (final event)
//   data: {"type":"error","value":"..."}\n\n              (on failure)

// deno-lint-ignore-file no-explicit-any

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2048

const BASE_SYSTEM_PROMPT = `You are the AI assistant for Lucas AI Hub, an internal web app for browsing, creating, and managing AI agent templates.

Users of this hub can:
- Browse agents across categories like "Development Team" and "AI Specialists"
- Stack multiple agents into a cart and download them as a ZIP of markdown system prompts
- Create their own agents and teams
- Bundle agents into named "teams" for reuse
- Use ⌘K to jump to any agent or team by name

## Answering questions about existing agents

You are given a summary of every agent currently in the hub in the "Existing Agents" section below. When the user asks about agents ("quais agentes tem?", "me fala do frontend-developer", "tem algum agente de security?"), answer directly using this summary. Don't call any tool just to read — the data is already in your context.

If the user asks for the full system prompt / content of a specific agent, tell them to open the agent's detail page (you don't have the full content, only the summary).

## Creating a new agent

You have access to the \`draft_agent\` tool. When the user asks to create a new agent (e.g. "create an agent that does X", "monta um agente de..."), call this tool to propose a draft. The draft appears as an interactive card in the chat — THE USER CONFIRMS THE CREATION, not you.

When calling \`draft_agent\`:
- Write a short, friendly one-sentence explanation BEFORE calling the tool (e.g. "Beleza! Montei um draft pra você revisar:")
- Fill ALL required fields with reasonable defaults based on the user's request
- Use 3–5 relevant tags
- Write the \`content\` field as a 2–4 paragraph markdown system prompt, using "##" subheadings for "Responsibilities", "Approach", etc.
- For \`icon\`, pick a PascalCase lucide-react icon name that matches the agent's purpose (e.g. Shield, Code, Database, Palette, Bot). If unsure, use Bot.

## Updating an existing agent

You have access to the \`update_agent\` tool. When the user asks to modify an existing agent ("muda a cor do X pra roxo", "adiciona a tag Y no Z", "troca a descrição do frontend-developer"), call this tool with the target agent's \`id\` and an \`updates\` object containing ONLY the fields being changed. Do not include fields that aren't changing.

The agent's \`id\` must match one from the "Existing Agents" summary exactly. If the user refers to an agent by name and there's ambiguity, ask which one they mean before calling the tool.

When calling \`update_agent\`:
- Write a short explanation BEFORE calling (e.g. "Entendi, vou propor essa alteração:")
- Put only the CHANGING fields in \`updates\` — leave out everything else
- The card will show a diff of old → new and the user clicks "Apply changes" to commit

If the user wants to iterate on a previous update/draft, call the relevant tool again with the updated fields.

## General rules

DO NOT call tools for questions about the hub itself, how features work, or general conversation. Only use tools when the user clearly wants to CREATE or MODIFY something.

Be concise, friendly, and reply in the same language the user used.`

const DRAFT_AGENT_TOOL = {
  name: 'draft_agent',
  description:
    'Propose a new agent draft for the user to review and confirm. The draft is rendered as an interactive card in the chat — the user clicks a button to actually create the agent. Call this whenever the user asks to build/create a new agent.',
  input_schema: {
    type: 'object',
    required: ['name', 'category', 'description', 'tags', 'icon', 'color', 'content'],
    properties: {
      name: {
        type: 'string',
        description: 'Display name of the agent, in Title Case. Example: "Security Auditor".',
      },
      category: {
        type: 'string',
        enum: ['Development Team', 'AI Specialists'],
        description: 'Which category the agent belongs to.',
      },
      description: {
        type: 'string',
        description: 'A single-sentence summary of what this agent does.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 6,
        description: 'Short topical tags (e.g. "OWASP", "Pentest", "React").',
      },
      icon: {
        type: 'string',
        description:
          'PascalCase name of a lucide-react icon that matches this agent. Examples: Shield, Code, Database, Palette, Bot, Sparkles, Bug, Wrench.',
      },
      color: {
        type: 'string',
        enum: ['blue', 'green', 'purple', 'amber', 'rose', 'cyan'],
        description: 'Accent color for the agent card.',
      },
      content: {
        type: 'string',
        description:
          'The full markdown system prompt for this agent. 2–4 paragraphs, using "##" subheadings for sections like Responsibilities, Approach, etc.',
      },
    },
  },
}

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
      tools: [DRAFT_AGENT_TOOL],
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

  // Bridge Anthropic's SSE stream → simplified SSE for the client.
  // We track tool_use blocks by their `index` so we can accumulate the
  // streamed `partial_json` deltas and emit one `tool_call` event per block.
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const toolBlocks = new Map<number, { name: string; json: string }>()

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const raw of events) {
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

            if (evt.type === 'content_block_start') {
              // Start tracking a tool_use block if this is one
              if (evt.content_block?.type === 'tool_use') {
                toolBlocks.set(evt.index, {
                  name: evt.content_block.name,
                  json: '',
                })
              }
            } else if (evt.type === 'content_block_delta') {
              if (evt.delta?.type === 'text_delta') {
                controller.enqueue(sseEvent({ type: 'text', value: evt.delta.text }))
              } else if (evt.delta?.type === 'input_json_delta') {
                const block = toolBlocks.get(evt.index)
                if (block) {
                  block.json += evt.delta.partial_json ?? ''
                }
              }
            } else if (evt.type === 'content_block_stop') {
              const block = toolBlocks.get(evt.index)
              if (block) {
                try {
                  const input = JSON.parse(block.json || '{}')
                  controller.enqueue(
                    sseEvent({ type: 'tool_call', name: block.name, input }),
                  )
                } catch (err) {
                  controller.enqueue(
                    sseEvent({
                      type: 'error',
                      value: `failed to parse tool input: ${(err as Error).message}`,
                    }),
                  )
                }
                toolBlocks.delete(evt.index)
              }
            } else if (evt.type === 'message_stop') {
              controller.enqueue(sseEvent({ type: 'done' }))
            } else if (evt.type === 'error') {
              controller.enqueue(
                sseEvent({ type: 'error', value: evt.error?.message ?? 'stream error' }),
              )
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
