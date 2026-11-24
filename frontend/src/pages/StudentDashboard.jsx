import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { notificationsApi } from '../api/notifications';
import { NotificationsPanel } from '../components/notifications/NotificationsPanel';
import { bookingsApi } from '../api/bookings';
import { NavBar } from '../components/layout/NavBar';
import { RequestRideForm } from '../components/booking/RequestRideForm';
import { BookingRow } from '../components/booking/BookingRow';
import { Spinner } from '../components/common/Spinner';
import { RefreshCw, MapPin, Ticket } from 'lucide-react';

export const StudentDashboard = () => {
  const { user } = useAuth();
  const [choiceRequest, setChoiceRequest] = useState(null);
  const openChoice = id => setChoiceRequest({ id });
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

  const hasOriginalRequest = bookings.some(booking => booking.status === 'awaiting_choice' && booking.original_review_at);
  useEffect(() => {
    if (!hasOriginalRequest) return undefined;
    const poll = window.setInterval(async () => { await fetchBookings(); await fetchNotifications(); }, 10000);
    return () => window.clearInterval(poll);
  }, [hasOriginalRequest, fetchBookings, fetchNotifications]);

  const handleCancelBooking = async (bookingId) => {
    setCancellingId(bookingId);
    setActionNotice(null);
    try {
      await bookingsApi.cancel(bookingId);
      setActionNotice({
        type: 'success',
        text: `Booking #${bookingId} has been cancelled.`,
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

      <main className="workspace flex-1 space-y-7">
        {/* Welcome & Context Header */}
        <div className="dashboard-hero">
          <div>
            <h1>Plan your next ride</h1>
            <p className="hero-context">
              <MapPin size={16} aria-hidden="true" />
              {user?.station_name || 'Graphic Era Hub'}
              {user?.role === 'faculty' && (
                <span className="ml-2 font-medium text-marigold">
                  Faculty priority
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
              className="hero-action"
              title="Refresh departures"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBookings ? 'animate-spin' : ''}`} />
              <span>Refresh board</span>
            </button>
          </div>
        </div>

        <div className="commuter-grid">
          <section aria-labelledby="request-ride-title" className="min-w-0">
            <RequestRideForm onBookingSuccess={refreshDashboard} choiceRequest={choiceRequest} />
          </section>
          <NotificationsPanel notifications={notifications} loading={notificationsLoading} error={notificationError} onOpenChoice={openChoice} />
        </div>

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="bookings-board-title" className="font-display font-bold text-2xl tracking-condensed text-pine-900">
                Your bookings
              </h2>
            </div>

            {/* Filter by status */}
            <div className="text-xs">
              <div className="booking-filter" aria-label="Filter bookings">
                {['all', 'confirmed', 'awaiting_choice', 'pending', 'cancelled'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    aria-pressed={filterStatus === st}
                    className={`px-2.5 py-1 text-xs capitalize rounded transition-colors ${
                      filterStatus === st
                        ? 'bg-paper-raised text-pine-900 shadow-sm'
                        : 'text-ink-muted hover:text-pine-900'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Departure-board Style List */}
          <div className="surface booking-board">

            {loadingBookings ? (
              <div className="py-12 flex justify-center items-center">
                <Spinner size="md" message="Loading departure records..." />
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <Ticket className="mx-auto mb-3 text-ink-muted" size={27} aria-hidden="true" />
                <p className="text-sm font-medium text-pine-900">
                  {filterStatus === 'all'
                    ? "You haven't booked a ride yet. Request one above to get started."
                    : `No ${filterStatus} bookings found on your schedule.`}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Confirmed trips will appear here with route details and driving directions.
                </p>
              </div>
            ) : (
              <div>
                {filteredBookings.map((b) => (
                  <BookingRow
                    key={b.booking_id}
                    booking={b}
                    onCancel={handleCancelBooking}
                    onOpenChoice={openChoice}
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
