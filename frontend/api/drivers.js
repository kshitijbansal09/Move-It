import api from './client';

export const driversApi = {
  getAll: async () => {
    const res = await api.get('/drivers');
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/drivers/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/drivers', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/drivers/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/drivers/${id}`);
    return res.data;
  },
};
