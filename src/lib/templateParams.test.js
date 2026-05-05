import { describe, it, expect } from 'vitest'
import { extractFields, validateParams, defaultValues } from './templateParams'

describe('extractFields', () => {
  it('returns [] for null/undefined/empty schema', () => {
    expect(extractFields(null)).toEqual([])
    expect(extractFields(undefined)).toEqual([])
    expect(extractFields({})).toEqual([])
  })

  it('parses a JSON-Schema-ish shape with properties + required array', () => {
    const schema = {
      type: 'object',
      required: ['topic'],
      properties: {
        topic: { type: 'string', label: 'Topic', description: 'Research focus' },
        notes: { type: 'textarea' },
      },
    }
    const fields = extractFields(schema)
    expect(fields).toHaveLength(2)
    expect(fields[0]).toMatchObject({
      key: 'topic',
      type: 'string',
      required: true,
      label: 'Topic',
      description: 'Research focus',
    })
    expect(fields[1]).toMatchObject({ key: 'notes', type: 'textarea', required: false })
  })

  it('honors per-property required flag when no top-level required list is present', () => {
    const schema = {
      properties: {
        topic: { type: 'string', required: true },
        notes: { type: 'textarea', required: false },
      },
    }
    const fields = extractFields(schema)
    expect(fields.find((f) => f.key === 'topic').required).toBe(true)
    expect(fields.find((f) => f.key === 'notes').required).toBe(false)
  })

  it('parses a flat-map shape (no `properties` wrapper)', () => {
    const schema = {
      topic: { type: 'string', required: true },
      tone: { type: 'enum', enum: ['serious', 'playful'] },
    }
    const fields = extractFields(schema)
    expect(fields).toHaveLength(2)
    expect(fields.find((f) => f.key === 'topic').required).toBe(true)
    expect(fields.find((f) => f.key === 'tone')).toMatchObject({
      type: 'enum',
      options: ['serious', 'playful'],
    })
  })

  it('classifies enum-like fields by their `enum` array even when type is string', () => {
    const schema = {
      properties: {
        tone: { type: 'string', enum: ['a', 'b'], required: true },
      },
    }
    const fields = extractFields(schema)
    expect(fields[0]).toMatchObject({
      key: 'tone',
      type: 'enum',
      options: ['a', 'b'],
      required: true,
    })
  })

  it('falls back type to "string" when descriptor lacks an explicit type', () => {
    const schema = { properties: { foo: {} } }
    expect(extractFields(schema)[0]).toMatchObject({ key: 'foo', type: 'string' })
  })

  it('uses a humanized label when none is provided', () => {
    const schema = { properties: { research_focus: { type: 'string' } } }
    expect(extractFields(schema)[0].label).toBe('Research focus')
  })
})

describe('defaultValues', () => {
  it('returns empty strings for string/textarea/number and the first enum option for enum', () => {
    const fields = [
      { key: 'a', type: 'string' },
      { key: 'b', type: 'textarea' },
      { key: 'c', type: 'number' },
      { key: 'd', type: 'enum', options: ['x', 'y'] },
    ]
    expect(defaultValues(fields)).toEqual({ a: '', b: '', c: '', d: 'x' })
  })

  it('uses the descriptor `default` when present', () => {
    const fields = [
      { key: 'a', type: 'string', default: 'hello' },
      { key: 'b', type: 'enum', options: ['x', 'y'], default: 'y' },
    ]
    expect(defaultValues(fields)).toEqual({ a: 'hello', b: 'y' })
  })
})

describe('validateParams', () => {
  it('returns no errors for a valid set of values', () => {
    const fields = [
      { key: 'topic', type: 'string', required: true },
      { key: 'tone', type: 'enum', options: ['a', 'b'], required: true },
    ]
    const errors = validateParams(fields, { topic: 'mental health', tone: 'a' })
    expect(errors).toEqual([])
  })

  it('flags required fields when missing or empty after trimming', () => {
    const fields = [{ key: 'topic', type: 'string', required: true }]
    expect(validateParams(fields, {})).toEqual([
      { key: 'topic', kind: 'required' },
    ])
    expect(validateParams(fields, { topic: '   ' })).toEqual([
      { key: 'topic', kind: 'required' },
    ])
  })

  it('does not flag optional fields when empty', () => {
    const fields = [{ key: 'notes', type: 'textarea', required: false }]
    expect(validateParams(fields, {})).toEqual([])
  })

  it('flags enum values that are not in the option list', () => {
    const fields = [{ key: 'tone', type: 'enum', options: ['a', 'b'], required: true }]
    expect(validateParams(fields, { tone: 'nope' })).toEqual([
      { key: 'tone', kind: 'enum' },
    ])
  })

  it('flags non-numeric values for number fields', () => {
    const fields = [{ key: 'count', type: 'number', required: true }]
    expect(validateParams(fields, { count: 'abc' })).toEqual([
      { key: 'count', kind: 'number' },
    ])
  })

  it('accepts numeric strings for number fields', () => {
    const fields = [{ key: 'count', type: 'number', required: true }]
    expect(validateParams(fields, { count: '42' })).toEqual([])
    expect(validateParams(fields, { count: 42 })).toEqual([])
  })

  it('returns multiple independent errors for multiple bad fields', () => {
    const fields = [
      { key: 'topic', type: 'string', required: true },
      { key: 'tone', type: 'enum', options: ['a'], required: true },
    ]
    const errors = validateParams(fields, { tone: 'wrong' })
    expect(errors).toHaveLength(2)
    expect(errors.map((e) => e.key).sort()).toEqual(['tone', 'topic'])
  })
})
