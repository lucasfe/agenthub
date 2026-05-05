// Tests for the mocked image-render and Zernio-publish tools used in the
// template-executor template-mode (issue #354). Slices #351 and #352 will
// replace these with real implementations; until then they return
// deterministic placeholders so the wider executor flow is independently
// testable.

import { assert, assertEquals, assertExists, assertStringIncludes } from 'jsr:@std/assert@1'

import {
  mockImageRender,
  mockZernioPublish,
} from './mockTools.ts'

function ctx(extra: Record<string, unknown> = {}) {
  return {
    signal: new AbortController().signal,
    agentsContext: [],
    stepId: 1,
    toolCallId: 'tc-1',
    ...extra,
  }
}

// ─── mockImageRender ────────────────────────────────────────────────────────

Deno.test('mockImageRender — returns a deterministic placeholder URL', async () => {
  const a = await mockImageRender({ prompt: 'a kitten on a skateboard' }, ctx())
  const b = await mockImageRender({ prompt: 'a kitten on a skateboard' }, ctx())
  assertEquals(a.ok, true)
  assertEquals(b.ok, true)
  if (!a.ok || !b.ok) return
  assertExists(a.result)
  assertEquals((a.result as any).url, (b.result as any).url)
  assertStringIncludes((a.result as any).url, 'mock-image')
})

Deno.test('mockImageRender — emits a file artifact with image/jpeg mime', async () => {
  const result = await mockImageRender(
    { prompt: 'test prompt' },
    ctx({ taskId: 'task-7', stepOrder: 2 }),
  )
  assertEquals(result.ok, true)
  if (!result.ok) return
  assertExists(result.artifact)
  assertEquals(result.artifact?.type, 'file')
  assertEquals(result.artifact?.format, 'jpg')
  assertEquals((result.result as any).mime_type, 'image/jpeg')
})

Deno.test('mockImageRender — rejects empty prompt', async () => {
  const result = await mockImageRender({ prompt: '   ' }, ctx())
  assertEquals(result.ok, false)
  assertExists(result.error)
})

Deno.test('mockImageRender — surfaces taskId/stepOrder in the placeholder URL', async () => {
  const result = await mockImageRender(
    { prompt: 'foo' },
    ctx({ taskId: 'task-99', stepOrder: 4 }),
  )
  assertEquals(result.ok, true)
  if (!result.ok) return
  const url = (result.result as any).url as string
  assertStringIncludes(url, 'task-99')
  assertStringIncludes(url, '4')
})

// ─── mockZernioPublish ──────────────────────────────────────────────────────

Deno.test('mockZernioPublish — logs the would-be payload and returns ok', async () => {
  const captured: unknown[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => {
    captured.push(args)
  }
  try {
    const result = await mockZernioPublish(
      { caption: 'hello', media_url: 'https://x/y.jpg' },
      ctx({ taskId: 'task-z', stepOrder: 0 }),
    )
    assertEquals(result.ok, true)
    if (!result.ok) return
    assertExists(result.summary)
    assert(captured.length > 0, 'expected console.log to be called')
    // Find the structured log line that includes the marker.
    const flat = captured.map((c) => JSON.stringify(c)).join('\n')
    assertStringIncludes(flat, 'mock_zernio_publish.would_publish')
    assertStringIncludes(flat, 'task-z')
    assertStringIncludes(flat, 'https://x/y.jpg')
  } finally {
    console.log = originalLog
  }
})

Deno.test('mockZernioPublish — rejects when caption AND media_url are both missing', async () => {
  const result = await mockZernioPublish({}, ctx())
  assertEquals(result.ok, false)
  assertExists(result.error)
})
