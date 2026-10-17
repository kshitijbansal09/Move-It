import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('moveit_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('moveit_token') || null);
  const [loading, setLoading] = useState(true);

  // Initialize and verify session on initial load
  useEffect(() => {
    const verifySession = async () => {
      const existingToken = localStorage.getItem('moveit_token');
      if (!existingToken) {
        setLoading(false);
        return;
      }

      try {
        const profile = await authApi.getMe();
        if (profile) {
          setUser(profile);
          localStorage.setItem('moveit_user', JSON.stringify(profile));
        }
      } catch (err) {
        console.warn('[Move It Auth] Session validation failed:', err.message);
        // Clear invalid token
        localStorage.removeItem('moveit_token');
        localStorage.removeItem('moveit_user');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password });
    if (!data || !data.token || !data.user) {
      throw new Error('Authentication response was malformed.');
    }
    localStorage.setItem('moveit_token', data.token);
    localStorage.setItem('moveit_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const signup = useCallback(async (formData) => {
    const data = await authApi.signup(formData);
    if (!data || !data.token || !data.user) {
      throw new Error('Signup response was malformed.');
    }
    localStorage.setItem('moveit_token', data.token);
    localStorage.setItem('moveit_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('moveit_token');
    localStorage.removeItem('moveit_user');
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    role: user?.role || null,
    isAuthenticated: Boolean(token && user),
    loading,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
