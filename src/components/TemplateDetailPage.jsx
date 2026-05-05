import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ArrowLeft,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Lock,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react'
import Header from './Header'
import { updateTemplate } from '../lib/templatesApi'
import {
  fetchTemplateById,
  fetchReferences,
  createTextReference,
  createImageReference,
  deleteReference,
  getReferenceSignedUrl,
} from '../lib/templateReferencesApi'
import { validateTemplateStep } from '../lib/templateValidate'

function deepCopy(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

async function readFileAsText(file) {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function isImageFile(file) {
  if (!file) return false
  return typeof file.type === 'string' && file.type.startsWith('image/')
}

function paramsKeysFromSchema(schema) {
  if (!schema || typeof schema !== 'object') return []
  // Accept either a JSON-Schema-ish shape ({ properties: { x: {...} } }) or a
  // flat map of keys to descriptors.
  if (schema.properties && typeof schema.properties === 'object') {
    return Object.keys(schema.properties)
  }
  return Object.keys(schema)
}

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1">
        {label}
      </span>
      <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-bg-input/40 border border-border-subtle/60 rounded-lg px-2.5 py-1.5">
        <Lock size={11} className="text-text-muted shrink-0" />
        <span className="font-mono">{value}</span>
      </div>
    </div>
  )
}

function ReferenceListItem({ reference, signedUrl, onDelete, deleting }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="flex items-center gap-3 p-3 rounded-xl border border-border-subtle bg-bg-card">
      <div className="w-10 h-10 rounded-lg bg-bg-input flex items-center justify-center text-text-muted shrink-0">
        {reference.kind === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{reference.key}</p>
        <p className="text-xs text-text-muted">
          {reference.kind === 'image' ? 'image' : 'text'}
          {reference.original_filename ? ` · ${reference.original_filename}` : ''}
        </p>
        {reference.kind === 'image' && signedUrl ? (
          <img
            src={signedUrl}
            alt={`${reference.key} preview`}
            className="mt-2 max-h-24 rounded-md border border-border-subtle"
          />
        ) : null}
      </div>
      {confirming ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDelete(reference.id)}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded-md bg-rose-500 text-white hover:bg-rose-600 transition-colors disabled:opacity-50"
            aria-label={`Confirm delete reference ${reference.key}`}
          >
            Confirm delete reference
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded-md text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/10 transition-colors"
          aria-label={`Delete reference ${reference.key}`}
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  )
}

function StepEditor({ step, references, paramsKeys, onSave }) {
  const [instruction, setInstruction] = useState(step.instruction ?? '')
  const [requiresApproval, setRequiresApproval] = useState(Boolean(step.requires_approval))
  const [errors, setErrors] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const referenceKeysForStep = useMemo(() => {
    const ids = Array.isArray(step.reference_ids) ? step.reference_ids : []
    const idSet = new Set(ids)
    return references.filter((r) => idSet.has(r.id)).map((r) => r.key)
  }, [references, step.reference_ids])

  const handleSave = async () => {
    const validationErrors = validateTemplateStep(
      { instruction },
      paramsKeys,
      Array.isArray(step.needs_outputs_from) ? step.needs_outputs_from : [],
      referenceKeysForStep,
    )
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      setSaveError(null)
      return
    }
    setErrors([])
    setSaveError(null)
    setSaving(true)
    try {
      await onSave({
        ...step,
        instruction,
        requires_approval: requiresApproval,
      })
    } catch (err) {
      setSaveError(err?.message || 'Failed to save step')
    } finally {
      setSaving(false)
    }
  }

  const stepLabel = step.agent_name || step.agent_id || 'Agent'
  const orderLabel = `Step ${step.order ?? step.id}`
  const instructionId = `step-${step.id}-instruction`
  const approvalId = `step-${step.id}-requires-approval`

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {orderLabel}
          </p>
          <h3 className="text-base font-semibold text-text-primary">{stepLabel}</h3>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50"
          aria-label={`Save step ${step.order ?? step.id}`}
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          Save step {step.order ?? step.id}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ReadOnlyField label="Agent ID" value={step.agent_id || '—'} />
        <ReadOnlyField
          label="Tool Keys"
          value={
            Array.isArray(step.tool_keys) && step.tool_keys.length > 0
              ? step.tool_keys.join(', ')
              : '—'
          }
        />
        <ReadOnlyField
          label="Needs Outputs From"
          value={
            Array.isArray(step.needs_outputs_from) && step.needs_outputs_from.length > 0
              ? step.needs_outputs_from.join(', ')
              : '—'
          }
        />
        <ReadOnlyField
          label="Params Keys"
          value={
            Array.isArray(step.params_keys) && step.params_keys.length > 0
              ? step.params_keys.join(', ')
              : '—'
          }
        />
      </div>

      <div>
        <label
          htmlFor={instructionId}
          className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5"
        >
          Step {step.order ?? step.id} instruction
        </label>
        <textarea
          id={instructionId}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={4}
          className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-border-hover resize-y transition-colors font-mono"
        />
      </div>

      <div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1.5">
          Reference IDs (read-only — edit via references panel)
        </span>
        <p className="text-xs text-text-secondary font-mono">
          {Array.isArray(step.reference_ids) && step.reference_ids.length > 0
            ? step.reference_ids.join(', ')
            : '—'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={approvalId}
          type="checkbox"
          checked={requiresApproval}
          onChange={(e) => setRequiresApproval(e.target.checked)}
          aria-label={`Step ${step.order ?? step.id} requires approval`}
        />
        <label htmlFor={approvalId} className="text-sm text-text-secondary">
          Requires approval before advancing
        </label>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2" role="alert">
          <p className="text-xs font-semibold text-rose-300 mb-1">
            Validation failed — fix before saving:
          </p>
          <ul className="text-xs text-rose-200 space-y-0.5">
            {errors.map((err, idx) => (
              <li key={idx}>
                <span className="font-mono">{err.placeholder}</span> — {err.kind.replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {saveError && (
        <p className="text-xs text-rose-300" role="alert">{saveError}</p>
      )}
    </div>
  )
}

export default function TemplateDetailPage() {
  const { id } = useParams()
  const [template, setTemplate] = useState(null)
  const [references, setReferences] = useState([])
  const [signedUrls, setSignedUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [notFound, setNotFound] = useState(false)

  const [brandContext, setBrandContext] = useState('')
  const [savingBrand, setSavingBrand] = useState(false)
  const [brandError, setBrandError] = useState(null)

  const [newKey, setNewKey] = useState('')
  const [newFile, setNewFile] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setNotFound(false)
    Promise.all([fetchTemplateById(id), fetchReferences(id)])
      .then(([tpl, refs]) => {
        if (cancelled) return
        if (!tpl) {
          setNotFound(true)
          return
        }
        setTemplate(tpl)
        setBrandContext(tpl.brand_context ?? '')
        setReferences(Array.isArray(refs) ? refs : [])
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err?.message || 'Failed to load template')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const imageRefs = references.filter(
      (r) => r.kind === 'image' && typeof r.storage_path === 'string',
    )
    Promise.all(
      imageRefs.map(async (r) => {
        try {
          const url = await getReferenceSignedUrl(r.storage_path, 3600)
          return [r.id, url]
        } catch {
          return [r.id, null]
        }
      }),
    ).then((entries) => {
      if (cancelled) return
      const map = {}
      for (const [refId, url] of entries) {
        if (url) map[refId] = url
      }
      setSignedUrls(map)
    })
    return () => {
      cancelled = true
    }
  }, [references])

  const paramsKeys = useMemo(
    () => paramsKeysFromSchema(template?.params_schema),
    [template?.params_schema],
  )

  const handleSaveBrand = async () => {
    if (!template) return
    setSavingBrand(true)
    setBrandError(null)
    try {
      const updated = await updateTemplate(template.id, { brand_context: brandContext })
      if (updated) setTemplate(updated)
      else setTemplate({ ...template, brand_context: brandContext })
    } catch (err) {
      setBrandError(err?.message || 'Failed to save brand context')
    } finally {
      setSavingBrand(false)
    }
  }

  const handleAddReference = async () => {
    if (!template) return
    if (!newKey.trim() || !newFile) return
    setAdding(true)
    setAddError(null)
    try {
      let inserted
      if (isImageFile(newFile)) {
        inserted = await createImageReference(template.id, {
          key: newKey.trim(),
          file: newFile,
          mime_type: newFile.type,
          original_filename: newFile.name,
        })
      } else {
        const text = await readFileAsText(newFile)
        inserted = await createTextReference(template.id, {
          key: newKey.trim(),
          content_text: text,
          mime_type: newFile.type || 'text/markdown',
          original_filename: newFile.name,
        })
      }
      if (inserted) {
        setReferences((prev) => [...prev, inserted])
      }
      setNewKey('')
      setNewFile(null)
    } catch (err) {
      setAddError(err?.message || 'Failed to add reference')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteReference = async (referenceId) => {
    setDeletingId(referenceId)
    try {
      await deleteReference(referenceId)
      setReferences((prev) => prev.filter((r) => r.id !== referenceId))
    } catch (err) {
      setAddError(err?.message || 'Failed to delete reference')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSaveStep = async (updatedStep) => {
    if (!template) return
    const planClone = deepCopy(template.plan) ?? { steps: [] }
    if (!Array.isArray(planClone.steps)) planClone.steps = []
    planClone.steps = planClone.steps.map((s) =>
      s.id === updatedStep.id ? updatedStep : s,
    )
    const updated = await updateTemplate(template.id, { plan: planClone })
    if (updated) setTemplate(updated)
    else setTemplate({ ...template, plan: planClone })
  }

  const planSteps = Array.isArray(template?.plan?.steps) ? template.plan.steps : []

  return (
    <>
      <Header />
      <section className="px-8 pt-8 pb-6">
        <Link
          to="/templates"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Back to templates
        </Link>

        {loading ? (
          <p className="text-text-muted text-base" role="status">
            Loading template...
          </p>
        ) : notFound ? (
          <p className="text-text-muted text-base" role="alert">
            Template not found.
          </p>
        ) : loadError ? (
          <p className="text-rose-300 text-base" role="alert">
            Failed to load template: {loadError}
          </p>
        ) : template ? (
          <div className="flex items-center gap-5">
            <div className="hero-icon w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center">
              <LayoutTemplate size={32} className="text-purple-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-text-primary tracking-tight">
                {template.name}
              </h1>
              <p className="text-text-secondary text-base mt-0.5">
                {template.description || 'No description'}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {template && !notFound && !loading ? (
        <div className="px-8 pb-12 space-y-8">
          <section className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
            <div>
              <label
                htmlFor="template-brand-context"
                className="text-sm font-semibold text-text-primary block"
              >
                Brand context
              </label>
              <p className="text-xs text-text-muted">
                Free-form Markdown describing voice, anti-patterns, and grounding
                content for every step in this template.
              </p>
            </div>
            <textarea
              id="template-brand-context"
              value={brandContext}
              onChange={(e) => setBrandContext(e.target.value)}
              rows={6}
              className="w-full bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-border-hover resize-y font-mono"
            />
            <div className="flex items-center justify-end gap-2">
              {brandError && (
                <span className="text-xs text-rose-300" role="alert">{brandError}</span>
              )}
              <button
                type="button"
                onClick={handleSaveBrand}
                disabled={savingBrand}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50"
                aria-label="Save brand context"
              >
                {savingBrand && <Loader2 size={12} className="animate-spin" />}
                Save brand context
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">References</h2>
              <p className="text-xs text-text-muted">
                Brand grounding (text or image). Each step picks the references it
                consumes; placeholders use <code className="font-mono">{`{{ref:KEY}}`}</code>.
              </p>
            </div>

            {references.length === 0 ? (
              <p className="text-xs text-text-muted italic">No references attached yet.</p>
            ) : (
              <ul className="space-y-2">
                {references.map((ref) => (
                  <ReferenceListItem
                    key={ref.id}
                    reference={ref}
                    signedUrl={signedUrls[ref.id]}
                    onDelete={handleDeleteReference}
                    deleting={deletingId === ref.id}
                  />
                ))}
              </ul>
            )}

            <div className="border-t border-border-subtle/60 pt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Add reference
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="new-reference-key"
                  aria-label="New reference key"
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. tone_of_voice"
                  className="flex-1 bg-bg-input border border-border-subtle rounded-xl px-3.5 py-2 text-sm text-text-primary outline-none focus:border-border-hover transition-colors"
                />
                <input
                  id="new-reference-file"
                  aria-label="Upload reference file"
                  type="file"
                  onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-text-secondary file:mr-3 file:px-3 file:py-1.5 file:text-xs file:font-medium file:rounded-lg file:bg-bg-input file:text-text-primary file:border-0 hover:file:bg-bg-input-hover transition-colors"
                />
                <button
                  type="button"
                  onClick={handleAddReference}
                  disabled={adding || !newKey.trim() || !newFile}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50"
                  aria-label="Add reference"
                >
                  {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Add reference
                </button>
              </div>
              {addError && (
                <p className="text-xs text-rose-300" role="alert">{addError}</p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Plan steps</h2>
              <p className="text-xs text-text-muted">
                Structural fields (agent, tools, needs_outputs_from, params_keys) are
                read-only. Edit instruction text and approval gates here.
              </p>
            </div>

            {planSteps.length === 0 ? (
              <p className="text-xs text-text-muted italic">No steps in this template's plan.</p>
            ) : (
              <div className="space-y-4">
                {planSteps.map((step) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    references={references}
                    paramsKeys={paramsKeys}
                    onSave={handleSaveStep}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}
