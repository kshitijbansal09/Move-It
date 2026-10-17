import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { StudentDashboard } from './pages/StudentDashboard';
import { DriverDashboard } from './pages/DriverDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { BookingDetail } from './pages/BookingDetail';
import { Spinner } from './components/common/Spinner';

/**
 * Role-Based Protected Route Wrapper.
 * - Redirects to /login if unauthenticated.
 * - Redirects to the user's role-appropriate dashboard if accessing unauthorized route.
 */
const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, isAuthenticated, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Spinner size="lg" message="Verifying Move It credentials..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // Redirect to the user's appropriate portal
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'driver') return <Navigate to="/driver" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

/**
 * Public Route Wrapper.
 * If already signed in, redirects to their assigned dashboard.
 */
const PublicRoute = ({ children }) => {
  const { user, isAuthenticated, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Spinner size="lg" message="Loading..." />
      </div>
    );
  }

  if (isAuthenticated && user) {
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'driver') return <Navigate to="/driver" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />

          {/* Commuter Portal: Student & Faculty */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['student', 'faculty']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />

          {/* Booking Tracking & Sequential Map */}
          <Route
            path="/booking/:id"
            element={
              <ProtectedRoute allowedRoles={['student', 'faculty', 'admin', 'driver']}>
                <BookingDetail />
              </ProtectedRoute>
            }
          />

          {/* Driver Operations */}
          <Route
            path="/driver"
            element={
              <ProtectedRoute allowedRoles={['driver', 'admin']}>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />

          {/* Admin Operations & Management */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Root & Catch-all: Route intelligently */}
          <Route
            path="/"
            element={
              <PublicRoute>
                <Navigate to="/login" replace />
              </PublicRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
