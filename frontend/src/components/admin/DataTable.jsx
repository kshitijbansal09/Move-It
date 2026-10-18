import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { Plus, Edit2, Trash2 } from 'lucide-react';

/**
 * Utilitarian departure-board data table for admin entities.
 * Hairline 1px dividers, sentence case headers, 13px table text.
 */
export const DataTable = ({
  title,
  subtitle,
  columns = [],
  data = [],
  loading = false,
  onAddNew,
  onEdit,
  onDelete,
  filterElement = null,
  emptyMessage = 'No records registered in the transit system.',
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  return (
    <div className="border border-line-grey bg-paper-raised rounded text-left">
      {/* Table Header Bar */}
      <div className="p-4 sm:p-5 border-b border-line-grey flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display font-bold text-2xl tracking-condensed text-pine-900 leading-tight">
              {title}
            </h2>
            <span className="text-xs font-mono text-ink-muted px-2 py-0.5 bg-paper rounded border border-line-grey">
              {data.length} {data.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {filterElement}
          {onAddNew && (
            <Button variant="primary" size="sm" onClick={onAddNew}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Add new</span>
            </Button>
          )}
        </div>
      </div>

      {/* Table Body */}
      {loading ? (
        <div className="py-12 flex justify-center items-center">
          <Spinner size="md" message="Loading records from transit database..." />
        </div>
      ) : data.length === 0 ? (
        <div className="py-12 px-6 text-center">
          <p className="text-sm font-medium text-pine-900">{emptyMessage}</p>
          {onAddNew && (
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={onAddNew}>
                <span>Add first entry</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-line-grey bg-paper text-pine-900 font-medium text-xs">
                {columns.map((col, idx) => (
                  <th key={idx} className="py-2.5 px-4 font-medium whitespace-nowrap">
                    {col.header}
                  </th>
                ))}
                {(onEdit || onDelete) && (
                  <th className="py-2.5 px-4 text-right font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIdx) => {
                const rowId = row.id || row.station_id || row.vehicle_id || row.driver_id || row.route_id || row.trip_id || row.booking_id;
                const isConfirmingDelete = deleteConfirmId === rowId;

                return (
                  <tr
                    key={row.slot_id && row.station_id ? `${row.slot_id}-${row.station_id}` : rowId || rowIdx}
                    className="border-b border-line-grey hover:bg-paper/40 transition-colors"
                  >
                    {columns.map((col, colIdx) => (
                      <td key={colIdx} className="py-3 px-4 text-pine-900 align-middle">
                        {col.render ? col.render(row) : row[col.accessor]}
                      </td>
                    ))}

                    {(onEdit || onDelete) && (
                      <td className="py-3 px-4 text-right align-middle whitespace-nowrap">
                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1.5 bg-paper p-1 rounded border border-rust-alert">
                            <span className="text-xs text-rust-alert font-medium mr-1">Confirm delete?</span>
                            <Button
                              variant="danger"
                              size="sm"
                              className="px-2 py-0.5 text-xs"
                              onClick={() => {
                                onDelete(rowId);
                                setDeleteConfirmId(null);
                              }}
                            >
                              Yes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2 py-0.5 text-xs text-ink-muted"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 justify-end">
                            {onEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2 py-1 text-ink-muted hover:text-pine-900"
                                onClick={() => onEdit(row)}
                                title="Edit entry"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {onDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2 py-1 text-ink-muted hover:text-rust-alert"
                                onClick={() => setDeleteConfirmId(rowId)}
                                title="Delete entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
