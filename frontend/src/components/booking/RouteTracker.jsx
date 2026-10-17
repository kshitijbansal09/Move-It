import React from 'react';
import { Bus, User, Phone, CheckCircle, Clock, MapPin, ExternalLink } from 'lucide-react';
import { StatusDot } from '../common/StatusDot';
import { getStationLocation } from '../../utils/stationLocations';

/**
 * RouteTracker: Sequential transit route line visualization.
 * Uses numbered sequence markers ONLY here (1, 2, 3...) as required by the design system.
 * Features the ONE deliberate animated stroke fill on the route line.
 * Respects prefers-reduced-motion.
 */
export const RouteTracker = ({
  trip,
  booking,
  stops = [],
  userStationId,
}) => {
  // If no detailed intermediate stops provided, build sequential corridor stops
  const routeStops = stops.length > 0 ? stops : [
    {
      station_id: trip?.start_station_id || 1,
      name: trip?.start_station_name || 'Graphic Era University (Campus)',
      time: trip?.departure_time
        ? new Date(trip.departure_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '08:00 AM',
      status: 'passed',
    },
    {
      station_id: 2,
      name: 'Clock Tower Hub',
      time: '+18 min',
      status: 'active',
    },
    {
      station_id: trip?.end_station_id || 6,
      name: trip?.end_station_name || 'Doiwala Terminal',
      time: '+35 min',
      status: 'upcoming',
    },
  ];

  return (
    <div className="space-y-6 text-left">
      {/* Trip Information Header */}
      <div className="bg-paper-raised border border-line-grey p-5 sm:p-6 rounded">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-grey pb-4">
          <div>
            <div className="text-xs font-medium text-ink-muted uppercase tracking-wider">
              Transit Corridor Monitor
            </div>
            <h1 className="font-display font-bold text-3xl tracking-condensed text-pine-900 mt-0.5">
              {trip?.route_name || `${trip?.start_station_name} to ${trip?.end_station_name}`}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-muted">
              <span>Trip #{trip?.trip_id}</span>
              <span>•</span>
              <StatusDot status={trip?.status || 'scheduled'} isLive={trip?.status === 'scheduled'} />
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs text-ink-muted">Scheduled Departure</div>
            <div className="font-display font-bold text-2xl tracking-condensed text-pine-900">
              {trip?.departure_time
                ? new Date(trip.departure_time).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                : '--:--'}
            </div>
          </div>
        </div>

        {/* Fleet & Crew Dispatch Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
          <div className="flex items-center gap-3">
            <Bus className="w-4 h-4 text-pine-900 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Vehicle</span>
              <span className="font-mono font-medium text-pine-900">
                {trip?.vehicle_reg || 'Campus Fleet'}
              </span>
              <span className="text-ink-muted ml-1.5">
                ({trip?.seats_filled || 0} / {trip?.vehicle_capacity || 20} seats)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-pine-900 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Assigned Driver</span>
              <span className="font-medium text-pine-900">
                {trip?.driver_name || 'Driver on Duty'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-pine-900 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Driver Contact</span>
              <span className="font-mono font-medium text-pine-900">
                {trip?.driver_contact || '+91 98111 22334'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sequential Route Stop Progression (Strictly for Sequential Content) */}
      <div className="bg-paper-raised border border-line-grey p-5 sm:p-6 rounded">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-xl tracking-condensed text-pine-900">
            Route Stations & Sequence
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="w-2 h-2 rounded-full bg-marigold live-pulse" />
            <span>Active valley corridor</span>
          </div>
        </div>

        <div className="relative pl-2 sm:pl-4">
          {/* Animated Route Line Stroke */}
          <div className="absolute left-[19px] sm:left-[27px] top-4 bottom-6 w-0.5 bg-line-grey">
            <div className="route-progress-fill w-full bg-marigold" />
          </div>

          {/* Sequential Stops */}
          <div className="space-y-8 relative">
            {routeStops.map((stop, index) => {
              const stopNumber = index + 1;
              const isStart = index === 0;
              const isEnd = index === routeStops.length - 1;
              const isUserStation = userStationId && Number(stop.station_id) === Number(userStationId);

              return (
                <div key={stop.station_id || index} className="flex items-start gap-4 sm:gap-6">
                  {/* Numbered Sequence Marker (1, 2, 3...) ONLY allowed here */}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center font-display font-bold text-sm shrink-0 z-10 transition-colors ${
                      isStart
                        ? 'bg-pine-900 border-pine-900 text-paper'
                        : isEnd
                        ? 'bg-marigold border-marigold-dark text-pine-900'
                        : 'bg-paper-raised border-pine-900 text-pine-900'
                    }`}
                  >
                    {stopNumber}
                  </div>

                  {/* Stop Name & Schedule Meta */}
                  <div className="flex-1 pt-0.5">
                    {(() => {
                      const stopLoc = getStationLocation({ name: stop.name, latitude: stop.latitude, longitude: stop.longitude });
                      return (
                        <>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold text-lg sm:text-xl tracking-condensed text-pine-900">
                                {stop.name}
                              </span>
                              <span className="text-[11px] font-medium text-indigo-500 bg-paper px-2 py-0.5 rounded border border-line-grey">
                                {stopLoc.zone}
                              </span>
                              {isUserStation && (
                                <span className="text-[11px] font-medium bg-marigold text-pine-900 px-2 py-0.5 rounded">
                                  Your Boarding Hub
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <a
                                href={stopLoc.mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-marigold-dark hover:text-pine-900 font-medium hover:underline"
                                title="Open stop location on Google Maps"
                              >
                                <MapPin className="w-3 h-3" />
                                <span>Map</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                              <span className="text-xs font-mono text-ink-muted">
                                {stop.time}
                              </span>
                            </div>
                          </div>

                          <div className="text-xs text-pine-900 font-medium mt-0.5">
                            {stopLoc.landmark}
                          </div>

                          <div className="text-[11px] text-ink-muted mt-0.5">
                            {isStart && 'Origin terminal — departure checkpoint • '}
                            {isEnd && 'Corridor terminus destination • '}
                            {!isStart && !isEnd && 'Intermediate valley stop • '}
                            <span>{stopLoc.description}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
