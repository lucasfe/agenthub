// Per-image approval gallery for Diana steps (issue #357).
//
// Replaces the textual approval gate (issue #355) for steps whose agent is
// `diana-design`. Renders a grid of thumbnails — one per `output_files[]`
// entry whose `mime_type` starts with `image/` — with three actions per
// thumbnail: Approve, Request edit, Re-render. The "Continue" button at
// the bottom is disabled until every image has `approval_state === 'approved'`.
//
// All state mutations live in the parent: this component is a thin
// dispatcher. Pass `onApprove(idx)`, `onRequestEdit(idx, feedback)`,
// `onRerender(idx, feedback?)`, and (optionally) `onAdvance()`.
// Use `loadingIndices` to disable buttons on a thumbnail whose rerender is
// in flight.

import { useState } from 'react'
import * as Icons from 'lucide-react'
import {
  countApproved,
  getFileApprovalState,
  imageFiles,
  isFullyApproved,
  totalImages,
} from '../../lib/dianaGallery'

function ThumbCard({
  file,
  idx,
  loading,
  onApprove,
  onRequestEdit,
  onRerender,
}) {
  const state = getFileApprovalState(file)
  const [editingOpen, setEditingOpen] = useState(state === 'edit_requested')
  const [feedback, setFeedback] = useState(
    typeof file.feedback === 'string' ? file.feedback : '',
  )
  // The parent passes a key bound to file.signed_url so this component
  // remounts whenever the file is rerendered — that resets local state
  // (editingOpen + feedback) without needing an effect.

  const stateBadge = (() => {
    if (state === 'approved') {
      return (
        <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/90 text-white shadow">
          <Icons.Check size={10} />
          Approved
        </span>
      )
    }
    if (state === 'edit_requested') {
      return (
        <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/90 text-white shadow">
          <Icons.Pencil size={10} />
          Edit requested
        </span>
      )
    }
    return null
  })()

  return (
    <div
      data-testid={`diana-thumb-${idx}`}
      className="rounded-xl border border-border-subtle bg-bg-card overflow-hidden flex flex-col"
    >
      <div className="relative aspect-square bg-black/30">
        {file.signed_url ? (
          <img
            src={file.signed_url}
            alt={file.storage_path || `output_files[${idx}]`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <Icons.ImageOff size={28} />
          </div>
        )}
        {stateBadge}
        {loading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Icons.Loader2 size={18} className="animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="px-3 py-2 flex items-center gap-1.5 border-t border-border-subtle">
        <button
          type="button"
          onClick={() => onApprove(idx)}
          disabled={loading || state === 'approved'}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-emerald-200 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icons.Check size={11} />
          Approve
        </button>
        <button
          type="button"
          onClick={() => setEditingOpen((open) => !open)}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-amber-200 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icons.Pencil size={11} />
          Request edit
        </button>
        <button
          type="button"
          onClick={() => onRerender(idx, feedback || file.feedback || '')}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-blue-200 bg-blue-500/15 border border-blue-500/30 hover:bg-blue-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icons.RotateCcw size={11} />
          Re-render
        </button>
      </div>

      {editingOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-border-subtle bg-bg-input/40">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted block mb-1">
            Feedback
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe the change you want…"
            rows={3}
            className="w-full px-2 py-1.5 rounded-md bg-bg-card border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
          />
          <div className="flex justify-end gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => {
                setEditingOpen(false)
                setFeedback(file.feedback || '')
              }}
              className="px-2 py-1 rounded-md text-[10px] text-text-secondary hover:bg-bg-card transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onRequestEdit(idx, feedback)
                setEditingOpen(false)
              }}
              disabled={!feedback.trim()}
              className="px-2 py-1 rounded-md text-[10px] font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send feedback
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DianaGallery({
  step,
  onApprove,
  onRequestEdit,
  onRerender,
  onAdvance,
  loadingIndices = [],
}) {
  const images = imageFiles(step)
  const total = totalImages(step)
  const approved = countApproved(step)
  const fullyApproved = isFullyApproved(step)
  const loadingSet = new Set(loadingIndices)

  if (images.length === 0) {
    return (
      <div
        data-testid="diana-empty"
        className="rounded-xl border border-dashed border-border-subtle bg-bg-card px-5 py-10 text-center"
      >
        <Icons.Image size={28} className="text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-secondary">
          No image files available for review in this step.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-3">
        <Icons.Image size={16} className="text-purple-400" />
        <h3 className="text-sm font-semibold text-text-primary flex-1">
          Gallery — approve each image
        </h3>
        <span
          data-testid="diana-counter"
          className={`text-xs font-medium ${
            fullyApproved ? 'text-emerald-300' : 'text-text-secondary'
          }`}
        >
          {approved} / {total} approved
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {images.map(({ idx, file }) => (
          <ThumbCard
            key={`${idx}:${file.signed_url || file.storage_path || ''}`}
            idx={idx}
            file={file}
            loading={loadingSet.has(idx)}
            onApprove={onApprove}
            onRequestEdit={onRequestEdit}
            onRerender={onRerender}
          />
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border-subtle flex justify-end">
        <button
          type="button"
          onClick={() => onAdvance && onAdvance()}
          disabled={!fullyApproved || !onAdvance}
          title={
            fullyApproved
              ? undefined
              : 'Approve all images before continuing'
          }
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icons.ArrowRight size={12} />
          Continue
        </button>
      </div>
    </div>
  )
}
