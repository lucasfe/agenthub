// Selected-agent branch for the chat Edge Function.
//
// When the user explicitly picks an agent next to the chat bar, the request
// must NOT go through the orchestrator/planner — it should land on the chosen
// agent directly, with that agent's persona AND its declared tools.
//
// This module owns that path:
// - Builds the streaming Anthropic call with the agent's content as the
//   system prompt and the agent's own tools (filtered by env availability).
// - Runs an iterative tool-use loop server-side: when the model calls a
//   tool, we execute it via the executor's TOOL_HANDLERS registry, append a
//   tool_result, and loop until the model produces only text.
// - Streams text deltas back as `chat.text` events and surfaces each tool
//   call via `chat.tool_call_start` / `chat.tool_call_done` events so the
//   UI can show what the agent is doing.
//
// The legacy `runChatBranch` (in index.ts) is still used for the hub-assistant
// persona — it owns the draft_agent / update_agent client-approval flow and
// has a different event contract.

// deno-lint-ignore-file no-explicit-any

import {
  buildAnthropicTool,
  describeUnavailableReason,
  getAvailableTools,
  SELECTED_AGENT_MAX_TOOL_ITERATIONS,
  SELECTED_AGENT_TOOL_CALL_TIMEOUT_MS,
  TOOL_HANDLERS,
  type ToolResult,
} from './executor.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_AGENT_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

type EmitFn = (type: string, payload?: Record<string, unknown>) => void

export interface RunSelectedAgentBranchOptions {
  agent: any
  messages: Array<{ role: string; content: any }>
  systemPrompt: string
  toolsContext: any[]
  agentsContext: any[]
  apiKey: string
  signal?: AbortSignal
  userId?: string
  // Test seam: override fetch (defaults to globalThis.fetch).
  fetchImpl?: typeof fetch
}

// Build the Anthropic tool list for the selected agent: intersect the agent's
// declared tools with the env-available tools, then map each to its schema.
// Returns the allowed tool ids alongside the schemas so callers can run the
// loop with the exact set the model is allowed to call.
export function buildAgentToolset(
  agent: any,
  toolsContext: any[],
): { tools: any[]; allowedIds: Set<string>; skippedIds: string[] } {
  const declared: string[] = Array.isArray(agent?.tools) ? agent.tools : []
  const availableInEnv = getAvailableTools()
  const allowed: string[] = []
  const skipped: string[] = []
  for (const id of declared) {
    if (typeof id !== 'string' || !id) continue
    if (!availableInEnv.has(id)) {
      skipped.push(id)
      continue
    }
    allowed.push(id)
  }
  const tools = allowed
    .map((id) => buildAnthropicTool(id, toolsContext))
    .filter(Boolean) as any[]
  return { tools, allowedIds: new Set(allowed), skippedIds: skipped }
}

// Append a one-line "Environment notice" so the agent knows which of its
// declared tools are NOT actually callable in this environment. Mirrors the
// executor branch — keeps the agent from looping on tools that will always
// return "not configured".
function appendEnvironmentNotice(systemPrompt: string, skippedIds: string[]): string {
  if (skippedIds.length === 0) return systemPrompt
  return (
    systemPrompt +
    `\n\n## Environment notice\n\nThe following tools are declared on you but NOT available in this environment: ${skippedIds.join(', ')}. Do NOT attempt to call them — explain to the user that the missing config blocks that capability.`
  )
}

// Single Anthropic streaming call: parses SSE, emits chat.text deltas, and
// collects assistant content blocks (text + tool_use) for the next iteration.
// Returns the full assistant content array and the stop reason.
async function streamOneTurn(
  emit: EmitFn,
  body: any,
  apiKey: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<{ content: any[]; stopReason: string | null; error?: string }> {
  let res: Response
  try {
    res = await fetchImpl(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    return { content: [], stopReason: null, error: (err as Error).message }
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => 'unknown error')
    return {
      content: [],
      stopReason: null,
      error: `Anthropic API error: ${res.status} ${errText.slice(0, 200)}`,
    }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // Index → assembled content block. We mirror the Anthropic streaming shape
  // so the next iteration can append assistant content verbatim.
  const blocks = new Map<number, any>()
  let stopReason: string | null = null

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
          const cb = evt.content_block || {}
          if (cb.type === 'text') {
            blocks.set(evt.index, { type: 'text', text: '' })
          } else if (cb.type === 'tool_use') {
            blocks.set(evt.index, {
              type: 'tool_use',
              id: cb.id,
              name: cb.name,
              input: undefined,
              _json: '',
            })
          }
        } else if (evt.type === 'content_block_delta') {
          const block = blocks.get(evt.index)
          if (!block) continue
          if (evt.delta?.type === 'text_delta') {
            block.text = (block.text || '') + (evt.delta.text || '')
            emit('chat.text', { value: evt.delta.text || '' })
          } else if (evt.delta?.type === 'input_json_delta') {
            block._json = (block._json || '') + (evt.delta.partial_json || '')
          }
        } else if (evt.type === 'content_block_stop') {
          const block = blocks.get(evt.index)
          if (block?.type === 'tool_use') {
            try {
              block.input = JSON.parse(block._json || '{}')
            } catch {
              block.input = {}
            }
            delete block._json
          }
        } else if (evt.type === 'message_delta') {
          if (typeof evt.delta?.stop_reason === 'string') {
            stopReason = evt.delta.stop_reason
          }
        } else if (evt.type === 'message_stop') {
          // Done — break out.
          // (We continue parsing in case more events come in same chunk.)
        } else if (evt.type === 'error') {
          return {
            content: [],
            stopReason: null,
            error: evt.error?.message || 'stream error',
          }
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { content: [], stopReason: null, error: 'aborted' }
    }
    return { content: [], stopReason: null, error: (err as Error).message }
  }

  // Materialize content array in the same order the model produced it.
  const sortedIndexes = [...blocks.keys()].sort((a, b) => a - b)
  const content = sortedIndexes.map((i) => {
    const b = blocks.get(i)!
    if (b.type === 'text') return { type: 'text', text: b.text || '' }
    return { type: 'tool_use', id: b.id, name: b.name, input: b.input || {} }
  })

  return { content, stopReason }
}

// Execute a single tool call via the shared TOOL_HANDLERS registry. Returns
// the result so the caller can build a tool_result message back to the model.
async function executeToolCall(
  toolUse: { id: string; name: string; input: any },
  agentsContext: any[],
  signal: AbortSignal | undefined,
  userId: string | undefined,
): Promise<{ result: ToolResult; durationMs: number }> {
  const handler = TOOL_HANDLERS[toolUse.name]
  const start = Date.now()
  if (!handler) {
    return {
      result: { ok: false, error: `Unknown tool: ${toolUse.name}` },
      durationMs: 0,
    }
  }
  try {
    const baseSignal = signal || new AbortController().signal
    const toolSignal = AbortSignal.any
      ? AbortSignal.any([
          baseSignal,
          AbortSignal.timeout(SELECTED_AGENT_TOOL_CALL_TIMEOUT_MS),
        ])
      : baseSignal
    const result = await handler(toolUse.input, {
      signal: toolSignal,
      agentsContext,
      // The selected-agent branch is not part of a multi-step plan. Use 0
      // as a sentinel step id; tool handlers don't depend on this.
      stepId: 0,
      toolCallId: toolUse.id,
      userId,
    })
    return { result, durationMs: Date.now() - start }
  } catch (err) {
    return {
      result: { ok: false, error: (err as Error).message },
      durationMs: Date.now() - start,
    }
  }
}

export async function runSelectedAgentBranch(
  emit: EmitFn,
  options: RunSelectedAgentBranchOptions,
): Promise<void> {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const { tools, allowedIds, skippedIds } = buildAgentToolset(
    options.agent,
    options.toolsContext,
  )

  const systemPrompt = appendEnvironmentNotice(options.systemPrompt, skippedIds)
  const model =
    typeof options.agent?.model === 'string' && options.agent.model
      ? options.agent.model
      : DEFAULT_AGENT_MODEL

  // Surface skipped tools up-front so the user (and the agent's reasoning)
  // know what's blocked. Mirrors the executor's pattern.
  for (const skipped of skippedIds) {
    const fakeId = `skip-${skipped}-${Date.now()}`
    const reason = describeUnavailableReason(skipped)
    emit('chat.tool_call_start', {
      tool_call_id: fakeId,
      name: skipped,
      input: {},
    })
    emit('chat.tool_call_done', {
      tool_call_id: fakeId,
      status: 'error',
      error: `Not configured — ${reason}`,
      duration_ms: 0,
    })
  }

  // Track per-tool consecutive failures so we bail out if the model gets
  // stuck calling the same broken tool over and over.
  const consecutiveFailures = new Map<string, number>()
  const messages: any[] = options.messages.slice()

  for (let iter = 0; iter < SELECTED_AGENT_MAX_TOOL_ITERATIONS; iter++) {
    const reqBody: any = {
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
      stream: true,
    }
    if (tools.length > 0) reqBody.tools = tools

    const turn = await streamOneTurn(
      emit,
      reqBody,
      options.apiKey,
      fetchImpl,
      options.signal,
    )

    if (turn.error) {
      emit('chat.error', { error: turn.error })
      return
    }

    const toolUses = turn.content.filter(
      (b: any) => b.type === 'tool_use',
    ) as Array<{ id: string; name: string; input: any }>

    if (toolUses.length === 0) {
      emit('chat.done', {})
      return
    }

    // Append the assistant's full turn (text + tool_use blocks) so the
    // tool_result message refers to a valid tool_use_id.
    messages.push({ role: 'assistant', content: turn.content })

    const toolResults: any[] = []
    for (const toolUse of toolUses) {
      // Block tool calls outside the agent's declared+available set. The model
      // shouldn't be able to invoke them (Anthropic only sees `tools`), but
      // belt-and-suspenders against schema drift or future regressions.
      if (!allowedIds.has(toolUse.name)) {
        emit('chat.tool_call_start', {
          tool_call_id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        })
        emit('chat.tool_call_done', {
          tool_call_id: toolUse.id,
          status: 'error',
          error: `Tool '${toolUse.name}' is not declared on this agent.`,
          duration_ms: 0,
        })
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({
            error: `Tool '${toolUse.name}' is not declared on this agent.`,
          }),
          is_error: true,
        })
        continue
      }

      emit('chat.tool_call_start', {
        tool_call_id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      })

      const { result, durationMs } = await executeToolCall(
        toolUse,
        options.agentsContext,
        options.signal,
        options.userId,
      )

      emit('chat.tool_call_done', {
        tool_call_id: toolUse.id,
        status: result.ok ? 'done' : 'error',
        summary: result.summary,
        error: result.error,
        artifact: result.artifact,
        duration_ms: durationMs,
      })

      if (result.ok) {
        consecutiveFailures.set(toolUse.name, 0)
      } else {
        const prev = consecutiveFailures.get(toolUse.name) || 0
        consecutiveFailures.set(toolUse.name, prev + 1)
        if (prev + 1 >= 2) {
          emit('chat.error', {
            error: `Tool '${toolUse.name}' failed twice in a row. Last error: ${result.error}`,
          })
          return
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

    messages.push({ role: 'user', content: toolResults })
  }

  emit('chat.error', {
    error: `Selected-agent chat exceeded ${SELECTED_AGENT_MAX_TOOL_ITERATIONS} tool iterations.`,
  })
}
