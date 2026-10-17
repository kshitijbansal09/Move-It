import React from 'react';

/**
 * Utilitarian transit select element.
 */
export const Select = ({
  label,
  id,
  value,
  onChange,
  options = [], // [{ value, label, disabled }]
  placeholder = 'Select option...',
  error,
  helperText,
  required = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`flex flex-col gap-1 text-left ${className}`}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-pine-900 flex items-center justify-between">
          <span>{label}</span>
          {required && <span className="text-rust-alert font-normal text-[11px]">Required</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className={`w-full px-3 py-2 pr-8 text-sm bg-paper-raised text-pine-900 border rounded appearance-none cursor-pointer transition-colors focus:outline-none focus:border-marigold focus:ring-1 focus:ring-marigold disabled:opacity-50 disabled:bg-paper ${
            error ? 'border-rust-alert focus:border-rust-alert' : 'border-line-grey'
          }`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-muted">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {error && <span className="text-xs text-rust-alert font-medium">{error}</span>}
      {helperText && !error && <span className="text-xs text-ink-muted">{helperText}</span>}
    </div>
  );
};
