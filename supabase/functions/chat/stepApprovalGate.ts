// Step-approval state machine for template-mode tasks (issue #354).
//
// Pure functions over a task snapshot. Every helper takes the current task
// (already loaded from the `tasks` table) and returns the next snapshot, so
// every transition is testable in isolation. Persistence is the caller's job.
//
// The task snapshot must look at minimum like:
//   { id, status, plan: { steps: [{ id, agent_id, ... }] }, error_message? }
// Steps gain these dynamic fields as the run progresses:
//   status: 'pending' | 'running' | 'awaiting_approval' | 'done' | 'error'
//   retry_count, output, output_files, last_feedback, error_message

// deno-lint-ignore-file no-explicit-any

export const MAX_STEP_RETRIES = 3

export type TaskStatus =
  | 'todo'
  | 'executing'
  | 'awaiting_approval'
  | 'done'
  | 'cancelled'
  | 'error'

export type StepStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'done'
  | 'error'

export interface StepFile {
  url: string
  mime_type: string
  storage_path?: string
  width?: number
  height?: number
}

export interface StepResult {
  output?: string
  output_files?: StepFile[]
}

export interface RetryFailure {
  task: Record<string, any>
  error: string
}

export interface RetrySuccess {
  task: Record<string, any>
}

export type RetryOutcome = RetrySuccess | RetryFailure

// ── Detection ──────────────────────────────────────────────────────────────

export function isTemplateTask(task: any): boolean {
  if (!task || typeof task !== 'object') return false
  const steps = task.plan?.steps
  if (!Array.isArray(steps) || steps.length === 0) return false
  return steps.some((s) => {
    if (!s || typeof s !== 'object') return false
    if (typeof s.instruction === 'string') return true
    if (Array.isArray(s.needs_outputs_from) && s.needs_outputs_from.length > 0) {
      return true
    }
    if (Array.isArray(s.reference_ids) && s.reference_ids.length > 0) return true
    return false
  })
}

// ── Internal step helpers ─────────────────────────────────────────────────

function findStepIndex(task: any, stepId: number): number {
  const steps = task?.plan?.steps
  if (!Array.isArray(steps)) return -1
  return steps.findIndex((s: any) => s && s.id === stepId)
}

function patchStep(task: any, stepId: number, patch: (step: any) => any): any {
  const steps = task?.plan?.steps ?? []
  const idx = findStepIndex(task, stepId)
  if (idx < 0) return task
  const nextSteps = steps.map((s: any, i: number) => (i === idx ? patch(s) : s))
  return {
    ...task,
    plan: { ...task.plan, steps: nextSteps },
  }
}

// ── Transitions ───────────────────────────────────────────────────────────

export function markStepRunning(task: any, stepId: number): any {
  const next = patchStep(task, stepId, (s) => ({
    ...s,
    status: 'running',
    error_message: undefined,
  }))
  return { ...next, status: 'executing', error_message: null }
}

export function applyStepResult(
  task: any,
  stepId: number,
  result: StepResult,
): any {
  return patchStep(task, stepId, (s) => ({
    ...s,
    output: typeof result.output === 'string' ? result.output : s.output,
    output_files: Array.isArray(result.output_files)
      ? result.output_files
      : s.output_files,
  }))
}

export function freezeForApproval(task: any, stepId: number): any {
  const next = patchStep(task, stepId, (s) => ({
    ...s,
    status: 'awaiting_approval',
  }))
  return { ...next, status: 'awaiting_approval' }
}

export function approveStep(task: any, stepId: number): any {
  const next = patchStep(task, stepId, (s) => ({ ...s, status: 'done' }))
  return { ...next, status: 'executing' }
}

export function retryStep(
  task: any,
  stepId: number,
  feedback: string,
): RetryOutcome {
  const idx = findStepIndex(task, stepId)
  if (idx < 0) {
    return {
      task,
      error: `Step ${stepId} not found in task plan`,
    }
  }

  const step = task.plan.steps[idx]
  const currentRetryCount =
    typeof step.retry_count === 'number' ? step.retry_count : 0

  if (currentRetryCount >= MAX_STEP_RETRIES) {
    const message = `Step ${stepId} exceeded max retries (${MAX_STEP_RETRIES})`
    const errored = patchStep(task, stepId, (s) => ({
      ...s,
      status: 'error',
      error_message: message,
    }))
    return {
      task: { ...errored, status: 'error', error_message: message },
      error: message,
    }
  }

  const trimmedFeedback = typeof feedback === 'string' ? feedback : ''

  // Reset the target step + every later step. Downstream stale invariant:
  // re-running step N invalidates outputs of every step > N because the
  // template renderer would otherwise feed them stale upstream context.
  const steps = task.plan.steps.map((s: any, i: number) => {
    if (i < idx) return s
    if (i === idx) {
      return {
        ...s,
        status: 'pending',
        retry_count: currentRetryCount + 1,
        last_feedback: trimmedFeedback || s.last_feedback,
        output: undefined,
        output_files: undefined,
        error_message: undefined,
      }
    }
    return {
      ...s,
      status: 'pending',
      output: undefined,
      output_files: undefined,
      error_message: undefined,
    }
  })

  return {
    task: {
      ...task,
      status: 'executing',
      error_message: null,
      plan: { ...task.plan, steps },
    },
  }
}

export function markStepError(
  task: any,
  stepId: number,
  message: string,
): any {
  const next = patchStep(task, stepId, (s) => ({
    ...s,
    status: 'error',
    error_message: message,
  }))
  return { ...next, status: 'error', error_message: message }
}

export function isStepRequiringApproval(step: any): boolean {
  return Boolean(step && step.requires_approval === true)
}
