import api from './client';

export const tripsApi = {
  getAll: async (params = {}) => {
    const res = await api.get('/trips', { params });
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/trips/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/trips', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/trips/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/trips/${id}`);
    return res.data;
  },
  scheduleBatch: async (id) => {
    const res = await api.post(`/trips/${id}/schedule-batch`);
    return res.data;
  },
};
