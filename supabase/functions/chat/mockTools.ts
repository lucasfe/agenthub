// Mock tool handlers used by the template-executor template-mode (issue #354).
//
// Slice #354 lands the executor's template branch BEFORE the real image
// renderer (#351) and Zernio publisher (#352) ship. To keep the slice
// independently mergeable, the executor calls these stubs whenever an agent
// declares the corresponding tool key. They return deterministic placeholder
// payloads and never reach the network.
//
// Replace the handlers in TOOL_HANDLERS with the real ones in #351/#352.

// deno-lint-ignore-file no-explicit-any

import type { ToolContext, ToolResult } from './executor.ts'

const PLACEHOLDER_URL_PREFIX =
  'https://placehold.co/1080x1080/jpeg?text=mock-image'

function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // unsigned 32-bit hex, padded
  return (h >>> 0).toString(16).padStart(8, '0')
}

export async function mockImageRender(
  input: { prompt?: unknown; width?: unknown; height?: unknown },
  ctx: ToolContext,
): Promise<ToolResult> {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt) {
    return {
      ok: false,
      error: 'mock_image_render requires a non-empty `prompt`.',
    }
  }
  const width = typeof input.width === 'number' && input.width > 0 ? input.width : 1080
  const height =
    typeof input.height === 'number' && input.height > 0 ? input.height : 1080

  const taskId = ctx.taskId ?? 'mock-task'
  const stepOrder =
    typeof ctx.stepOrder === 'number' ? ctx.stepOrder : ctx.stepId
  const promptHash = fnv1a(prompt)
  const url =
    `${PLACEHOLDER_URL_PREFIX}-${taskId}-${stepOrder}-${promptHash}`

  // deno-lint-ignore no-await-in-loop
  await Promise.resolve()

  return {
    ok: true,
    result: {
      url,
      mime_type: 'image/jpeg',
      width,
      height,
      mock: true,
      prompt,
    },
    summary: `Mock-rendered ${width}×${height} image for prompt "${prompt.slice(0, 60)}"`,
    artifact: {
      type: 'file',
      name: `${taskId}-step${stepOrder}-${promptHash}.jpg`,
      format: 'jpg',
      content: url,
    },
  }
}

export async function mockZernioPublish(
  input: {
    caption?: unknown
    media_url?: unknown
    schedule_at?: unknown
    [key: string]: unknown
  },
  ctx: ToolContext,
): Promise<ToolResult> {
  const caption = typeof input.caption === 'string' ? input.caption.trim() : ''
  const mediaUrl = typeof input.media_url === 'string' ? input.media_url.trim() : ''
  if (!caption && !mediaUrl) {
    return {
      ok: false,
      error:
        'mock_zernio_publish requires at least one of `caption` or `media_url`.',
    }
  }

  const payload = {
    event: 'mock_zernio_publish.would_publish',
    task_id: ctx.taskId ?? null,
    step_order:
      typeof ctx.stepOrder === 'number' ? ctx.stepOrder : ctx.stepId,
    caption,
    media_url: mediaUrl,
    schedule_at:
      typeof input.schedule_at === 'string' ? input.schedule_at : null,
  }
  console.log(JSON.stringify(payload))

  await Promise.resolve()

  return {
    ok: true,
    result: { published: true, mock: true, ...payload },
    summary: caption
      ? `Mock-published Zernio post: "${caption.slice(0, 60)}"`
      : 'Mock-published Zernio post (media-only)',
  }
}
