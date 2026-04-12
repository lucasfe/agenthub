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
const MAX_STEP_TOKENS = 8192
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
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const sections = Array.isArray(input.sections) ? input.sections : []

  // Strict: reject empty calls so the sub-agent sees a real error instead of
  // looping on a trivially-successful no-op.
  if (!title) {
    return {
      ok: false,
      error:
        'generate_markdown requires a non-empty `title`. Provide the document title.',
    }
  }
  const validSections = sections.filter(
    (s) => s && (typeof s.heading === 'string' || typeof s.body === 'string'),
  )
  if (validSections.length === 0) {
    return {
      ok: false,
      error:
        'generate_markdown requires at least one non-empty section (each with `heading` and `body`).',
    }
  }
  const totalBodyLen = validSections.reduce(
    (acc, s) => acc + (typeof s.body === 'string' ? s.body.length : 0),
    0,
  )
  if (totalBodyLen < 20) {
    return {
      ok: false,
      error:
        'generate_markdown sections look empty (total body < 20 chars). Write the full content directly into each section\'s `body` field — do NOT call this tool with placeholders.',
    }
  }

  const lines: string[] = []
  lines.push(`# ${title}`, '')
  for (const s of validSections) {
    if (s.heading) lines.push(`## ${s.heading}`, '')
    if (s.body) lines.push(s.body, '')
  }
  const md = lines.join('\n').trim()

  return {
    ok: true,
    result: { markdown: md, section_count: validSections.length },
    summary: `Generated ${validSections.length} section${validSections.length === 1 ? '' : 's'} (${md.length} chars)`,
    artifact: {
      type: 'text',
      name: title,
      format: 'md',
      content: md,
    },
  }
}

async function generateFile(
  input: { filename: string; format: string; content: string },
  _ctx: ToolContext,
): Promise<ToolResult> {
  const filename =
    typeof input.filename === 'string' && input.filename.trim()
      ? input.filename.trim()
      : ''
  const format = typeof input.format === 'string' ? input.format : 'txt'
  const content = typeof input.content === 'string' ? input.content : ''

  // Strict: require a filename AND substantive content. The most common
  // failure mode was the model calling this tool with an empty `content`
  // parameter and looping on the trivial success.
  if (!filename) {
    return {
      ok: false,
      error: 'generate_file requires a non-empty `filename`.',
    }
  }
  if (content.trim().length < 20) {
    return {
      ok: false,
      error:
        'generate_file requires substantive `content` (at least 20 chars). Write the complete file content inline as the `content` argument — do NOT call this tool with an empty or placeholder value.',
    }
  }

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

// ─── Google Slides tool ─────────────────────────────────────────────────────

function base64url(input: string | ArrayBuffer): string {
  let b64: string
  if (typeof input === 'string') {
    b64 = btoa(input)
  } else {
    b64 = btoa(String.fromCharCode(...new Uint8Array(input)))
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getGoogleAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope:
      'https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/drive',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedClaims = base64url(JSON.stringify(claims))
  const signingInput = `${encodedHeader}.${encodedClaims}`

  const pemContents = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )

  const jwt = `${signingInput}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Google auth failed: ${JSON.stringify(data).slice(0, 300)}`)
  }
  return data.access_token
}

async function createGoogleSlides(
  input: {
    title: string
    slides: Array<{
      title: string
      body: string
      speaker_notes?: string
      layout?: string
    }>
  },
  ctx: ToolContext,
): Promise<ToolResult> {
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!saJson) {
    return {
      ok: false,
      error:
        'GOOGLE_SERVICE_ACCOUNT_JSON is not configured in Edge Function secrets.',
    }
  }

  let sa: any
  try {
    sa = JSON.parse(saJson)
  } catch {
    return { ok: false, error: 'Invalid GOOGLE_SERVICE_ACCOUNT_JSON format.' }
  }

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) {
    return { ok: false, error: 'create_google_slides requires a non-empty `title`.' }
  }

  const slides = Array.isArray(input.slides) ? input.slides : []
  if (slides.length === 0) {
    return {
      ok: false,
      error: 'create_google_slides requires at least one slide in `slides`.',
    }
  }

  // Validate that slides have content — prevent empty-content loops.
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    if (
      (!s.title || typeof s.title !== 'string' || !s.title.trim()) &&
      (!s.body || typeof s.body !== 'string' || !s.body.trim())
    ) {
      return {
        ok: false,
        error: `Slide ${i + 1} has no title or body. Every slide must have at least one of them with real content.`,
      }
    }
  }

  try {
    // 1. Authenticate
    const token = await getGoogleAccessToken(sa)

    // 2. Create empty presentation
    const createRes = await fetch(
      'https://slides.googleapis.com/v1/presentations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
        signal: ctx.signal,
      },
    )
    if (!createRes.ok) {
      const err = await createRes.text().catch(() => '')
      return {
        ok: false,
        error: `Failed to create presentation: ${createRes.status} ${err.slice(0, 200)}`,
      }
    }
    const presData = await createRes.json()
    const presentationId: string = presData.presentationId
    const defaultSlideId: string | undefined = presData.slides?.[0]?.objectId

    // 3. Build batch update requests
    const requests: any[] = []

    // Delete the default empty title slide that comes with a new presentation.
    if (defaultSlideId) {
      requests.push({ deleteObject: { objectId: defaultSlideId } })
    }

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const slideId = `s${i}`
      const titlePh = `${slideId}_t`
      const bodyPh = `${slideId}_b`
      const layout = slide.layout || 'TITLE_AND_BODY'

      const mappings: any[] = [
        {
          layoutPlaceholder: { type: 'TITLE', index: 0 },
          objectId: titlePh,
        },
      ]
      if (layout === 'TITLE_AND_BODY') {
        mappings.push({
          layoutPlaceholder: { type: 'BODY', index: 0 },
          objectId: bodyPh,
        })
      }

      requests.push({
        createSlide: {
          objectId: slideId,
          insertionIndex: i,
          slideLayoutReference: { predefinedLayout: layout },
          placeholderIdMappings: mappings,
        },
      })

      if (typeof slide.title === 'string' && slide.title.trim()) {
        requests.push({
          insertText: { objectId: titlePh, text: slide.title.trim() },
        })
      }

      if (
        layout === 'TITLE_AND_BODY' &&
        typeof slide.body === 'string' &&
        slide.body.trim()
      ) {
        requests.push({
          insertText: { objectId: bodyPh, text: slide.body.trim() },
        })
      }
    }

    // 4. Execute batch update
    const batchRes = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
        signal: ctx.signal,
      },
    )
    if (!batchRes.ok) {
      const err = await batchRes.text().catch(() => '')
      return {
        ok: false,
        error: `Failed to add slides: ${batchRes.status} ${err.slice(0, 200)}`,
      }
    }

    // 5. Share with user — prefer the email passed by the agent, fall back
    //    to the env var only as a last resort (for dev/testing convenience).
    const shareEmail =
      (typeof input.share_with_email === 'string' && input.share_with_email.trim()
        ? input.share_with_email.trim()
        : null) || Deno.env.get('GOOGLE_SLIDES_SHARE_EMAIL')
    if (shareEmail) {
      const shareRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${presentationId}/permissions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'writer',
            type: 'user',
            emailAddress: shareEmail,
          }),
        },
      )
      if (!shareRes.ok) {
        const err = await shareRes.text().catch(() => '')
        console.warn(`[google-slides] share failed: ${shareRes.status} ${err.slice(0, 200)}`)
      }
    }

    // 6. Return URL
    const url = `https://docs.google.com/presentation/d/${presentationId}/edit`
    return {
      ok: true,
      result: {
        url,
        presentation_id: presentationId,
        slide_count: slides.length,
        shared_with: shareEmail || null,
      },
      summary: `Created ${slides.length}-slide presentation: ${url}`,
    }
  } catch (err) {
    return {
      ok: false,
      error: `Google Slides error: ${(err as Error).message}`,
    }
  }
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  web_search: webSearch,
  fetch_url: fetchUrl,
  generate_markdown: generateMarkdown,
  generate_file: generateFile,
  read_agent: readAgent,
  save_artifact: saveArtifact,
  create_google_slides: createGoogleSlides,
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
  stepAnswers: Record<string, string>,
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

  // Inject user-provided answers for this step's requirements (if any).
  const answerEntries = Object.entries(stepAnswers || {}).filter(
    ([, v]) => typeof v === 'string' && v.trim(),
  )
  const answersBlock =
    answerEntries.length > 0
      ? `\n\n## User-provided answers\n\nThese are the user's answers to the requirements the planner identified for this step. Treat them as authoritative.\n\n${answerEntries
          .map(([k, v]) => `- **${k}**: ${v}`)
          .join('\n')}`
      : ''

  // Autonomous-mode preamble — sub-agents run in a one-shot execution, with
  // no human on the other side. If the agent's system prompt says to "ask the
  // user first", this preamble overrides it: make assumptions, state them,
  // produce output.
  const autonomousPreamble = `\n\n## Autonomous mode\n\nYou are running in autonomous mode. There is NO user available to answer questions mid-step. All the information you need is above (original request, prior step outputs, user-provided answers). Do NOT ask questions, do NOT request clarification, do NOT output "please tell me X". If something is ambiguous, make a reasonable assumption and STATE it explicitly in your output. Proceed directly to producing the deliverable.`

  const messages: any[] = [
    {
      role: 'user',
      content: `${stepContext}${unavailableNotice}${answersBlock}${autonomousPreamble}\n\n## Your task\n\n${step.task}`,
    },
  ]

  let totalIn = 0
  let totalOut = 0
  let finalText = ''
  // Tracks repeated tool failures: if the same tool fails twice in a row,
  // abort the step rather than burning iterations on a broken loop.
  const consecutiveFailures = new Map<string, number>()

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

      // Track consecutive failures per tool; bail out if the same tool fails
      // twice in a row (usually means the model is stuck on a malformed call).
      if (result.ok) {
        consecutiveFailures.set(toolUse.name, 0)
      } else {
        const prev = consecutiveFailures.get(toolUse.name) || 0
        consecutiveFailures.set(toolUse.name, prev + 1)
        if (prev + 1 >= 2) {
          return {
            text: finalText,
            tokens_in: totalIn,
            tokens_out: totalOut,
            error: `Step aborted: tool '${toolUse.name}' failed twice in a row. Last error: ${result.error}`,
          }
        }
      }

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

// ─── Requirements analyzer ──────────────────────────────────────────────────
//
// Runs AFTER the planner has produced a validated plan, BEFORE the user sees
// it. For each step in the plan, reads the chosen agent's system prompt and
// extracts the questions it would ask the user ("pergunte antes de começar..."
// / "ask the user about..."). Skips questions whose answers are already
// derivable from the original task or the step task. Always inlines a
// `suggested` default. Returns the plan with a `requirements` array attached
// to each step (empty array when nothing is needed).

const REQUIREMENTS_ANALYZER_SYSTEM_PROMPT = `You are a requirements analyst for Lucas AI Hub. A plan has been generated to execute a user task. For each step, identify the questions the step's agent would ask the user BEFORE starting — but ONLY when the agent's system prompt explicitly instructs it to ask.

## Rules

1. **Be rigorous.** Only include a question if the agent's system prompt contains an explicit instruction to ask (phrases like "ask the user", "pergunte", "confirme antes", "clarify", "solicite"). If the prompt doesn't ask for information, return an empty \`requirements\` array for that step — do NOT invent questions.
2. **Skip already-answered questions.** If the user's original task or the step task already tells the agent the answer (even implicitly), skip it.
3. **Always pre-fill \`suggested\`.** Infer the most likely answer from the original task and step context. Even a best-guess default is more useful than a blank.
4. **Max ${MAX_REQUIREMENTS_PER_STEP} questions per step.** Prioritize the ones the agent prompt calls out most directly.
5. **Short, concrete questions.** Avoid open-ended philosophical framing. Use the same language as the user's original task (Portuguese in, Portuguese out).
6. **\`required: true\`** only if the agent cannot reasonably produce output without the answer. Default to false for nice-to-have details.

## Response

Call \`submit_requirements\` exactly once with the list. Include every step from the plan, using an empty \`requirements\` array for steps that need nothing. Do not emit any text outside the tool call.`

const SUBMIT_REQUIREMENTS_TOOL = {
  name: 'submit_requirements',
  description:
    'Submit the list of user-facing questions per step that must be answered before execution can start.',
  input_schema: {
    type: 'object',
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        description: 'One entry per step in the plan, in the same order. Always include every step.',
        items: {
          type: 'object',
          required: ['step_id', 'requirements'],
          properties: {
            step_id: {
              type: 'integer',
              description: 'Matches the id of the step in the plan.',
            },
            requirements: {
              type: 'array',
              maxItems: MAX_REQUIREMENTS_PER_STEP,
              items: {
                type: 'object',
                required: ['key', 'question'],
                properties: {
                  key: {
                    type: 'string',
                    description: 'Short snake_case identifier, unique within the step. Becomes the field name used by the executor.',
                  },
                  question: {
                    type: 'string',
                    description: 'The question to show the user.',
                  },
                  hint: {
                    type: 'string',
                    description: 'Optional short example or guidance shown under the input.',
                  },
                  required: {
                    type: 'boolean',
                    description: "Whether the user MUST answer before 'Approve & run' unlocks.",
                  },
                  suggested: {
                    type: 'string',
                    description: 'Inferred default value to pre-fill the input with.',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

function buildAnalyzerUserMessage(
  plan: any,
  agentsContext: any[],
  originalTask: string,
): string {
  const parts: string[] = []
  parts.push(`# Original user task\n\n${originalTask}`)

  const lightPlan = {
    steps: plan.steps.map((s: any) => ({
      id: s.id,
      agent_id: s.agent_id,
      agent_name: s.agent_name,
      task: s.task,
      inputs: s.inputs,
      tools_used: s.tools_used,
    })),
  }
  parts.push(`# Plan\n\n\`\`\`json\n${JSON.stringify(lightPlan, null, 2)}\n\`\`\``)

  parts.push(`# Agent system prompts for the chosen steps\n`)
  const agentById = new Map<string, any>()
  for (const a of agentsContext) {
    if (a && typeof a.id === 'string') agentById.set(a.id, a)
  }
  for (const step of plan.steps) {
    const agent = agentById.get(step.agent_id)
    const content =
      typeof agent?.content === 'string' && agent.content.trim()
        ? agent.content
        : '(no system prompt)'
    parts.push(`## Step ${step.id} · ${agent?.name || step.agent_id}\n\n${content}`)
  }

  return parts.join('\n\n')
}

function sanitizeRequirement(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null
  const key = typeof raw.key === 'string' ? raw.key.trim() : ''
  const question = typeof raw.question === 'string' ? raw.question.trim() : ''
  if (!key || !question) return null
  const req = {
    key: key.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 40),
    question,
    required: typeof raw.required === 'boolean' ? raw.required : false,
  } as any
  if (typeof raw.hint === 'string' && raw.hint.trim()) req.hint = raw.hint.trim()
  if (typeof raw.suggested === 'string' && raw.suggested.trim())
    req.suggested = raw.suggested.trim()
  return req
}

export async function analyzeRequirements(
  plan: any,
  agentsContext: any[],
  originalTask: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<any> {
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANALYZER_MODEL,
        max_tokens: ANALYZER_MAX_TOKENS,
        system: REQUIREMENTS_ANALYZER_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildAnalyzerUserMessage(plan, agentsContext, originalTask),
          },
        ],
        tools: [SUBMIT_REQUIREMENTS_TOOL],
        tool_choice: { type: 'tool', name: 'submit_requirements' },
      }),
      signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`[analyzer] API error ${res.status}: ${body.slice(0, 200)}`)
      return attachEmptyRequirements(plan)
    }

    const data = await res.json()
    const blocks: any[] = Array.isArray(data?.content) ? data.content : []
    const toolUse = blocks.find(
      (b: any) => b?.type === 'tool_use' && b?.name === 'submit_requirements',
    )

    if (!toolUse || !Array.isArray(toolUse.input?.steps)) {
      console.warn('[analyzer] no submit_requirements tool call in response')
      return attachEmptyRequirements(plan)
    }

    const reqByStepId = new Map<number, any[]>()
    for (const s of toolUse.input.steps) {
      if (typeof s?.step_id !== 'number') continue
      const sanitized = Array.isArray(s.requirements)
        ? s.requirements
            .map(sanitizeRequirement)
            .filter((r: any) => r !== null)
            .slice(0, MAX_REQUIREMENTS_PER_STEP)
        : []
      reqByStepId.set(s.step_id, sanitized)
    }

    return {
      ...plan,
      steps: plan.steps.map((step: any) => ({
        ...step,
        requirements: reqByStepId.get(step.id) || [],
      })),
    }
  } catch (err) {
    console.warn('[analyzer] unexpected error', (err as Error).message)
    return attachEmptyRequirements(plan)
  }
}

function attachEmptyRequirements(plan: any): any {
  return {
    ...plan,
    steps: plan.steps.map((s: any) => ({ ...s, requirements: [] })),
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
    stepAnswers?: Record<string | number, Record<string, string>>
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
  // Tracks which step is currently in-flight so we can surface step.error
  // if an exception (e.g. AbortError from the wall-clock timeout) bubbles
  // up from runStep.
  let currentStepId: number | null = null

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
      currentStepId = step.id

      const stepStart = Date.now()
      const answersForStep =
        (options.stepAnswers &&
          (options.stepAnswers[step.id] || options.stepAnswers[String(step.id)])) ||
        {}
      const result = await runStep(
        step,
        options.agentsContext,
        options.toolsContext,
        stepContext,
        answersForStep,
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
        currentStepId = null
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
      currentStepId = null
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
    // Friendly message for the wall-clock timeout (AbortError).
    const raw = (err as Error).message || 'unknown error'
    const isAbort =
      (err as Error)?.name === 'AbortError' ||
      raw.includes('aborted') ||
      raw.includes('abort')
    errorMessage = isAbort
      ? 'Run exceeded the wall-clock time limit. Try a shorter task, split into more steps, or increase RUN_TIMEOUT_MS.'
      : raw

    // If we were in the middle of a step when the error hit, surface the
    // step as errored so the UI doesn't keep spinning it forever.
    if (currentStepId !== null) {
      emit('step.error', { step_id: currentStepId, error: errorMessage })
      failedStepId = currentStepId
    }
    emit('run.error', {
      run_id: runId,
      error: errorMessage,
      failed_step_id: failedStepId,
    })
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
