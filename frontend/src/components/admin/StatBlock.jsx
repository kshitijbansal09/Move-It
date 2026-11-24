import React from 'react';

export const StatBlock = ({ value, label, subtext = null }) => {
  return (
    <div className="surface admin-stat p-4 sm:p-5 text-left">
      <div className="font-display font-bold tabular-nums text-3xl sm:text-4xl tracking-condensed text-pine-900 leading-none">
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
