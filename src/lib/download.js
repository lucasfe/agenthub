// Small browser-side helper to trigger a file download from in-memory text.
// Used by the orchestration UI to let users save step outputs and artifacts.

const MIME_BY_FORMAT = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  html: 'text/html',
}

export function downloadText(content, filename, mime) {
  const resolvedMime = mime || guessMime(filename) || 'text/plain'
  const blob = new Blob([content ?? ''], { type: resolvedMime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Free memory on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function guessMime(filename) {
  if (typeof filename !== 'string') return null
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? MIME_BY_FORMAT[ext] || null : null
}

// Safe-ish filename: replace anything outside [a-z0-9-_.] with hyphens.
export function safeFilename(name, fallback = 'output') {
  if (typeof name !== 'string' || !name.trim()) return fallback
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || fallback
}
