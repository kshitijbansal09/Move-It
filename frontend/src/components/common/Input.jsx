import React from 'react';

/**
 * Utilitarian transit input field.
 * Sentence case labels, hairline borders, no floating badges.
 */
export const Input = ({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  helperText,
  required = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`flex min-w-0 flex-col gap-1.5 text-left ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-pine-900 flex flex-wrap items-center justify-between gap-x-1">
          <span>{label}</span>
          {required && <span className="text-ink-muted font-normal text-[11px]">Required</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={`w-full min-w-0 min-h-11 px-3 py-2.5 text-sm bg-paper text-pine-900 border rounded transition-colors placeholder:text-ink-muted/70 focus:outline-none focus:border-marigold focus:ring-1 focus:ring-marigold disabled:opacity-50 disabled:bg-paper ${
          error ? 'border-rust-alert focus:border-rust-alert focus:ring-rust-alert' : 'border-line-grey'
        }`}
        {...props}
      />
      {error && <span className="text-xs text-rust-alert font-medium">{error}</span>}
      {helperText && !error && <span className="text-xs text-ink-muted">{helperText}</span>}
    </div>
  );
};
