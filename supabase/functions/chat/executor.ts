// Executor branch for the chat Edge Function.
//
// Owns:
// - the per-step sub-agent call loop (tool use aware)
// - the 6 tool handlers (registry at the bottom)
// - the orchestrator that walks an approved plan step-by-step
// - writing the final run summary into the `runs` table
// - the post-planner requirements analyzer (looks at agent prompts and
//   extracts per-step questions that must be answered before execution)
//
// Emits namespaced SSE events:
//   run.started, run.done, run.error
//   step.started, step.text, step.tool_call_start, step.tool_call_done,
//   step.done, step.error
//
// deno-lint-ignore-file no-explicit-any

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_STEP_MODEL = 'claude-sonnet-4-6'
const ANALYZER_MODEL = Deno.env.get('ANALYZER_MODEL') || 'claude-sonnet-4-6'
const MAX_STEP_TOKENS = 2048
const ANALYZER_MAX_TOKENS = 2048
const MAX_TOOL_ITERATIONS = 5
const TOOL_CALL_TIMEOUT_MS = 30_000
const MAX_REQUIREMENTS_PER_STEP = 4

// ─── Tool handler types ─────────────────────────────────────────────────────

export interface ToolContext {
  signal: AbortSignal
  agentsContext: any[]
  stepId: number
  toolCallId: string
}

export interface ToolArtifact {
  type: 'file' | 'text'
  name?: string
  format?: string
  content: string
}

export interface ToolResult {
  ok: boolean
  result?: unknown
  summary?: string
  artifact?: ToolArtifact
  error?: string
}

export type ToolHandler = (input: any, ctx: ToolContext) => Promise<ToolResult>

// ─── Tool implementations ───────────────────────────────────────────────────

async function webSearch(
  input: { query: string; max_results?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  const apiKey = Deno.env.get('TAVILY_API_KEY')
  if (!apiKey) {
    return {
      ok: false,
      error:
        'Web search is not configured. Set TAVILY_API_KEY in the Edge Function secrets to enable this tool.',
      result: { error: 'not_configured' },
    }
  }

  const max = Math.min(Math.max(1, input.max_results ?? 5), 10)
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: input.query,
        max_results: max,
        search_depth: 'basic',
      }),
      signal: ctx.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Tavily error: ${res.status} ${body.slice(0, 200)}` }
    }
    const data = await res.json()
    const results = Array.isArray(data.results)
      ? data.results.map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
        }))
      : []
    return {
      ok: true,
      result: { query: input.query, results },
      summary: `${results.length} results for "${input.query}"`,
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function fetchUrl(
  input: { url: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    const res = await fetch(input.url, {
      signal: ctx.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LucasAIHub/1.0)',
      },
    })
    if (!res.ok) {
      return { ok: false, error: `Fetch error: ${res.status} ${res.statusText}` }
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    let text = await res.text()

    if (contentType.includes('html') || (!contentType && text.trim().startsWith('<'))) {
      text = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim()
    }

    const MAX = 4000
    const truncated = text.length > MAX ? text.slice(0, MAX) + '…[truncated]' : text
    let hostname = input.url
    try {
      hostname = new URL(input.url).hostname
    } catch {
      // ignore malformed URL parse
    }
    return {
      ok: true,
      result: { url: input.url, text: truncated, original_length: text.length },
      summary: `Fetched ${text.length} chars from ${hostname}`,
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function generateMarkdown(
  input: {
    title?: string
    sections?: Array<{ heading?: string; body?: string }>
  },
  _ctx: ToolContext,
): Promise<ToolResult> {
  const title = typeof input.title === 'string' ? input.title : ''
  const sections = Array.isArray(input.sections) ? input.sections : []

  const lines: string[] = []
  if (title) lines.push(`# ${title}`, '')
  for (const s of sections) {
    if (s.heading) lines.push(`## ${s.heading}`, '')
    if (s.body) lines.push(s.body, '')
  }
  const md = lines.join('\n').trim()

  return {
    ok: true,
    result: { markdown: md, section_count: sections.length },
    summary: `Generated ${sections.length} section${sections.length === 1 ? '' : 's'}`,
    artifact: {
      type: 'text',
      name: title || 'document',
      format: 'md',
      content: md,
    },
  }
}

async function generateFile(
  input: { filename: string; format: string; content: string },
  _ctx: ToolContext,
): Promise<ToolResult> {
  const filename = typeof input.filename === 'string' ? input.filename : 'output.txt'
  const format = typeof input.format === 'string' ? input.format : 'txt'
  const content = typeof input.content === 'string' ? input.content : ''
  return {
    ok: true,
    result: { filename, format, size: content.length },
    summary: `Generated ${filename} (${content.length} chars)`,
    artifact: {
      type: 'file',
      name: filename,
      format,
      content,
    },
  }
}

async function readAgent(
  input: { agent_id: string },
  ctx: ToolContext,
): Promise<ToolResult> {
  const agent = ctx.agentsContext.find((a: any) => a && a.id === input.agent_id)
  if (!agent) {
    return {
      ok: false,
      error: `Agent '${input.agent_id}' not found in this hub.`,
    }
  }
  return {
    ok: true,
    result: {
      id: agent.id,
      name: agent.name,
      category: agent.category,
      description: agent.description,
      tags: agent.tags,
      capabilities: agent.capabilities,
      tools: agent.tools,
      model: agent.model,
    },
    summary: `Read ${agent.name}`,
  }
}

async function saveArtifact(
  input: { name: string; content: string; format?: string },
  _ctx: ToolContext,
): Promise<ToolResult> {
  // Phase 4: artifact persistence is not implemented server-side yet. The
  // client will receive the artifact payload and can offer a download.
  const name = typeof input.name === 'string' ? input.name : 'artifact'
  const content = typeof input.content === 'string' ? input.content : ''
  const format = typeof input.format === 'string' ? input.format : 'md'
  return {
    ok: true,
    result: { saved: true, name, size: content.length },
    summary: `Saved ${name}`,
    artifact: { type: 'file', name, format, content },
  }
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  web_search: webSearch,
  fetch_url: fetchUrl,
  generate_markdown: generateMarkdown,
  generate_file: generateFile,
  read_agent: readAgent,
  save_artifact: saveArtifact,
}

// Which tools are functional in the current environment. Some tools depend on
// external config (API keys) — if that config is missing, we'd rather drop the
// tool from the sub-agent's toolset than let it loop on repeated failures.
function getAvailableTools(): Set<string> {
  const available = new Set(Object.keys(TOOL_HANDLERS))
  if (!Deno.env.get('TAVILY_API_KEY')) {
    available.delete('web_search')
  }
  return available
}

function describeUnavailableReason(toolId: string): string {
  if (toolId === 'web_search') {
    return 'TAVILY_API_KEY is not configured in the Edge Function secrets.'
  }
  return 'Tool is not available in this environment.'
}

// ─── Anthropic tool schema derivation ───────────────────────────────────────

function buildAnthropicTool(toolId: string, toolsContext: any[]): any | null {
  const meta = toolsContext.find((t: any) => t && t.id === toolId)
  if (!meta) return null
  // Tools table already stores an Anthropic-compatible input_schema. The
  // planner / planner tool already inlines it in the row for us.
  return {
    name: toolId,
    description: meta.description || meta.name || toolId,
    input_schema: meta.input_schema || {
      type: 'object',
      properties: {},
    },
  }
}

// ─── Step context builder ───────────────────────────────────────────────────

function buildStepContext(
  step: any,
  stepOutputs: Map<number, string>,
  originalTask: string,
): string {
  const inputs: string[] = Array.isArray(step.inputs) ? step.inputs : ['original_task']
  const parts: string[] = []

  for (const inp of inputs) {
    if (inp === 'original_task') {
      parts.push(`## Original user request\n\n${originalTask}`)
      continue
    }
    const match = /^step_(\d+)$/.exec(inp)
    if (match) {
      const stepId = Number(match[1])
      const out = stepOutputs.get(stepId)
      if (out) {
        parts.push(`## Output of step ${stepId}\n\n${out}`)
      } else {
        parts.push(
          `## Output of step ${stepId}\n\n(This step has no output available.)`,
        )
      }
    }
  }

  if (parts.length === 0) {
    parts.push(`## Original user request\n\n${originalTask}`)
  }

  return parts.join('\n\n')
}

// ─── Sub-agent step runner ──────────────────────────────────────────────────

type EmitFn = (type: string, payload?: Record<string, unknown>) => void

async function runStep(
  step: any,
  agentsContext: any[],
  toolsContext: any[],
  stepContext: string,
  emit: EmitFn,
  apiKey: string,
  signal: AbortSignal,
): Promise<{
  text: string
  tokens_in: number
  tokens_out: number
  error?: string
}> {
  const agent = agentsContext.find((a: any) => a && a.id === step.agent_id)
  if (!agent) {
    return { text: '', tokens_in: 0, tokens_out: 0, error: `Agent '${step.agent_id}' not found` }
  }

  const systemPrompt =
    typeof agent.content === 'string' && agent.content.trim()
      ? agent.content
      : `You are ${agent.name}, an AI agent in the Lucas AI Hub.`
  const model = typeof agent.model === 'string' && agent.model ? agent.model : DEFAULT_STEP_MODEL

  // Restrict tools to those declared in the plan AND owned by the agent.
  const declaredIds = new Set<string>(Array.isArray(step.tools_used) ? step.tools_used : [])
  const agentToolIds = new Set<string>(Array.isArray(agent.tools) ? agent.tools : [])
  const availableInEnv = getAvailableTools()
  const allowedIds: string[] = []
  const skippedIds: string[] = []
  for (const id of declaredIds) {
    if (!agentToolIds.has(id)) continue
    if (!availableInEnv.has(id)) {
      skippedIds.push(id)
      continue
    }
    allowedIds.push(id)
  }

  // If the plan declared tools that aren't available in this environment,
  // surface a single "skipped" tool_call event per tool so the user sees why.
  for (const skipped of skippedIds) {
    const fakeId = `skip-${step.id}-${skipped}`
    const reason = describeUnavailableReason(skipped)
    emit('step.tool_call_start', {
      step_id: step.id,
      tool_call_id: fakeId,
      name: skipped,
      input: {},
    })
    emit('step.tool_call_done', {
      step_id: step.id,
      tool_call_id: fakeId,
      status: 'error',
      error: `Not configured — ${reason}`,
      duration_ms: 0,
    })
  }

  const anthropicTools = allowedIds
    .map((id) => buildAnthropicTool(id, toolsContext))
    .filter(Boolean) as any[]

  const unavailableNotice =
    skippedIds.length > 0
      ? `\n\n## Environment notice\n\nThe following tools were planned for this step but are NOT available in this environment: ${skippedIds.join(', ')}. Do NOT attempt to call them. Work around them — use your training knowledge or the remaining tools.`
      : ''

  const messages: any[] = [
    {
      role: 'user',
      content: `${stepContext}${unavailableNotice}\n\n## Your task\n\n${step.task}`,
    },
  ]

  let totalIn = 0
  let totalOut = 0
  let finalText = ''

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const body: any = {
      model,
      max_tokens: MAX_STEP_TOKENS,
      system: systemPrompt,
      messages,
    }
    if (anthropicTools.length > 0) body.tools = anthropicTools

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error')
      return {
        text: finalText,
        tokens_in: totalIn,
        tokens_out: totalOut,
        error: `Sub-agent API error: ${res.status} ${errText.slice(0, 200)}`,
      }
    }

    const data = await res.json()
    const content: any[] = Array.isArray(data.content) ? data.content : []
    const usage = data.usage || {}
    totalIn += usage.input_tokens || 0
    totalOut += usage.output_tokens || 0

    // Stream text blocks to the client
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        finalText += block.text
        emit('step.text', { step_id: step.id, value: block.text })
      }
    }

    const toolUses = content.filter((b) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      // Model produced only text — step is done.
      return { text: finalText, tokens_in: totalIn, tokens_out: totalOut }
    }

    // Execute tools and collect tool_result blocks to send back.
    const toolResults: any[] = []
    for (const toolUse of toolUses) {
      // Decision 13 safety check: sensitive tools MUST be declared in the plan.
      const toolMeta = toolsContext.find((t: any) => t && t.id === toolUse.name)
      if (toolMeta?.requires_approval && !declaredIds.has(toolUse.name)) {
        return {
          text: finalText,
          tokens_in: totalIn,
          tokens_out: totalOut,
          error: `Safety: step tried to call sensitive tool '${toolUse.name}' that was not declared in the plan.`,
        }
      }

      emit('step.tool_call_start', {
        step_id: step.id,
        tool_call_id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      })

      const handler = TOOL_HANDLERS[toolUse.name]
      const toolStart = Date.now()
      let result: ToolResult
      if (!handler) {
        result = { ok: false, error: `Unknown tool: ${toolUse.name}` }
      } else {
        try {
          const toolSignal = AbortSignal.any
            ? AbortSignal.any([signal, AbortSignal.timeout(TOOL_CALL_TIMEOUT_MS)])
            : signal
          result = await handler(toolUse.input, {
            signal: toolSignal,
            agentsContext,
            stepId: step.id,
            toolCallId: toolUse.id,
          })
        } catch (err) {
          result = { ok: false, error: (err as Error).message }
        }
      }
      const duration_ms = Date.now() - toolStart

      emit('step.tool_call_done', {
        step_id: step.id,
        tool_call_id: toolUse.id,
        status: result.ok ? 'done' : 'error',
        summary: result.summary,
        error: result.error,
        artifact: result.artifact,
        duration_ms,
      })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(
          result.ok ? result.result ?? {} : { error: result.error },
        ).slice(0, 8000),
        is_error: !result.ok,
      })
    }

    // Append the assistant turn + user tool_result turn and loop.
    messages.push({ role: 'assistant', content })
    messages.push({ role: 'user', content: toolResults })
  }

  return {
    text: finalText,
    tokens_in: totalIn,
    tokens_out: totalOut,
    error: `Step exceeded ${MAX_TOOL_ITERATIONS} tool iterations.`,
  }
}

// ─── Run logging (inserts a row into public.runs) ───────────────────────────

async function insertRunLog(run: Record<string, unknown>): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !key) {
    console.warn('[runs] SUPABASE_URL / KEY missing, skipping run log insert')
    return
  }
  try {
    const res = await fetch(`${url}/rest/v1/runs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(run),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[runs] insert failed: ${res.status} ${body.slice(0, 200)}`)
    }
  } catch (err) {
    console.warn('[runs] insert error', (err as Error).message)
  }
}

// ─── Executor branch entry point ────────────────────────────────────────────

export async function runExecutorBranch(
  emit: EmitFn,
  options: {
    plan: any
    originalTask: string
    agentsContext: any[]
    toolsContext: any[]
    apiKey: string
    signal: AbortSignal
  },
): Promise<void> {
  const runId = crypto.randomUUID()
  const startTime = Date.now()
  emit('run.started', { run_id: runId })

  const stepOutputs = new Map<number, string>()
  const stepMetrics: any[] = []
  let totalIn = 0
  let totalOut = 0
  let status: 'done' | 'error' | 'timeout' = 'done'
  let errorMessage: string | undefined
  let failedStepId: number | undefined

  try {
    for (const step of options.plan.steps) {
      if (options.signal.aborted) {
        status = 'error'
        errorMessage = 'Run aborted'
        break
      }

      const stepContext = buildStepContext(step, stepOutputs, options.originalTask)

      emit('step.started', {
        step_id: step.id,
        agent_id: step.agent_id,
        agent_name: step.agent_name,
        agent_color: step.agent_color,
        agent_icon: step.agent_icon,
        model: step.model,
      })

      const stepStart = Date.now()
      const result = await runStep(
        step,
        options.agentsContext,
        options.toolsContext,
        stepContext,
        emit,
        options.apiKey,
        options.signal,
      )
      const stepDuration = Date.now() - stepStart
      totalIn += result.tokens_in
      totalOut += result.tokens_out

      stepMetrics.push({
        id: step.id,
        agent_id: step.agent_id,
        model: step.model,
        duration_ms: stepDuration,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        status: result.error ? 'error' : 'done',
        error: result.error,
      })

      if (result.error) {
        emit('step.error', { step_id: step.id, error: result.error })
        status = 'error'
        errorMessage = result.error
        failedStepId = step.id
        break
      }

      stepOutputs.set(step.id, result.text)
      emit('step.done', {
        step_id: step.id,
        duration_ms: stepDuration,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
      })
    }

    if (status === 'done') {
      emit('run.done', {
        run_id: runId,
        duration_ms: Date.now() - startTime,
        total_tokens_in: totalIn,
        total_tokens_out: totalOut,
      })
    } else {
      emit('run.error', {
        run_id: runId,
        error: errorMessage,
        failed_step_id: failedStepId,
      })
    }
  } catch (err) {
    status = 'error'
    errorMessage = (err as Error).message
    emit('run.error', { run_id: runId, error: errorMessage })
  }

  // Log the completed run (fire-and-forget).
  insertRunLog({
    id: runId,
    task: options.originalTask,
    mode: 'execute',
    status,
    plan: options.plan,
    steps: stepMetrics,
    total_tokens_in: totalIn,
    total_tokens_out: totalOut,
    duration_ms: Date.now() - startTime,
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  }).catch(() => {})
}
