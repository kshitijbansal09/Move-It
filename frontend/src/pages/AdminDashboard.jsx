import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavBar } from '../components/layout/NavBar';
import { Sidebar } from '../components/layout/Sidebar';
import { StatBlock } from '../components/admin/StatBlock';
import { DataTable } from '../components/admin/DataTable';
import { EntityFormModal } from '../components/admin/EntityFormModal';
import { StatusDot } from '../components/common/StatusDot';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import { Button } from '../components/common/Button';
import { stationsApi } from '../api/stations';
import { vehiclesApi } from '../api/vehicles';
import { driversApi } from '../api/drivers';
import { routesApi } from '../api/routes';
import { tripsApi } from '../api/trips';
import { adminApi } from '../api/admin';
import { campusDate } from '../utils/departure';
import { SlotStrip, DemandView, AllocationView, AllocationLines } from '../components/admin/ScheduleViews';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PlayCircle, Filter, MapPin, ExternalLink } from 'lucide-react';
import { getStationLocation, POPULAR_DEHRADUN_HUBS } from '../utils/stationLocations';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const loadVersion = useRef(0);
  const [selectedDate, setSelectedDate] = useState(campusDate);
  const [slots, setSlots] = useState([]);
  const [summary, setSummary] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [board, setBoard] = useState({ slots: [], warnings: [] });
  const [fleet, setFleet] = useState([]);
  const [driverStatus, setDriverStatus] = useState([]);
  const [bookingStationFilter, setBookingStationFilter] = useState('');
  const [bookingSlotFilter, setBookingSlotFilter] = useState('');

  // Entity states
  const [stations, setStations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [trips, setTrips] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  // Modal form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'station' | 'vehicle' | 'driver' | 'route' | 'trip'
  const [editingItem, setEditingItem] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Form Fields
  const [stationForm, setStationForm] = useState({ name: '', landmark: '', zone: '', latitude: '', longitude: '' });
  const [vehicleForm, setVehicleForm] = useState({ reg_number: '', capacity: '20', status: 'active' });
  const [driverForm, setDriverForm] = useState({ name: '', license_no: '', contact_info: '' });
  const [routeForm, setRouteForm] = useState({ route_name: '', start_station_id: '', end_station_id: '' });
  const [tripForm, setTripForm] = useState({
    vehicle_id: '',
    route_id: '',
    driver_id: '',
    trip_date: campusDate(),
    slot_id: '',
    status: 'scheduled',
  });

  // Booking table filter
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');

  // Load all system data
  const loadAllData = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setErrorNotice(null);
    try {
      const [stData, vData, dData, rData, tData, bData, slotData, summaryData, hourlyData, boardData, fleetData, driverData] = await Promise.all([
        stationsApi.getAll(), vehiclesApi.getAll(), driversApi.getAll(), routesApi.getAll(),
        tripsApi.getAll({ date: selectedDate }),
        adminApi.bookings({ date: selectedDate, station_id: bookingStationFilter || undefined, slot_id: bookingSlotFilter || undefined, status: bookingStatusFilter === 'all' ? undefined : bookingStatusFilter }),
        adminApi.slots(), adminApi.summary(selectedDate), adminApi.hourly(selectedDate),
        adminApi.allocations(selectedDate), adminApi.fleet(selectedDate), adminApi.drivers(selectedDate),
      ]);

      if (version !== loadVersion.current) return;
      setSlots(slotData); setSummary(summaryData); setHourly(hourlyData); setBoard(boardData); setFleet(fleetData); setDriverStatus(driverData);
      setStations(Array.isArray(stData) ? stData : []);
      setVehicles(Array.isArray(vData) ? vData : []);
      setDrivers(Array.isArray(dData) ? dData : []);
      setRoutes(Array.isArray(rData) ? rData : []);
      setTrips(Array.isArray(tData) ? tData : []);
      setBookings(Array.isArray(bData) ? bData : []);
    } catch (err) {
      if (version !== loadVersion.current) return;
      console.error('[Move It Admin] Data load failed:', err);
      setErrorNotice(err.message || 'Unable to load transit data. Please refresh.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [selectedDate, bookingStationFilter, bookingSlotFilter, bookingStatusFilter]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Compute overview stats
  const stats = useMemo(() => {
    const activeTripsCount = trips.filter((t) => t.status === 'scheduled' || t.status === 'departed').length;
    const pendingBookingsCount = bookings.filter((b) => b.status === 'pending').length;

    let totalSeats = 0;
    let filledSeats = 0;
    trips.forEach((t) => {
      const cap = t.vehicle_capacity || 20;
      totalSeats += cap;
      filledSeats += t.seats_filled || 0;
    });

    const avgOccupancy = totalSeats > 0 ? Math.round((filledSeats / totalSeats) * 100) : 0;

    return {
      activeTripsCount,
      avgOccupancy,
      pendingBookingsCount,
      fleetCount: vehicles.length,
    };
  }, [trips, bookings, vehicles]);

  // Compute route occupancy for Recharts Bar Chart
  const routeOccupancyData = useMemo(() => {
    const map = {};
    trips.forEach((t) => {
      const rName = t.route_name || 'Corridor';
      if (!map[rName]) {
        map[rName] = { totalSeats: 0, filledSeats: 0 };
      }
      map[rName].totalSeats += t.vehicle_capacity || 20;
      map[rName].filledSeats += t.seats_filled || 0;
    });

    return Object.entries(map).map(([name, data]) => ({
      name: name.length > 18 ? name.slice(0, 18) + '...' : name,
      fullName: name,
      occupancy: data.totalSeats > 0 ? Math.round((data.filledSeats / data.totalSeats) * 100) : 0,
      seats: `${data.filledSeats}/${data.totalSeats}`,
    }));
  }, [trips]);

  // Trigger FCFS / Priority scheduling engine for a trip
  const handleScheduleBatch = async (tripId) => {
    setErrorNotice(null);
    setSuccessNotice(null);
    try {
      await tripsApi.scheduleBatch(tripId);
      setSuccessNotice(`Priority & FCFS scheduling engine executed for Trip #${tripId}. Seat allocations updated.`);
      await loadAllData();
    } catch (err) {
      console.error('[Move It] Batch schedule failed:', err);
      setErrorNotice(err.message || `Batch scheduling execution error on Trip #${tripId}`);
    }
  };

  // Open Add Modal
  const handleAddNew = (type) => {
    setModalType(type);
    setEditingItem(null);
    setFormError(null);

    if (type === 'station') {
      setStationForm({
        name: '',
        landmark: '',
        zone: 'Campus Hub',
        latitude: '30.267500',
        longitude: '77.995900',
      });
    }
    if (type === 'vehicle') setVehicleForm({ reg_number: '', capacity: '20', status: 'active' });
    if (type === 'driver') setDriverForm({ name: '', license_no: '', contact_info: '+91' });
    if (type === 'route') {
      setRouteForm({
        route_name: '',
        start_station_id: stations[0]?.station_id ? String(stations[0].station_id) : '',
        end_station_id: stations[1]?.station_id ? String(stations[1].station_id) : '',
      });
    }
    if (type === 'trip') {
      setTripForm({
        vehicle_id: vehicles.find(v => v.status === 'active')?.vehicle_id ? String(vehicles.find(v => v.status === 'active').vehicle_id) : '',
        route_id: routes[0]?.route_id ? String(routes[0].route_id) : '',
        driver_id: drivers[0]?.driver_id ? String(drivers[0].driver_id) : '',
        trip_date: selectedDate,
        slot_id: slots[0]?.slot_id ? String(slots[0].slot_id) : '',
        status: 'scheduled',
      });
    }

    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleEdit = (type, item) => {
    setModalType(type);
    setEditingItem(item);
    setFormError(null);

    if (type === 'station') {
      const loc = getStationLocation(item);
      setStationForm({
        name: item.name,
        landmark: loc.landmark,
        zone: loc.zone,
        latitude: String(item.latitude),
        longitude: String(item.longitude),
      });
    }
    if (type === 'vehicle') {
      setVehicleForm({
        reg_number: item.reg_number,
        capacity: String(item.capacity),
        status: item.status,
      });
    }
    if (type === 'driver') {
      setDriverForm({
        name: item.name,
        license_no: item.license_no,
        contact_info: item.contact_info,
      });
    }
    if (type === 'route') {
      setRouteForm({
        route_name: item.route_name,
        start_station_id: String(item.start_station_id),
        end_station_id: String(item.end_station_id),
      });
    }
    if (type === 'trip') {
      setTripForm({
        vehicle_id: String(item.vehicle_id),
        route_id: String(item.route_id),
        driver_id: String(item.driver_id),
        trip_date: item.trip_date || selectedDate,
        slot_id: item.slot_id ? String(item.slot_id) : '',
        status: item.status,
      });
    }

    setIsModalOpen(true);
  };

  // Delete Entity Handler
  const handleDelete = async (type, id) => {
    setErrorNotice(null);
    setSuccessNotice(null);
    try {
      if (type === 'station') await stationsApi.delete(id);
      if (type === 'vehicle') await vehiclesApi.delete(id);
      if (type === 'driver') await driversApi.delete(id);
      if (type === 'route') await routesApi.delete(id);
      if (type === 'trip') await tripsApi.delete(id);

      setSuccessNotice(`Item #${id} removed successfully from transit database.`);
      await loadAllData();
    } catch (err) {
      console.error(`[Move It] Delete ${type} failed:`, err);
      setErrorNotice(err.message || `Unable to delete item #${id}. Integrity constraints may apply.`);
    }
  };

  // Submit Modal Form (Add or Edit)
  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);
    setErrorNotice(null);
    setSuccessNotice(null);

    try {
      if (modalType === 'station') {
        const payload = {
          name: stationForm.name.trim(),
          latitude: parseFloat(stationForm.latitude),
          longitude: parseFloat(stationForm.longitude),
        };
        if (editingItem) {
          await stationsApi.update(editingItem.station_id, payload);
        } else {
          await stationsApi.create(payload);
        }
      } else if (modalType === 'vehicle') {
        const payload = {
          reg_number: vehicleForm.reg_number.trim(),
          capacity: parseInt(vehicleForm.capacity, 10),
          status: vehicleForm.status,
        };
        if (editingItem) {
          await vehiclesApi.update(editingItem.vehicle_id, payload);
        } else {
          await vehiclesApi.create(payload);
        }
      } else if (modalType === 'driver') {
        const payload = {
          name: driverForm.name.trim(),
          license_no: driverForm.license_no.trim(),
          contact_info: driverForm.contact_info.trim(),
        };
        if (editingItem) {
          await driversApi.update(editingItem.driver_id, payload);
        } else {
          await driversApi.create(payload);
        }
      } else if (modalType === 'route') {
        const payload = {
          route_name: routeForm.route_name.trim(),
          start_station_id: parseInt(routeForm.start_station_id, 10),
          end_station_id: parseInt(routeForm.end_station_id, 10),
        };
        if (editingItem) {
          await routesApi.update(editingItem.route_id, payload);
        } else {
          await routesApi.create(payload);
        }
      } else if (modalType === 'trip') {
        const payload = {
          vehicle_id: parseInt(tripForm.vehicle_id, 10),
          route_id: parseInt(tripForm.route_id, 10),
          driver_id: parseInt(tripForm.driver_id, 10),
          trip_date: tripForm.trip_date,
          slot_id: Number(tripForm.slot_id),
          status: tripForm.status,
        };
        if (editingItem) {
          await tripsApi.update(editingItem.trip_id, payload);
        } else {
          await tripsApi.create(payload);
        }
      }

      setIsModalOpen(false);
      setSuccessNotice(`${modalType} record saved successfully.`);
      await loadAllData();
    } catch (err) {
      console.error('[Move It Admin] Save error:', err);
      setFormError(err.message || 'Operation failed. Verify data validity.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Filtered bookings
  const filteredBookings = bookings.filter((b) => {
    if (bookingStatusFilter === 'all') return true;
    return b.status === bookingStatusFilter;
  });

  return (
    <div className="min-h-screen bg-paper text-pine-900 flex flex-col">
      <NavBar />

      <div className="flex-1 flex flex-col md:flex-row">
        {/* Left Sidebar */}
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

        {/* Admin Content Area */}
        <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="flex flex-wrap items-end gap-4 border-b border-line-grey pb-4">
            <Input label="Schedule date" type="date" value={selectedDate} onChange={e => e.target.value && setSelectedDate(e.target.value)} required />
            <Button variant="secondary" onClick={loadAllData} loading={loading}>Refresh board</Button>
          </div>
          {/* Header notifications */}
          {errorNotice && (
            <div className="p-3 bg-paper-raised border border-rust-alert/40 text-rust-alert text-xs font-medium rounded flex items-center justify-between text-left">
              <span>{errorNotice}</span>
              <button onClick={() => setErrorNotice(null)} className="underline text-ink-muted">
                Dismiss
              </button>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-paper-raised border border-success-moss/40 text-success-moss text-xs font-medium rounded flex items-center justify-between text-left">
              <span>{successNotice}</span>
              <button onClick={() => setSuccessNotice(null)} className="underline text-ink-muted">
                Dismiss
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 text-left">
              <div className="border-b border-line-grey pb-3">
                <h1 className="font-display font-bold text-3xl sm:text-4xl tracking-condensed text-pine-900 leading-tight">
                  Transit operations overview
                </h1>
                <p className="text-xs text-ink-muted mt-1">
                  Graphic Era institutional fleet telemetry and corridor occupancy metrics
                </p>
              </div>

              <SlotStrip slots={slots} summary={summary} loading={loading} />

              {/* Big Barlow Condensed Stats (No Icon Boxes!) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatBlock
                  value={stats.activeTripsCount}
                  label="Active trips on selected date"
                  subtext="Scheduled or in-transit"
                />
                <StatBlock
                  value={`${stats.avgOccupancy}%`}
                  label="Average occupancy"
                  subtext="Across scheduled runs"
                />
                <StatBlock
                  value={stats.pendingBookingsCount}
                  label="Pending bookings"
                  subtext="Awaiting seat assignment"
                />
                <StatBlock
                  value={stats.fleetCount}
                  label="Registered vehicles"
                  subtext="Buses, mini-buses, shuttles"
                />
              </div>

              {/* Occupancy Per Route Recharts Bar Chart */}
              <div className="border border-line-grey bg-paper-raised p-5 sm:p-6 rounded">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <h2 className="font-display font-bold text-2xl tracking-condensed text-pine-900 leading-tight">
                      Average occupancy per corridor
                    </h2>
                    <p className="text-xs text-ink-muted">
                      Ratio of reserved seats against fleet vehicle capacities
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <span className="w-3 h-3 bg-marigold rounded-xs" />
                    <span>Average seat occupancy %</span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  {routeOccupancyData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-ink-muted">
                      No active trip corridor data to graph.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={routeOccupancyData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#CBCFC7" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: '#5B655F', fontSize: 12, fontFamily: 'IBM Plex Sans' }}
                          tickLine={false}
                          interval={0}
                        />
                        <YAxis
                          domain={[0, 100]}
                          unit="%"
                          tick={{ fill: '#5B655F', fontSize: 11, fontFamily: 'IBM Plex Sans' }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#CBCFC7',
                            borderRadius: '4px',
                            fontSize: '12px',
                            color: '#16302A',
                          }}
                          formatter={(value, name, item) => [
                            `${value}% (${item.payload.seats} seats)`,
                            'Occupancy',
                          ]}
                          labelFormatter={(label, items) => items[0]?.payload?.fullName || label}
                        />
                        <Bar
                          dataKey="occupancy"
                          fill="#E8A23B"
                          radius={[2, 2, 0, 0]}
                          maxBarSize={48}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'demand' && <DemandView hourly={hourly} summary={summary} loading={loading} />}
          {activeTab === 'allocations' && <AllocationView board={board} loading={loading} />}
          {activeTab === 'fleet' && <DataTable title="Fleet allocations" data={fleet} loading={loading}
            onAddNew={() => handleAddNew('vehicle')} onEdit={item => handleEdit('vehicle', item)} onDelete={id => handleDelete('vehicle', id)}
            columns={[{header:'Bus',accessor:'reg_number'},{header:'Capacity',accessor:'capacity'},{header:'Vehicle status',render:v => <StatusDot status={v.status} />},{header:'Today’s status',accessor:'fleet_status'},{header:'Allocations',render:v => <AllocationLines trips={v.allocations} />}]} />}

          {/* TAB 2: STATIONS */}
          {activeTab === 'stations' && (
            <DataTable
              title="Transit stations"
              subtitle="Designated commuter hubs, prominent landmarks, and valley transit corridors"
              data={stations}
              loading={loading}
              onAddNew={() => handleAddNew('station')}
              onEdit={(item) => handleEdit('station', item)}
              onDelete={(id) => handleDelete('station', id)}
              columns={[
                { header: 'ID', accessor: 'station_id' },
                {
                  header: 'Station name',
                  accessor: 'name',
                  render: (s) => (
                    <span className="font-display font-bold text-base tracking-condensed text-pine-900">
                      {s.name}
                    </span>
                  ),
                },
                {
                  header: 'Exact location & landmark',
                  render: (s) => {
                    const loc = getStationLocation(s);
                    return (
                      <div className="max-w-md">
                        <div className="font-medium text-pine-900 text-xs">
                          {loc.landmark}
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          {loc.description}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  header: 'Corridor zone',
                  render: (s) => {
                    const loc = getStationLocation(s);
                    return (
                      <span className="inline-block text-[11px] font-medium text-indigo-500 bg-paper px-2 py-0.5 rounded border border-line-grey">
                        {loc.zone}
                      </span>
                    );
                  },
                },
                {
                  header: 'Map access',
                  render: (s) => {
                    const loc = getStationLocation(s);
                    return (
                      <div className="flex flex-col gap-0.5">
                        <a
                          href={loc.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-marigold-dark hover:text-pine-900 font-medium hover:underline"
                          title="Open exact location in Google Maps"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>View on Map</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                        <span className="font-mono text-[10px] text-ink-muted/80">
                          {parseFloat(s.latitude).toFixed(4)}, {parseFloat(s.longitude).toFixed(4)}
                        </span>
                      </div>
                    );
                  },
                },
              ]}
            />
          )}

          {/* TAB 3: VEHICLES */}
          {activeTab === 'vehicles' && (
            <DataTable
              title="Fleet vehicles"
              subtitle="Campus transport vehicles, seating capacities, and service states"
              data={vehicles}
              loading={loading}
              onAddNew={() => handleAddNew('vehicle')}
              onEdit={(item) => handleEdit('vehicle', item)}
              onDelete={(id) => handleDelete('vehicle', id)}
              columns={[
                {
                  header: 'Registration',
                  accessor: 'reg_number',
                  render: (v) => (
                    <span className="font-mono font-medium text-sm text-pine-900">
                      {v.reg_number}
                    </span>
                  ),
                },
                {
                  header: 'Capacity',
                  accessor: 'capacity',
                  render: (v) => (
                    <span className="font-display font-bold text-base tracking-condensed">
                      {v.capacity} seats
                    </span>
                  ),
                },
                {
                  header: 'Status',
                  accessor: 'status',
                  render: (v) => <StatusDot status={v.status} />,
                },
              ]}
            />
          )}

          {/* TAB 4: DRIVERS */}
          {activeTab === 'drivers' && (
            <DataTable
              title="Transit drivers"
              subtitle="Authorized university drivers and direct dispatch contact details"
              data={driverStatus}
              loading={loading}
              onAddNew={() => handleAddNew('driver')}
              onEdit={(item) => handleEdit('driver', item)}
              onDelete={(id) => handleDelete('driver', id)}
              columns={[
                {
                  header: 'Driver name',
                  accessor: 'name',
                  render: (d) => (
                    <span className="font-display font-bold text-base tracking-condensed text-pine-900">
                      {d.name}
                    </span>
                  ),
                },
                {
                  header: 'License number',
                  accessor: 'license_no',
                  render: (d) => <span className="font-mono text-xs">{d.license_no}</span>,
                },
                {
                  header: 'Contact',
                  accessor: 'contact_info',
                  render: (d) => <span className="font-mono text-xs">{d.contact_info}</span>,
                },
                { header: 'Status today', accessor: 'derived_status' },
                { header: 'Trips today', render: d => <AllocationLines trips={d.trips} /> },
              ]}
            />
          )}

          {/* TAB 5: ROUTES */}
          {activeTab === 'routes' && (
            <DataTable
              title="Transit corridors"
              subtitle="Fixed routes connecting campus and valley pickup stations"
              data={routes}
              loading={loading}
              onAddNew={() => handleAddNew('route')}
              onEdit={(item) => handleEdit('route', item)}
              onDelete={(id) => handleDelete('route', id)}
              columns={[
                {
                  header: 'Corridor name',
                  accessor: 'route_name',
                  render: (r) => (
                    <span className="font-display font-bold text-base tracking-condensed text-pine-900">
                      {r.route_name}
                    </span>
                  ),
                },
                { header: 'Origin hub', accessor: 'start_station_name' },
                { header: 'Destination hub', accessor: 'end_station_name' },
              ]}
            />
          )}

          {/* TAB 6: TRIPS */}
          {activeTab === 'trips' && (
            <DataTable
              title="Scheduled trips"
              subtitle="Concrete transit runs combining vehicle, corridor, and driver"
              data={trips}
              loading={loading}
              onAddNew={() => handleAddNew('trip')}
              onEdit={(item) => handleEdit('trip', item)}
              onDelete={(id) => handleDelete('trip', id)}
              columns={[
                { header: 'Trip ID', accessor: 'trip_id' },
                {
                  header: 'Corridor',
                  accessor: 'route_name',
                  render: (t) => (
                    <span className="font-display font-bold text-base tracking-condensed text-pine-900">
                      {t.route_name}
                    </span>
                  ),
                },
                {
                  header: 'Departure time',
                  render: (t) => (
                    <div>
                      <div className="font-display font-bold text-sm tracking-condensed">
                        {t.departure_time
                          ? new Date(t.departure_time).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit', timeZone: 'Asia/Kolkata',
                            })
                          : '--:--'}
                      </div>
                      <div className="text-[11px] text-ink-muted">
                        {t.departure_time ? new Date(t.departure_time).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
                      </div>
                    </div>
                  ),
                },
                {
                  header: 'Vehicle',
                  render: (t) => <span className="font-mono text-xs">{t.vehicle_reg}</span>,
                },
                {
                  header: 'Driver',
                  accessor: 'driver_name',
                },
                {
                  header: 'Occupancy',
                  render: (t) => (
                    <span className="font-mono text-xs">
                      {t.seats_filled || 0} / {t.vehicle_capacity || 20}
                    </span>
                  ),
                },
                {
                  header: 'Status',
                  render: (t) => <StatusDot status={t.status} isLive={t.status === 'scheduled'} />,
                },
                {
                  header: 'Algorithm batch',
                  render: (t) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-indigo-500 hover:text-pine-900"
                      onClick={() => handleScheduleBatch(t.trip_id)}
                      title="Run FCFS and Priority Queue scheduling engine on waiting requests"
                    >
                      <PlayCircle className="w-3.5 h-3.5 mr-1" />
                      <span>Run FCFS/Priority</span>
                    </Button>
                  ),
                },
              ]}
            />
          )}

          {/* TAB 7: BOOKINGS (Read-only System-wide) */}
          {activeTab === 'bookings' && (
            <DataTable
              title="Commuter bookings"
              subtitle="System-wide reservations, priority tiers, and confirmation audit trail"
              data={filteredBookings}
              loading={loading}
              filterElement={<div className="flex flex-wrap gap-2">
                <Select label="Destination filter" value={bookingStationFilter} onChange={e => setBookingStationFilter(e.target.value)} placeholder={null} options={[{value:'',label:'All destinations'}, ...stations.map(s => ({value:String(s.station_id),label:s.name}))]} />
                <Select label="Slot filter" value={bookingSlotFilter} onChange={e => setBookingSlotFilter(e.target.value)} placeholder={null} options={[{value:'',label:'All slots'}, ...slots.map(s => ({value:String(s.slot_id),label:s.label}))]} />
                <Select label="Status filter" value={bookingStatusFilter} onChange={e => setBookingStatusFilter(e.target.value)} placeholder={null} options={['all','confirmed','pending','cancelled','rejected'].map(value => ({value,label:value === 'all' ? 'All statuses' : value[0].toUpperCase()+value.slice(1)}))} />
              </div>}
              columns={[
                { header: 'Ref #', accessor: 'booking_id' },
                { header: 'Requested time', accessor: 'requested_time' },
                { header: 'Assigned slot', accessor: 'slot_label' },
                { header: 'Trip', accessor: 'trip_id' },
                { header: 'Bus', accessor: 'vehicle_reg' },
                { header: 'Driver', accessor: 'driver_name' },
                {
                  header: 'Commuter',
                  render: (b) => (
                    <div>
                      <div className="font-medium text-pine-900">{b.user_name}</div>
                      <div className="text-[11px] text-ink-muted capitalize">
                        {b.user_role} • {b.user_contact}
                      </div>
                    </div>
                  ),
                },
                {
                  header: 'Destination',
                  render: (b) => (
                    <div>
                      <div className="font-display font-bold text-sm tracking-condensed text-pine-900">
                        {b.end_station_name}
                      </div>
                      <div className="text-[11px] text-ink-muted">{b.route_name}</div>
                    </div>
                  ),
                },
                {
                  header: 'Departure',
                  render: (b) => (
                    <div className="font-mono text-xs">
                      {b.departure_time
                        ? new Date(b.departure_time).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit', timeZone: 'Asia/Kolkata',
                          })
                        : '--:--'}
                    </div>
                  ),
                },
                {
                  header: 'Priority',
                  render: (b) => (
                    <span
                      className={`text-xs ${
                        b.priority === 'urgent' ? 'text-indigo-500 font-semibold' : 'text-ink-muted'
                      }`}
                    >
                      {b.priority === 'urgent' ? 'Urgent' : 'Normal'}
                    </span>
                  ),
                },
                {
                  header: 'Status',
                  render: (b) => <StatusDot status={b.status} isLive={b.status === 'confirmed'} />,
                },
              ]}
            />
          )}
        </main>
      </div>

      {/* Entity Modal Dialog for CRUD */}
      <EntityFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? `Edit ${modalType}` : `Add new ${modalType}`}
        subtitle={`Update transit ${modalType} records in the MySQL database`}
        onSubmit={handleModalSubmit}
        isSubmitting={formSubmitting}
        error={formError}
      >
        {/* Station Form Fields */}
        {modalType === 'station' && (
          <div className="space-y-3">
            {!editingItem && (
              <div className="bg-paper p-3 rounded border border-line-grey text-xs space-y-1.5 text-left">
                <label className="font-medium text-pine-900 block text-xs">
                  Quick-select popular valley hub (Auto-fills landmark & GPS coordinates)
                </label>
                <select
                  className="w-full px-2.5 py-1.5 text-xs bg-paper-raised text-pine-900 border border-line-grey rounded focus:outline-none focus:border-marigold"
                  onChange={(e) => {
                    const selected = POPULAR_DEHRADUN_HUBS.find((h) => h.name === e.target.value);
                    if (selected) {
                      setStationForm({
                        name: selected.name,
                        landmark: selected.landmark,
                        zone: selected.zone,
                        latitude: String(selected.lat),
                        longitude: String(selected.lon),
                      });
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a major valley hub (ISBT, Ballupur, Jakhan, Railway Station...)
                  </option>
                  {POPULAR_DEHRADUN_HUBS.map((hub) => (
                    <option key={hub.name} value={hub.name}>
                      {hub.name} — {hub.landmark} ({hub.zone})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-muted">
                  Select a known Dehradun hub to automatically configure GPS coordinates without memorizing numbers.
                </p>
              </div>
            )}

            <Input
              label="Station name"
              value={stationForm.name}
              onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })}
              placeholder="e.g. Ballupur Chowk"
              required
            />

            <Input
              label="Exact physical location & landmark"
              value={stationForm.landmark || ''}
              onChange={(e) => setStationForm({ ...stationForm, landmark: e.target.value })}
              placeholder="e.g. GMS Road & Chakrata Road Crossing, Near Synergy Hospital"
              helperText="Recognizable street address / crossing for commuters"
            />

            <div className="p-2.5 bg-paper rounded border border-line-grey space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-pine-900">
                  GPS Coordinates (Auto-resolved for Haversine distance engine)
                </span>
                <span className="font-mono text-ink-muted">
                  {stationForm.latitude || '30.2675'}, {stationForm.longitude || '77.9959'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Latitude"
                  value={stationForm.latitude}
                  onChange={(e) => setStationForm({ ...stationForm, latitude: e.target.value })}
                  placeholder="30.267500"
                  required
                />
                <Input
                  label="Longitude"
                  value={stationForm.longitude}
                  onChange={(e) => setStationForm({ ...stationForm, longitude: e.target.value })}
                  placeholder="77.995900"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* Vehicle Form Fields */}
        {modalType === 'vehicle' && (
          <>
            <Input
              label="Registration plate number"
              value={vehicleForm.reg_number}
              onChange={(e) => setVehicleForm({ ...vehicleForm, reg_number: e.target.value })}
              placeholder="UK07-PA-1010"
              required
            />
            <Input
              label="Seating capacity"
              type="number"
              min="1"
              max="100"
              value={vehicleForm.capacity}
              onChange={(e) => setVehicleForm({ ...vehicleForm, capacity: e.target.value })}
              required
            />
            <Select
              label="Maintenance status"
              value={vehicleForm.status}
              onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value })}
              options={[
                { value: 'active', label: 'Active in service' },
                { value: 'maintenance', label: 'In maintenance workshop' },
                { value: 'inactive', label: 'Decommissioned / Inactive' },
              ]}
            />
          </>
        )}

        {/* Driver Form Fields */}
        {modalType === 'driver' && (
          <>
            <Input
              label="Driver full name"
              value={driverForm.name}
              onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
              placeholder="e.g. Ramesh Chand"
              required
            />
            <Input
              label="Commercial driver license number"
              value={driverForm.license_no}
              onChange={(e) => setDriverForm({ ...driverForm, license_no: e.target.value })}
              placeholder="UK07-2019-0012345"
              required
            />
            <Input
              label="Contact phone (E.164 WhatsApp)"
              value={driverForm.contact_info}
              onChange={(e) => setDriverForm({ ...driverForm, contact_info: e.target.value })}
              placeholder="+919811122334"
              required
            />
          </>
        )}

        {/* Route Form Fields */}
        {modalType === 'route' && (
          <>
            <Input
              label="Corridor route name"
              value={routeForm.route_name}
              onChange={(e) => setRouteForm({ ...routeForm, route_name: e.target.value })}
              placeholder="Campus – Clock Tower Express"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Origin station"
                value={routeForm.start_station_id}
                onChange={(e) => setRouteForm({ ...routeForm, start_station_id: e.target.value })}
                options={stations.map((s) => ({ value: String(s.station_id), label: s.name }))}
                required
              />
              <Select
                label="Destination station"
                value={routeForm.end_station_id}
                onChange={(e) => setRouteForm({ ...routeForm, end_station_id: e.target.value })}
                options={stations.map((s) => ({ value: String(s.station_id), label: s.name }))}
                required
              />
            </div>
          </>
        )}

        {/* Trip Form Fields */}
        {modalType === 'trip' && (
          <>
            <Select
              label="Transit corridor route"
              value={tripForm.route_id}
              onChange={(e) => setTripForm({ ...tripForm, route_id: e.target.value })}
              options={routes.map((r) => ({ value: String(r.route_id), label: r.route_name }))}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Assigned vehicle"
                value={tripForm.vehicle_id}
                onChange={(e) => setTripForm({ ...tripForm, vehicle_id: e.target.value })}
                options={vehicles
                  .filter((v) => v.status === 'active' || (editingItem && String(v.vehicle_id) === String(editingItem.vehicle_id)))
                  .map((v) => ({
                    value: String(v.vehicle_id),
                    label: `${v.reg_number} (${v.capacity} seats)`,
                  }))}
                required
              />
              <Select
                label="Assigned driver"
                value={tripForm.driver_id}
                onChange={(e) => setTripForm({ ...tripForm, driver_id: e.target.value })}
                options={drivers.map((d) => ({ value: String(d.driver_id), label: d.name }))}
                required
              />
            </div>
            <Input label="Departure date" type="date" value={tripForm.trip_date} onChange={e => setTripForm({ ...tripForm, trip_date: e.target.value })} required />
            <Select label="Departure slot" value={tripForm.slot_id} onChange={e => setTripForm({ ...tripForm, slot_id: e.target.value })} options={slots.map(s => ({ value: String(s.slot_id), label: s.label }))} required />
            <Select
              label="Trip status"
              value={tripForm.status}
              onChange={(e) => setTripForm({ ...tripForm, status: e.target.value })}
              options={[
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'departed', label: 'Departed' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </>
        )}
      </EntityFormModal>
    </div>
  );
};
