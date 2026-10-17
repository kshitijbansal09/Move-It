import api from './client';

export const vehiclesApi = {
  getAll: async () => {
    const res = await api.get('/vehicles');
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/vehicles/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/vehicles', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/vehicles/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/vehicles/${id}`);
    return res.data;
  },
};
