import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { tripsApi } from '../api/trips';
import { driversApi } from '../api/drivers';
import { NavBar } from '../components/layout/NavBar';
import { TripCard } from '../components/driver/TripCard';
import { Spinner } from '../components/common/Spinner';
import { Select } from '../components/common/Select';
import { RefreshCw, ShieldAlert, Bus } from 'lucide-react';

export const DriverDashboard = () => {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingTripId, setUpdatingTripId] = useState(null);
  const [notice, setNotice] = useState(null);

  // Load drivers list to allow driver selection for testing/operations
  useEffect(() => {
    const loadDrivers = async () => {
      try {
        const driversList = await driversApi.getAll();
        const list = Array.isArray(driversList) ? driversList : [];
        setDrivers(list);
        if (list.length > 0 && !selectedDriverId) {
          // If logged in user matches a driver name, select them, else default to first driver
          const matching = list.find(
            (d) => d.name.toLowerCase() === (user?.name || '').toLowerCase()
          );
          setSelectedDriverId(matching ? String(matching.driver_id) : String(list[0].driver_id));
        }
      } catch (err) {
        console.error('[Move It] Error loading driver registry:', err);
      }
    };
    loadDrivers();
  }, [user]);

  const fetchTrips = useCallback(async () => {
    try {
      const data = await tripsApi.getAll();
      setTrips(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[Move It] Error loading driver trips:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const handleUpdateStatus = async (tripId, nextStatus) => {
    setUpdatingTripId(tripId);
    setNotice(null);
    try {
      await tripsApi.update(tripId, { status: nextStatus });
      setNotice({
        type: 'success',
        text: `Trip #${tripId} status updated to ${nextStatus}. Dispatch board synchronized.`,
      });
      await fetchTrips();
    } catch (err) {
      console.error('[Move It] Status update error:', err);
      setNotice({
        type: 'error',
        text: err.message || `Unable to update Trip #${tripId}. Please check network.`,
      });
    } finally {
      setUpdatingTripId(null);
    }
  };

  // Filter trips for selected driver
  const assignedTrips = trips.filter((t) => {
    if (!selectedDriverId) return true;
    return String(t.driver_id) === String(selectedDriverId);
  });

  const currentDriver = drivers.find((d) => String(d.driver_id) === String(selectedDriverId));

  const driverOptions = drivers.map((d) => ({
    value: String(d.driver_id),
    label: `${d.name} (${d.license_no})`,
  }));

  return (
    <div className="min-h-screen bg-paper text-pine-900 flex flex-col">
      <NavBar />

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 border-b border-line-grey pb-4 text-left">
          <div>
            <div className="flex items-center gap-2">
              <Bus className="w-5 h-5 text-pine-900" />
              <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-condensed text-pine-900 leading-tight">
                Driver Operations
              </h1>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              Active assigned transit runs • Graphic Era Fleet Control
            </p>
          </div>

          <div className="flex items-center gap-3">
            {drivers.length > 1 && (
              <div className="w-56">
                <Select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  options={driverOptions}
                  placeholder="Select driver..."
                />
              </div>
            )}
            <button
              onClick={() => {
                setLoading(true);
                fetchTrips();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-pine-900 py-1.5 px-3 rounded border border-line-grey hover:bg-paper-raised transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh runs</span>
            </button>
          </div>
        </div>

        {/* Current Driver Roster Banner */}
        {currentDriver && (
          <div className="bg-paper-raised border border-line-grey p-4 rounded text-left flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-ink-muted">Assigned Driver: </span>
              <span className="font-medium text-pine-900 text-sm">{currentDriver.name}</span>
              <span className="text-ink-muted ml-2">License: {currentDriver.license_no}</span>
            </div>
            <div>
              <span className="text-ink-muted">Contact: </span>
              <span className="font-mono font-medium text-pine-900">{currentDriver.contact_info}</span>
            </div>
          </div>
        )}

        {/* Action Notice */}
        {notice && (
          <div
            className={`p-3 rounded text-xs font-medium border text-left flex items-center justify-between ${
              notice.type === 'success'
                ? 'bg-paper-raised text-success-moss border-success-moss/30'
                : 'bg-paper-raised text-rust-alert border-rust-alert/30'
            }`}
          >
            <span>{notice.text}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-xs text-ink-muted hover:text-pine-900 ml-4 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Assigned Trips List */}
        <section aria-label="Assigned Runs" className="space-y-4 text-left">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-2xl tracking-condensed text-pine-900">
              Today's scheduled runs ({assignedTrips.length})
            </h2>
            <div className="text-xs text-ink-muted">
              Click Start trip when departing terminal
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center items-center bg-paper-raised border border-line-grey rounded">
              <Spinner size="md" message="Loading assigned runs from fleet schedule..." />
            </div>
          ) : assignedTrips.length === 0 ? (
            <div className="py-16 px-6 bg-paper-raised border border-line-grey rounded text-center">
              <p className="text-base font-medium text-pine-900">
                No trips currently assigned to this driver.
              </p>
              <p className="text-xs text-ink-muted mt-1">
                New corridor trips scheduled by the transport admin will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignedTrips.map((trip) => (
                <TripCard
                  key={trip.trip_id}
                  trip={trip}
                  onUpdateStatus={handleUpdateStatus}
                  isUpdating={updatingTripId === trip.trip_id}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
