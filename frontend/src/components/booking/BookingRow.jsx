import React from 'react';
import { Link } from 'react-router-dom';
import { DepartureDetails } from './DepartureDetails';
import { StatusDot } from '../common/StatusDot';
import { Button } from '../common/Button';
import { ArrowRight, XCircle } from 'lucide-react';

/**
 * Departure-board style horizontal row for a booking.
 * Left-to-right: Departure time, destination/corridor, vehicle reg, status dot + text, actions.
 * Hairline 1px border divider, no card shadows.
 */
export const BookingRow = ({ booking, onCancel, isCancelling = false }) => {
  const formattedTime = booking.departure_time
    ? new Date(booking.departure_time).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true, timeZone: 'Asia/Kolkata',
      })
    : '--:--';

  const formattedDate = booking.departure_time
    ? new Date(booking.departure_time).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short', timeZone: 'Asia/Kolkata',
      })
    : '';

  const canCancel = booking.status === 'confirmed' || booking.status === 'pending';
  const isConfirmed = booking.status === 'confirmed';

  return (
    <div className="py-3 px-2 sm:px-4 border-b border-line-grey flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left transition-colors hover:bg-paper-raised/60">
      {/* Time & Destination Block */}
      <div className="flex items-baseline sm:items-center gap-4 min-w-[240px]">
        <div className="w-20 shrink-0">
          <div className="font-display font-bold text-lg sm:text-xl tracking-condensed text-pine-900 leading-none">
            {booking.slot_label || formattedTime}
          </div>
          <div className="text-[11px] text-ink-muted mt-0.5">{formattedDate}</div>
        </div>

        <div className="min-w-0">
          <div className="font-display font-bold text-base sm:text-lg tracking-condensed text-pine-900 truncate">
            {booking.end_station_name || 'Graphic Era Corridor'}
          </div>
          <div className="text-xs text-ink-muted truncate">
            {booking.route_name || `${booking.start_station_name} to ${booking.end_station_name}`}
          </div>
        </div>
      </div>

      {/* Vehicle Reg & Priority Block */}
      <div className="flex items-center gap-4 text-xs sm:w-44 shrink-0">
        <div>
          <div className="text-ink-muted text-[11px]">Vehicle</div>
          <div className="font-mono font-medium text-pine-900">
            {booking.vehicle_reg || 'Bus unavailable'}
          </div>
        </div>
        {booking.priority === 'urgent' && (
          <span className="text-[11px] font-medium text-indigo-500 border border-indigo-500/30 px-1.5 py-0.5 rounded">
            Urgent priority
          </span>
        )}
      </div>

      <DepartureDetails booking={booking} compact />

      {/* Status Dot */}
      <div className="w-28 shrink-0">
        <StatusDot status={booking.status} isLive={isConfirmed} />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 shrink-0 justify-end">
        {['confirmed','pending'].includes(booking.status) && (
          <Link to={`/booking/${booking.booking_id}`}>
            <Button variant="secondary" size="sm" className="text-xs">
              <span>Track route</span>
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
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
