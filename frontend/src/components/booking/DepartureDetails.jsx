import React, { useState, useEffect } from 'react';
import { countdown, departureLabel } from '../../utils/departure';
export const DepartureDetails = ({ booking, compact = false }) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  if (compact) return <div className="text-xs text-ink-muted mt-1 space-y-1"><div>{countdown(booking, now)}</div><div>{booking.driver_name || 'Driver unavailable'} · {booking.driver_contact || 'Contact unavailable'}</div></div>;
  return <section aria-label="Your departure" className="border border-line-grey bg-paper-raised divide-y divide-line-grey text-left">
    <div className="p-4"><h2 className="font-display text-2xl font-bold">{booking?.slot_label ? `Your bus leaves at ${booking.slot_label}` : 'Your departure'}</h2><p className="text-sm mt-1">{departureLabel(booking?.departure_time)} · {countdown(booking,now)}</p></div>
    <div className="p-4 text-sm space-y-2"><p>Bus: {booking?.vehicle_reg || 'Unavailable'}{booking?.vehicle_capacity ? ` · ${booking.vehicle_capacity} seats` : ''}</p><p>Driver: {booking?.driver_name || 'Unavailable'} · {booking?.driver_contact || 'Contact unavailable'}</p><p>Route: {booking?.start_station_name || 'Unavailable'} → {booking?.end_station_name || 'Unavailable'}</p><p>Trip status: {booking?.trip_status || 'Unavailable'}</p></div>
  </section>;
};
