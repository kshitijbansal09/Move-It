import api from './client';
const get = async (path, params) => (await api.get(path, { params })).data;
export const adminApi = {
  slots: () => get('/slots'),
  summary: date => get('/admin/slots/summary', { date }),
  hourly: (date, station_id) => get('/admin/demand/hourly', { date, station_id }),
  allocations: date => get('/admin/allocations', { date }),
  fleet: date => get('/admin/fleet', { date }),
  drivers: date => get('/admin/drivers/status', { date }),
  bookings: params => get('/admin/bookings', params),
};
