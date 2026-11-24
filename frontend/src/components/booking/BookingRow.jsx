import React from 'react';
import { Link } from 'react-router-dom';
import { DepartureDetails } from './DepartureDetails';
import { StatusDot } from '../common/StatusDot';
import { Button } from '../common/Button';
import { ArrowRight, XCircle } from 'lucide-react';

export const BookingRow = ({ booking, onCancel, onOpenChoice, isCancelling = false }) => {
  const shownDeparture = booking.departure_time || (booking.status === 'awaiting_choice' && booking.preferred_departure);
  const formattedTime = shownDeparture
    ? new Date(shownDeparture).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true, timeZone: 'Asia/Kolkata',
      })
    : '--:--';

  const formattedDate = shownDeparture
    ? new Date(shownDeparture).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short', timeZone: 'Asia/Kolkata',
      })
    : '';

  const isConfirmed = booking.status === 'confirmed';
  const isAwaitingChoice = booking.status === 'awaiting_choice';
  const isOriginal = isAwaitingChoice && Boolean(booking.original_review_at);
  const canCancel = isConfirmed || booking.status === 'pending' || isOriginal;
  const originalLabel = isOriginal ? (booking.original_offer_trip_id ? 'Bus available' : 'Waiting for original ride') : undefined;

  return (
    <div className="booking-item text-left transition-colors">
      {/* Time & Destination Block */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="booking-time">
          <div className="font-display font-bold text-lg sm:text-xl tracking-condensed text-pine-900 leading-none">
            {booking.slot_label || formattedTime}
          </div>
          <div className="text-[11px] text-ink-muted mt-0.5">{formattedDate}</div>
        </div>

        <div className="min-w-0">
          <div className="font-display font-bold text-base sm:text-lg tracking-condensed text-pine-900 truncate">
            {booking.destination || booking.end_station_name || 'Graphic Era Corridor'}
          </div>
          <div className="text-xs text-ink-muted truncate">
            {booking.route_name || 'From Graphic Era campus'}
          </div>
        </div>
      </div>

      {/* Vehicle Reg & Priority Block */}
      <div className="flex items-center gap-4 text-xs min-w-0 flex-wrap">
        <div>
          <div className="text-ink-muted text-[11px]">Vehicle</div>
          <div className="font-mono font-medium text-pine-900">
            {isConfirmed ? booking.vehicle_reg || 'Bus unavailable' : 'No seat assigned'}
          </div>
        </div>
        {booking.priority === 'urgent' && (
          <span className="text-[11px] font-medium text-indigo-500 border border-indigo-500/30 px-1.5 py-0.5 rounded">
            Urgent priority
          </span>
        )}
      </div>

      <div className="min-w-0 break-words">{isConfirmed && <DepartureDetails booking={booking} compact />}</div>

      {/* Status Dot */}
      <div className="min-w-0">
        <StatusDot status={booking.status} label={originalLabel} />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {isAwaitingChoice && <Button variant="secondary" size="sm" onClick={() => onOpenChoice(booking.booking_id)}>{isOriginal ? 'View request' : 'Review options'}</Button>}
        {['confirmed','pending'].includes(booking.status) && (
          <Link to={`/booking/${booking.booking_id}`} className="inline-flex items-center gap-1.5 rounded border border-line-grey px-3 py-1.5 min-h-8 text-xs font-semibold hover:bg-paper">
            Track route
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}

        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancel(booking.booking_id)}
            disabled={isCancelling}
            className="text-rust-alert hover:text-rust-alert hover:bg-rust-alert/10 text-xs"
            title="Cancel reservation"
          >
            <XCircle className="w-3.5 h-3.5 mr-1" />
            <span>Cancel</span>
          </Button>
        )}
      </div>
    </div>
  );
};
