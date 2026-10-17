import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { stationsApi } from '../api/stations';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { ArrowRight } from 'lucide-react';

export const Signup = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [stationId, setStationId] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchStations = async () => {
      try {
        const data = await stationsApi.getAll();
        if (isMounted) {
          setStations(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('[Move It] Failed to load stations:', err.message);
      } finally {
        if (isMounted) setLoadingStations(false);
      }
    };
    fetchStations();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password || !contactInfo) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = await signup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        station_id: stationId ? Number(stationId) : null,
        contact_info: contactInfo.trim(),
      });

      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'driver') {
        navigate('/driver');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('[Move It] Registration failure:', err);
      setError(err.message || 'Registration failed. A user with this email or phone may already exist.');
    } finally {
      setLoading(false);
    }
  };

  const stationOptions = stations.map((s) => ({
    value: s.station_id,
    label: s.name,
  }));

  const roleOptions = [
    { value: 'student', label: 'Student' },
    { value: 'faculty', label: 'Faculty' },
  ];

  return (
    <AuthLayout
      title="Register for transit pass"
      subtitle="Commuter profile for Graphic Era campus and Doon Valley transit"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="text-xs text-rust-alert font-medium p-3 bg-paper rounded border border-rust-alert/30 text-left">
            {error}
          </div>
        )}

        <Input
          label="Full name"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Priya Chauhan"
          required
        />

        <Input
          label="Institutional email"
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. priya.student@geu.ac.in"
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Commuter role"
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={roleOptions}
            required
            helperText="Admin roles are institutional-only"
          />

          <Select
            label="Primary boarding hub"
            id="station"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            options={stationOptions}
            placeholder={loadingStations ? 'Loading stations...' : 'Select station'}
            disabled={loadingStations}
            helperText="Default pick-up location"
          />
        </div>

        <Input
          label="Mobile phone number (for WhatsApp alerts)"
          id="contact"
          value={contactInfo}
          onChange={(e) => setContactInfo(e.target.value)}
          placeholder="+919876543210"
          helperText="Format: +91 followed by 10 digits (E.164 standard)"
          required
        />

        <Input
          label="Set account password"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          required
        />

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="w-full justify-center"
            loading={loading}
          >
            <span>Register account</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>

        <div className="pt-2 text-center text-xs text-ink-muted border-t border-line-grey">
          <span>Already registered with Move It? </span>
          <Link
            to="/login"
            className="text-pine-900 font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-marigold"
          >
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};
