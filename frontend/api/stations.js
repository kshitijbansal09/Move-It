import api from './client';

export const stationsApi = {
  getAll: async () => {
    const res = await api.get('/stations');
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/stations/${id}`);
    return res.data;
  },
  getNearby: async (id, radius = 15) => {
    const res = await api.get(`/stations/${id}/nearby`, { params: { radius } });
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/stations', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/stations/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/stations/${id}`);
    return res.data;
  },
};
