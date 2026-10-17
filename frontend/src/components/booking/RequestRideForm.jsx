import React, { useState, useEffect } from 'react';
import { campusDate } from '../../utils/departure';
import { useAuth } from '../../context/AuthContext';
import { stationsApi } from '../../api/stations';
import { bookingsApi } from '../../api/bookings';
import { Select } from '../common/Select';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { BookingStatusPanel } from './BookingStatusPanel';
import { Clock, Send } from 'lucide-react';
import { getStationLocation } from '../../utils/stationLocations';

export const RequestRideForm = ({ onBookingSuccess }) => {
  const { user } = useAuth();
  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(true);

  // Form inputs
  const [destinationStationId, setDestinationStationId] = useState('');
  const [departureTime, setDepartureTime] = useState(() => {
    // Default to nearest future half-hour slot formatted for input
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    return now.toTimeString().slice(0, 5); // "HH:MM"
  });
  const [departureDate, setDepartureDate] = useState(campusDate);
  const [isUrgent, setIsUrgent] = useState(false);

  // Live status workflow state
  const [statusStage, setStatusStage] = useState(null); // null | 'received' | 'evaluating' | 'confirmed' | 'alternative' | 'conflict' | 'error'
  const [resultData, setResultData] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAcceptingAlt, setIsAcceptingAlt] = useState(false);

  // Fetch stations on mount
  useEffect(() => {
    let isMounted = true;
    const loadStations = async () => {
      try {
        const data = await stationsApi.getAll();
        if (isMounted) {
          setStations(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('[Move It] Failed to load transit stations:', err.message);
        if (isMounted) setErrorMessage(err.message || 'Unable to load destinations.');
      } finally {
        if (isMounted) setLoadingStations(false);
      }
    };
    loadStations();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!destinationStationId) {
      setErrorMessage('Please choose a destination station from the dropdown.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setResultData(null);

    // Progression: "Request received" -> "Checking availability" -> result
    setStatusStage('received');

    try {
      // Small intentional pause so user experiences transit dispatch acknowledgement
      await new Promise((r) => setTimeout(r, 450));
      setStatusStage('evaluating');

      const priority = isUrgent && user?.role === 'faculty' ? 'urgent' : 'normal';
      const response = await bookingsApi.requestRide({
        destination_station_id: Number(destinationStationId),
        requested_time: `${departureDate}T${departureTime}:00`,
        priority,
      });

      // Give brief evaluation moment
      await new Promise((r) => setTimeout(r, 600));

      setResultData(response);

      if (response?.actionTaken === 'DIRECT_TRIP_ALLOCATED' || response?.booking) {
        setStatusStage('confirmed');
        if (onBookingSuccess) onBookingSuccess();
      } else if (response?.actionTaken === 'ALTERNATIVE_SUGGESTED' || response?.suggestedAlternativeTrip) {
        setStatusStage('alternative');
      } else {
        setStatusStage('alternative');
      }
    } catch (err) {
      console.error('[Move It] Booking request error:', err);
      if (err.status === 409 || err.message?.includes('conflict') || err.message?.includes('fully booked')) {
        setStatusStage('conflict');
        setErrorMessage(err.message || 'This trip is fully booked. Choose another departure.');
      } else {
        setStatusStage('error');
        setErrorMessage(err.message || 'Unable to evaluate transit request. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptAlternative = async (tripId) => {
    setIsAcceptingAlt(true);
    try {
      const priority = isUrgent && user?.role === 'faculty' ? 'urgent' : 'normal';
      const bookingRes = await bookingsApi.createBooking({
        trip_id: tripId,
        priority,
      });

      setResultData({
        ...resultData,
        booking: bookingRes,
      });
      setStatusStage('confirmed');
      if (onBookingSuccess) onBookingSuccess();
    } catch (err) {
      console.error('[Move It] Failed to accept alternative trip:', err);
      setStatusStage('conflict');
      setErrorMessage(err.message || 'Alternative trip seat allocation failed due to concurrency conflict.');
    } finally {
      setIsAcceptingAlt(false);
    }
  };

  const handleReset = () => {
    setStatusStage(null);
    setResultData(null);
    setErrorMessage(null);
  };

  const stationOptions = stations.map((s) => {
    const loc = getStationLocation(s);
    const landmarkPart = loc.landmark ? loc.landmark.split(',')[0] : '';
    return {
      value: s.station_id,
      label: `${s.name} — ${landmarkPart} (${loc.zone})`,
    };
  });

  return (
    <div className="border border-line-grey bg-paper-raised p-5 sm:p-6 rounded text-left">
      <div className="flex items-center justify-between border-b border-line-grey pb-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-2xl tracking-condensed text-pine-900 leading-tight">
            Request a ride
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Real-time seat reservation across Graphic Era transit corridors
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="w-3.5 h-3.5" />
          <span>Live demand matching</span>
        </div>
      </div>

      {statusStage ? (
        <BookingStatusPanel
          stage={statusStage}
          resultData={resultData}
          errorMessage={errorMessage}
          onAcceptAlternative={handleAcceptAlternative}
          onReset={handleReset}
          isAccepting={isAcceptingAlt}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Destination station"
              id="destination-station"
              value={destinationStationId}
              onChange={(e) => setDestinationStationId(e.target.value)}
              options={stationOptions}
              placeholder={loadingStations ? 'Loading campus & valley stations...' : 'Select drop-off station'}
              disabled={loadingStations || isSubmitting}
              required
            />

            <Input label="Travel date" type="date" value={departureDate} onChange={e => setDepartureDate(e.target.value)} required />
            <Input
              label="Preferred departure time"
              id="departure-time"
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              helperText="Campus departures: 1:00 PM, 4:00 PM and 6:00 PM (India time)"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Faculty Priority Toggle */}
          {user?.role === 'faculty' && (
            <div className="pt-1 pb-1">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-pine-900 select-none">
                <input
                  type="checkbox"
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                  className="w-4 h-4 rounded border-line-grey text-marigold focus:ring-marigold cursor-pointer"
                />
                <span className="font-medium">Mark as urgent</span>
                <span className="text-ink-muted">
                  (Priority queue allocation for exam oversight and institutional transit)
                </span>
              </label>
            </div>
          )}

          {errorMessage && (
            <div className="text-xs text-rust-alert font-medium p-2 bg-paper rounded border border-rust-alert/30">
              {errorMessage}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isSubmitting}
              disabled={!destinationStationId || loadingStations}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              <span>Request ride</span>
            </Button>
            <span className="text-[11px] text-ink-muted">
              Auto-allocated via FCFS & Priority algorithms
            </span>
          </div>
        </form>
      )}
    </div>
  );
};
