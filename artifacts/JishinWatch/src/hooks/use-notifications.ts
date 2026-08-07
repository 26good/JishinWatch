import { useState, useCallback, useRef } from 'react';

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isEnabled, setIsEnabled] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied' as NotificationPermission;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const toggle = useCallback(async () => {
    if (isEnabled) {
      setIsEnabled(false);
      return;
    }
    let perm = permission;
    if (perm === 'default') {
      perm = await requestPermission();
    }
    if (perm === 'granted') {
      setIsEnabled(true);
    }
  }, [isEnabled, permission, requestPermission]);

  const notify = useCallback((id: string, title: string, body: string) => {
    if (!isEnabled || permission !== 'granted') return;
    if (seenRef.current.has(id)) return;
    seenRef.current.add(id);
    try {
      new Notification(title, { body, icon: '/favicon.svg' });
    } catch {}
  }, [isEnabled, permission]);

  return { isEnabled, permission, toggle, notify };
};
