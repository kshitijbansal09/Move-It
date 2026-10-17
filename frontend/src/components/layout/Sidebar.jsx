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
    <aside className="w-full md:w-56 shrink-0 bg-pine-900 text-paper border-b md:border-b-0 md:border-r border-pine-700">
      <div className="p-4 md:py-6">
        <div className="text-xs text-paper/40 font-semibold px-3 mb-2 hidden md:block">
          Operations
        </div>
        <nav className="flex md:flex-col overflow-x-auto md:overflow-visible gap-1 pb-2 md:pb-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded whitespace-nowrap transition-colors text-left ${
                  isActive
                    ? 'bg-pine-700 text-paper border-l-2 md:border-l-4 border-marigold'
                    : 'text-paper/70 hover:text-paper hover:bg-pine-700/50'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-marigold' : 'text-paper/60'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};
