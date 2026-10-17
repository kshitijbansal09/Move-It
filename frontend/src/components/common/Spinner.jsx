import React from 'react';

/**
 * Quiet utilitarian transit spinner.
 */
export const Spinner = ({ size = 'md', className = '', message = null }) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 text-xs text-ink-muted ${className}`}>
      <svg
        className={`animate-spin ${sizeMap[size] || sizeMap.md} text-ink-muted`}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          className="opacity-20"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-80"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
        />
      </svg>
      {message && <span className="font-medium">{message}</span>}
    </div>
  );
};
