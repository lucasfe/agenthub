// Pure helpers that turn a `task_templates.params_schema` JSON blob into a
// flat list of form fields, plus client-side validation.
//
// The schema accepts two shapes — the JSON-Schema-ish form
//   { properties: { key: { type, required, enum, ... } }, required: [keys] }
// and a flat-map form
//   { key: { type, required, enum, ... } }
// The detail page already tolerates both (see paramsKeysFromSchema in
// TemplateDetailPage.jsx); the modal uses the same parser so a single
// authored schema works in both surfaces.

const SUPPORTED_TYPES = new Set(['string', 'enum', 'textarea', 'number'])

function humanizeKey(key) {
  if (typeof key !== 'string' || !key) return ''
  const spaced = key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function classifyType(descriptor) {
  if (Array.isArray(descriptor?.enum) && descriptor.enum.length > 0) return 'enum'
  const declared = typeof descriptor?.type === 'string' ? descriptor.type : 'string'
  return SUPPORTED_TYPES.has(declared) ? declared : 'string'
}

function descriptorEntries(schema) {
  if (schema?.properties && typeof schema.properties === 'object') {
    return Object.entries(schema.properties)
  }
  if (schema && typeof schema === 'object') {
    return Object.entries(schema).filter(([, value]) => value && typeof value === 'object')
  }
  return []
}

function topLevelRequired(schema) {
  const list = schema?.required
  if (!Array.isArray(list)) return null
  return new Set(list.filter((k) => typeof k === 'string'))
}

export function extractFields(schema) {
  if (!schema || typeof schema !== 'object') return []
  const entries = descriptorEntries(schema)
  const requiredSet = topLevelRequired(schema)
  return entries.map(([key, descriptor]) => {
    const type = classifyType(descriptor)
    const required = requiredSet
      ? requiredSet.has(key)
      : Boolean(descriptor?.required)
    const options = Array.isArray(descriptor?.enum) ? [...descriptor.enum] : undefined
    const label = typeof descriptor?.label === 'string' && descriptor.label
      ? descriptor.label
      : humanizeKey(key)
    return {
      key,
      type,
      required,
      label,
      description: typeof descriptor?.description === 'string' ? descriptor.description : '',
      options,
      default: descriptor?.default,
    }
  })
}

export function defaultValues(fields) {
  const out = {}
  for (const f of fields) {
    if (f.default !== undefined && f.default !== null) {
      out[f.key] = f.default
      continue
    }
    if (f.type === 'enum') {
      out[f.key] = Array.isArray(f.options) && f.options.length > 0 ? f.options[0] : ''
    } else {
      out[f.key] = ''
    }
  }
  return out
}

function isMissing(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string' && value.trim() === '') return true
  return false
}

export function validateParams(fields, values) {
  const errors = []
  for (const field of fields) {
    const value = values?.[field.key]
    if (field.required && isMissing(value)) {
      errors.push({ key: field.key, kind: 'required' })
      continue
    }
    if (isMissing(value)) continue
    if (field.type === 'enum') {
      const opts = Array.isArray(field.options) ? field.options : []
      if (!opts.includes(value)) {
        errors.push({ key: field.key, kind: 'enum' })
      }
      continue
    }
    if (field.type === 'number') {
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) {
        errors.push({ key: field.key, kind: 'number' })
      }
      continue
    }
  }
  return errors
}
