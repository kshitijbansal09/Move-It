import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both institutional email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = await login(email.trim(), password);
      // Redirect based on role
      if (user.role === 'admin') {
        navigate('/admin');
      } else if (user.role === 'driver') {
        navigate('/driver');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('[Move It] Sign in failure:', err);
      setError(err.message || 'Invalid email or password. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Quick fill helper for testing/viva demonstration
  const handleQuickFill = (testEmail) => {
    setEmail(testEmail);
    setPassword('Password@123');
    setError(null);
  };

  return (
    <AuthLayout
      title="Sign in to transit dispatch"
      subtitle="Enter your institutional credentials to manage corridor bookings"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-xs text-rust-alert font-medium p-3 bg-paper rounded border border-rust-alert/30 text-left">
            {error}
          </div>
        )}

        <Input
          label="Institutional email"
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. rahul.student@geu.ac.in"
          required
          autoComplete="username"
        />

        <Input
          label="Password"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          required
          autoComplete="current-password"
        />

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="w-full justify-center"
            loading={loading}
          >
            <span>Sign in</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>

        <div className="pt-2 text-center text-xs text-ink-muted border-t border-line-grey">
          <span>New to Graphic Era transit? </span>
          <Link
            to="/signup"
            className="text-pine-900 font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-marigold"
          >
            Register account
          </Link>
        </div>

        {/* Viva / Quick Demo Seed Accounts */}
        <div className="pt-3 border-t border-line-grey/60 text-left">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-pine-900" />
            <span>Demonstration accounts (Password: Password@123)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickFill('admin@geu.ac.in')}
              className="text-[11px] px-2 py-0.5 bg-paper hover:bg-line-grey/40 text-pine-900 rounded border border-line-grey transition-colors"
            >
              Admin (Dr. Sharma)
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('sunita.verma@geu.ac.in')}
              className="text-[11px] px-2 py-0.5 bg-paper hover:bg-line-grey/40 text-pine-900 rounded border border-line-grey transition-colors"
            >
              Faculty (Prof. Verma)
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('rahul.student@geu.ac.in')}
              className="text-[11px] px-2 py-0.5 bg-paper hover:bg-line-grey/40 text-pine-900 rounded border border-line-grey transition-colors"
            >
              Student (Rahul)
            </button>
          </div>
        </div>
      </form>
    </AuthLayout>
  );
};
