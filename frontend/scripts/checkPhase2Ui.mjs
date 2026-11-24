import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
try {
  const { SlotStrip, DemandView, AllocationView, AllocationLines } = await server.ssrLoadModule('/src/components/admin/ScheduleViews.jsx');
  const { DepartureDetails } = await server.ssrLoadModule('/src/components/booking/DepartureDetails.jsx');
  const { BookingStatusPanel } = await server.ssrLoadModule('/src/components/booking/BookingStatusPanel.jsx');
  const { NotificationsPanel } = await server.ssrLoadModule('/src/components/notifications/NotificationsPanel.jsx');
  const { RouteTracker } = await server.ssrLoadModule('/src/components/booking/RouteTracker.jsx');
  const slots=[{slot_id:1,label:'1:00 PM'},{slot_id:2,label:'4:00 PM'},{slot_id:3,label:'6:00 PM'}];
  const summary=[{slot_id:1,slot_label:'1:00 PM',station_id:9,station:'Rishikesh',request_count:3,seats_available:37,low_demand:true}];
  const render = (component,props) => renderToStaticMarkup(React.createElement(component,props));
  const strip=render(SlotStrip,{slots,summary}); for (const label of ['1:00 PM','4:00 PM','6:00 PM','3 requests','Low demand']) assert.ok(strip.includes(label));
  const demand=render(DemandView,{summary,hourly:[{station_id:9,station:'Rishikesh',hour_start:'12:00',hour_end:'13:00',request_count:3}]}); for (const label of ['Rishikesh','12:00','13:00','Low demand, 3 requests']) assert.ok(demand.includes(label));
  const trip={trip_id:1,route_name:'Campus → Rishikesh',reg_number:'UK07-1234',driver_name:'Dev Singh',capacity:40,seats_filled:3,status:'scheduled',slot_label:'1:00 PM'};
  const board=render(AllocationView,{board:{slots:[{...slots[0],trips:[trip]}],warnings:['Bus UK07-5678 has no trip at 4:00 PM.']}}); for (const label of ['Dev Singh','UK07-1234','3/40','has no trip']) assert.ok(board.includes(label));
  assert.ok(render(AllocationLines,{trips:[]}).includes('No trips this day'));
  const booking={slot_label:'4:00 PM',departure_time:new Date(Date.now()+130*60000).toISOString(),trip_status:'scheduled',vehicle_reg:'UK07-1234',driver_name:'Dev Singh',driver_contact:'+919811122334'};
  const details=render(DepartureDetails,{booking}); for (const label of ['Your bus leaves at 4:00 PM','Leaves in 2 h 10 min','UK07-1234','Dev Singh','+919811122334']) assert.ok(details.includes(label));
  assert.ok(render(DepartureDetails,{booking:{}}).includes('Departure details unavailable'));
  const notifications=render(NotificationsPanel,{notifications:[
    {notification_id:1,booking_id:2,type:'low_demand',booking_status:'awaiting_choice',is_read:0,message:'Only 3 requests so far.'},
    {notification_id:2,booking_id:3,type:'low_demand',booking_status:'cancelled',booking_expired:1,is_read:1,message:'A previous request.'},
    {notification_id:3,booking_id:4,type:'low_demand',booking_status:'cancelled',booking_expired:1,is_read:0,message:'An expired request.'},
  ],onOpenChoice:()=>{}});
  for (const label of ['Review ride options','Mark as read','Only 3 requests so far.','Request expired','2 unread']) assert.ok(notifications.includes(label));
  assert.ok(!notifications.includes('A previous request.'));
  const choice = render(BookingStatusPanel, { result: {
    outcome:'low_demand', booking:{destination:'Rishikesh',slot_label:'1:00 PM'}, demandCount:2, choice_ttl_minutes:30,
    options:{slots:[{slot_id:1,slot_label:'1:00 PM',scheduled:true,seats_available:3,request_count:2}],
    nearby:[{slot_id:2,slot_label:'4:00 PM',scheduled:true,seats_available:4,request_count:5,high_demand:true,
      station:'Doiwala',destination_station_id:6,distance_km:3.5}]},
  } });
  for (const label of ['Few riders so far for Rishikesh','Other times to Rishikesh','Doiwala','3.5','Enough riders',
    'Confirm this option','Cancel my request','30']) assert.ok(choice.includes(label));
  assert.ok(render(NotificationsPanel,{notifications:[]}).includes('No unread notifications'));
  assert.ok(render(NotificationsPanel,{notifications:[],error:'Unable to load notifications'}).includes('Unable to load notifications'));
  const doiwalaTrip = { trip_id: 10, start_station_name: 'Graphic Era University (Campus)', end_station_name: 'Doiwala' };
  const doiwalaRoute = { start_lat: '30.2675', start_lon: '77.9959', end_lat: 30.1798, end_lon: 78.1232 };
  const tracker = render(RouteTracker, { trip: doiwalaTrip, route: doiwalaRoute });
  for (const label of ['Graphic Era University (Campus)', 'Doiwala', 'Driving directions']) assert.ok(tracker.includes(label));
  assert.doesNotMatch(tracker, /Clock Tower|Prem Nagar|\+15 min/);
  const directions = new URL(tracker.match(/href="(https:\/\/www\.google\.com\/maps\/dir\/[^"]+)"/)[1].replaceAll('&amp;', '&'));
  assert.equal(directions.searchParams.get('origin'), '30.2675,77.9959');
  assert.equal(directions.searchParams.get('destination'), '30.1798,78.1232');
  assert.equal(directions.searchParams.get('travelmode'), 'driving');
  assert.equal(directions.searchParams.has('waypoints'), false);
  assert.ok(choice.includes('Keep my original request'));
  const waiting = render(BookingStatusPanel, {result: {
    outcome:'waiting_original', booking:{destination:'Doiwala', preferred_departure:'2030-10-17T14:15:00+05:30', original_review_at:'2030-10-10T12:30:00+05:30'},
  }});
  assert.match(waiting, /Original request saved.*counts toward demand/);
  const offered = render(BookingStatusPanel, {result: {
    outcome:'original_offer', booking:{destination:'Doiwala', preferred_departure:'2030-10-17T14:15:00+05:30'},
    offer:{departure_time:'2030-10-17T14:25:00+05:30', reg_number:'UK07-test'},
  }});
  assert.ok(offered.includes('Confirm this ride'));
  const incompleteTracker = render(RouteTracker, { trip: doiwalaTrip, route: { ...doiwalaRoute, end_lat: null } });
  assert.ok(incompleteTracker.includes('Driving directions are unavailable'));
  assert.ok(!incompleteTracker.includes('/maps/dir/'));
  console.log('Passed admin, departure, notification, and route tracking rendering checks.');
} finally { await server.close(); }
