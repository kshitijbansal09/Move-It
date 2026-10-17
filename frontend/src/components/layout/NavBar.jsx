import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';

export const NavBar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getDashboardPath = () => {
    if (!user) return '/login';
    if (user.role === 'admin') return '/admin';
    if (user.role === 'driver') return '/driver';
    return '/dashboard';
  };

  return (
    <header className="bg-pine-900 text-paper border-b border-pine-700 select-none">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand Wordmark */}
        <Link to={getDashboardPath()} className="flex items-baseline gap-2.5 group">
          <span className="font-display font-bold text-2xl tracking-condensed text-paper group-hover:text-marigold transition-colors">
            Move It
          </span>
          <span className="text-xs text-paper/60 hidden sm:inline font-normal">
            Doon Valley Transit
          </span>
        </Link>

        {/* User Context & Sign Out */}
        {user && (
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right leading-tight">
              <div className="font-medium text-paper text-sm">{user.name}</div>
              <div className="text-paper/60 capitalize flex items-center justify-end gap-1.5">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    user.role === 'faculty' ? 'bg-indigo-500' : user.role === 'admin' ? 'bg-rust-alert' : 'bg-marigold'
                  }`}
                />
                <span>{user.role}</span>
              </div>
            </div>

            <div className="h-6 w-px bg-pine-700" />

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs text-paper/80 hover:text-marigold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-marigold py-1 px-2 rounded"
              title="Sign out of system"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
