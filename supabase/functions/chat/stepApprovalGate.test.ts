// Tests for the step-approval state machine driving template-mode tasks
// (issue #354). The module is purely functional — every helper takes a task
// snapshot and returns the next snapshot, so each transition can be tested
// in isolation without any I/O.

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1'

import {
  applyStepResult,
  approveStep,
  freezeForApproval,
  isTemplateTask,
  markStepError,
  markStepRunning,
  MAX_STEP_RETRIES,
  retryStep,
} from './stepApprovalGate.ts'

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    status: 'todo',
    plan: {
      steps: [
        {
          id: 1,
          agent_id: 'frontend-developer',
          instruction: 'Hello {{ params.who }}',
          needs_outputs_from: [],
          reference_ids: [],
        },
        {
          id: 2,
          agent_id: 'backend-developer',
          instruction: 'Use {{ step-1.output }} to {{ params.do_what }}',
          needs_outputs_from: [1],
          reference_ids: [],
          requires_approval: true,
        },
        {
          id: 3,
          agent_id: 'qa-engineer',
          instruction: 'Wrap up {{ step-2.output }}',
          needs_outputs_from: [2],
          reference_ids: [],
        },
      ],
    },
    ...overrides,
  }
}

// ─── isTemplateTask ─────────────────────────────────────────────────────────

Deno.test('isTemplateTask — true when any step has an instruction', () => {
  assertEquals(isTemplateTask(baseTask()), true)
})

Deno.test('isTemplateTask — true when step has needs_outputs_from', () => {
  const t = {
    plan: {
      steps: [{ id: 1, agent_id: 'a', needs_outputs_from: [1] }],
    },
  }
  assertEquals(isTemplateTask(t), true)
})

Deno.test('isTemplateTask — true when step has reference_ids', () => {
  const t = {
    plan: { steps: [{ id: 1, agent_id: 'a', reference_ids: ['logo'] }] },
  }
  assertEquals(isTemplateTask(t), true)
})

Deno.test('isTemplateTask — false on legacy planner task (just task field)', () => {
  const legacy = {
    plan: {
      steps: [{ id: 1, agent_id: 'a', task: 'do the thing', inputs: ['original_task'] }],
    },
  }
  assertEquals(isTemplateTask(legacy), false)
})

Deno.test('isTemplateTask — false on missing/empty plan', () => {
  assertEquals(isTemplateTask({}), false)
  assertEquals(isTemplateTask({ plan: null }), false)
  assertEquals(isTemplateTask({ plan: { steps: [] } }), false)
})

// ─── markStepRunning ────────────────────────────────────────────────────────

Deno.test('markStepRunning — sets task status executing and step status running', () => {
  const next = markStepRunning(baseTask(), 1)
  assertEquals(next.status, 'executing')
  assertEquals(next.plan.steps[0].status, 'running')
  // other steps untouched
  assertEquals(next.plan.steps[1].status, undefined)
})

Deno.test('markStepRunning — clears prior error_message when re-running', () => {
  const errored = baseTask({ status: 'error', error_message: 'boom' })
  const next = markStepRunning(errored, 1)
  assertEquals(next.error_message, null)
  assertEquals(next.status, 'executing')
})

// ─── applyStepResult ────────────────────────────────────────────────────────

Deno.test('applyStepResult — persists text output and output_files on the step', () => {
  const t = markStepRunning(baseTask(), 1)
  const out = applyStepResult(t, 1, {
    output: 'rendered text',
    output_files: [{ url: 'https://x/y.jpg', mime_type: 'image/jpeg' }],
  })
  assertEquals(out.plan.steps[0].output, 'rendered text')
  assertEquals(out.plan.steps[0].output_files?.length, 1)
})

Deno.test('applyStepResult — does not flip step status to done by itself', () => {
  // status flip happens separately so that requires_approval can intercept.
  const t = markStepRunning(baseTask(), 1)
  const out = applyStepResult(t, 1, { output: 'x' })
  assertEquals(out.plan.steps[0].status, 'running')
})

// ─── freezeForApproval ──────────────────────────────────────────────────────

Deno.test('freezeForApproval — sets step + task to awaiting_approval', () => {
  const t = applyStepResult(markStepRunning(baseTask(), 2), 2, {
    output: 'draft',
  })
  const frozen = freezeForApproval(t, 2)
  assertEquals(frozen.status, 'awaiting_approval')
  assertEquals(frozen.plan.steps[1].status, 'awaiting_approval')
})

// ─── approveStep ────────────────────────────────────────────────────────────

Deno.test('approveStep — flips step status to done and resumes task to executing', () => {
  const frozen = freezeForApproval(
    applyStepResult(markStepRunning(baseTask(), 2), 2, { output: 'draft' }),
    2,
  )
  const next = approveStep(frozen, 2)
  assertEquals(next.plan.steps[1].status, 'done')
  assertEquals(next.status, 'executing')
})

// ─── retryStep ──────────────────────────────────────────────────────────────

Deno.test('retryStep — increments retry_count and clears step output', () => {
  const frozen = freezeForApproval(
    applyStepResult(markStepRunning(baseTask(), 2), 2, {
      output: 'draft',
      output_files: [{ url: 'https://x/y.jpg', mime_type: 'image/jpeg' }],
    }),
    2,
  )
  const result = retryStep(frozen, 2, 'make it punchier')
  assert(!('error' in result))
  if ('error' in result) return
  const next = result.task
  assertEquals(next.plan.steps[1].retry_count, 1)
  assertEquals(next.plan.steps[1].output, undefined)
  assertEquals(next.plan.steps[1].output_files, undefined)
  assertEquals(next.plan.steps[1].status, 'pending')
  assertEquals(next.plan.steps[1].last_feedback, 'make it punchier')
  assertEquals(next.status, 'executing')
})

Deno.test('retryStep — marks downstream steps stale (clears their output)', () => {
  // Step 2 is approved, step 3 has output, then we retry step 2 → step 3 must
  // be reset because its input changed.
  let t = applyStepResult(markStepRunning(baseTask(), 2), 2, { output: 'draft v1' })
  t = approveStep(freezeForApproval(t, 2), 2)
  t = applyStepResult(markStepRunning(t, 3), 3, { output: 'wrap-up v1' })
  t = { ...t, plan: { ...t.plan, steps: t.plan.steps.map((s: any) => s.id === 3 ? { ...s, status: 'done' } : s) } }
  const result = retryStep(t, 2, 'redo')
  assert(!('error' in result))
  if ('error' in result) return
  const next = result.task
  // step 2 is back to pending
  assertEquals(next.plan.steps[1].status, 'pending')
  assertEquals(next.plan.steps[1].output, undefined)
  // step 3 became stale (output cleared, status pending)
  assertEquals(next.plan.steps[2].status, 'pending')
  assertEquals(next.plan.steps[2].output, undefined)
})

Deno.test(`retryStep — returns error after ${MAX_STEP_RETRIES} retries`, () => {
  let t = freezeForApproval(
    applyStepResult(markStepRunning(baseTask(), 2), 2, { output: 'draft' }),
    2,
  )
  for (let i = 0; i < MAX_STEP_RETRIES; i++) {
    const result = retryStep(t, 2, `feedback ${i + 1}`)
    assert(!('error' in result))
    if ('error' in result) return
    // simulate the retry being executed by running and freezing again
    t = freezeForApproval(
      applyStepResult(markStepRunning(result.task, 2), 2, { output: `draft v${i + 2}` }),
      2,
    )
  }
  const final = retryStep(t, 2, 'one too many')
  assert('error' in final, 'expected error sentinel after max retries')
  if (!('error' in final)) return
  assertExists(final.error)
  assertEquals(final.task.status, 'error')
  assertEquals(final.task.plan.steps[1].status, 'error')
})

// ─── markStepError ──────────────────────────────────────────────────────────

Deno.test('markStepError — flips step + task to error with message', () => {
  const t = markStepRunning(baseTask(), 1)
  const next = markStepError(t, 1, 'tool blew up')
  assertEquals(next.status, 'error')
  assertEquals(next.error_message, 'tool blew up')
  assertEquals(next.plan.steps[0].status, 'error')
  assertEquals(next.plan.steps[0].error_message, 'tool blew up')
})
