// Tests for the template-executor branch (issue #354). Covers:
//   - end-to-end happy path on a 2-step template task with all-mocked tools
//   - approval gate freezes the run and emits step.awaiting_approval
//   - resumeTemplateApprove advances after the user clicks Approve
//   - resumeTemplateRetry re-executes the same step with feedback in context
//   - retry past MAX_STEP_RETRIES transitions the task to error
//   - retrying step N invalidates outputs of steps > N

import {
  assert,
  assertEquals,
  assertExists,
  assertStringIncludes,
} from 'jsr:@std/assert@1'

import {
  resumeTemplateApprove,
  resumeTemplateRetry,
  runTemplateExecutor,
} from './templateExecutorBranch.ts'

interface FetchCall {
  url: string
  body: any
}

function makeFetchMock(
  responder: (call: FetchCall) => Response | Promise<Response>,
) {
  const calls: FetchCall[] = []
  const fn = (async (input: any, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    let body: any = null
    try {
      body =
        typeof init?.body === 'string'
          ? JSON.parse(init.body)
          : null
    } catch {
      body = null
    }
    const call: FetchCall = { url, body }
    calls.push(call)
    return await responder(call)
  }) as typeof fetch
  return { fn, calls }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fakeAnthropicMessage(text: string): unknown {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

interface EmittedEvent {
  type: string
  payload: Record<string, unknown>
}

function makeEmitter() {
  const events: EmittedEvent[] = []
  const emit = (type: string, payload: Record<string, unknown> = {}) => {
    events.push({ type, payload })
  }
  return { emit, events }
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    status: 'todo',
    plan: {
      steps: [
        {
          id: 1,
          agent_id: 'writer',
          instruction: 'Write about {{ params.topic }}.',
          needs_outputs_from: [],
          reference_ids: [],
          requires_approval: false,
        },
        {
          id: 2,
          agent_id: 'editor',
          instruction: 'Polish: {{ step-1.output }}',
          needs_outputs_from: [1],
          reference_ids: [],
          requires_approval: true,
        },
      ],
    },
    ...overrides,
  }
}

const AGENTS_CONTEXT = [
  {
    id: 'writer',
    name: 'Writer',
    content: 'You write things.',
    model: 'claude-sonnet-4-6',
    tools: [],
  },
  {
    id: 'editor',
    name: 'Editor',
    content: 'You polish text.',
    model: 'claude-sonnet-4-6',
    tools: [],
  },
]

function makeDeps(overrides: Record<string, unknown> = {}) {
  const persisted: any[] = []
  const persistTask = async (t: any) => {
    persisted.push(structuredClone(t))
  }
  const { emit, events } = makeEmitter()
  const fetchMock = makeFetchMock(() =>
    jsonResponse(200, fakeAnthropicMessage('rendered output')),
  )
  return {
    deps: {
      fetchImpl: fetchMock.fn,
      apiKey: 'sk-test',
      signal: new AbortController().signal,
      emit,
      agentsContext: AGENTS_CONTEXT,
      toolsContext: [],
      references: {},
      params: { topic: 'cats' },
      persistTask,
      userId: 'user-1',
      ...overrides,
    },
    fetchCalls: fetchMock.calls,
    events,
    persisted,
  }
}

// ── End-to-end happy path with approval freeze ─────────────────────────────

Deno.test('runTemplateExecutor — runs first step then freezes on approval', async () => {
  const t = makeTask()
  const { deps, fetchCalls, events } = makeDeps()
  const { task, outcome } = await runTemplateExecutor(t, deps)
  assertEquals(outcome.kind, 'frozen')
  assertEquals(task.status, 'awaiting_approval')
  assertEquals(task.plan.steps[0].status, 'done')
  assertEquals(task.plan.steps[0].output, 'rendered output')
  assertEquals(task.plan.steps[1].status, 'awaiting_approval')
  // Two Anthropic calls happened (one per step), both with the right shape.
  assertEquals(fetchCalls.length, 2)
  for (const call of fetchCalls) {
    assertEquals(call.url, 'https://api.anthropic.com/v1/messages')
  }
  // Step 1 prompt was rendered (no placeholders left).
  const firstReq = fetchCalls[0].body
  const firstUserMessage = firstReq.messages[0].content
  // content can be string or block array — handle both
  const firstText =
    typeof firstUserMessage === 'string'
      ? firstUserMessage
      : firstUserMessage.find((b: any) => b.type === 'text')?.text
  assertStringIncludes(firstText, 'Write about cats')
  // Step 2 prompt got step-1 output substituted.
  const secondReq = fetchCalls[1].body
  const secondUserMessage = secondReq.messages[0].content
  const secondText =
    typeof secondUserMessage === 'string'
      ? secondUserMessage
      : secondUserMessage.find((b: any) => b.type === 'text')?.text
  assertStringIncludes(secondText, 'Polish: rendered output')
  // Approval freeze emitted.
  const frozen = events.find((e) => e.type === 'step.awaiting_approval')
  assertExists(frozen)
  assertEquals(frozen!.payload.step_id, 2)
})

// ── resumeTemplateApprove advances ────────────────────────────────────────

Deno.test('resumeTemplateApprove — flips step to done, runs no further steps when last', async () => {
  const t = makeTask()
  const { deps } = makeDeps()
  const { task: frozenTask } = await runTemplateExecutor(t, deps)
  assertEquals(frozenTask.status, 'awaiting_approval')
  // Approve step 2 (the last) — should mark task done.
  const { task: doneTask, outcome } = await resumeTemplateApprove(
    frozenTask,
    2,
    deps,
  )
  assertEquals(outcome.kind, 'all_done')
  assertEquals(doneTask.status, 'done')
  assertEquals(doneTask.plan.steps[1].status, 'done')
})

// ── resumeTemplateRetry executes again with feedback ──────────────────────

Deno.test('resumeTemplateRetry — re-runs the step with feedback in the prompt', async () => {
  const t = makeTask()
  const { deps: initialDeps } = makeDeps()
  const { task: frozenTask } = await runTemplateExecutor(t, initialDeps)

  // Now retry step 2 with feedback. New deps, new fetch mock so we can spy on
  // the request body alone.
  const fetchMock = makeFetchMock(() =>
    jsonResponse(200, fakeAnthropicMessage('refined output v2')),
  )
  const persisted: any[] = []
  const { emit } = makeEmitter()
  const retryDeps = {
    fetchImpl: fetchMock.fn,
    apiKey: 'sk-test',
    signal: new AbortController().signal,
    emit,
    agentsContext: AGENTS_CONTEXT,
    toolsContext: [],
    references: {},
    params: { topic: 'cats' },
    persistTask: async (t: any) => {
      persisted.push(structuredClone(t))
    },
    userId: 'user-1',
  }
  const { task: retriedTask, outcome } = await resumeTemplateRetry(
    frozenTask,
    2,
    'make it punchier',
    retryDeps,
  )
  // After retry+execute, step 2 froze again awaiting approval.
  assertEquals(outcome.kind, 'frozen')
  assertEquals(retriedTask.plan.steps[1].retry_count, 1)
  assertEquals(retriedTask.plan.steps[1].output, 'refined output v2')
  assertEquals(retriedTask.plan.steps[1].status, 'awaiting_approval')
  // Verify exactly one Anthropic call (only step 2 runs again — step 1 is done).
  assertEquals(fetchMock.calls.length, 1)
  const reqBody = fetchMock.calls[0].body
  const userBlocks = reqBody.messages[0].content
  const flat =
    typeof userBlocks === 'string'
      ? userBlocks
      : userBlocks.map((b: any) => b.text || '').join('\n')
  assertStringIncludes(flat, 'make it punchier')
  assertStringIncludes(flat, 'Polish: rendered output')
})

// ── max retries kills the task ─────────────────────────────────────────────

Deno.test('resumeTemplateRetry — task transitions to error after MAX_STEP_RETRIES retries', async () => {
  const t = makeTask()
  const { deps } = makeDeps()
  let { task } = await runTemplateExecutor(t, deps)

  for (let i = 0; i < 3; i++) {
    const out = await resumeTemplateRetry(task, 2, `feedback ${i + 1}`, deps)
    task = out.task
    // Each successful retry runs and freezes again.
    assertEquals(out.outcome.kind, 'frozen', `retry ${i + 1} should freeze`)
  }
  // The 4th retry exceeds MAX_STEP_RETRIES (3) and errors.
  const final = await resumeTemplateRetry(task, 2, 'one too many', deps)
  assertEquals(final.outcome.kind, 'error')
  assertEquals(final.task.status, 'error')
  assertExists(final.task.error_message)
  assertEquals(final.task.plan.steps[1].status, 'error')
})

// ── downstream-stale invariant ─────────────────────────────────────────────

Deno.test('resumeTemplateRetry — retrying step N marks step N+1 stale and re-executes it', async () => {
  // Build a 3-step task where step 2 is approvable and step 3 isn't.
  const t = {
    id: 'task-3',
    status: 'todo',
    plan: {
      steps: [
        {
          id: 1,
          agent_id: 'writer',
          instruction: 'Topic: {{ params.topic }}',
          needs_outputs_from: [],
          reference_ids: [],
          requires_approval: false,
        },
        {
          id: 2,
          agent_id: 'editor',
          instruction: 'Polish: {{ step-1.output }}',
          needs_outputs_from: [1],
          reference_ids: [],
          requires_approval: true,
        },
        {
          id: 3,
          agent_id: 'editor',
          instruction: 'Wrap up: {{ step-2.output }}',
          needs_outputs_from: [2],
          reference_ids: [],
          requires_approval: false,
        },
      ],
    },
  }

  // First run: step1 → step2 (freeze).
  const fetchMock1 = makeFetchMock((call) => {
    const text = call.body.messages[0].content
    const flat =
      typeof text === 'string'
        ? text
        : text.map((b: any) => b.text || '').join('\n')
    if (flat.includes('Topic')) return jsonResponse(200, fakeAnthropicMessage('step1-A'))
    if (flat.includes('Polish')) return jsonResponse(200, fakeAnthropicMessage('step2-A'))
    if (flat.includes('Wrap up')) return jsonResponse(200, fakeAnthropicMessage('step3-A'))
    return jsonResponse(200, fakeAnthropicMessage('default'))
  })
  const { emit } = makeEmitter()
  const deps1 = {
    fetchImpl: fetchMock1.fn,
    apiKey: 'sk-test',
    signal: new AbortController().signal,
    emit,
    agentsContext: AGENTS_CONTEXT,
    toolsContext: [],
    references: {},
    params: { topic: 'cats' },
    persistTask: async () => {},
    userId: 'u',
  }
  let { task } = await runTemplateExecutor(t, deps1)
  assertEquals(task.plan.steps[1].status, 'awaiting_approval')
  // Approve step 2 → step 3 runs and finishes (no approval).
  const r = await resumeTemplateApprove(task, 2, deps1)
  assertEquals(r.outcome.kind, 'all_done')
  task = r.task
  assertEquals(task.status, 'done')
  assertEquals(task.plan.steps[2].output, 'step3-A')

  // Now retry step 2 — step 3 must be invalidated and re-executed.
  const fetchMock2 = makeFetchMock((call) => {
    const text = call.body.messages[0].content
    const flat =
      typeof text === 'string'
        ? text
        : text.map((b: any) => b.text || '').join('\n')
    if (flat.includes('Polish')) return jsonResponse(200, fakeAnthropicMessage('step2-B'))
    if (flat.includes('Wrap up')) return jsonResponse(200, fakeAnthropicMessage('step3-B'))
    return jsonResponse(200, fakeAnthropicMessage('default'))
  })
  const deps2 = { ...deps1, fetchImpl: fetchMock2.fn }
  const retried = await resumeTemplateRetry(task, 2, 'redo', deps2)
  // Step 2 freezes again, step 3 will run only after step 2 is approved.
  assertEquals(retried.outcome.kind, 'frozen')
  // Step 2 has new output, step 3 was reset (cleared) — but execution should
  // freeze at step 2 first. Step 3 is still pending.
  assertEquals(retried.task.plan.steps[1].output, 'step2-B')
  assertEquals(retried.task.plan.steps[1].status, 'awaiting_approval')
  assertEquals(retried.task.plan.steps[2].status, 'pending')
  assertEquals(retried.task.plan.steps[2].output, undefined)

  // Approve step 2 again → step 3 re-executes with the new step 2 output.
  const continued = await resumeTemplateApprove(retried.task, 2, deps2)
  assertEquals(continued.outcome.kind, 'all_done')
  assertEquals(continued.task.plan.steps[2].output, 'step3-B')
})

// ── upstream-failure surfaces step.error ───────────────────────────────────

Deno.test('runTemplateExecutor — Anthropic 500 surfaces error, transitions task', async () => {
  const t = makeTask()
  const fetchMock = makeFetchMock(() => jsonResponse(500, { error: 'boom' }))
  const { emit } = makeEmitter()
  const deps = {
    fetchImpl: fetchMock.fn,
    apiKey: 'sk-test',
    signal: new AbortController().signal,
    emit,
    agentsContext: AGENTS_CONTEXT,
    toolsContext: [],
    references: {},
    params: { topic: 'cats' },
    persistTask: async () => {},
    userId: 'u',
  }
  const { task, outcome } = await runTemplateExecutor(t, deps)
  assertEquals(outcome.kind, 'error')
  assertEquals(task.status, 'error')
  assertExists(task.error_message)
  assertEquals(task.plan.steps[0].status, 'error')
})
