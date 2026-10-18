import { Icon } from './Icon'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Sil',
  cancelLabel = 'Vazgeç',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEscapeIleKapat(onCancel)
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
            <Icon name="AlertTriangle" className="w-5 h-5 text-rose-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-ink-700">{title}</h3>
            <p className="text-sm text-ink-400 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1 border border-ink-100">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-rose-500 text-white font-semibold rounded-2xl px-5 py-3.5 active:scale-[0.97] transition-all hover:bg-rose-600"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
