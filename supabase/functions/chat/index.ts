// Supabase Edge Function: chat
//
// Orchestration gateway: accepts a `mode` parameter, classifies the incoming
// message via a Haiku router, and routes to the appropriate branch. Emits the
// namespaced SSE protocol (Decision 15) back to the browser.
//
// Phase 4 scope:
// - Router (Haiku) classifies every message as chat/crud/task
// - `task` → planner branch (Opus), returns a plan card or fallback
// - `chat`/`crud` → chat branch (Sonnet)
// - `execute` mode runs an approved plan via the executor (sequential steps,
//   sub-agent loops with tool use, runs table logging)

// deno-lint-ignore-file no-explicit-any

import { analyzeRequirements, runExecutorBranch } from './executor.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const CHAT_MODEL = Deno.env.get('CHAT_MODEL') || 'claude-sonnet-4-6'
const PLANNER_MODEL = Deno.env.get('PLANNER_MODEL') || 'claude-opus-4-6'
const ROUTER_MODEL = Deno.env.get('ROUTER_MODEL') || 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048
const PLANNER_MAX_TOKENS = 4096
const MAX_PLAN_STEPS = 5

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

// ─── Planner branch ─────────────────────────────────────────────────────────

const PLANNER_SYSTEM_PROMPT = `You are the planning engine for Lucas AI Hub. A user has asked for a task to be executed. You will design a short execution plan using the available agents.

## Rules

1. **Pick agents ONLY from the "Available Agents" list below.** Never invent agent IDs.
2. **Max ${MAX_PLAN_STEPS} steps.** Be concise — group related work into fewer steps.
3. Each step has an \`agent_id\` (must match exactly), a short \`task\` (1-2 sentences of instructions for that agent), an \`inputs\` array declaring what it needs (\`original_task\` or prior \`step_N\`), and \`tools_used\` listing which of the agent's tools will be called.
4. Only declare tools that exist in the agent's tool set.
5. **If NO available agent is a good fit for any part of the task**, call \`reject_plan\` instead of inventing a bad plan. Err on the side of rejecting when you're unsure — the user can then create a new agent or override.
6. When picking between similar agents, prefer the one whose \`capabilities\` or \`description\` explicitly mentions the task type.
7. **Prefer file-producing tools for deliverables.** If a step is expected to produce a document, report, outline, slide deck or any long/structured text, and the agent has \`generate_markdown\` or \`generate_file\` in its tool set, DECLARE that tool in \`tools_used\`. This makes the output downloadable for the user. Instruct the agent in \`task\` to call the tool at the end of its work. Do NOT declare these tools for steps whose output is purely intermediate (research summaries feeding another step can skip them).
8. For refinement requests (when \`REFINEMENT\` section is present), revise the previous plan as requested, keeping the rest stable when possible.

## Response

You MUST call exactly ONE tool:
- \`submit_plan\` — if the task is executable with the available agents
- \`reject_plan\` — if no agent is suitable

Do not emit any text outside of the tool call.`

const SUBMIT_PLAN_TOOL = {
  name: 'submit_plan',
  description:
    'Submit an execution plan for the user task. Use when at least one available agent can handle each required part of the task.',
  input_schema: {
    type: 'object',
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_PLAN_STEPS,
        description: 'Ordered list of execution steps. Each step runs on one agent.',
        items: {
          type: 'object',
          required: ['id', 'agent_id', 'task', 'inputs', 'tools_used'],
          properties: {
            id: {
              type: 'integer',
              minimum: 1,
              description: '1-based sequential step number',
            },
            agent_id: {
              type: 'string',
              description:
                "ID of the agent executing this step. Must exactly match one from the 'Available Agents' list.",
            },
            task: {
              type: 'string',
              description:
                'Short instruction for the agent (1-2 sentences). Describe what this step must produce.',
            },
            inputs: {
              type: 'array',
              items: { type: 'string' },
              description:
                "What this step consumes. Each entry is either 'original_task' or 'step_N' (referring to an earlier step).",
            },
            tools_used: {
              type: 'array',
              items: { type: 'string' },
              description:
                "Tool IDs this step plans to call. Must be a subset of the agent's declared tools.",
            },
          },
        },
      },
      estimated_duration_ms: {
        type: 'integer',
        description: 'Rough wall-clock estimate of how long the whole plan will take, in ms.',
      },
    },
  },
}

const REJECT_PLAN_TOOL = {
  name: 'reject_plan',
  description:
    "Reject the user task when NO available agent is a good fit. Use this instead of inventing a bad plan. The user will be given the option to create a new agent or fall back to a suggestion.",
  input_schema: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: {
        type: 'string',
        description:
          "Brief explanation of what is missing (e.g. 'no agent specializes in legal contract analysis').",
      },
      suggested_agent_type: {
        type: 'string',
        description:
          'Optional description of the kind of agent that would be needed (used to prefill a create-agent form).',
      },
      suggested_fallback_agent_id: {
        type: 'string',
        description:
          'Optional: the ID of the closest-fit existing agent, which the user may choose to run anyway.',
      },
    },
  },
}

function buildPlannerSystemPrompt(
  agentsContext: unknown,
  toolsContext: unknown,
  refinement: { previous_plan?: unknown; instructions?: string } | undefined,
): string {
  const parts = [PLANNER_SYSTEM_PROMPT]

  // Tools catalog
  if (Array.isArray(toolsContext) && toolsContext.length > 0) {
    const toolLines = toolsContext
      .filter((t: any) => t && typeof t.id === 'string')
      .map((t: any) => {
        const cat = t.category ? ` [${t.category}]` : ''
        const approval = t.requires_approval ? ' (requires approval)' : ''
        return `- ${t.id}${cat}: ${t.description || t.name || ''}${approval}`
      })
    if (toolLines.length > 0) {
      parts.push(`## Tools Catalog\n\n${toolLines.join('\n')}`)
    }
  }

  // Available agents with full metadata
  if (Array.isArray(agentsContext) && agentsContext.length > 0) {
    const agentBlocks = agentsContext
      .filter((a: any) => a && typeof a.id === 'string' && typeof a.name === 'string')
      .map((a: any) => {
        const desc = a.description ? `\n  Description: ${a.description}` : ''
        const tags =
          Array.isArray(a.tags) && a.tags.length > 0
            ? `\n  Tags: [${a.tags.join(', ')}]`
            : ''
        const caps =
          Array.isArray(a.capabilities) && a.capabilities.length > 0
            ? `\n  Good for: ${a.capabilities.join(', ')}`
            : ''
        const model = a.model ? `\n  Model: ${a.model}` : ''
        const tools =
          Array.isArray(a.tools) && a.tools.length > 0
            ? `\n  Tools: [${a.tools.join(', ')}]`
            : '\n  Tools: (none)'
        return `- ${a.id}: ${a.name}${desc}${tags}${caps}${model}${tools}`
      })
    if (agentBlocks.length > 0) {
      parts.push(`## Available Agents\n\n${agentBlocks.join('\n\n')}`)
    }
  }

  // Refinement context
  if (refinement && (refinement.previous_plan || refinement.instructions)) {
    const prev = refinement.previous_plan
      ? JSON.stringify(refinement.previous_plan, null, 2)
      : '(none)'
    const instr = refinement.instructions || '(none)'
    parts.push(
      `## REFINEMENT\n\nThe user already saw a plan proposal and wants to refine it.\n\n### Previous plan\n\`\`\`json\n${prev}\n\`\`\`\n\n### User refinement instructions\n${instr}\n\nRegenerate the plan respecting the user's instructions. Keep the parts the user didn't touch.`,
    )
  }

  return parts.join('\n\n')
}

// Validates that a submitted plan references only known agents and declared tools.
// Returns the (possibly cleaned) plan object or null if the plan is unusable.
function validateSubmittedPlan(
  rawInput: any,
  agentsContext: any[],
): { steps: any[]; estimated_duration_ms?: number } | { error: string } {
  if (!rawInput || !Array.isArray(rawInput.steps) || rawInput.steps.length === 0) {
    return { error: 'plan has no steps' }
  }
  if (rawInput.steps.length > MAX_PLAN_STEPS) {
    return { error: `plan exceeds max steps (${MAX_PLAN_STEPS})` }
  }

  const agentById = new Map<string, any>()
  for (const a of agentsContext) {
    if (a && typeof a.id === 'string') agentById.set(a.id, a)
  }

  const cleanSteps: any[] = []
  for (let i = 0; i < rawInput.steps.length; i++) {
    const step = rawInput.steps[i]
    if (!step || typeof step !== 'object') {
      return { error: `step ${i + 1} is not an object` }
    }
    const agent = agentById.get(step.agent_id)
    if (!agent) {
      return { error: `step ${i + 1} references unknown agent '${step.agent_id}'` }
    }
    const task = typeof step.task === 'string' ? step.task.trim() : ''
    if (!task) {
      return { error: `step ${i + 1} has empty task` }
    }
    const inputs = Array.isArray(step.inputs) ? step.inputs.map(String) : ['original_task']
    const declaredTools = Array.isArray(agent.tools) ? agent.tools : []
    const toolsUsed = Array.isArray(step.tools_used)
      ? step.tools_used
          .map(String)
          .filter((t: string) => declaredTools.includes(t))
      : []
    cleanSteps.push({
      id: i + 1,
      agent_id: step.agent_id,
      agent_name: agent.name,
      agent_color: agent.color,
      agent_icon: agent.icon,
      model: agent.model,
      task,
      inputs,
      tools_used: toolsUsed,
    })
  }

  return {
    steps: cleanSteps,
    estimated_duration_ms:
      typeof rawInput.estimated_duration_ms === 'number'
        ? rawInput.estimated_duration_ms
        : undefined,
  }
}

// Planner branch: calls Opus with forced tool use (submit_plan OR reject_plan),
// parses the result, validates, and emits one of:
//   - plan.proposed (with a validated plan)
//   - plan.fallback (when reject_plan is called or validation fails)
//   - plan.error (on upstream failure)
async function runPlannerBranch(
  emit: (type: string, payload?: Record<string, unknown>) => void,
  options: {
    messages: Array<{ role: string; content: string }>
    agentsContext: any[]
    toolsContext: any[]
    refinement?: { previous_plan?: unknown; instructions?: string }
    originalTask: string
    apiKey: string
  },
) {
  emit('plan.proposing', {})

  const systemPrompt = buildPlannerSystemPrompt(
    options.agentsContext,
    options.toolsContext,
    options.refinement,
  )

  const upstream = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: PLANNER_MODEL,
      max_tokens: PLANNER_MAX_TOKENS,
      system: systemPrompt,
      messages: options.messages,
      tools: [SUBMIT_PLAN_TOOL, REJECT_PLAN_TOOL],
      tool_choice: { type: 'any' },
    }),
  })

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => 'unknown error')
    emit('plan.error', {
      error: `Planner API error: ${upstream.status} ${errText}`,
    })
    return
  }

  const data = await upstream.json()
  const blocks: any[] = Array.isArray(data?.content) ? data.content : []
  const toolUse = blocks.find((b) => b.type === 'tool_use')

  if (!toolUse) {
    emit('plan.error', {
      error: 'Planner did not return a tool call (submit_plan or reject_plan).',
    })
    return
  }

  if (toolUse.name === 'reject_plan') {
    emit('plan.fallback', {
      reason: toolUse.input?.reason || 'No suitable agent available.',
      suggested_agent_type: toolUse.input?.suggested_agent_type,
      suggested_fallback_agent_id: toolUse.input?.suggested_fallback_agent_id,
    })
    return
  }

  if (toolUse.name === 'submit_plan') {
    const validated = validateSubmittedPlan(toolUse.input, options.agentsContext)
    if ('error' in validated) {
      emit('plan.fallback', {
        reason: `Planner produced an invalid plan: ${validated.error}`,
      })
      return
    }

    // Requirements analyzer: look at each agent's system prompt and extract
    // questions that must be answered before execution can start. Falls back
    // to empty requirements on any error.
    emit('plan.analyzing_requirements', {})
    const enriched = await analyzeRequirements(
      validated,
      options.agentsContext,
      options.originalTask,
      options.apiKey,
    )

    emit('plan.proposed', { plan: enriched })
    return
  }

  emit('plan.error', { error: `Unexpected tool call: ${toolUse.name}` })
}

// ─── Server ─────────────────────────────────────────────────────────────────

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
    tools_context?: unknown
    refinement?: { previous_plan?: unknown; instructions?: string }
    plan?: { steps?: unknown[] }
    original_task?: string
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

  const agentsContextRaw = Array.isArray(body.agents_context)
    ? (body.agents_context as any[])
    : []
  const toolsContextRaw = Array.isArray(body.tools_context)
    ? (body.tools_context as any[])
    : []
  const systemPrompt = buildSystemPrompt(agentsContextRaw)
  const lastUser = [...cleanMessages].reverse().find((m) => m.role === 'user')
  const isRefinement = Boolean(
    body.refinement && (body.refinement.previous_plan || body.refinement.instructions),
  )
  const isExecute = mode === 'execute'

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = makeEmitter(controller, sessionId)

      try {
        // Execute mode: skip router+planner, run an already-approved plan.
        if (isExecute) {
          const plan = body.plan as any
          if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
            emit('run.error', { error: 'execute mode requires a plan with at least one step' })
            return
          }
          const originalTask =
            typeof body.original_task === 'string' && body.original_task
              ? body.original_task
              : lastUser?.content || ''
          emit('router.classified', { mode: 'execute' })
          // Enforce Decision 10: 90s wall clock cap for the whole run.
          const timeoutController = new AbortController()
          const timeoutId = setTimeout(() => timeoutController.abort(), 90_000)
          try {
            await runExecutorBranch(emit, {
              plan,
              originalTask,
              agentsContext: agentsContextRaw,
              toolsContext: toolsContextRaw,
              apiKey,
              signal: timeoutController.signal,
            })
          } finally {
            clearTimeout(timeoutId)
          }
          return
        }

        // Router: classify the latest user message unless this is a refinement
        // call (which is always a task re-plan by definition).
        let classification: 'chat' | 'crud' | 'task'
        if (isRefinement) {
          classification = 'task'
        } else if (lastUser) {
          classification = await classifyIntent(lastUser.content, apiKey)
        } else {
          classification = 'chat'
        }
        console.log(
          `[router] session=${sessionId} mode=${mode} classified=${classification} refinement=${isRefinement}`,
        )
        emit('router.classified', { mode: classification })

        // Route: task → planner, everything else → chat branch.
        // `mode: 'planned'` forces the planner regardless of classification.
        const goPlanner =
          mode === 'planned' || classification === 'task' || isRefinement

        if (goPlanner) {
          await runPlannerBranch(emit, {
            messages: cleanMessages,
            agentsContext: agentsContextRaw,
            toolsContext: toolsContextRaw,
            refinement: body.refinement,
            apiKey,
          })
        } else {
          await runChatBranch(emit, {
            messages: cleanMessages,
            systemPrompt,
            apiKey,
          })
        }
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
