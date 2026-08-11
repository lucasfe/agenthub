// Per-file rerender for Diana steps (issue #357).
//
// When the user clicks "Re-render" on a single thumbnail in the Diana
// gallery, the chat function dispatches into this helper. It locates the
// target step + output_file, re-invokes `render_html_to_image` for that
// single file via the supplied `renderFile` callback, and returns a fresh
// task snapshot with the file replaced and its `approval_state` reset to
// `'pending'`. Sibling files — including ones already approved — are
// untouched.
//
// The module is intentionally pure: storage and DB writes happen in the
// caller (`chat/index.ts`). Tests inject a fake `renderFile` to assert the
// call shape and count without spinning up Browserless.

// deno-lint-ignore-file no-explicit-any

export interface RerenderFileRequest {
  html: string
  width: number
  height: number
  feedback?: string
}

export interface RerenderFileResult {
  storage_path: string
  signed_url: string
  mime_type: 'image/jpeg' | string
  width: number
  height: number
}

export interface RerenderStepFileDeps {
  renderFile: (req: RerenderFileRequest) => Promise<RerenderFileResult>
  feedback?: string
}

export interface RerenderStepFileOutcome {
  task: any
  newFile: RerenderFileResult
}

const isImageMime = (m: unknown) =>
  typeof m === 'string' && m.startsWith('image/')

export async function rerenderStepFile(
  task: any,
  stepId: number,
  fileIdx: number,
  deps: RerenderStepFileDeps,
): Promise<RerenderStepFileOutcome> {
  const steps: any[] = Array.isArray(task?.plan?.steps) ? task.plan.steps : []
  const stepPos = steps.findIndex((s: any) => s && s.id === stepId)
  if (stepPos < 0) {
    throw new Error(`step ${stepId} not found`)
  }
  const step = steps[stepPos]
  const files: any[] = Array.isArray(step.output_files) ? step.output_files : []
  if (fileIdx < 0 || fileIdx >= files.length) {
    throw new Error(`file index ${fileIdx} out of range`)
  }
  const target = files[fileIdx]
  if (!isImageMime(target?.mime_type)) {
    throw new Error('target file is not an image')
  }
  const html = typeof target.source_html === 'string' ? target.source_html : ''
  if (!html.trim()) {
    throw new Error(
      'cannot rerender — source_html is missing on the target file',
    )
  }
  const width = typeof target.width === 'number' ? target.width : 0
  const height = typeof target.height === 'number' ? target.height : 0

  const newFile = await deps.renderFile({
    html,
    width,
    height,
    feedback: deps.feedback,
  })

  const merged: Record<string, unknown> = {
    ...newFile,
    source_html: html,
    approval_state: 'pending',
  }
  // Drop any stale feedback so the freshly-rendered file starts clean.
  delete merged.feedback

  const nextFiles = files.slice()
  nextFiles[fileIdx] = merged
  const nextSteps = steps.slice()
  nextSteps[stepPos] = { ...step, output_files: nextFiles }
  const nextTask = {
    ...task,
    plan: { ...task.plan, steps: nextSteps },
  }
  return { task: nextTask, newFile }
}
