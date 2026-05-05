// Pure helpers for the per-file approval state machine used by Diana steps
// (issue #357). Each entry of a step's `output_files[]` array carries an
// optional `approval_state` field — `'pending' | 'approved' | 'edit_requested'`
// — plus an optional `feedback` string when the user requests an adjustment.
// The textual approval gate (issue #355) treats the whole step atomically;
// Diana steps replace it with a per-image gate driven by these helpers.
//
// Every function returns a fresh step / array — never mutates input — so the
// caller can confidently swap state into a React reducer.

const VALID_STATES = new Set(['pending', 'approved', 'edit_requested'])

const isImageFile = (file) =>
  !!file && typeof file.mime_type === 'string' && file.mime_type.startsWith('image/')

export function imageFiles(step) {
  const files = step?.output_files
  if (!Array.isArray(files)) return []
  const out = []
  for (let i = 0; i < files.length; i++) {
    if (isImageFile(files[i])) out.push({ idx: i, file: files[i] })
  }
  return out
}

export function totalImages(step) {
  return imageFiles(step).length
}

export function getFileApprovalState(file) {
  const raw = file?.approval_state
  return VALID_STATES.has(raw) ? raw : 'pending'
}

export function setFileApprovalState(step, fileIdx, state, feedback) {
  if (!VALID_STATES.has(state)) {
    throw new Error(`Unknown approval state: ${state}`)
  }
  const files = Array.isArray(step?.output_files) ? step.output_files : []
  if (fileIdx < 0 || fileIdx >= files.length) {
    throw new Error(`file index ${fileIdx} out of range`)
  }
  const target = files[fileIdx]
  const next = { ...target, approval_state: state }
  if (state === 'edit_requested' && typeof feedback === 'string' && feedback.trim()) {
    next.feedback = feedback.trim()
  } else {
    delete next.feedback
  }
  const nextFiles = files.slice()
  nextFiles[fileIdx] = next
  return { ...step, output_files: nextFiles }
}

export function applyFileRerender(step, fileIdx, newFile) {
  const files = Array.isArray(step?.output_files) ? step.output_files : []
  if (fileIdx < 0 || fileIdx >= files.length) {
    throw new Error(`file index ${fileIdx} out of range`)
  }
  const merged = { ...newFile, approval_state: 'pending' }
  delete merged.feedback
  const nextFiles = files.slice()
  nextFiles[fileIdx] = merged
  return { ...step, output_files: nextFiles }
}

export function countApproved(step) {
  let count = 0
  for (const { file } of imageFiles(step)) {
    if (getFileApprovalState(file) === 'approved') count++
  }
  return count
}

export function isFullyApproved(step) {
  const images = imageFiles(step)
  if (images.length === 0) return false
  return images.every(({ file }) => getFileApprovalState(file) === 'approved')
}
