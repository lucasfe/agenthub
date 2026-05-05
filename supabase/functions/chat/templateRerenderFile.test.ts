// Tests for the per-file rerender helper used by Diana steps (issue #357).
// The module is pure: it takes a task snapshot and a renderFile callback,
// validates the request, invokes the callback exactly once for a single
// output_file, and returns a fresh task with the file replaced.

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1'

import { rerenderStepFile } from './templateRerenderFile.ts'

const baseFile = (overrides: Record<string, unknown> = {}) => ({
  storage_path: 'tasks/abc/feed_001.jpg',
  signed_url: 'https://example.com/feed_001.jpg',
  mime_type: 'image/jpeg',
  width: 1080,
  height: 1080,
  source_html: '<html><body>v1</body></html>',
  approval_state: 'edit_requested',
  feedback: 'lighten the background',
  ...overrides,
})

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    status: 'awaiting_approval',
    plan: {
      steps: [
        {
          id: 1,
          agent_id: 'diana-design',
          status: 'awaiting_approval',
          requires_approval: true,
          output_files: [
            baseFile(),
            baseFile({
              storage_path: 'tasks/abc/feed_002.jpg',
              approval_state: 'approved',
            }),
          ],
        },
      ],
    },
    ...overrides,
  }
}

Deno.test('rerenderStepFile — invokes renderFile exactly once with stored html + dims', async () => {
  const calls: Array<Record<string, unknown>> = []
  const renderFile = (req: any) => {
    calls.push(req)
    return Promise.resolve({
      storage_path: 'tasks/abc/feed_001_v2.jpg',
      signed_url: 'https://example.com/feed_001_v2.jpg',
      mime_type: 'image/jpeg',
      width: 1080,
      height: 1080,
    })
  }
  const result = await rerenderStepFile(baseTask(), 1, 0, { renderFile })
  assertEquals(calls.length, 1)
  assertEquals(calls[0].html, '<html><body>v1</body></html>')
  assertEquals(calls[0].width, 1080)
  assertEquals(calls[0].height, 1080)
  // The rerendered file replaces idx 0 only.
  assertEquals(
    result.task.plan.steps[0].output_files[0].storage_path,
    'tasks/abc/feed_001_v2.jpg',
  )
  assertEquals(
    result.task.plan.steps[0].output_files[1].storage_path,
    'tasks/abc/feed_002.jpg',
  )
  // Approved file at idx 1 is preserved untouched.
  assertEquals(
    result.task.plan.steps[0].output_files[1].approval_state,
    'approved',
  )
})

Deno.test('rerenderStepFile — resets the rerendered file approval_state to pending', async () => {
  const renderFile = () =>
    Promise.resolve({
      storage_path: 'new.jpg',
      signed_url: 'https://example.com/new.jpg',
      mime_type: 'image/jpeg',
      width: 1080,
      height: 1080,
    })
  const result = await rerenderStepFile(baseTask(), 1, 0, { renderFile })
  assertEquals(result.task.plan.steps[0].output_files[0].approval_state, 'pending')
  assertEquals(
    result.task.plan.steps[0].output_files[0].feedback,
    undefined,
  )
})

Deno.test('rerenderStepFile — propagates user-provided feedback into the renderFile call', async () => {
  let received: Record<string, unknown> | null = null
  const renderFile = (req: any) => {
    received = req
    return Promise.resolve({
      storage_path: 'new.jpg',
      signed_url: 'https://example.com/new.jpg',
      mime_type: 'image/jpeg',
      width: 1080,
      height: 1080,
    })
  }
  await rerenderStepFile(baseTask(), 1, 0, {
    renderFile,
    feedback: 'darker tones',
  })
  assert(received !== null)
  assertEquals((received as Record<string, unknown>).feedback, 'darker tones')
})

Deno.test('rerenderStepFile — rejects when step does not exist', async () => {
  const renderFile = () =>
    Promise.resolve({
      storage_path: 'x',
      signed_url: 'x',
      mime_type: 'image/jpeg',
      width: 1,
      height: 1,
    })
  await assertRejects(
    () => rerenderStepFile(baseTask(), 999, 0, { renderFile }),
    Error,
    'step',
  )
})

Deno.test('rerenderStepFile — rejects when file index is out of range', async () => {
  const renderFile = () =>
    Promise.resolve({
      storage_path: 'x',
      signed_url: 'x',
      mime_type: 'image/jpeg',
      width: 1,
      height: 1,
    })
  await assertRejects(
    () => rerenderStepFile(baseTask(), 1, 99, { renderFile }),
    Error,
    'file',
  )
})

Deno.test('rerenderStepFile — rejects when target file is not an image', async () => {
  const task = baseTask()
  task.plan.steps[0].output_files[0] = {
    ...baseFile(),
    mime_type: 'application/pdf',
  }
  const renderFile = () =>
    Promise.resolve({
      storage_path: 'x',
      signed_url: 'x',
      mime_type: 'image/jpeg',
      width: 1,
      height: 1,
    })
  await assertRejects(
    () => rerenderStepFile(task, 1, 0, { renderFile }),
    Error,
    'image',
  )
})

Deno.test('rerenderStepFile — rejects when source_html is missing', async () => {
  const task = baseTask()
  delete (task.plan.steps[0].output_files[0] as Record<string, unknown>).source_html
  const renderFile = () =>
    Promise.resolve({
      storage_path: 'x',
      signed_url: 'x',
      mime_type: 'image/jpeg',
      width: 1,
      height: 1,
    })
  await assertRejects(
    () => rerenderStepFile(task, 1, 0, { renderFile }),
    Error,
    'source_html',
  )
})

Deno.test('rerenderStepFile — preserves source_html on the rerendered file so subsequent rerenders work', async () => {
  const renderFile = () =>
    Promise.resolve({
      storage_path: 'tasks/abc/feed_001_v2.jpg',
      signed_url: 'https://example.com/feed_001_v2.jpg',
      mime_type: 'image/jpeg',
      width: 1080,
      height: 1080,
    })
  const result = await rerenderStepFile(baseTask(), 1, 0, { renderFile })
  assertEquals(
    result.task.plan.steps[0].output_files[0].source_html,
    '<html><body>v1</body></html>',
  )
})
