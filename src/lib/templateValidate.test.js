import { describe, it, expect } from 'vitest'
import { validateTemplateStep, parsePlaceholderInner } from './templateValidate'

describe('parsePlaceholderInner', () => {
  it('classifies params placeholders', () => {
    expect(parsePlaceholderInner('params.topic')).toEqual({
      kind: 'param',
      name: 'topic',
    })
  })

  it('classifies step output placeholders', () => {
    expect(parsePlaceholderInner('step-2.output')).toEqual({
      kind: 'step_output',
      index: 2,
    })
  })

  it('classifies step output_files placeholders', () => {
    expect(parsePlaceholderInner('step-3.output_files')).toEqual({
      kind: 'step_output_files',
      index: 3,
    })
  })

  it('classifies ref placeholders', () => {
    expect(parsePlaceholderInner('ref:tone_of_voice')).toEqual({
      kind: 'ref',
      key: 'tone_of_voice',
    })
  })

  it('returns unknown for garbage', () => {
    expect(parsePlaceholderInner('garbage')).toEqual({ kind: 'unknown' })
  })
})

describe('validateTemplateStep', () => {
  it('returns no errors when every placeholder is declared', () => {
    const errors = validateTemplateStep(
      {
        instruction:
          'Topic: {{params.topic}} | Prior: {{step-1.output}} | Voice: {{ref:tone}}',
      },
      ['topic'],
      [1],
      ['tone'],
    )
    expect(errors).toEqual([])
  })

  it('flags undeclared param', () => {
    const errors = validateTemplateStep(
      { instruction: '{{params.topic}} {{params.audience}}' },
      ['topic'],
      [],
      [],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe('undeclared_param')
    expect(errors[0].placeholder).toBe('params.audience')
  })

  it('flags undeclared step output dependency', () => {
    const errors = validateTemplateStep(
      { instruction: '{{step-1.output}} {{step-2.output}}' },
      [],
      [1],
      [],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe('undeclared_step')
    expect(errors[0].placeholder).toBe('step-2.output')
  })

  it('flags undeclared step output_files dependency', () => {
    const errors = validateTemplateStep(
      { instruction: '{{step-3.output_files}}' },
      [],
      [1, 2],
      [],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe('undeclared_step')
    expect(errors[0].placeholder).toBe('step-3.output_files')
  })

  it('flags undeclared reference key', () => {
    const errors = validateTemplateStep(
      { instruction: '{{ref:moodboard}}' },
      [],
      [],
      ['tone_of_voice'],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe('undeclared_ref')
    expect(errors[0].placeholder).toBe('ref:moodboard')
  })

  it('flags unknown placeholder format', () => {
    const errors = validateTemplateStep(
      { instruction: 'Weird: {{garbage}}' },
      [],
      [],
      [],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].kind).toBe('unknown_placeholder')
  })

  it('collects multiple errors in left-to-right order', () => {
    const errors = validateTemplateStep(
      {
        instruction:
          '{{params.unknown_param}} {{step-9.output}} {{ref:nope}} {{whatever}}',
      },
      [],
      [],
      [],
    )
    expect(errors).toHaveLength(4)
    expect(errors[0].kind).toBe('undeclared_param')
    expect(errors[1].kind).toBe('undeclared_step')
    expect(errors[2].kind).toBe('undeclared_ref')
    expect(errors[3].kind).toBe('unknown_placeholder')
  })

  it('does not report the same placeholder more than once', () => {
    const errors = validateTemplateStep(
      { instruction: '{{params.x}} and {{params.x}} again' },
      [],
      [],
      [],
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].placeholder).toBe('params.x')
  })

  it('instruction without placeholders has no errors', () => {
    expect(validateTemplateStep({ instruction: 'plain text' }, [], [], [])).toEqual([])
  })

  it('tolerates whitespace inside braces', () => {
    expect(
      validateTemplateStep(
        { instruction: 'Topic: {{ params.topic }}' },
        ['topic'],
        [],
        [],
      ),
    ).toEqual([])
  })

  it('treats null/missing instruction as empty', () => {
    expect(validateTemplateStep({}, [], [], [])).toEqual([])
    expect(validateTemplateStep(null, [], [], [])).toEqual([])
  })
})
