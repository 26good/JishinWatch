import { useState, useEffect, useRef } from 'react';
import { EEWData } from '../lib/utils-earthquake';
import { playSound } from '../lib/audio';

const EEW_STORAGE_KEY = 'eew_last_v2';
const EEW_MAX_AGE_MS = 3 * 60 * 1000;

const loadStoredEEW = (): EEWData | null => {
  try {
    const stored = sessionStorage.getItem(EEW_STORAGE_KEY);
    if (!stored) return null;
    const { data, ts } = JSON.parse(stored);
    if (Date.now() - ts < EEW_MAX_AGE_MS) return data as EEWData;
  } catch {}
  return null;
};

const saveEEW = (data: EEWData) => {
  try {
    sessionStorage.setItem(EEW_STORAGE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
};

const clearEEW = () => {
  try {
    sessionStorage.removeItem(EEW_STORAGE_KEY);
  } catch {}
};

// If no message is received within this time, assume the connection is dead
const WS_MESSAGE_TIMEOUT_MS = 60 * 1000;

export const useEEW = (isSoundEnabled: boolean) => {
  const [eew, setEEW] = useState<EEWData | null>(loadStoredEEW);
  const [status, setStatus] = useState<string>('Connecting...');
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetFallbackTimer = () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      setEEW(null);
      clearEEW();
    }, EEW_MAX_AGE_MS);
  };

  useEffect(() => {
    if (eew) resetFallbackTimer();
  }, []);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let keepAliveTimer: ReturnType<typeof setInterval>;
    // Detects zombie connections: OPEN state but no messages received
    let msgTimeoutTimer: ReturnType<typeof setTimeout>;

    const resetMsgTimeout = (wsRef: WebSocket) => {
      clearTimeout(msgTimeoutTimer);
      msgTimeoutTimer = setTimeout(() => {
        // No message for 60 s — force reconnect
        setStatus('Connection Lost. Reconnecting...');
        wsRef.close();
      }, WS_MESSAGE_TIMEOUT_MS);
    };

    const connect = () => {
      ws = new WebSocket('wss://ws-api.wolfx.jp/jma_eew');

      ws.onopen = () => {
        setStatus('System Online / EEW Connected');
        resetMsgTimeout(ws);
      };

      ws.onmessage = (event) => {
        // Reset the dead-connection watchdog on every message (including pings)
        resetMsgTimeout(ws);

        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'jma_eew') return;

          if (data.isCancel) {
            setEEW(null);
            clearEEW();
            if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
            if (isSoundEnabled) playSound.end();
            return;
          }

          const prevEEW = loadStoredEEW();
          const isNew = !prevEEW || prevEEW.Serial !== data.Serial;

          if (isSoundEnabled && isNew) {
            const isWarnByTitle = data.Title?.includes('警報');
            const isWarnByScale = /[567]/.test(data.MaxInt || data.MaxIntensity || '');
            if (isWarnByTitle || isWarnByScale) {
              playSound.alert();
            } else if (data.isFinal) {
              playSound.end();
            } else if (!prevEEW) {
              playSound.detect();
            } else {
              playSound.update();
            }
          }

          setEEW(data);
          saveEEW(data);
          resetFallbackTimer();
        } catch {}
      };

      ws.onclose = () => {
        clearTimeout(msgTimeoutTimer);
        setStatus('Connection Lost. Reconnecting...');
        reconnectTimer = setTimeout(connect, 5000);
      };

      // Send ping every 25 s to keep the connection alive through proxies/firewalls
      keepAliveTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 25000);
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      clearTimeout(msgTimeoutTimer);
      clearInterval(keepAliveTimer);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (ws) ws.close();
    };
  }, [isSoundEnabled]);

  return { eew, status };
};
