import React from 'react';

/**
 * Departure-board status indicator: colored dot + sentence case text (not a pill chip).
 * Live / urgent items pulse with a small marigold dot.
 */
export const StatusDot = ({
  status = 'pending',
  label,
  isLive = false,
  className = '',
}) => {
  const normalized = (status || '').toLowerCase();

  const getDotConfig = () => {
    switch (normalized) {
      case 'confirmed':
      case 'completed':
      case 'active':
        return {
          dotBg: 'bg-success-moss',
          textClass: 'text-success-moss',
          defaultLabel: normalized === 'confirmed' ? 'Confirmed' : normalized === 'completed' ? 'Completed' : 'Active',
        };
      case 'pending':
      case 'scheduled':
        return {
          dotBg: 'bg-marigold',
          textClass: 'text-pine-900',
          defaultLabel: normalized === 'pending' ? 'Pending' : 'Scheduled',
        };
      case 'cancelled':
      case 'rejected':
      case 'inactive':
        return {
          dotBg: 'bg-rust-alert',
          textClass: 'text-rust-alert',
          defaultLabel: normalized === 'cancelled' ? 'Cancelled' : normalized === 'rejected' ? 'Rejected' : 'Inactive',
        };
      case 'departed':
        return {
          dotBg: 'bg-indigo-500',
          textClass: 'text-indigo-500',
          defaultLabel: 'Departed',
        };
      case 'maintenance':
        return {
          dotBg: 'bg-marigold-dark',
          textClass: 'text-marigold-dark',
          defaultLabel: 'Maintenance',
        };
      default:
        return {
          dotBg: 'bg-ink-muted',
          textClass: 'text-ink-muted',
          defaultLabel: status,
        };
    }
  };

  const config = getDotConfig();
  const displayLabel = label || config.defaultLabel;

  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium ${className}`}>
      <span className="relative flex h-2 w-2 items-center justify-center">
        {isLive && (
          <span className="live-pulse absolute inline-flex h-full w-full rounded-full bg-marigold opacity-75" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dotBg}`} />
      </span>
      <span className={config.textClass}>{displayLabel}</span>
    </span>
  );
};
