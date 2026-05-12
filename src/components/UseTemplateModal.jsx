import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import {
  defaultValues,
  extractFields,
  validateParams,
} from '../lib/templateParams'

const ERROR_MESSAGES = {
  required: (field) => `${field.label} is required`,
  enum: (field) => `${field.label} must be one of: ${(field.options || []).join(', ')}`,
  number: (field) => `${field.label} must be a number`,
}

function FieldRow({ field, value, error, onChange }) {
  const id = `use-template-field-${field.key}`
  const baseInput =
    'w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors'

  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
      >
        {field.label}
        {field.required ? <span className="text-rose-400 ml-1">*</span> : null}
      </label>
      {field.description ? (
        <p className="text-xs text-text-muted/80 mb-1.5">{field.description}</p>
      ) : null}

      {field.type === 'textarea' ? (
        <textarea
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          rows={3}
          aria-invalid={Boolean(error)}
          className={`${baseInput} resize-y`}
        />
      ) : field.type === 'enum' ? (
        <select
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          aria-invalid={Boolean(error)}
          className={baseInput}
        >
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'number' ? (
        <input
          id={id}
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          aria-invalid={Boolean(error)}
          className={baseInput}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          aria-invalid={Boolean(error)}
          className={baseInput}
        />
      )}

      {error ? (
        <p className="text-xs text-rose-300 mt-1" role="alert">
          {ERROR_MESSAGES[error.kind](field)}
        </p>
      ) : null}
    </div>
  )
}

export default function UseTemplateModal({ template, onClose, onInstantiate }) {
  const fields = useMemo(
    () => extractFields(template?.params_schema),
    [template?.params_schema],
  )
  const [values, setValues] = useState(() => defaultValues(fields))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)
  const firstFieldRef = useRef(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setServerError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const validationErrors = validateParams(fields, values)
    if (validationErrors.length > 0) {
      const map = {}
      for (const err of validationErrors) map[err.key] = err
      setErrors(map)
      return
    }
    setErrors({})
    setSubmitting(true)
    setServerError(null)
    try {
      await onInstantiate(values)
    } catch (err) {
      setServerError(err?.message || 'Failed to instantiate template')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={() => {
        if (!submitting) onClose()
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md mx-4 rounded-2xl bg-bg-sidebar border border-border-subtle shadow-2xl"
      >
        <div className="h-12 border-b border-border-subtle px-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Use template — {template?.name || 'Untitled'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-bg-input text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {fields.length === 0 ? (
            <p className="text-xs text-text-muted italic">
              This template has no parameters — submit to create the task as is.
            </p>
          ) : (
            fields.map((field, idx) => (
              <FieldRow
                key={field.key}
                field={field}
                value={values[field.key]}
                error={errors[field.key]}
                onChange={handleChange}
                {...(idx === 0 ? { autoFocusRef: firstFieldRef } : {})}
              />
            ))
          )}

          {serverError ? (
            <p className="text-xs text-rose-300" role="alert">
              {serverError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              Create task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
