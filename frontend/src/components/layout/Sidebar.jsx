import React from 'react';
import {
  LayoutDashboard,
  MapPin,
  Bus,
  UserCheck,
  Milestone,
  CalendarClock,
  Ticket,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'demand', label: 'Demand', icon: Ticket },
  { id: 'allocations', label: 'Allocations', icon: CalendarClock },
  { id: 'fleet', label: 'Fleet', icon: Bus },
  { id: 'drivers', label: 'Drivers', icon: UserCheck },
  { id: 'stations', label: 'Stations', icon: MapPin },
  { id: 'vehicles', label: 'Vehicles', icon: Bus },
  { id: 'routes', label: 'Routes', icon: Milestone },
  { id: 'trips', label: 'Trips', icon: CalendarClock },
  { id: 'bookings', label: 'Bookings', icon: Ticket },
];

export const Sidebar = ({ activeTab, onSelectTab }) => {
  return (
    <aside className="admin-sidebar">
      <nav aria-label="Operations">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={17} className="shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
