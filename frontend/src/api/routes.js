import api from './client';

export const routesApi = {
  getAll: async () => {
    const res = await api.get('/routes');
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/routes/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await api.post('/routes', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/routes/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/routes/${id}`);
    return res.data;
  },
};
