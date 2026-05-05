// Template-executor branch (issue #354).
//
// Walks a template-instantiated task one step at a time. Each step:
//   1. Resolves its `instruction` via templateRenderer.render(), pulling
//      params from the task, prior outputs from earlier steps, and
//      references from the supplied dictionary.
//   2. Calls Anthropic with the rendered user-message blocks + the agent's
//      system prompt + the agent's declared tools (tool execution itself is
//      deferred to slice #354 follow-ups; a single-shot LLM round-trip is
//      enough to satisfy the AC for this slice).
//   3. Persists the response as the step's output (text) and output_files
//      (any artifacts emitted by tool calls — none in v1 of this slice).
//   4. Either freezes for approval (requires_approval === true) or marks
//      the step done and advances to the next pending step.
//
// resumeTemplateApprove and resumeTemplateRetry are the entry points called
// from the chat function when the user clicks Approve / Refazer com ajustes
// in the chat UI. Both consume a previously-frozen task snapshot, transition
// the state machine, and continue the run from the next pending step.
//
// The module is intentionally side-effect-free aside from `deps.persistTask`,
// `deps.emit`, and the LLM call. Storage and DB writes happen in the caller.

// deno-lint-ignore-file no-explicit-any

import {
  render,
  type ContentBlock,
  type PriorStep,
  type TemplateReference,
} from '../_shared/templateRenderer.ts'
import {
  applyStepResult,
  approveStep,
  freezeForApproval,
  isStepRequiringApproval,
  markStepError,
  markStepRunning,
  retryStep,
  type RetryOutcome,
} from './stepApprovalGate.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_STEP_MODEL = 'claude-sonnet-4-6'
const MAX_STEP_TOKENS = 8192

export interface TemplateExecutorDeps {
  fetchImpl?: typeof fetch
  apiKey: string
  signal: AbortSignal
  emit: (type: string, payload?: Record<string, unknown>) => void
  agentsContext: any[]
  toolsContext: any[]
  references: Record<string, TemplateReference>
  params: Record<string, string>
  persistTask: (task: any) => Promise<void>
  userId?: string
}

export type StepOutcome =
  | { kind: 'continue' }
  | { kind: 'frozen' }
  | { kind: 'error'; error: string }
  | { kind: 'all_done' }

// ─── helpers ───────────────────────────────────────────────────────────────

function buildPriorSteps(steps: any[]): PriorStep[] {
  return steps.map((s) => ({
    output: typeof s?.output === 'string' ? s.output : undefined,
    output_files: Array.isArray(s?.output_files) ? s.output_files : undefined,
  }))
}

function buildUserMessageBlocks(
  step: any,
  priorSteps: PriorStep[],
  references: Record<string, TemplateReference>,
  params: Record<string, string>,
): { blocks: ContentBlock[]; resolvedText: string; renderErrors: any[] } {
  const instruction = typeof step.instruction === 'string' ? step.instruction : ''
  const rendered = render({
    instruction,
    params,
    priorSteps,
    references,
  })
  const blocks: ContentBlock[] = [...rendered.user_message_blocks]
  // Append retry feedback, if any, as a trailing text block. Keeping it
  // separate from the instruction makes it visible to the model without
  // requiring template authors to add a placeholder.
  if (typeof step.last_feedback === 'string' && step.last_feedback.trim()) {
    const note = `\n\n## User feedback for this retry\n\n${step.last_feedback.trim()}`
    if (blocks.length > 0 && blocks[blocks.length - 1].type === 'text') {
      ;(blocks[blocks.length - 1] as any).text =
        (blocks[blocks.length - 1] as any).text + note
    } else {
      blocks.push({ type: 'text', text: note.trimStart() })
    }
  }
  // Empty rendered.text — make sure we always send a non-empty text block so
  // Anthropic doesn't reject the message.
  if (
    blocks.length === 0 ||
    (blocks.length === 1 &&
      blocks[0].type === 'text' &&
      !(blocks[0] as any).text.trim())
  ) {
    blocks.push({ type: 'text', text: '(empty instruction)' })
  }
  return {
    blocks,
    resolvedText: rendered.resolved_text,
    renderErrors: rendered.validation_errors,
  }
}

function findAgent(agentsContext: any[], agentId: string): any | null {
  return agentsContext.find((a: any) => a && a.id === agentId) ?? null
}

function extractTextFromContent(content: any[]): string {
  if (!Array.isArray(content)) return ''
  let acc = ''
  for (const b of content) {
    if (b?.type === 'text' && typeof b.text === 'string') acc += b.text
  }
  return acc
}

async function callAnthropic(
  step: any,
  agent: any,
  blocks: ContentBlock[],
  deps: TemplateExecutorDeps,
): Promise<
  | { ok: true; output: string; output_files: any[] }
  | { ok: false; error: string }
> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const model =
    typeof agent.model === 'string' && agent.model ? agent.model : DEFAULT_STEP_MODEL
  const system =
    typeof agent.content === 'string' && agent.content.trim()
      ? agent.content
      : `You are ${agent.name || agent.id}, an AI agent.`
  const reqBody = {
    model,
    max_tokens: MAX_STEP_TOKENS,
    system,
    messages: [{ role: 'user', content: blocks }],
  }
  let res: Response
  try {
    res = await fetchImpl(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': deps.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(reqBody),
      signal: deps.signal,
    })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      error: `Anthropic API error: ${res.status} ${text.slice(0, 200)}`,
    }
  }
  const data = await res.json()
  const content: any[] = Array.isArray(data?.content) ? data.content : []
  const output = extractTextFromContent(content)
  // No tool execution in this slice — output_files comes from rendered
  // tool_use blocks in slices #351/#352. Keep it empty here.
  return { ok: true, output, output_files: [] }
}

// ─── single-step runner ────────────────────────────────────────────────────

async function executeStep(
  task: any,
  stepId: number,
  deps: TemplateExecutorDeps,
): Promise<{ task: any; outcome: StepOutcome }> {
  const stepIdx = task.plan.steps.findIndex((s: any) => s && s.id === stepId)
  if (stepIdx < 0) {
    return {
      task,
      outcome: { kind: 'error', error: `Step ${stepId} not found` },
    }
  }
  const step = task.plan.steps[stepIdx]
  const agent = findAgent(deps.agentsContext, step.agent_id)
  if (!agent) {
    const next = markStepError(task, stepId, `Agent '${step.agent_id}' not found`)
    deps.emit('step.error', { step_id: stepId, error: next.error_message })
    await deps.persistTask(next)
    return { task: next, outcome: { kind: 'error', error: next.error_message } }
  }

  let working = markStepRunning(task, stepId)
  deps.emit('step.started', {
    step_id: stepId,
    agent_id: step.agent_id,
    agent_name: agent.name,
  })
  await deps.persistTask(working)

  const priorSteps = buildPriorSteps(working.plan.steps)
  const { blocks } = buildUserMessageBlocks(
    working.plan.steps[stepIdx],
    priorSteps,
    deps.references,
    deps.params,
  )

  const result = await callAnthropic(step, agent, blocks, deps)
  if (!result.ok) {
    working = markStepError(working, stepId, result.error)
    deps.emit('step.error', { step_id: stepId, error: result.error })
    await deps.persistTask(working)
    return { task: working, outcome: { kind: 'error', error: result.error } }
  }

  working = applyStepResult(working, stepId, {
    output: result.output,
    output_files: result.output_files,
  })

  if (isStepRequiringApproval(working.plan.steps[stepIdx])) {
    working = freezeForApproval(working, stepId)
    deps.emit('step.awaiting_approval', {
      step_id: stepId,
      output: result.output,
    })
    await deps.persistTask(working)
    return { task: working, outcome: { kind: 'frozen' } }
  }

  // No approval required — flip the step to done so the next iteration
  // doesn't try to re-run it.
  const stepsDone = working.plan.steps.map((s: any) =>
    s.id === stepId ? { ...s, status: 'done' } : s,
  )
  working = { ...working, plan: { ...working.plan, steps: stepsDone } }
  deps.emit('step.done', { step_id: stepId })
  await deps.persistTask(working)
  return { task: working, outcome: { kind: 'continue' } }
}

function findNextPendingStepId(task: any): number | null {
  const steps = task?.plan?.steps ?? []
  for (const s of steps) {
    if (!s) continue
    const status = s.status
    if (status === 'done') continue
    if (status === 'awaiting_approval') return null // halted
    if (status === 'error') return null
    return s.id
  }
  return null
}

// ─── public entry points ───────────────────────────────────────────────────

export async function runTemplateExecutor(
  initialTask: any,
  deps: TemplateExecutorDeps,
): Promise<{ task: any; outcome: StepOutcome }> {
  let task = initialTask
  // Cap iterations to the step count so a buggy state machine can never
  // infinite-loop us.
  const stepCount = task?.plan?.steps?.length ?? 0
  for (let iter = 0; iter < stepCount + 1; iter++) {
    const nextStepId = findNextPendingStepId(task)
    if (nextStepId === null) {
      // Either we hit a freeze, an error, or every step is done.
      const allDone =
        Array.isArray(task?.plan?.steps) &&
        task.plan.steps.every((s: any) => s?.status === 'done')
      if (allDone) {
        const next = { ...task, status: 'done' as const }
        deps.emit('run.done', { task_id: task.id })
        await deps.persistTask(next)
        return { task: next, outcome: { kind: 'all_done' } }
      }
      if (task.status === 'awaiting_approval') {
        return { task, outcome: { kind: 'frozen' } }
      }
      return {
        task,
        outcome: { kind: 'error', error: task.error_message || 'Unknown error' },
      }
    }
    const out = await executeStep(task, nextStepId, deps)
    task = out.task
    if (out.outcome.kind !== 'continue') {
      return { task, outcome: out.outcome }
    }
  }
  return { task, outcome: { kind: 'error', error: 'Step iteration cap exceeded' } }
}

export async function resumeTemplateApprove(
  task: any,
  stepId: number,
  deps: TemplateExecutorDeps,
): Promise<{ task: any; outcome: StepOutcome }> {
  const advanced = approveStep(task, stepId)
  deps.emit('step.approved', { step_id: stepId })
  await deps.persistTask(advanced)
  return runTemplateExecutor(advanced, deps)
}

export async function resumeTemplateRetry(
  task: any,
  stepId: number,
  feedback: string,
  deps: TemplateExecutorDeps,
): Promise<{ task: any; outcome: StepOutcome }> {
  const result: RetryOutcome = retryStep(task, stepId, feedback)
  if ('error' in result) {
    deps.emit('step.error', { step_id: stepId, error: result.error })
    await deps.persistTask(result.task)
    return { task: result.task, outcome: { kind: 'error', error: result.error } }
  }
  await deps.persistTask(result.task)
  deps.emit('step.retrying', { step_id: stepId, feedback })
  return runTemplateExecutor(result.task, deps)
}
