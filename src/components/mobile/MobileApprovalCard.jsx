import { ShieldAlert } from 'lucide-react'

export default function MobileApprovalCard({ name, input, onApprove, onReject, status = 'pending' }) {
  const inputPreview = input ? JSON.stringify(input, null, 2) : ''
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  const handleApprove = () => {
    if (status !== 'pending') return
    onApprove?.()
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(20)
      } catch {
        // vibration is best-effort, ignore failures (e.g. policy block)
      }
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-text-primary">
      <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold uppercase tracking-wide">
        <ShieldAlert size={14} />
        <span>Approval required</span>
      </div>
      <div className="mt-2 text-sm font-mono text-text-primary truncate">{name}</div>
      {inputPreview && (
        <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-black/30 p-2 text-[11px] text-text-secondary whitespace-pre-wrap break-words">
          {inputPreview}
        </pre>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={status !== 'pending'}
          className="flex-1 px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApproved ? 'Approved' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => status === 'pending' && onReject?.()}
          disabled={status !== 'pending'}
          className="px-3 py-2 rounded-lg bg-white/10 text-text-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRejected ? 'Rejected' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
