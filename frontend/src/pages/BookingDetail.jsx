import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { bookingsApi } from '../api/bookings';
import { tripsApi } from '../api/trips';
import { stationsApi } from '../api/stations';
import { NavBar } from '../components/layout/NavBar';
import { DepartureDetails } from '../components/booking/DepartureDetails';
import { RouteTracker } from '../components/booking/RouteTracker';
import { Spinner } from '../components/common/Spinner';
import { Button } from '../components/common/Button';
import { ArrowLeft } from 'lucide-react';

export const BookingDetail = () => {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const loadDetails = async () => {
      try {
        const bookingData = await bookingsApi.getById(id);
        if (!bookingData) throw new Error(`Booking #${id} does not exist in the transit registry.`);
        if (isMounted) setBooking(bookingData);

        // Fetch Trip details
        if (bookingData.trip_id) {
          const tripData = await tripsApi.getById(bookingData.trip_id).catch(() => null);
          if (isMounted) setTrip(tripData);
        }

        // Fetch all stations to interpolate intermediate corridor waypoints
        const allStations = await stationsApi.getAll();
        if (isMounted && Array.isArray(allStations)) {
          // Construct sequential route waypoints starting from origin to destination
          const startName = bookingData.start_station_name;
          const endName = bookingData.end_station_name;

          const startStation = allStations.find((s) => s.name === startName) || allStations[0];
          const endStation = allStations.find((s) => s.name === endName) || allStations[allStations.length - 1];

          // Intermediate stations
          const intermediates = allStations
            .filter((s) => s.station_id !== startStation?.station_id && s.station_id !== endStation?.station_id)
            .slice(0, 2);

          const sequentialStops = [
            {
              station_id: startStation?.station_id,
              name: startStation?.name || 'Graphic Era Campus Hub',
              time: 'Origin Departure',
              status: 'passed',
            },
            ...intermediates.map((s, idx) => ({
              station_id: s.station_id,
              name: s.name,
              time: `+${(idx + 1) * 15} min`,
              status: 'intermediate',
            })),
            {
              station_id: endStation?.station_id,
              name: endStation?.name || 'Corridor Terminus',
              time: 'Final Drop-off',
              status: 'destination',
            },
          ];

          setStops(sequentialStops);
        }
      } catch (err) {
        console.error('[Move It] Error loading route tracker:', err);
        if (isMounted) setError(err.message || 'Unable to retrieve corridor route data.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-paper text-pine-900 flex flex-col">
      <NavBar />

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between border-b border-line-grey pb-3 text-left">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              <span>Back to departure board</span>
            </Button>
          </Link>
          <div className="text-xs font-mono text-ink-muted">
            Booking Reference #{id}
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="py-24 flex justify-center items-center bg-paper-raised border border-line-grey rounded">
            <Spinner size="md" message="Synchronizing corridor telemetry and route markers..." />
          </div>
        ) : error ? (
          <div className="p-8 bg-paper-raised border border-line-grey rounded text-center">
            <h2 className="font-display font-bold text-2xl tracking-condensed text-pine-900">
              Trip tracking unavailable
            </h2>
            <p className="text-xs text-ink-muted mt-1 max-w-md mx-auto">
              {error}
            </p>
            <div className="mt-4">
              <Link to="/dashboard">
                <Button variant="secondary" size="sm">
                  <span>Return to dashboard</span>
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
          <DepartureDetails booking={booking} />
          {trip && <RouteTracker
            trip={trip}
            booking={booking}
            stops={stops}
            userStationId={booking?.station_id}
          />}
          </>
        )}
      </main>
    </div>
  );
};
