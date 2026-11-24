import React, { useState, useEffect } from 'react';
import { countdown, departureLabel } from '../../utils/departure';
export const DepartureDetails = ({ booking, compact = false, board = false }) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  if (board && booking?.departure) {
    const departure = booking.departure;
    return (
      <div aria-label="Confirmed departure" className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line-grey py-3">
        <div>
          <p className="font-display text-3xl font-bold leading-none">{departure.slot_label || departureLabel(departure.departure_datetime)}</p>
          <p className="text-xs text-ink-muted">{departureLabel(departure.departure_datetime)}</p>
        </div>
        <div className="text-sm">
          <p>{departure.route?.start} to {departure.route?.end}</p>
          <p className="text-ink-muted">Bus {departure.bus?.reg_number || 'unavailable'}</p>
        </div>
        <div className="text-sm">
          <p>{departure.driver?.name || 'Driver unavailable'}</p>
          <p className="text-ink-muted">{departure.driver?.contact_info || 'Contact unavailable'}</p>
        </div>
        <p className="text-sm font-medium" aria-live="off">{countdown(booking, now)}</p>
      </div>
    );
  }
  if (compact) return <div className="text-xs text-ink-muted mt-1 space-y-1"><div>{countdown(booking, now)}</div><div>{booking.driver_name || 'Driver unavailable'} · {booking.driver_contact || 'Contact unavailable'}</div></div>;
  return <section aria-label="Your departure" className="surface divide-y divide-line-grey text-left">
    <div className="p-4"><h2 className="font-display text-2xl font-bold">{booking?.slot_label ? `Your bus leaves at ${booking.slot_label}` : 'Your departure'}</h2><p className="text-sm mt-1">{departureLabel(booking?.departure_time)} · {countdown(booking,now)}</p></div>
    <div className="p-4 text-sm space-y-2"><p>Bus: {booking?.vehicle_reg || 'Unavailable'}{booking?.vehicle_capacity ? ` · ${booking.vehicle_capacity} seats` : ''}</p><p>Driver: {booking?.driver_name || 'Unavailable'} · {booking?.driver_contact || 'Contact unavailable'}</p><p>Route: {booking?.start_station_name || 'Unavailable'} → {booking?.end_station_name || 'Unavailable'}</p><p>Trip status: {booking?.trip_status || 'Unavailable'}</p></div>
  </section>;
};
