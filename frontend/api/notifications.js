import api from './client';
export const notificationsApi = {
  getAll: async () => (await api.get('/notifications')).data,
  read: async id => (await api.put(`/notifications/${id}/read`)).data,
};
