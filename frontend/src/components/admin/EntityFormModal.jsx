import React from 'react';
import { Button } from '../common/Button';
import { X } from 'lucide-react';

/**
 * Utilitarian modal dialog for adding/editing transit entities.
 */
export const EntityFormModal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Save record',
  error = null,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-pine-900/60 backdrop-blur-xs select-none">
      <div
        className="w-full max-w-lg bg-paper-raised border border-line-grey rounded shadow-none text-left overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-line-grey flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-2xl tracking-condensed text-pine-900 leading-tight">
              {title}
            </h3>
            {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-pine-900 p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-marigold"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={onSubmit}>
          <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="text-xs text-rust-alert font-medium p-2.5 bg-paper rounded border border-rust-alert/30">
                {error}
              </div>
            )}
            {children}
          </div>

          {/* Modal Footer */}
          <div className="p-4 sm:p-5 border-t border-line-grey bg-paper flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={onClose} disabled={isSubmitting}>
              <span>Cancel</span>
            </Button>
            <Button type="submit" variant="primary" size="md" loading={isSubmitting}>
              <span>{submitLabel}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
