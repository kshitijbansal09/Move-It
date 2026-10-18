import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
try {
  const { SlotStrip, DemandView, AllocationView, AllocationLines } = await server.ssrLoadModule('/src/components/admin/ScheduleViews.jsx');
  const { DepartureDetails } = await server.ssrLoadModule('/src/components/booking/DepartureDetails.jsx');
  const { NotificationsPanel } = await server.ssrLoadModule('/src/components/notifications/NotificationsPanel.jsx');
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
  const notifications=render(NotificationsPanel,{notifications:[{notification_id:1,booking_id:2,type:'low_demand',is_read:0,message:'Only 3 requests so far.'}],onRefresh:()=>{}}); for (const label of ['Keep my request','Cancel my request','Only 3 requests so far.','1 unread']) assert.ok(notifications.includes(label));
  assert.ok(render(NotificationsPanel,{notifications:[],onRefresh:()=>{}}).includes('No unread notifications'));
  assert.ok(render(NotificationsPanel,{notifications:[],error:'Unable to load notifications',onRefresh:()=>{}}).includes('Unable to load notifications'));
  console.log('Passed Phase 2 admin, departure, and notification rendering checks.');
} finally { await server.close(); }
