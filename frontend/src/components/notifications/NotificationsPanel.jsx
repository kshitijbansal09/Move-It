import React, { useState } from 'react';
import { notificationsApi } from '../../api/notifications';
import { bookingsApi } from '../../api/bookings';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
export const NotificationsPanel = ({ notifications, loading, error, onRefresh }) => {
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const unread = notifications.filter(n => !n.is_read);
  const act = async (notification, cancel) => {
    setBusy(notification.notification_id); setActionError(null);
    try {
      if (cancel) await bookingsApi.cancel(notification.booking_id);
      await notificationsApi.read(notification.notification_id);
      await onRefresh();
    } catch(e) { setActionError(e.message || 'Unable to update your request.'); }
    finally { setBusy(null); }
  };
  return <section aria-labelledby="notifications-title" className="border border-line-grey bg-paper-raised text-left">
    <div className="p-4 border-b border-line-grey"><h2 id="notifications-title" className="font-display text-2xl font-bold">Notifications <span className="text-sm font-body text-ink-muted">{unread.length} unread</span></h2></div>
    {(error || actionError) && <p role="alert" className="p-4 text-sm text-rust-alert">{actionError || error}</p>}
    {loading ? <div className="p-4"><Spinner message="Loading notifications…" /></div> : !unread.length ? <p className="p-4 text-sm text-ink-muted">No unread notifications.</p> : unread.map(n => <div key={n.notification_id} className="p-4 border-b border-line-grey space-y-3"><p className="text-sm">{n.message}</p><div className="flex flex-wrap gap-2">{n.type === 'low_demand' ? <><Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => act(n, false)}>Keep my request</Button><Button size="sm" variant="danger" disabled={busy !== null || !n.booking_id} onClick={() => act(n, true)}>Cancel my request</Button></> : <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => act(n,false)}>Mark as read</Button>}</div></div>)}
  </section>;
};
