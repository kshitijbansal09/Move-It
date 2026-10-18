import React from 'react';

/**
 * Utilitarian transit stat block:
 * Large Barlow Condensed numbers with small sentence case labels underneath.
 * Strict compliance: NO icon boxes, NO colored circle badges, NO soft shadow cards.
 */
export const StatBlock = ({ value, label, subtext = null }) => {
  return (
    <div className="border border-line-grey bg-paper-raised p-4 sm:p-5 rounded text-left">
      <div className="font-display font-bold text-3xl sm:text-4xl tracking-condensed text-pine-900 leading-none">
        {value}
      </div>
      <div className="text-xs font-medium text-ink-muted mt-2">
        {label}
      </div>
      {subtext && (
        <div className="text-[11px] text-ink-muted/80 mt-0.5">
          {subtext}
        </div>
      )}
    </div>
  );
};
