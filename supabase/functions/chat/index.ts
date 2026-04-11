// Supabase Edge Function: chat
//
// Orchestration gateway: accepts a `mode` parameter, classifies the incoming
// message via a Haiku router, and routes to the appropriate branch. Emits the
// namespaced SSE protocol (Decision 15) back to the browser:
//
//   data: {"type":"router.classified","session_id":"...","timestamp":...,"mode":"chat"|"crud"|"task"}
//   data: {"type":"chat.text","session_id":"...","timestamp":...,"value":"..."}
//   data: {"type":"chat.tool_call","session_id":"...","timestamp":...,"name":"...","input":{...}}
//   data: {"type":"chat.done","session_id":"...","timestamp":...}
//   data: {"type":"chat.error","session_id":"...","timestamp":...,"error":"..."}
//
// Phase 2 scope: only the `chat` branch is wired up. The router runs for every
// request but its classification is logged and ignored — everything still flows
// through the chat branch. Phase 3 will route `task` to the planner.

// deno-lint-ignore-file no-explicit-any

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const CHAT_MODEL = Deno.env.get('CHAT_MODEL') || 'claude-sonnet-4-6'
const ROUTER_MODEL = Deno.env.get('ROUTER_MODEL') || 'claude-haiku-4-5-20251001'
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

const ROUTER_SYSTEM_PROMPT = `You are a fast intent classifier for the Lucas AI Hub assistant. Given the latest user message, reply with exactly ONE word — no punctuation, no explanation — from this set:

- "chat" — questions, greetings, conversation, requests for information about the hub or its agents
- "crud" — asking to create, modify, delete an agent (e.g. "cria um agente X", "muda a cor do Y", "apaga Z")
- "task" — asking for a piece of work to be executed by running agents (e.g. "faz um ppt sobre X", "escreve um pitch", "analisa esse texto")

Examples:
- "quais agentes tem?" -> chat
- "cria um agente de SEO" -> crud
- "faz um pitch deck" -> task
- "oi tudo bem" -> chat

Reply with only: chat, crud, or task.`

const AGENT_FIELD_PROPS = {
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
    minItems: 1,
    maxItems: 6,
    description: 'Short topical tags (e.g. "OWASP", "Pentest", "React").',
  },
  icon: {
    type: 'string',
    description:
      'PascalCase name of a lucide-react icon (e.g. Shield, Code, Database, Palette, Bot, Sparkles, Bug, Wrench).',
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
}

const DRAFT_AGENT_TOOL = {
  name: 'draft_agent',
  description:
    'Propose a new agent draft for the user to review and confirm. The draft is rendered as an interactive card in the chat — the user clicks a button to actually create the agent. Call this whenever the user asks to build/create a new agent.',
  input_schema: {
    type: 'object',
    required: ['name', 'category', 'description', 'tags', 'icon', 'color', 'content'],
    properties: AGENT_FIELD_PROPS,
  },
}

const UPDATE_AGENT_TOOL = {
  name: 'update_agent',
  description:
    'Propose an update to an existing agent for the user to review and confirm. Renders as a diff card in the chat — the user clicks "Apply changes" to commit. Call this whenever the user asks to modify, edit, or change an existing agent.',
  input_schema: {
    type: 'object',
    required: ['id', 'updates'],
    properties: {
      id: {
        type: 'string',
        description:
          'The kebab-case ID of the target agent. Must match an agent from the "Existing Agents" summary.',
      },
      updates: {
        type: 'object',
        description:
          'Partial object with ONLY the fields being changed. Do not include fields that remain the same.',
        properties: AGENT_FIELD_PROPS,
        additionalProperties: false,
      },
    },
  },
}

function buildSystemPrompt(agentsContext: unknown): string {
  if (!Array.isArray(agentsContext) || agentsContext.length === 0) {
    return BASE_SYSTEM_PROMPT
  }
  const lines = agentsContext
    .filter((a: any) => a && typeof a.id === 'string' && typeof a.name === 'string')
    .map((a: any) => {
      const tags = Array.isArray(a.tags) && a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : ''
      const desc = typeof a.description === 'string' && a.description ? ` — ${a.description}` : ''
      const cat = typeof a.category === 'string' && a.category ? ` (${a.category})` : ''
      return `- ${a.id}: ${a.name}${cat}${desc}${tags}`
    })
  if (lines.length === 0) return BASE_SYSTEM_PROMPT
  return `${BASE_SYSTEM_PROMPT}\n\n## Existing Agents\n\n${lines.join('\n')}`
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function makeEmitter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  sessionId: string,
) {
  const encoder = new TextEncoder()
  return (type: string, payload: Record<string, unknown> = {}) => {
    const evt = {
      type,
      session_id: sessionId,
      timestamp: Date.now(),
      ...payload,
    }
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
  }
}

// Quick one-shot classification with Haiku. Non-streaming. Returns 'chat' as
// a safe default on any error or unexpected response — the router should
// never be a point of failure for the whole request.
async function classifyIntent(
  latestUserMessage: string,
  apiKey: string,
): Promise<'chat' | 'crud' | 'task'> {
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ROUTER_MODEL,
        max_tokens: 8,
        system: ROUTER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: latestUserMessage }],
      }),
    })
    if (!res.ok) return 'chat'
    const data = await res.json()
    const text = (data?.content?.[0]?.text ?? '').trim().toLowerCase()
    if (text === 'crud' || text === 'task' || text === 'chat') return text
    return 'chat'
  } catch (err) {
    console.error('[router] classify error', err)
    return 'chat'
  }
}

// Chat branch: proxies streaming Anthropic SSE and re-emits as namespaced
// events (`chat.text`, `chat.tool_call`, `chat.done`, `chat.error`).
async function runChatBranch(
  emit: (type: string, payload?: Record<string, unknown>) => void,
  options: {
    messages: Array<{ role: string; content: string }>
    systemPrompt: string
    apiKey: string
  },
) {
  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system: options.systemPrompt,
      messages: options.messages,
      tools: [DRAFT_AGENT_TOOL, UPDATE_AGENT_TOOL],
      stream: true,
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => 'unknown error')
    emit('chat.error', { error: `Anthropic API error: ${upstream.status} ${errText}` })
    return
  }

  const reader = upstream.body.getReader()
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
          if (evt.content_block?.type === 'tool_use') {
            toolBlocks.set(evt.index, {
              name: evt.content_block.name,
              json: '',
            })
          }
        } else if (evt.type === 'content_block_delta') {
          if (evt.delta?.type === 'text_delta') {
            emit('chat.text', { value: evt.delta.text })
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
              emit('chat.tool_call', { name: block.name, input })
            } catch (err) {
              emit('chat.error', {
                error: `failed to parse tool input: ${(err as Error).message}`,
              })
            }
            toolBlocks.delete(evt.index)
          }
        } else if (evt.type === 'message_stop') {
          emit('chat.done', {})
          return
        } else if (evt.type === 'error') {
          emit('chat.error', { error: evt.error?.message ?? 'stream error' })
          return
        }
      }
    }
    // Stream closed without explicit message_stop
    emit('chat.done', {})
  } catch (err) {
    emit('chat.error', { error: (err as Error).message })
  }
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

  let body: {
    mode?: string
    session_id?: string
    messages?: Array<{ role: string; content: string }>
    agents_context?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const mode = typeof body.mode === 'string' ? body.mode : 'chat'
  const sessionId =
    typeof body.session_id === 'string' && body.session_id
      ? body.session_id
      : crypto.randomUUID()

  const messages = Array.isArray(body.messages) ? body.messages : []
  const cleanMessages = messages
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim(),
    )
    .map((m) => ({ role: m.role, content: m.content }))

  if (cleanMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'At least one user message is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const systemPrompt = buildSystemPrompt(body.agents_context)
  const lastUser = [...cleanMessages].reverse().find((m) => m.role === 'user')

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = makeEmitter(controller, sessionId)

      try {
        // Router: classify the latest user message. In Phase 2 the result is
        // logged and emitted but the chat branch always runs.
        const classification = lastUser
          ? await classifyIntent(lastUser.content, apiKey)
          : 'chat'
        console.log(
          `[router] session=${sessionId} mode=${mode} classified=${classification}`,
        )
        emit('router.classified', { mode: classification })

        // Phase 2: regardless of mode or classification, run the chat branch.
        // Phase 3 will route `task` messages into the planner.
        await runChatBranch(emit, {
          messages: cleanMessages,
          systemPrompt,
          apiKey,
        })
      } catch (err) {
        emit('chat.error', { error: (err as Error).message })
      } finally {
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
