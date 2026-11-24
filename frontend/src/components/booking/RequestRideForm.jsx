import React, { useEffect, useRef, useState } from 'react';
import { Send, Route } from 'lucide-react';
import { campusDate } from '../../utils/departure';
import { useAuth } from '../../context/AuthContext';
import { stationsApi } from '../../api/stations';
import { bookingsApi } from '../../api/bookings';
import { Select } from '../common/Select';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { BookingStatusPanel } from './BookingStatusPanel';

export const RequestRideForm = ({ onBookingSuccess, choiceRequest }) => {
  const { user } = useAuth();
  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [destinationStationId, setDestinationStationId] = useState('');
  const [suggestedTime] = useState(() => new Date(Date.now() + 30 * 60000));
  const [departureDate, setDepartureDate] = useState(() => campusDate(suggestedTime));
  const [departureTime, setDepartureTime] = useState(() => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(suggestedTime));
  const [isUrgent, setIsUrgent] = useState(false);
  const [waitForOriginal, setWaitForOriginal] = useState(false);
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formHeading = useRef(null);

  useEffect(() => {
    let active = true;
    stationsApi.getAll()
      .then(data => { if (active) setStations(data); })
      .catch(error => { if (active) setErrorMessage(error.message); })
      .finally(() => { if (active) setLoadingStations(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!choiceRequest) return undefined;
    let active = true;
    setIsSubmitting(true);
    setErrorMessage('');
    setResult(null);
    formHeading.current?.focus();
    bookingsApi.getOptions(choiceRequest.id)
      .then(data => { if (active) setResult({ ...data, outcome: data.outcome || 'low_demand' }); })
      .catch(error => {
        if (!active) return;
        setErrorMessage(error.message);
        onBookingSuccess();
      })
      .finally(() => { if (active) setIsSubmitting(false); });
    return () => { active = false; };
  }, [choiceRequest, onBookingSuccess]);

  const handleSubmit = async event => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const data = await bookingsApi.requestRide({
        destination_station_id: Number(destinationStationId),
        date: departureDate,
        preferred_time: departureTime,
        wait_for_original: waitForOriginal,
        whatsapp_updates: Boolean(user?.whatsapp_available && whatsappUpdates),
        priority: isUrgent && user.role === 'faculty' ? 'urgent' : 'normal',
      });
      setResult(data);
      onBookingSuccess();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async choice => {
    setIsSubmitting(true);
    setErrorMessage('');
    const id = result.booking.booking_id;
    try {
      setResult(await bookingsApi.resolve(id, choice));
      onBookingSuccess();
    } catch (error) {
      setErrorMessage(error.message);
      if ([409, 422].includes(error.status)) {
        try {
          const latest = await bookingsApi.getOptions(id);
          setResult(previous => ({ ...previous, ...latest }));
          if (error.message.includes('fully booked')) setErrorMessage('That bus is now full. Pick another option.');
        } catch (refreshError) {
          if (refreshError.status === 409) {
            setResult(null);
            setErrorMessage(refreshError.message);
            onBookingSuccess();
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setErrorMessage('');
  };

  const stationOptions = stations
    .filter(station => station.station_id !== 1)
    .map(station => ({ value: station.station_id, label: station.name }));

  const preferredLabel = departureTime && new Date(`2000-01-01T${departureTime}:00+05:30`).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <div className="surface p-5 sm:p-6 text-left">
      <h2 ref={formHeading} tabIndex={-1} id="request-ride-title"
        className="flex items-center gap-3 font-display font-bold text-2xl tracking-condensed pb-3 mb-4 border-b border-line-grey">
        <span className="panel-heading-icon"><Route size={18} aria-hidden="true" /></span>
        Request a ride
      </h2>
      {result ? (
        <BookingStatusPanel key={result.booking.booking_id} result={result} onResolve={handleResolve}
          onReset={handleReset} busy={isSubmitting} error={errorMessage} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Destination station"
              id="destination-station"
              className="sm:col-span-2"
              value={destinationStationId}
              onChange={(e) => setDestinationStationId(e.target.value)}
              options={stationOptions}
              placeholder={loadingStations ? 'Loading destinations...' : 'Select a destination'}
              disabled={loadingStations || isSubmitting}
              required
            />

            <Input label="Travel date" id="travel-date" type="date" min={campusDate()} disabled={isSubmitting} value={departureDate} onChange={e => setDepartureDate(e.target.value)} required />
            <Input
              label="Preferred departure time"
              id="departure-time"
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              helperText={waitForOriginal ? 'We will check for a bus around this time without moving your request to a college slot.' : preferredLabel ? `Selected ${preferredLabel.toUpperCase()} India time. College departures: 1:00 PM, 4:00 PM and 6:00 PM.`
                : 'College departures: 1:00 PM, 4:00 PM and 6:00 PM (India time).'}
              disabled={isSubmitting}
              required
            />
          </div>

          <label className="flex items-start gap-2.5 rounded border border-line-grey bg-paper p-3 text-sm">
            <input type="checkbox" checked={waitForOriginal} disabled={isSubmitting}
              className="mt-0.5 h-4 w-4 shrink-0 accent-pine-700"
              onChange={event => setWaitForOriginal(event.target.checked)} />
            <span>Wait for my preferred time</span>
          </label>

          {user?.whatsapp_available ? (
            <label className="flex items-start gap-2.5 rounded border border-line-grey bg-paper p-3 text-sm">
              <input type="checkbox" checked={whatsappUpdates} disabled={isSubmitting}
                className="mt-0.5 h-4 w-4 shrink-0 accent-pine-700"
                onChange={event => setWhatsappUpdates(event.target.checked)} />
              <span>Send ride updates to my WhatsApp ({user.contact_info})</span>
            </label>
          ) : (
            <p className="text-sm text-ink-muted">
              {user?.whatsapp_unavailable_reason || 'WhatsApp updates are currently unavailable.'}
            </p>
          )}

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
              </label>
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="text-xs text-rust-alert font-medium p-2 bg-paper rounded border border-rust-alert/30">
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
          </div>
        </form>
      )}
    </div>
  );
};
