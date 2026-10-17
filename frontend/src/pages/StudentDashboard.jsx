import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { notificationsApi } from '../api/notifications';
import { NotificationsPanel } from '../components/notifications/NotificationsPanel';
import { bookingsApi } from '../api/bookings';
import { NavBar } from '../components/layout/NavBar';
import { RequestRideForm } from '../components/booking/RequestRideForm';
import { BookingRow } from '../components/booking/BookingRow';
import { Spinner } from '../components/common/Spinner';
import { RefreshCw, Filter } from 'lucide-react';

export const StudentDashboard = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState(null);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionNotice, setActionNotice] = useState(null);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await bookingsApi.getAll();
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[Move It] Error fetching bookings:', err.message);
      setActionNotice({type:'error', text:err.message || 'Unable to load bookings.'});
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try { setNotifications(await notificationsApi.getAll()); setNotificationError(null); }
    catch (e) { setNotificationError(e.message); }
    finally { setNotificationsLoading(false); }
  }, []);
  const refreshDashboard = useCallback(async () => { await Promise.all([fetchBookings(),fetchNotifications()]); }, [fetchBookings,fetchNotifications]);
  useEffect(() => { refreshDashboard(); }, [refreshDashboard]);

  const handleCancelBooking = async (bookingId) => {
    setCancellingId(bookingId);
    setActionNotice(null);
    try {
      await bookingsApi.cancel(bookingId);
      setActionNotice({
        type: 'success',
        text: `Booking #${bookingId} has been cancelled. Seat returned to corridor pool.`,
      });
      await fetchBookings();
    } catch (err) {
      console.error('[Move It] Cancellation error:', err);
      setActionNotice({
        type: 'error',
        text: err.message || `Unable to cancel Booking #${bookingId}. Please try again.`,
      });
    } finally {
      setCancellingId(null);
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (filterStatus === 'all') return true;
    return b.status === filterStatus;
  });

  return (
    <div className="min-h-screen bg-paper text-pine-900 flex flex-col">
      <NavBar />

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Welcome & Context Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-line-grey pb-4 text-left">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-condensed text-pine-900 leading-tight">
              Transit dispatch
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Active commuter: {user?.name} • Station: {user?.station_name || 'Graphic Era Hub'}
              {user?.role === 'faculty' && (
                <span className="ml-2 font-medium text-indigo-500">
                  (Faculty Priority Allocation Active)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLoadingBookings(true);
                refreshDashboard();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-pine-900 py-1 px-2.5 rounded border border-line-grey hover:bg-paper-raised transition-colors"
              title="Refresh departures"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBookings ? 'animate-spin' : ''}`} />
              <span>Refresh board</span>
            </button>
          </div>
        </div>

        <NotificationsPanel notifications={notifications} loading={notificationsLoading} error={notificationError} onRefresh={refreshDashboard} />

        {/* Top: Ride Request Panel */}
        <section aria-labelledby="request-ride-title">
          <RequestRideForm onBookingSuccess={refreshDashboard} />
        </section>

        {/* Action Notice (Plain English) */}
        {actionNotice && (
          <div
            className={`p-3 rounded text-xs font-medium border text-left flex items-center justify-between ${
              actionNotice.type === 'success'
                ? 'bg-paper-raised text-success-moss border-success-moss/30'
                : 'bg-paper-raised text-rust-alert border-rust-alert/30'
            }`}
          >
            <span>{actionNotice.text}</span>
            <button
              onClick={() => setActionNotice(null)}
              className="text-xs text-ink-muted hover:text-pine-900 ml-4 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Bottom: "Your Bookings" Departure Board */}
        <section aria-labelledby="bookings-board-title" className="text-left space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-grey pb-2">
            <div>
              <h2 id="bookings-board-title" className="font-display font-bold text-2xl tracking-condensed text-pine-900">
                Your bookings
              </h2>
              <p className="text-xs text-ink-muted">
                Departure board of registered seat reservations and corridor passes
              </p>
            </div>

            {/* Filter by status */}
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-ink-muted" />
              <div className="inline-flex rounded border border-line-grey bg-paper-raised p-0.5">
                {['all', 'confirmed', 'pending', 'cancelled'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`px-2.5 py-1 text-xs capitalize rounded transition-colors ${
                      filterStatus === st
                        ? 'bg-pine-900 text-paper font-medium'
                        : 'text-ink-muted hover:text-pine-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Departure-board Style List */}
          <div className="bg-paper-raised border border-line-grey rounded overflow-hidden">
            {/* Board Column Headers (Hidden on small mobile) */}
            <div className="hidden sm:flex items-center justify-between py-2 px-4 bg-paper text-ink-muted font-medium text-xs border-b border-line-grey">
              <div className="min-w-[240px]">Time & Destination</div>
              <div className="w-44">Vehicle & Priority</div>
              <div className="w-28">Status</div>
              <div className="w-36 text-right">Action</div>
            </div>

            {loadingBookings ? (
              <div className="py-12 flex justify-center items-center">
                <Spinner size="md" message="Loading departure records..." />
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="py-12 px-6 text-center text-left">
                <p className="text-sm font-medium text-pine-900">
                  {filterStatus === 'all'
                    ? "You haven't booked a ride yet. Request one above to get started."
                    : `No ${filterStatus} bookings found on your schedule.`}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Once requested, confirmed trips will appear here with live tracking links.
                </p>
              </div>
            ) : (
              <div>
                {filteredBookings.map((b) => (
                  <BookingRow
                    key={b.booking_id}
                    booking={b}
                    onCancel={handleCancelBooking}
                    isCancelling={cancellingId === b.booking_id}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
