import React from 'react';
import { Button } from '../common/Button';
import { CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, MapPin, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getStationLocation } from '../../utils/stationLocations';

/**
 * Live status panel for ride request progression:
 * 1. "Request received"
 * 2. "Checking availability"
 * 3. Result: "Seat confirmed on [trip]" OR "Low demand — here's a nearby option"
 */
export const BookingStatusPanel = ({
  stage, // 'received' | 'evaluating' | 'confirmed' | 'alternative' | 'conflict' | 'error'
  resultData,
  errorMessage,
  onAcceptAlternative,
  onReset,
  isAccepting = false,
}) => {
  return (
    <div className="border border-line-grey bg-paper-raised p-5 rounded text-left transition-all">
      {/* Stage Progression Indicator */}
      <div className="flex items-center gap-6 pb-4 border-b border-line-grey text-xs">
        {/* Step 1 */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              stage === 'received' ? 'bg-marigold live-pulse' : 'bg-success-moss'
            }`}
          />
          <span className={stage === 'received' ? 'font-medium text-pine-900' : 'text-ink-muted'}>
            Request received
          </span>
        </div>

        <div className="w-8 h-px bg-line-grey" />

        {/* Step 2 */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              stage === 'evaluating'
                ? 'bg-marigold live-pulse'
                : ['confirmed', 'alternative', 'conflict', 'error'].includes(stage)
                ? 'bg-success-moss'
                : 'bg-line-grey'
            }`}
          />
          <span className={stage === 'evaluating' ? 'font-medium text-pine-900' : 'text-ink-muted'}>
            Checking availability
          </span>
        </div>

        <div className="w-8 h-px bg-line-grey" />

        {/* Step 3 */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              stage === 'confirmed'
                ? 'bg-success-moss'
                : stage === 'alternative'
                ? 'bg-marigold'
                : stage === 'conflict' || stage === 'error'
                ? 'bg-rust-alert'
                : 'bg-line-grey'
            }`}
          />
          <span
            className={
              ['confirmed', 'alternative', 'conflict', 'error'].includes(stage)
                ? 'font-medium text-pine-900'
                : 'text-ink-muted'
            }
          >
            {stage === 'confirmed'
              ? 'Seat confirmed'
              : stage === 'alternative'
              ? 'Alternative found'
              : stage === 'conflict'
              ? 'Trip full'
              : stage === 'error'
              ? 'Notice'
              : 'Allocation'}
          </span>
        </div>
      </div>

      {/* Dynamic Content Body */}
      <div className="pt-4">
        {/* Evaluating State */}
        {(stage === 'received' || stage === 'evaluating') && (
          <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="live-pulse absolute inline-flex h-full w-full rounded-full bg-marigold opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-marigold" />
            </div>
            <div>
              <div className="font-display font-bold text-xl tracking-condensed text-pine-900">
                {stage === 'received' ? 'Request recorded in dispatch' : 'Evaluating corridor demand...'}
              </div>
              <p className="text-xs text-ink-muted mt-1 max-w-sm">
                Finding your next fixed departure and checking available seats.
              </p>
            </div>
          </div>
        )}

        {/* Confirmed State */}
        {stage === 'confirmed' && resultData && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success-moss shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-bold text-2xl tracking-condensed text-pine-900 leading-tight">
                  Your bus leaves at {resultData.booking?.slot_label || 'the assigned departure'}
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  {resultData.message || 'Your seat is confirmed. Departure details are available below.'}
                </p>
              </div>
            </div>

            {/* Trip details grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-paper p-3 rounded border border-line-grey text-xs">
              <div>
                <span className="text-ink-muted block text-[11px]">Route</span>
                <span className="font-medium text-pine-900">
                  {resultData.booking?.trip_details?.routeName || 'Campus Corridor'}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block text-[11px]">Departure time</span>
                <span className="font-medium text-pine-900">
                  {resultData.booking?.slot_label || 'Departure unavailable'}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block text-[11px]">Vehicle reg</span>
                <span className="font-medium text-pine-900 font-mono">
                  {resultData.booking?.trip_details?.vehicleReg || 'Transit bus'}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block text-[11px]">Driver</span>
                <span className="font-medium text-pine-900">
                  {resultData.booking?.driver_name || 'Driver unavailable'}<br />{resultData.booking?.driver_contact || ''}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Link
                to={`/booking/${resultData.booking?.bookingId || resultData.booking?.booking_id || resultData.bookingId}`}
              >
                <Button variant="primary" size="md">
                  <span>Track route stations</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                <span>Request another ride</span>
              </Button>
            </div>
          </div>
        )}

        {/* Low Demand / Alternative Station State */}
        {stage === 'alternative' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-marigold mt-1.5 shrink-0" />
              <div>
                <div className="font-display font-bold text-2xl tracking-condensed text-pine-900 leading-tight">
                  Low demand — here's a nearby option
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  Demand for your selected station is below the minimum threshold (5 commuters).
                  We found an active scheduled trip from a nearby valley station.
                </p>
              </div>
            </div>

            {/* Alternative Trip Details */}
            {resultData?.suggestedAlternativeTrip ? (
              <div className="border border-line-grey bg-paper p-4 rounded text-xs space-y-3">
                {(() => {
                  const altLoc = getStationLocation({ name: resultData.suggestedAlternativeTrip.stationName });
                  return (
                    <div className="border-b border-line-grey pb-2.5 space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-xl tracking-condensed text-pine-900">
                            {resultData.suggestedAlternativeTrip.stationName}
                          </span>
                          <span className="text-[11px] font-medium text-indigo-500 bg-paper-raised px-2 py-0.5 rounded border border-line-grey">
                            {altLoc.zone}
                          </span>
                        </div>
                        <div className="text-ink-muted font-medium">
                          {resultData.suggestedAlternativeTrip.distanceKm} km away from requested stop
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="text-pine-900 font-medium">
                          Exact location: <span className="text-ink-muted font-normal">{altLoc.landmark}</span>
                        </div>
                        <a
                          href={altLoc.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-marigold-dark hover:text-pine-900 font-medium hover:underline"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>View on Google Maps</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-ink-muted block text-[11px]">Departure time</span>
                    <span className="font-medium text-pine-900 text-sm">
                      {resultData.suggestedAlternativeTrip.departureTime}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[11px]">Route</span>
                    <span className="font-medium text-pine-900">
                      {resultData.suggestedAlternativeTrip.routeName}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-[11px]">Seats available</span>
                    <span className="font-medium text-success-moss">
                      {resultData.suggestedAlternativeTrip.availableSeats} seats open
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    loading={isAccepting}
                    onClick={() => onAcceptAlternative(resultData.suggestedAlternativeTrip.tripId)}
                  >
                    <span>Accept this nearby option</span>
                    <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onReset}>
                    <span>Change destination</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border border-line-grey bg-paper p-4 rounded text-xs">
                <p className="text-pine-900 font-medium">
                  {resultData?.message || 'No direct buses are currently scheduled for this route.'}
                </p>
                <p className="text-ink-muted mt-1">
                  Estimated next shuttle service is in ~45 minutes. A WhatsApp notification has been queued for your account.
                </p>
                <div className="mt-3">
                  <Button variant="secondary" size="sm" onClick={onReset}>
                    <span>Try another destination</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Conflict / Error State */}
        {(stage === 'conflict' || stage === 'error') && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rust-alert shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-bold text-xl tracking-condensed text-pine-900">
                  {stage === 'conflict'
                    ? 'This trip is fully booked. Try the nearby-station option below.'
                    : 'Unable to complete transit request'}
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  {errorMessage || 'Vehicle capacity conflict detected by MySQL trigger. No seats remain on this specific departure.'}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={onReset}>
                <span>Try another station or time</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
