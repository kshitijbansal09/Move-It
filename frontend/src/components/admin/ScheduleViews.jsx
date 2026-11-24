import React from 'react';
import { DataTable } from './DataTable';
import { StatusDot } from '../common/StatusDot';
export const SlotStrip = ({ slots, summary, loading }) => (
  <section aria-labelledby="fixed-departures-title" className="surface p-5">
    <h2 id="fixed-departures-title" className="font-display text-xl font-bold mb-3">Fixed departures</h2>
    <div className="departure-grid">
      {slots.map(slot => {
        const rows = summary.filter(row => row.slot_id === slot.slot_id);
        const count = rows.reduce((total, row) => total + row.request_count, 0);
        const lowDemand = rows.filter(row => row.low_demand).length;
        return (
          <div key={slot.slot_id} className="departure-slot">
            <strong className="font-display text-xl">{slot.label}</strong>
            <div className="mt-1 text-sm text-ink-muted">{loading ? 'Loading requests…' : `${count} requests`}</div>
            {!loading && lowDemand > 0 && <p className="mt-1 text-xs text-rust-alert">Low demand on {lowDemand} destinations</p>}
          </div>
        );
      })}
    </div>
  </section>
);
export const DemandView = ({ hourly, summary, loading }) => {
  const hours = [...new Set(hourly.map(r => r.hour_start))].sort();
  const stations = [...new Map(summary.map(r => [r.station_id, { station_id: r.station_id, station: r.station }])).values()];
  const originalWaiting = hourly.reduce((sum, row) => sum + (row.original_request_count || 0), 0);
  return <div className="space-y-6"><DataTable title="Hourly requests" subtitle="Preferred travel times, grouped by destination" loading={loading} data={stations} columns={[{header:'Destination',accessor:'station'},...hours.map(hour => ({header:`${hour}–${hourly.find(r => r.hour_start === hour).hour_end}`,render:s => hourly.find(r => r.station_id === s.station_id && r.hour_start === hour)?.request_count || 0}))]} emptyMessage="No destinations registered yet." />
  {!loading && originalWaiting > 0 && (
    <p className="surface p-4 text-sm"><strong>{originalWaiting}</strong> original-time {originalWaiting === 1 ? 'request is' : 'requests are'} included in hourly demand. See Commuter bookings for exact times.</p>
  )}
  {!loading && !hourly.length && <p className="text-sm text-ink-muted">No active requests for this date.</p>}
  <DataTable title="Demand by departure" loading={loading} data={summary} columns={[{header:'Departure',accessor:'slot_label'},{header:'Destination',accessor:'station'},{header:'Requests',accessor:'request_count'},
    {header:'Confirmed',accessor:'confirmed_count'},{header:'Awaiting choice',accessor:'awaiting_choice_count'},
    {header:'Legacy pending',accessor:'pending_count'},{header:'Seats available',accessor:'seats_available'},{header:'Demand',render:r => <span className={r.low_demand ? 'text-rust-alert' : 'text-ink-muted'}>{r.low_demand ? `Low demand, ${r.request_count} requests` : `${r.request_count} requests`}</span>}]} /></div>;
};
const tripColumns = [{header:'Trip',accessor:'trip_id'},{header:'Route',accessor:'route_name'},{header:'Bus',accessor:'reg_number'},{header:'Driver',accessor:'driver_name'},{header:'Seats',render:t => `${t.seats_filled}/${t.capacity}`},{header:'Status',render:t => <StatusDot status={t.status} />}];
export const AllocationView = ({ board, loading }) => <div className="space-y-6">
  <section className="surface p-5"><h2 className="font-display text-2xl font-bold">Allocation notices</h2>{loading ? <p>Loading allocations…</p> : board.warnings?.length ? <ul className="mt-3 space-y-2 text-sm">{board.warnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul> : <p className="text-sm text-ink-muted">No allocation problems for this date.</p>}</section>
  {board.slots?.map(slot => <DataTable key={slot.slot_id} title={slot.label} data={slot.trips} columns={tripColumns} loading={loading} emptyMessage="No trips scheduled for this departure." />)}
  {board.unassigned_trips?.length > 0 && <DataTable title="Trips outside fixed slots" data={board.unassigned_trips} columns={tripColumns} />}
</div>;
export const AllocationLines = ({ trips = [] }) => trips.length ? <div className="space-y-2 text-xs">{trips.map(t => <div key={t.trip_id}><strong>{t.slot_label || t.departure_time?.slice(11, 16) || 'Unassigned slot'}</strong> · {t.route_name}<br />{t.reg_number} · {t.driver_name} · {t.seats_filled}/{t.capacity} seats</div>)}</div> : <span className="text-xs text-ink-muted">No trips this day</span>;
