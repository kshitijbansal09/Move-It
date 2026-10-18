export const campusDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const departureLabel = value => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : 'Departure details unavailable';
export const countdown = (booking, now = Date.now()) => {
  if (!booking?.departure_time || !booking?.trip_status) return 'Departure details unavailable';
  if (booking.trip_status === 'departed') return 'Bus has departed';
  if (booking.trip_status === 'completed') return 'Trip completed';
  const minutes = Math.max(0, Math.ceil((Date.parse(booking.departure_time)-now)/60000));
  if (!minutes) return 'Scheduled departure time reached';
  return `Leaves in ${Math.floor(minutes/60) ? `${Math.floor(minutes/60)} h ` : ''}${minutes%60} min`;
};
