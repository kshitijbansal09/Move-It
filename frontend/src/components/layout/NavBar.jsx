import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BusFront, LogOut } from 'lucide-react';

export const NavBar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const home = { admin: '/admin', driver: '/driver' }[user?.role] || (user ? '/dashboard' : '/login');
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  return (
    <header className="app-nav">
      <div className="app-nav-inner">
        <Link to={home} className="transit-brand">
          <span className="brand-icon"><BusFront size={20} aria-hidden="true" /></span>
          <span>Move It</span>
        </Link>
        {user && (
          <div className="nav-account">
            <div className="account-avatar" aria-hidden="true">{initials}</div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{user.name}</div>
              <div className="text-xs text-ink-muted capitalize">{user.role}</div>
            </div>
            <button type="button" aria-label="Sign out" className="nav-signout" onClick={() => { logout(); navigate('/login'); }}>
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
