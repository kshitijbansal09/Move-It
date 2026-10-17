import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach token from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('moveit_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: return response.data directly and extract error messages cleanly in the transit system voice
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    let friendlyMessage = 'An unexpected network error occurred. Please verify server connection.';

    if (error.response) {
      const data = error.response.data;
      if (data && data.message) {
        friendlyMessage = data.message;
      } else if (data && data.error) {
        friendlyMessage = data.error;
      } else if (error.response.status === 401) {
        friendlyMessage = 'Session has expired or credentials invalid. Please sign in again.';
      } else if (error.response.status === 403) {
        friendlyMessage = 'Access restricted for this operational role.';
      } else if (error.response.status === 404) {
        friendlyMessage = 'Requested transit resource was not found.';
      } else if (error.response.status === 409) {
        friendlyMessage = data?.message || 'Seat conflict detected. Vehicle capacity has been reached.';
      }
    } else if (error.request) {
      friendlyMessage = 'The C++ transit server is unavailable. Please start it with make serve.';
    }

    const enhancedError = new Error(friendlyMessage);
    enhancedError.status = error.response?.status;
    enhancedError.originalError = error;
    return Promise.reject(enhancedError);
  }
);

export default api;
