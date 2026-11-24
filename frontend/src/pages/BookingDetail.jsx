import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { bookingsApi } from '../api/bookings';
import { tripsApi } from '../api/trips';
import { routesApi } from '../api/routes';
import { NavBar } from '../components/layout/NavBar';
import { DepartureDetails } from '../components/booking/DepartureDetails';
import { RouteTracker } from '../components/booking/RouteTracker';
import { Spinner } from '../components/common/Spinner';
import { Button } from '../components/common/Button';
import { ArrowLeft } from 'lucide-react';

const whatsappStatuses = {
  pending: 'Queued',
  sending: 'Sending',
  submitted: 'Submitted to WhatsApp',
  failed: 'Send failed',
  unknown: 'Could not verify submission',
  skipped: 'Skipped because the account phone number changed',
  simulated: 'Simulated',
};

export const BookingDetail = () => {
  const { id } = useParams();
  const [details, setDetails] = useState(null);
  const loading = !details || details.id !== id;
  const { booking, trip, route, error } = loading ? {} : details;

  useEffect(() => {
    let current = true;
    const loadDetails = async () => {
      try {
        const booking = await bookingsApi.getById(id);
        if (!booking) throw new Error('Booking not found.');

        const trip = booking.trip_id ? await tripsApi.getById(booking.trip_id).catch(() => null) : null;
        if (!current) return;

        const route = trip?.route_id ? await routesApi.getById(trip.route_id).catch(() => null) : null;
        if (current) setDetails({ id, booking, trip, route });
      } catch (err) {
        if (current) setDetails({ id, error: err.message || 'Unable to retrieve the booking.' });
      }
    };

    loadDetails();
    return () => {
      current = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-paper text-pine-900 flex flex-col">
      <NavBar />

      <main className="workspace flex-1 space-y-5">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-wrap gap-2 items-center justify-between text-left">
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
          <div className="surface py-24 flex justify-center items-center">
            <Spinner size="md" message="Loading trip details..." />
          </div>
        ) : error ? (
          <div className="surface p-8 text-center">
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
            {booking.whatsapp_updates && (
              <p className="text-sm text-ink-muted">
                WhatsApp update ? {whatsappStatuses[booking.whatsapp_status] || 'No update queued yet'}
              </p>
            )}
            {trip && <RouteTracker trip={trip} route={route} />}
            {!trip && booking.trip_id && (
              <p className="text-sm text-ink-muted">The assigned trip route is temporarily unavailable.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
};
