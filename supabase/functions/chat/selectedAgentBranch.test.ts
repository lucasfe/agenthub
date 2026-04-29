import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'jsr:@std/assert@1'
import {
  buildAgentToolset,
  runSelectedAgentBranch,
} from './selectedAgentBranch.ts'

// ─── helpers ────────────────────────────────────────────────────────────────

interface CapturedEvent {
  type: string
  payload: Record<string, unknown>
}

function makeEmitter(): { emit: (t: string, p?: Record<string, unknown>) => void; events: CapturedEvent[] } {
  const events: CapturedEvent[] = []
  return {
    emit: (type, payload = {}) => {
      events.push({ type, payload })
    },
    events,
  }
}

// Builds a stream body (Anthropic-style SSE) from a list of content blocks.
// Tool-use blocks emit input_json_delta with the full JSON in one chunk for
// simplicity — the parser only cares about reassembly, not chunk shape.
function streamFromContent(
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >,
  stopReason: 'end_turn' | 'tool_use' = 'end_turn',
): Response {
  const parts: string[] = []
  parts.push(
    `data: ${JSON.stringify({
      type: 'message_start',
      message: { id: 'msg', type: 'message', role: 'assistant' },
    })}\n\n`,
  )
  for (let i = 0; i < content.length; i++) {
    const block = content[i]
    if (block.type === 'text') {
      parts.push(
        `data: ${JSON.stringify({
          type: 'content_block_start',
          index: i,
          content_block: { type: 'text', text: '' },
        })}\n\n`,
      )
      parts.push(
        `data: ${JSON.stringify({
          type: 'content_block_delta',
          index: i,
          delta: { type: 'text_delta', text: block.text },
        })}\n\n`,
      )
      parts.push(
        `data: ${JSON.stringify({ type: 'content_block_stop', index: i })}\n\n`,
      )
    } else {
      parts.push(
        `data: ${JSON.stringify({
          type: 'content_block_start',
          index: i,
          content_block: {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: {},
          },
        })}\n\n`,
      )
      parts.push(
        `data: ${JSON.stringify({
          type: 'content_block_delta',
          index: i,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify(block.input),
          },
        })}\n\n`,
      )
      parts.push(
        `data: ${JSON.stringify({ type: 'content_block_stop', index: i })}\n\n`,
      )
    }
  }
  parts.push(
    `data: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: stopReason },
    })}\n\n`,
  )
  parts.push(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`)

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const p of parts) controller.enqueue(encoder.encode(p))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function withEnv(key: string, value: string | null): () => void {
  const previous = Deno.env.get(key)
  if (value === null) Deno.env.delete(key)
  else Deno.env.set(key, value)
  return () => {
    if (previous === undefined) Deno.env.delete(key)
    else Deno.env.set(key, previous)
  }
}

// ─── buildAgentToolset ──────────────────────────────────────────────────────

Deno.test('buildAgentToolset — intersects agent tools with env-available tools', () => {
  const restore = withEnv('GITHUB_TOKEN', 'tok')
  try {
    const agent = { tools: ['list_github_repos', 'create_github_issue', 'web_search'] }
    const toolsContext = [
      { id: 'list_github_repos', name: 'List repos', input_schema: { type: 'object', properties: {} } },
      { id: 'create_github_issue', name: 'Create issue', input_schema: { type: 'object', properties: {} } },
      { id: 'web_search', name: 'Web search', input_schema: { type: 'object', properties: {} } },
    ]
    const { tools, allowedIds, skippedIds } = buildAgentToolset(agent, toolsContext)
    // GITHUB_TOKEN is set but TAVILY_API_KEY is not, so web_search is skipped.
    assert(allowedIds.has('list_github_repos'))
    assert(allowedIds.has('create_github_issue'))
    assert(!allowedIds.has('web_search'))
    assertEquals(skippedIds, ['web_search'])
    assertEquals(tools.length, 2)
  } finally {
    restore()
  }
})

Deno.test('buildAgentToolset — drops unknown tool ids and non-string entries', () => {
  const agent = { tools: ['generate_markdown', '', 42, 'totally_made_up'] }
  const toolsContext = [
    { id: 'generate_markdown', name: 'md', input_schema: { type: 'object', properties: {} } },
  ]
  const { tools, allowedIds } = buildAgentToolset(agent, toolsContext)
  assert(allowedIds.has('generate_markdown'))
  assert(!allowedIds.has('totally_made_up'))
  assertEquals(tools.length, 1)
})

// ─── runSelectedAgentBranch ─────────────────────────────────────────────────

Deno.test('runSelectedAgentBranch — single text turn ends with chat.done', async () => {
  const { emit, events } = makeEmitter()

  const fetchImpl = async () => streamFromContent([{ type: 'text', text: 'Hello!' }])

  await runSelectedAgentBranch(emit, {
    agent: { id: 'a', tools: [] },
    messages: [{ role: 'user', content: 'hi' }],
    systemPrompt: 'You are agent A.',
    agentsContext: [],
    toolsContext: [],
    apiKey: 'k',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })

  const types = events.map((e) => e.type)
  assertEquals(types, ['chat.text', 'chat.done'])
  assertEquals(events[0].payload.value, 'Hello!')
})

Deno.test('runSelectedAgentBranch — executes tools server-side and loops back to LLM', async () => {
  const { emit, events } = makeEmitter()

  // Track Anthropic-bound calls so we can assert the tools we sent and the
  // tool_result we appended.
  const anthropicCalls: { body: any }[] = []
  let turn = 0

  const fetchImpl = async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url
    if (url === 'https://api.anthropic.com/v1/messages') {
      const body = JSON.parse((init?.body as string) || '{}')
      anthropicCalls.push({ body })
      turn++
      if (turn === 1) {
        // First turn: the model proposes a tool call.
        return streamFromContent(
          [{ type: 'tool_use', id: 'tu1', name: 'generate_markdown', input: { title: 'Doc', sections: [{ heading: 'H', body: 'This is a long enough body for the tool to accept.' }] } }],
          'tool_use',
        )
      }
      // Second turn: model wraps up with text now that it has the tool result.
      return streamFromContent([{ type: 'text', text: 'Done writing.' }])
    }
    return new Response('not mocked', { status: 500 })
  }

  await runSelectedAgentBranch(emit, {
    agent: {
      id: 'writer',
      tools: ['generate_markdown'],
      content: 'You write docs.',
    },
    messages: [{ role: 'user', content: 'write me a doc' }],
    systemPrompt: 'You write docs.',
    agentsContext: [],
    toolsContext: [
      {
        id: 'generate_markdown',
        name: 'gm',
        input_schema: { type: 'object', properties: {} },
      },
    ],
    apiKey: 'k',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })

  // Two Anthropic round-trips: initial + after tool_result.
  assertEquals(anthropicCalls.length, 2)

  // The first request advertised the agent's own tool, NOT draft_agent.
  const firstTools = anthropicCalls[0].body.tools as Array<{ name: string }>
  assertEquals(firstTools.length, 1)
  assertEquals(firstTools[0].name, 'generate_markdown')

  // The second request includes a tool_result for the prior tool_use.
  const secondMessages = anthropicCalls[1].body.messages as Array<{ role: string; content: any }>
  assertEquals(secondMessages.length, 3)
  assertEquals(secondMessages[1].role, 'assistant')
  assertEquals(secondMessages[2].role, 'user')
  const toolResult = secondMessages[2].content[0]
  assertEquals(toolResult.type, 'tool_result')
  assertEquals(toolResult.tool_use_id, 'tu1')

  // We surfaced start/done events for the tool, then text + done for the wrap-up.
  const types = events.map((e) => e.type)
  assertEquals(types, [
    'chat.tool_call_start',
    'chat.tool_call_done',
    'chat.text',
    'chat.done',
  ])
  assertEquals(events[0].payload.name, 'generate_markdown')
  assertEquals(events[1].payload.status, 'done')
})

Deno.test('runSelectedAgentBranch — surfaces skipped tools when env config is missing', async () => {
  const restore = withEnv('GITHUB_TOKEN', null)
  try {
    const { emit, events } = makeEmitter()
    const fetchImpl = async () => streamFromContent([{ type: 'text', text: 'ok' }])

    await runSelectedAgentBranch(emit, {
      agent: {
        id: 'gh',
        tools: ['list_github_repos'],
        content: 'You file issues.',
      },
      messages: [{ role: 'user', content: 'list my repos' }],
      systemPrompt: 'You file issues.',
      agentsContext: [],
      toolsContext: [
        {
          id: 'list_github_repos',
          name: 'lgr',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const skipStart = events.find(
      (e) => e.type === 'chat.tool_call_start' && e.payload.name === 'list_github_repos',
    )
    const skipDone = events.find(
      (e) => e.type === 'chat.tool_call_done' && e.payload.status === 'error',
    )
    assert(skipStart, 'expected a synthetic tool_call_start for the skipped tool')
    assert(skipDone, 'expected a tool_call_done with error status for the skipped tool')
    assertStringIncludes(String(skipDone!.payload.error), 'GITHUB_TOKEN')
  } finally {
    restore()
  }
})

Deno.test('runSelectedAgentBranch — surfaces upstream Anthropic errors as chat.error', async () => {
  const { emit, events } = makeEmitter()
  const fetchImpl = async () =>
    new Response('rate limited', { status: 429 })

  await runSelectedAgentBranch(emit, {
    agent: { id: 'a', tools: [] },
    messages: [{ role: 'user', content: 'hi' }],
    systemPrompt: 'You are a.',
    agentsContext: [],
    toolsContext: [],
    apiKey: 'k',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })

  assertEquals(events.length, 1)
  assertEquals(events[0].type, 'chat.error')
  assertStringIncludes(String(events[0].payload.error), '429')
})
