import React from 'react';
import { DataTable } from './DataTable';
import { StatusDot } from '../common/StatusDot';
export const SlotStrip = ({ slots, summary, loading }) => <section aria-label="Fixed departures" className="border border-line-grey bg-paper-raised divide-y divide-line-grey">
  {slots.map(slot => { const rows = summary.filter(r => r.slot_id === slot.slot_id); const count = rows.reduce((n,r) => n + r.request_count, 0); return <div key={slot.slot_id} className="px-4 py-3 flex flex-wrap items-baseline gap-4"><strong className="font-display text-2xl">{slot.label}</strong><span className="text-sm">{loading ? 'Loading requests…' : `${count} requests`}</span>{!loading && rows.some(r => r.low_demand) && <span className="text-xs text-rust-alert">Low demand on {rows.filter(r => r.low_demand).length} destinations</span>}</div>; })}
</section>;
export const DemandView = ({ hourly, summary, loading }) => {
  const hours = [...new Set(hourly.map(r => r.hour_start))].sort();
  const stations = [...new Map(summary.map(r => [r.station_id, { station_id: r.station_id, station: r.station }])).values()];
  return <div className="space-y-6"><DataTable title="Hourly requests" subtitle="Preferred travel times, grouped by destination" loading={loading} data={stations} columns={[{header:'Destination',accessor:'station'},...hours.map(hour => ({header:`${hour}–${hourly.find(r => r.hour_start === hour).hour_end}`,render:s => hourly.find(r => r.station_id === s.station_id && r.hour_start === hour)?.request_count || 0}))]} emptyMessage="No destinations registered yet." />
  {!loading && !hourly.length && <p className="text-sm text-ink-muted">No active requests for this date.</p>}
  <DataTable title="Demand by departure" loading={loading} data={summary} columns={[{header:'Departure',accessor:'slot_label'},{header:'Destination',accessor:'station'},{header:'Requests',accessor:'request_count'},{header:'Seats available',accessor:'seats_available'},{header:'Demand',render:r => <span className={r.low_demand ? 'text-rust-alert' : 'text-ink-muted'}>{r.low_demand ? `Low demand, ${r.request_count} requests` : `${r.request_count} requests`}</span>}]} /></div>;
};
const tripColumns = [{header:'Trip',accessor:'trip_id'},{header:'Route',accessor:'route_name'},{header:'Bus',accessor:'reg_number'},{header:'Driver',accessor:'driver_name'},{header:'Seats',render:t => `${t.seats_filled}/${t.capacity}`},{header:'Status',render:t => <StatusDot status={t.status} />}];
export const AllocationView = ({ board, loading }) => <div className="space-y-6">
  <section className="border border-line-grey bg-paper-raised p-4"><h2 className="font-display text-2xl font-bold">Allocation notices</h2>{loading ? <p>Loading allocations…</p> : board.warnings?.length ? <ul className="mt-3 space-y-2 text-sm">{board.warnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul> : <p className="text-sm text-ink-muted">No allocation problems for this date.</p>}</section>
  {board.slots?.map(slot => <DataTable key={slot.slot_id} title={slot.label} data={slot.trips} columns={tripColumns} loading={loading} emptyMessage="No trips scheduled for this departure." />)}
  {board.unassigned_trips?.length > 0 && <DataTable title="Legacy trips awaiting a slot" data={board.unassigned_trips} columns={tripColumns} />}
</div>;
export const AllocationLines = ({ trips = [] }) => trips.length ? <div className="space-y-2 text-xs">{trips.map(t => <div key={t.trip_id}><strong>{t.slot_label || 'Unassigned slot'}</strong> · {t.route_name}<br />{t.reg_number} · {t.driver_name} · {t.seats_filled}/{t.capacity} seats</div>)}</div> : <span className="text-xs text-ink-muted">No trips this day</span>;
