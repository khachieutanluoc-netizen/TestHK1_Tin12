import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'warning' | 'danger';
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  tone = 'primary',
  hideCancel = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hideCancel) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, hideCancel, onCancel]);

  if (!open) return null;

  const confirmButtonClass =
    tone === 'danger'
      ? 'bg-rose-700 hover:bg-rose-800 text-white'
      : tone === 'warning'
        ? 'bg-amber-700 hover:bg-amber-800 text-white'
        : 'bg-blue-700 hover:bg-blue-800 text-white';

  const Icon = tone === 'primary' ? CheckCircle2 : AlertTriangle;
  const iconColor =
    tone === 'danger'
      ? 'text-rose-700 bg-rose-50 border-rose-200'
      : tone === 'warning'
        ? 'text-amber-700 bg-amber-50 border-amber-200'
        : 'text-blue-700 bg-blue-50 border-blue-200';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg border shrink-0 ${iconColor}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="confirm-dialog-title"
                className="text-base font-bold text-slate-900 leading-snug"
              >
                {title}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {message}
              </p>
            </div>
          </div>
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Đóng hộp thoại"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${confirmButtonClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
