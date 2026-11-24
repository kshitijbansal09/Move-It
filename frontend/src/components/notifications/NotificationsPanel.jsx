import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { notificationsApi } from '../../api/notifications';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';

export const NotificationsPanel = ({ notifications, loading, error, onOpenChoice }) => {
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [readIds, setReadIds] = useState(() => new Set());
  const unread = notifications.filter(notification => !notification.is_read && !readIds.has(notification.notification_id));

  const markRead = async notification => {
    setBusy(notification.notification_id);
    setActionError(null);
    try {
      await notificationsApi.read(notification.notification_id);
      setReadIds(ids => new Set(ids).add(notification.notification_id));
    } catch (failure) {
      setActionError(failure.message || 'Unable to mark the notification as read.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="notifications-title" className="surface overflow-hidden text-left">
      <div className="flex items-center justify-between flex-wrap gap-2 p-5 border-b border-line-grey">
        <h2 id="notifications-title" className="flex items-center gap-2.5 font-display text-xl font-bold">
          <span className="panel-heading-icon"><Bell size={18} aria-hidden="true" /></span>
          Notifications
        </h2>
        <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-ink-muted" aria-live="polite">{unread.length} unread</span>
      </div>
      {(error || actionError) && <p role="alert" className="p-4 text-sm text-rust-alert">{actionError || error}</p>}
      {loading ? <div className="p-4"><Spinner message="Loading notifications..." /></div> : (
        <>
          {!unread.length && <p className="p-5 text-sm text-ink-muted">No unread notifications.</p>}
          {unread.map(notification => {
            const low = ['low_demand', 'ride_options'].includes(notification.type);
            const originalOffer = notification.type === 'original_ride_available';
            const choice = (low || originalOffer) && notification.booking_status === 'awaiting_choice';
            return (
              <div key={notification.notification_id} className="px-5 py-4 border-b last:border-b-0 border-line-grey space-y-2">
                <p className="text-sm">{notification.message}</p>
                {low && Boolean(notification.booking_expired) && <p className="text-xs text-rust-alert">Request expired</p>}
                <div className="flex flex-wrap gap-2">
                  {choice && <Button size="sm" variant="secondary" onClick={() => onOpenChoice(notification.booking_id)} >{originalOffer ? 'View available ride' : 'Review ride options'}</Button>}
                  <Button size="sm" variant="ghost" disabled={busy !== null}
                    onClick={() => markRead(notification)}>Mark as read</Button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
};
