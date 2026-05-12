// Frontend port of templateRenderer.validate (supabase/functions/_shared/templateRenderer.ts).
//
// Pure: no I/O, no Supabase. Used by `/templates/[id]` to gate saves on the
// same Mustache placeholder rules the Edge Function enforces at runtime.
// Keep the placeholder grammar in sync with the Deno module — both are
// driven by the same regex below.

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

export function parsePlaceholderInner(inner) {
  const paramMatch = /^params\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(inner)
  if (paramMatch) return { kind: 'param', name: paramMatch[1] }

  const stepOutputMatch = /^step-(\d+)\.output$/.exec(inner)
  if (stepOutputMatch) {
    return { kind: 'step_output', index: Number(stepOutputMatch[1]) }
  }

  const stepFilesMatch = /^step-(\d+)\.output_files$/.exec(inner)
  if (stepFilesMatch) {
    return { kind: 'step_output_files', index: Number(stepFilesMatch[1]) }
  }

  const refMatch = /^ref:([A-Za-z0-9_\-.]+)$/.exec(inner)
  if (refMatch) return { kind: 'ref', key: refMatch[1] }

  return { kind: 'unknown' }
}

function parsePlaceholders(instruction) {
  const out = []
  PLACEHOLDER_RE.lastIndex = 0
  let m
  while ((m = PLACEHOLDER_RE.exec(instruction)) !== null) {
    out.push({ raw: m[0], inner: m[1].trim() })
  }
  return out
}

export function validateTemplateStep(
  step,
  declaredParamsKeys,
  declaredNeedsOutputsFrom,
  declaredReferenceIds,
) {
  const instruction = step?.instruction ?? ''
  const placeholders = parsePlaceholders(instruction)
  const errors = []
  const seen = new Set()

  const paramSet = new Set(declaredParamsKeys || [])
  const stepSet = new Set(declaredNeedsOutputsFrom || [])
  const refSet = new Set(declaredReferenceIds || [])

  for (const ph of placeholders) {
    if (seen.has(ph.inner)) continue
    seen.add(ph.inner)

    const c = parsePlaceholderInner(ph.inner)

    if (c.kind === 'param') {
      if (!paramSet.has(c.name)) {
        errors.push({ kind: 'undeclared_param', placeholder: ph.inner })
      }
      continue
    }
    if (c.kind === 'step_output' || c.kind === 'step_output_files') {
      if (!stepSet.has(c.index)) {
        errors.push({ kind: 'undeclared_step', placeholder: ph.inner })
      }
      continue
    }
    if (c.kind === 'ref') {
      if (!refSet.has(c.key)) {
        errors.push({ kind: 'undeclared_ref', placeholder: ph.inner })
      }
      continue
    }
    errors.push({ kind: 'unknown_placeholder', placeholder: ph.inner })
  }

  return errors
}
