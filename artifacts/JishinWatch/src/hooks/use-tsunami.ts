import { useEffect, useRef, useState } from 'react';
import { TsunamiInfo } from '../lib/utils-earthquake';
import { initAudioContext, playSound } from '../lib/audio';

const TSUNAMI_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const parseTsunamiTime = (t: string | undefined): number => {
  if (!t) return 0;
  try {
    return new Date(t.replace(/\//g, '-')).getTime();
  } catch {
    return 0;
  }
};

export const useTsunami = (isSoundEnabled: boolean) => {
  const [tsunami, setTsunami] = useState<TsunamiInfo | null>(null);
  const [lastTsunamiUpdate, setLastTsunamiUpdate] = useState<string>('--:--:--');
  const lastAlertIdRef = useRef<string | null>(null);

  const fetchTsunami = async () => {
    try {
      const res = await fetch('https://api.p2pquake.net/v2/history?codes=552&limit=20');
      const list: TsunamiInfo[] = await res.json();
      const cutoff = Date.now() - TSUNAMI_MAX_AGE_MS;

      const active = list.find(item => {
        if (item.cancelled || !item.areas?.length) return false;
        const issueTime = parseTsunamiTime(item.issue?.time) || parseTsunamiTime(item.time);
        return issueTime > cutoff;
      }) || null;

      setTsunami(active);
      setLastTsunamiUpdate(new Date().toLocaleTimeString('ja-JP', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }));

      if (active && active.id !== lastAlertIdRef.current) {
        lastAlertIdRef.current = active.id;
        if (isSoundEnabled) {
          initAudioContext();
          const hasMajor = active.areas.some(a => a.grade === 'MajorWarning');
          const hasWarning = active.areas.some(a => a.grade === 'Warning');
          if (hasMajor || hasWarning) {
            playSound.alert();
          } else {
            playSound.caution();
          }
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchTsunami();
    const interval = setInterval(fetchTsunami, 5000);
    return () => clearInterval(interval);
  }, [isSoundEnabled]);

  return { tsunami, lastTsunamiUpdate };
};
