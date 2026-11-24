import React, { useState } from 'react';
import { Button } from '../common/Button';
import { DepartureDetails } from './DepartureDetails';
import { departureLabel } from '../../utils/departure';

const requestCount = count => `${count} ${count === 1 ? 'request' : 'requests'}`;

function OptionRows({ title, options, action = 'choose_slot', selected, onSelect, busy }) {
  return (
    <fieldset disabled={busy} className="min-w-0">
      <legend className="font-display text-xl font-semibold">{title}</legend>
      {options.length === 0 && <p className="py-2 text-sm text-ink-muted">No departures available.</p>}
      {options.map(option => {
        const key = `${action}/${option.destination_station_id ?? ""}/${option.slot_id}`;
        const available = option.scheduled && option.seats_available > 0;
        return (
          <label key={key} className="ride-option mt-1.5 flex items-center gap-3 border border-line-grey rounded px-3 py-2.5 text-sm">
            <input
              type="radio"
              name="ride-choice"
              className="accent-pine-900"
              checked={selected === key}
              disabled={!available}
              onChange={() => onSelect({ key, action, slot_id: option.slot_id,
                ...(option.destination_station_id && { destination_station_id: option.destination_station_id }) })}
            />
            <span className="font-display text-lg font-semibold min-w-16">{option.slot_label}</span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {option.station && <span>{option.station}{option.distance_km != null && ` (${option.distance_km} km)`}</span>}
              <span className="text-ink-muted">{requestCount(option.request_count)}</span>
              <span className="text-ink-muted">{option.scheduled ? `${option.seats_available} seats left` : 'No bus scheduled'}</span>
              {option.high_demand && <span className="text-success-moss">Enough riders</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function BookingStatusPanel({ result, onResolve, onReset, busy, error }) {
  const [selected, setSelected] = useState(null);
  const { booking, message, options } = result;
  if (result.outcome === 'confirmed' || result.outcome === 'cancelled') {
    return (
      <div className="space-y-3">
        <p role="status" className="text-sm">{message}</p>
        {result.outcome === 'confirmed' && <DepartureDetails booking={booking} board />}
        <Button variant="ghost" size="sm" onClick={onReset}>Request another ride</Button>
      </div>
    );
  }
  if (['waiting_original', 'original_offer', 'original_unavailable'].includes(result.outcome)) {
    return (
      <div className="space-y-3">
        <h3 className="font-display text-xl font-bold">
          {result.offer ? 'A bus is available' : result.outcome === 'original_unavailable' ? 'The offered bus is unavailable' : 'Original request saved'}
        </h3>
        <p className="text-sm">Preferred ride to <strong>{booking.destination}</strong> · {departureLabel(booking.preferred_departure)} India time</p>
        {result.offer ? (
          <div className="rounded border border-line-grey bg-paper p-3 text-sm">
            <strong>{departureLabel(result.offer.departure_time)} India time</strong> · {result.offer.reg_number}
            <p className="text-ink-muted mt-1">Confirm before this bus departs to reserve a seat.</p>
          </div>
        ) : result.outcome === 'waiting_original' ? (
          <p className="text-sm text-ink-muted">
            Look for an in-app update around {departureLabel(booking.original_review_at)} India time. Your request counts toward demand.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">This bus may have filled, departed, or been rescheduled.</p>
        )}
        {error && <p role="alert" className="text-sm text-rust-alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {result.offer && <Button disabled={busy} onClick={() => onResolve({ action: 'confirm_original' })}>Confirm this ride</Button>}
          <Button variant="ghost" size="sm" onClick={onReset}>Back to request form</Button>
        </div>
      </div>
    );
  }
  const canConfirm = selected && [...options.slots, ...options.nearby, ...(options.fixed || [])].some(option =>
    option.destination_station_id === selected.destination_station_id &&
    option.slot_id === selected.slot_id && option.scheduled && option.seats_available > 0);
  const confirm = () => {
    const { key, ...choice } = selected;
    onResolve(choice);
  };
  const deadline = booking.expires_at && new Date(booking.expires_at).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
  return (
    <div aria-labelledby="ride-options-title" className="space-y-4">
      <div>
        <h3 id="ride-options-title" className="font-display text-2xl font-semibold">
          {result.low_demand === false ? 'Ride options for' : 'Few riders so far for'} {booking.destination} at {booking.slot_label} ({requestCount(result.demandCount)})
        </h3>
        {(result.next_day || result.time_adjusted) && <p className="text-sm">{message}</p>}
        {result.direct_trip_scheduled === false && (
          <p className="text-sm mt-1">Your request has been counted. You can keep your original ride request or choose another departure.</p>
        )}
        <p className="text-sm text-ink-muted mt-1">
          Your request stays open for up to {result.choice_ttl_minutes} minutes
          {deadline ? ` (until ${deadline} India time)` : ''}. Seats are assigned when you confirm.
        </p>
      </div>
      {!(booking.requested_time && Date.parse(booking.requested_time.replace(' ', 'T') + '+05:30') <= Date.now()) && (
        <div className="rounded border border-line-grey bg-paper p-3 space-y-2">
          <p className="text-sm">Keep your destination and preferred time. We’ll check for a bus in about {result.choice_ttl_minutes} minutes and notify you here.</p>
          <Button variant="secondary" disabled={busy} onClick={() => onResolve({ action: 'wait_original' })}>Keep my original request</Button>
        </div>
      )}
      <OptionRows title={`Other times to ${booking.destination}`} options={options.slots}
        selected={selected?.key} onSelect={setSelected} busy={busy} />
      <OptionRows title="Nearby destinations" options={options.nearby} action="choose_nearby"
        selected={selected?.key} onSelect={setSelected} busy={busy} />
      {options.fixed?.length > 0 && <OptionRows title="Other college departures" options={options.fixed} action="choose_departure"
        selected={selected?.key} onSelect={setSelected} busy={busy} />}
      {error && <p role="alert" className="text-sm text-rust-alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canConfirm || busy} onClick={confirm}>Confirm this option</Button>
        <Button variant="danger" disabled={busy} onClick={() => onResolve({ action: 'cancel' })}>Cancel my request</Button>
        <Button variant="ghost" disabled={busy} onClick={onReset}>Close options</Button>
      </div>
    </div>
  );
}
