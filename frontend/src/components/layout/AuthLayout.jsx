import React from 'react';
import { BusFront } from 'lucide-react';
import shuttle from '../../assets/campus-shuttle.jpg';

export const AuthLayout = ({ children, title, subtitle }) => (
  <main className="auth-layout">
    <div className="auth-visual">
      <img src={shuttle} alt="" className="auth-photo" />
      <div className="auth-visual-content">
        <div className="transit-brand">
          <span className="brand-icon"><BusFront size={20} aria-hidden="true" /></span>
          <span>Move It</span>
        </div>
        <div className="auth-caption">
          <p className="font-display">Campus rides,<br />made simple.</p>
          <span>Graphic Era University · Doon Valley</span>
        </div>
      </div>
    </div>
    <div className="auth-form-area">
      <div className="auth-form">
        <div className="mb-7">
          <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">{title}</h1>
          {subtitle && <p className="text-ink-muted mt-2">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  </main>
);
