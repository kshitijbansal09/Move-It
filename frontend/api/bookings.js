import api from './client';

export const bookingsApi = {
  requestRide: async (data) => {
    const res = await api.post('/bookings/request', data);
    return res.data;
  },
  createBooking: async (data) => {
    const res = await api.post('/bookings', data);
    return res.data;
  },
  getAll: async () => {
    const res = await api.get('/bookings');
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/bookings/${id}`);
    return res.data;
  },
  cancel: async (id) => {
    const res = await api.put(`/bookings/${id}/cancel`);
    return res.data;
  },
  updateStatus: async (id, status) => {
    const res = await api.put(`/bookings/${id}/status`, { status });
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/bookings/${id}`);
    return res.data;
  },
};
