import React from 'react';
import { Bus, User, Phone, MapPin, ExternalLink } from 'lucide-react';
import { StatusDot } from '../common/StatusDot';
import { getStationLocation } from '../../utils/stationLocations';

const coordinates = (latitude, longitude) => {
  if ([latitude, longitude].some(value => value == null || String(value).trim() === '')) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon].join(',');
};

export const RouteTracker = ({ trip, route }) => {
  const stops = [
    {
      label: 'Origin',
      name: trip.start_station_name,
      point: coordinates(route?.start_lat, route?.start_lon),
    },
    {
      label: 'Destination',
      name: trip.end_station_name,
      point: coordinates(route?.end_lat, route?.end_lon),
    },
  ];
  const [origin, destination] = stops;
  const directionsUrl = origin.point && destination.point
    ? 'https://www.google.com/maps/dir/?' + new URLSearchParams({
        api: '1',
        origin: origin.point,
        destination: destination.point,
        travelmode: 'driving',
      })
    : null;

  return (
    <div className="commuter-grid text-left">
      {/* Trip Information Header */}
      <div className="surface p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-grey pb-4">
          <div>
            <div className="text-xs font-medium text-ink-muted uppercase tracking-wider">
              Assigned trip
            </div>
            <h1 className="font-display font-bold text-3xl tracking-condensed text-pine-900 mt-0.5">
              {trip?.route_name?.replace('<->', '↔') || `${trip?.start_station_name} to ${trip?.end_station_name}`}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-ink-muted">
              <span>Trip #{trip?.trip_id}</span>
              <span>•</span>
              <StatusDot status={trip?.status || 'scheduled'} />
            </div>
          </div>

          <div className="shrink-0 whitespace-nowrap text-left sm:text-right">
            <div className="text-xs text-ink-muted">Scheduled Departure</div>
            <div className="font-display font-bold text-2xl tracking-condensed text-pine-900">
              {trip?.departure_time
                ? new Date(trip.departure_time).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZone: 'Asia/Kolkata',
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

      <section aria-labelledby="driving-route-title" className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 id="driving-route-title" className="font-display font-bold text-xl">Trip route</h2>
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded border border-pine-900 px-3 py-2 text-sm font-semibold hover:bg-paper"
            >
              <MapPin className="w-4 h-4" aria-hidden="true" />
              Driving directions
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        <ol className="route-stops">
          {stops.map(stop => {
            const location = stop.name ? getStationLocation({ name: stop.name }) : null;
            return (
              <li key={stop.label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-ink-muted">{stop.label}</p>
                  <p className="font-display text-lg font-bold">{stop.name || 'Station unavailable'}</p>
                  {location && <p className="text-xs text-ink-muted">{location.landmark}</p>}
                </div>
                {stop.point && (
                  <a
                    href={'https://www.google.com/maps/search/?' + new URLSearchParams({ api: '1', query: stop.point })}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={'Open ' + stop.name + ' on Google Maps'}
                    className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  >
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    Map
                  </a>
                )}
              </li>
            );
          })}
        </ol>
        {!directionsUrl && <p className="mt-4 text-sm text-ink-muted">Driving directions are unavailable for this trip.</p>}
      </section>
    </div>
  );
};
