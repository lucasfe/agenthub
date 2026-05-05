// Pure template renderer for the Luiza content-automation pipeline (PRD #344).
//
// Resolves a Mustache-style instruction string against a runtime context made
// of params, prior step outputs, and named references, and produces an
// Anthropic-API-ready user message: a `user_message_blocks[]` array of
// interleaved text and image blocks plus a flat `resolved_text` for debug
// surfaces. Image references and prior-step image files are emitted as
// Anthropic `image` blocks rather than URL text so the LLM can actually see
// them.
//
// Save-time validation lives next to render() so a template author can be
// told at authoring time that a placeholder references something the step
// has not declared (param, prior step, or reference key).
//
// Module is intentionally pure: no fetch, no Deno.env, no Supabase imports.

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ImageBlock {
  type: 'image'
  source: {
    type: 'url'
    url: string
  }
}

export type ContentBlock = TextBlock | ImageBlock

export interface PriorStepFile {
  url: string
  mime_type: string
}

export interface PriorStep {
  output?: string
  output_files?: PriorStepFile[]
}

export interface TemplateReference {
  kind: 'text' | 'image' | 'audio'
  content_text?: string
  url?: string
  mime_type?: string
}

export interface RenderInput {
  instruction: string
  params?: Record<string, string>
  priorSteps?: PriorStep[]
  references?: Record<string, TemplateReference>
}

export type ValidationErrorKind =
  | 'unknown_placeholder'
  | 'missing_param'
  | 'missing_step_output'
  | 'missing_ref'
  | 'unsupported_ref_kind'
  | 'undeclared_param'
  | 'undeclared_step'
  | 'undeclared_ref'

export interface ValidationError {
  kind: ValidationErrorKind
  placeholder: string
  detail?: string
}

export interface RenderOutput {
  user_message_blocks: ContentBlock[]
  resolved_text: string
  validation_errors: ValidationError[]
}

export interface TemplateStep {
  instruction: string
}

interface ParsedPlaceholder {
  raw: string // full match including braces, e.g. "{{ params.topic }}"
  inner: string // trimmed inner, e.g. "params.topic"
  start: number
  end: number
}

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

function parsePlaceholders(instruction: string): ParsedPlaceholder[] {
  const out: ParsedPlaceholder[] = []
  PLACEHOLDER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLACEHOLDER_RE.exec(instruction)) !== null) {
    out.push({
      raw: m[0],
      inner: m[1].trim(),
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return out
}

type Classification =
  | { kind: 'param'; name: string }
  | { kind: 'step_output'; index: number }
  | { kind: 'step_output_files'; index: number }
  | { kind: 'ref'; key: string }
  | { kind: 'unknown' }

function classify(inner: string): Classification {
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

function markdownUrlList(files: PriorStepFile[]): string {
  return files.map((f) => `- ${f.url}`).join('\n')
}

export function render(input: RenderInput): RenderOutput {
  const instruction = input.instruction ?? ''
  const params = input.params ?? {}
  const priorSteps = input.priorSteps ?? []
  const references = input.references ?? {}

  const placeholders = parsePlaceholders(instruction)
  const blocks: ContentBlock[] = []
  const validationErrors: ValidationError[] = []

  let textBuffer = ''
  let cursor = 0

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({ type: 'text', text: textBuffer })
      textBuffer = ''
    }
  }

  const resolvedSegments: string[] = []

  for (const ph of placeholders) {
    const literal = instruction.slice(cursor, ph.start)
    textBuffer += literal
    resolvedSegments.push(literal)
    cursor = ph.end

    const c = classify(ph.inner)

    if (c.kind === 'param') {
      const value = params[c.name]
      if (typeof value !== 'string') {
        validationErrors.push({
          kind: 'missing_param',
          placeholder: ph.inner,
        })
        continue
      }
      textBuffer += value
      resolvedSegments.push(value)
      continue
    }

    if (c.kind === 'step_output') {
      const step = priorSteps[c.index - 1]
      if (!step || typeof step.output !== 'string') {
        validationErrors.push({
          kind: 'missing_step_output',
          placeholder: ph.inner,
        })
        continue
      }
      textBuffer += step.output
      resolvedSegments.push(step.output)
      continue
    }

    if (c.kind === 'step_output_files') {
      const step = priorSteps[c.index - 1]
      if (!step) {
        validationErrors.push({
          kind: 'missing_step_output',
          placeholder: ph.inner,
        })
        continue
      }
      const files = Array.isArray(step.output_files) ? step.output_files : []
      const list = markdownUrlList(files)
      textBuffer += list
      resolvedSegments.push(list)
      // Flush so image blocks land after the markdown list, then emit one
      // image block per file whose mime_type starts with "image/".
      flushText()
      for (const file of files) {
        if (
          typeof file?.url === 'string' &&
          typeof file?.mime_type === 'string' &&
          file.mime_type.startsWith('image/')
        ) {
          blocks.push({
            type: 'image',
            source: { type: 'url', url: file.url },
          })
        }
      }
      continue
    }

    if (c.kind === 'ref') {
      const ref = references[c.key]
      if (!ref) {
        validationErrors.push({
          kind: 'missing_ref',
          placeholder: ph.inner,
        })
        continue
      }
      if (ref.kind === 'text') {
        const text = typeof ref.content_text === 'string' ? ref.content_text : ''
        textBuffer += text
        resolvedSegments.push(text)
        continue
      }
      if (ref.kind === 'image') {
        if (typeof ref.url === 'string' && ref.url.length > 0) {
          flushText()
          blocks.push({
            type: 'image',
            source: { type: 'url', url: ref.url },
          })
        } else {
          validationErrors.push({
            kind: 'missing_ref',
            placeholder: ph.inner,
            detail: 'image reference is missing a url',
          })
        }
        continue
      }
      // audio (reserved in schema, unimplemented in v1) and any future kinds
      validationErrors.push({
        kind: 'unsupported_ref_kind',
        placeholder: ph.inner,
        detail: `ref kind "${ref.kind}" is not supported in v1`,
      })
      continue
    }

    // Unknown placeholder shape — leave the literal in place so the prompt
    // does not silently drop content, and surface the error.
    validationErrors.push({
      kind: 'unknown_placeholder',
      placeholder: ph.inner,
    })
    textBuffer += ph.raw
    resolvedSegments.push(ph.raw)
  }

  const tail = instruction.slice(cursor)
  textBuffer += tail
  resolvedSegments.push(tail)
  flushText()

  return {
    user_message_blocks: blocks,
    resolved_text: resolvedSegments.join(''),
    validation_errors: validationErrors,
  }
}

export function validate(
  step: TemplateStep,
  declaredParamsKeys: readonly string[],
  declaredNeedsOutputsFrom: readonly number[],
  declaredReferenceIds: readonly string[],
): ValidationError[] {
  const instruction = step?.instruction ?? ''
  const placeholders = parsePlaceholders(instruction)
  const errors: ValidationError[] = []
  const seen = new Set<string>()

  const paramSet = new Set(declaredParamsKeys)
  const stepSet = new Set(declaredNeedsOutputsFrom)
  const refSet = new Set(declaredReferenceIds)

  for (const ph of placeholders) {
    if (seen.has(ph.inner)) continue
    seen.add(ph.inner)

    const c = classify(ph.inner)

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
