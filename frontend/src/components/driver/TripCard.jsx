import React from 'react';
import { Button } from '../common/Button';
import { StatusDot } from '../common/StatusDot';
import { Bus, Users, Play, CheckCircle } from 'lucide-react';

/**
 * Driver Trip Card:
 * Utilitarian, legible, focused view for drivers on duty.
 * Shows route, vehicle reg, departure time, passenger count/capacity ("18 / 20 seats"),
 * and direct "Start trip" or "Mark complete" actions.
 */
export const TripCard = ({ trip, onUpdateStatus, isUpdating = false }) => {
  const isScheduled = trip.status === 'scheduled';
  const isDeparted = trip.status === 'departed';
  const isCompleted = trip.status === 'completed';

  const departureTime = trip.departure_time
    ? new Date(trip.departure_time).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '--:--';

  const departureDate = trip.departure_time
    ? new Date(trip.departure_time).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      })
    : '';

  const occupancyRatio = trip.vehicle_capacity
    ? Math.round((trip.seats_filled / trip.vehicle_capacity) * 100)
    : 0;

  return (
    <div className="bg-paper-raised border border-line-grey p-5 sm:p-6 rounded text-left transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-grey pb-4">
        <div>
          <div className="text-[11px] font-medium text-ink-muted uppercase tracking-wider">
            Assigned Run • Trip #{trip.trip_id}
          </div>
          <h2 className="font-display font-bold text-2xl sm:text-3xl tracking-condensed text-pine-900 mt-0.5">
            {trip.route_name || `${trip.start_station_name} to ${trip.end_station_name}`}
          </h2>
          <div className="text-xs text-ink-muted mt-0.5">
            Corridor: {trip.start_station_name} → {trip.end_station_name}
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-xs text-ink-muted">Departure</div>
          <div className="font-display font-bold text-2xl tracking-condensed text-pine-900">
            {departureTime}
          </div>
          <div className="text-[11px] text-ink-muted">{departureDate}</div>
        </div>
      </div>

      {/* Capacity & Vehicle Data */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 text-xs">
        <div>
          <span className="text-ink-muted block text-[11px]">Assigned vehicle</span>
          <span className="font-mono font-medium text-pine-900 text-sm">
            {trip.vehicle_reg || 'Campus Bus'}
          </span>
        </div>

        <div>
          <span className="text-ink-muted block text-[11px]">Passenger occupancy</span>
          <span className="font-display font-bold text-lg text-pine-900 tracking-condensed">
            {trip.seats_filled || 0} / {trip.vehicle_capacity || 20} seats
          </span>
          <span className="text-ink-muted ml-1.5 text-[11px]">({occupancyRatio}%)</span>
        </div>

        <div>
          <span className="text-ink-muted block text-[11px]">Operational status</span>
          <div className="mt-1">
            <StatusDot status={trip.status} isLive={isScheduled || isDeparted} />
          </div>
        </div>
      </div>

      {/* Driver Actions */}
      <div className="border-t border-line-grey pt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-ink-muted">
          {isScheduled && 'Run is waiting at origin terminal for boarding'}
          {isDeparted && 'Bus is currently en route along the transit corridor'}
          {isCompleted && 'Run completed and passengers safely discharged'}
        </div>

        <div>
          {isScheduled && (
            <Button
              variant="primary"
              size="md"
              disabled={isUpdating}
              onClick={() => onUpdateStatus(trip.trip_id, 'departed')}
            >
              <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
              <span>Start trip</span>
            </Button>
          )}

          {isDeparted && (
            <Button
              variant="primary"
              size="md"
              disabled={isUpdating}
              onClick={() => onUpdateStatus(trip.trip_id, 'completed')}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              <span>Mark complete</span>
            </Button>
          )}

          {isCompleted && (
            <span className="inline-flex items-center text-xs text-success-moss font-medium">
              Run completed
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
