import React from 'react';

export const Button = ({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'ghost'
  size = 'md',         // 'sm' | 'md' | 'lg'
  type = 'button',
  disabled = false,
  loading = false,
  className = '',
  onClick,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-body text-sm font-semibold rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs min-h-8',
    md: 'px-4 py-2 text-sm min-h-10',
    lg: 'px-5 py-3 text-base min-h-12',
  };

  const variantStyles = {
    primary: 'bg-pine-700 text-paper hover:bg-pine-900 active:bg-pine-900 shadow-sm',
    secondary: 'border border-line-grey text-pine-900 bg-paper-raised hover:bg-paper hover:border-pine-700',
    danger: 'border border-rust-alert text-rust-alert bg-transparent hover:bg-rust-alert hover:text-paper',
    ghost: 'text-pine-900 hover:bg-line-grey/30 bg-transparent',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size] || sizeStyles.md} ${variantStyles[variant] || variantStyles.primary} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
