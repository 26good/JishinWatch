import { useState, useEffect, useRef, useCallback } from 'react';
import { EEWData, EarthquakeHistoryItem, TsunamiInfo } from '../lib/utils-earthquake';
import { playSound, initAudioContext } from '../lib/audio';

const SANDBOX_WS_URL = 'wss://api-realtime-sandbox.p2pquake.net/v2/ws';
const PROD_WS_URL = 'wss://api.p2pquake.net/v2/ws';

// P2PQuake WebSocket message types
// Code 551: earthquake info, 552: tsunami, 556: EEW
interface P2PMessage {
  code: number;
  id?: string;
  time?: string;
  earthquake?: any;
  points?: any[];
  areas?: any[];
  cancelled?: boolean;
  issue?: any;
  // EEW fields (code 556)
  type?: string;
  isCancel?: boolean;
  isFinal?: boolean;
  Title?: string;
  Hypocenter?: string;
  OriginTime?: string;
  MaxInt?: string;
  MaxIntensity?: string;
  Magunitude?: string;
  Magnitude?: string;
  Latitude?: string | number;
  Longitude?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  Depth?: string;
  Serial?: string;
}

const parseP2PEEW = (msg: P2PMessage): EEWData | null => {
  if (msg.code !== 556) return null;
  if (!msg.Serial) return null;
  const latitude = msg.Latitude ?? msg.latitude;
  const longitude = msg.Longitude ?? msg.longitude;
  return {
    type: msg.type || 'jma_eew',
    isCancel: msg.isCancel || false,
    isFinal: msg.isFinal || false,
    Title: msg.Title || '緊急地震速報',
    Hypocenter: msg.Hypocenter || '',
    OriginTime: msg.OriginTime || '',
    MaxInt: msg.MaxInt || msg.MaxIntensity || '',
    MaxIntensity: msg.MaxIntensity || msg.MaxInt || '',
    Magnitude: msg.Magunitude || msg.Magnitude || '',
    Latitude: latitude,
    Longitude: longitude,
    latitude,
    longitude,
    Depth: msg.Depth || '',
    Serial: msg.Serial,
  };
};

const parseP2PQuake = (msg: P2PMessage): EarthquakeHistoryItem | null => {
  if (msg.code !== 551) return null;
  if (!msg.earthquake?.hypocenter?.name) return null;
  return {
    id: msg.id || `p2p-${Date.now()}`,
    time: msg.time || new Date().toISOString(),
    earthquake: {
      time: msg.earthquake.time || msg.time || '',
      hypocenter: {
        name: msg.earthquake.hypocenter.name,
        latitude: msg.earthquake.hypocenter.latitude ?? 0,
        longitude: msg.earthquake.hypocenter.longitude ?? 0,
        depth: msg.earthquake.hypocenter.depth ?? 0,
        magnitude: msg.earthquake.hypocenter.magnitude ?? -1,
      },
      maxScale: msg.earthquake.maxScale ?? 10,
      domesticTsunami: msg.earthquake.domesticTsunami || 'None',
    },
    points: msg.points || [],
  };
};

const parseP2PTsunami = (msg: P2PMessage): TsunamiInfo | null => {
  if (msg.code !== 552) return null;
  if (!msg.areas?.length) return null;
  return {
    id: msg.id || `p2p-tsunami-${Date.now()}`,
    code: 552,
    cancelled: msg.cancelled || false,
    time: msg.time || new Date().toISOString(),
    issue: msg.issue,
    areas: msg.areas.map((a: any) => ({
      name: a.name,
      grade: a.grade,
      immediate: a.immediate || false,
      firstHeight: a.firstHeight,
      maxHeight: a.maxHeight,
    })),
  };
};

export interface P2PRealtimeData {
  eew: EEWData | null;
  quake: EarthquakeHistoryItem | null;
  tsunami: TsunamiInfo | null;
  status: string;
}

export const useP2PQuakeRealtime = (isSandbox: boolean, isSoundEnabled: boolean) => {
  const [data, setData] = useState<P2PRealtimeData>({
    eew: null,
    quake: null,
    tsunami: null,
    status: 'Connecting...',
  });

  const lastQuakeIdRef = useRef<string | null>(null);
  const lastEEWSerialRef = useRef<string | null>(null);
  const lastTsunamiIdRef = useRef<string | null>(null);

  const connect = useCallback(() => {
    const url = isSandbox ? SANDBOX_WS_URL : PROD_WS_URL;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let msgTimeoutTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    const resetMsgTimeout = () => {
      clearTimeout(msgTimeoutTimer);
      msgTimeoutTimer = setTimeout(() => {
        setData(prev => ({ ...prev, status: 'Connection Lost. Reconnecting...' }));
        ws.close();
      }, 60000);
    };

    const doConnect = () => {
      if (disposed) return;
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (disposed) return;
        setData(prev => ({
          ...prev,
          status: isSandbox
            ? 'Sandbox Connected (test data ~30s interval)'
            : 'System Online / P2PQuake Connected',
        }));
        resetMsgTimeout();
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        resetMsgTimeout();
        try {
          const msg: P2PMessage = JSON.parse(event.data);

          // EEW (code 556)
          const eew = parseP2PEEW(msg);
          if (eew) {
            if (eew.isCancel) {
              setData(prev => ({ ...prev, eew: null }));
              if (isSoundEnabled) playSound.end();
              return;
            }
            const isNew = lastEEWSerialRef.current !== eew.Serial;
            if (isNew && isSoundEnabled) {
              initAudioContext();
              const isWarn = eew.Title?.includes('警報') || /[567]/.test(eew.MaxInt || eew.MaxIntensity || '');
              if (isWarn) playSound.alert();
              else if (eew.isFinal) playSound.end();
              else if (!lastEEWSerialRef.current) playSound.detect();
              else playSound.update();
            }
            lastEEWSerialRef.current = eew.Serial;
            setData(prev => ({ ...prev, eew }));
            return;
          }

          // Earthquake (code 551)
          const quake = parseP2PQuake(msg);
          if (quake) {
            const isNew = lastQuakeIdRef.current !== quake.id;
            if (isNew && isSoundEnabled) {
              initAudioContext();
              if (quake.earthquake.maxScale >= 50) playSound.alert();
              else playSound.detect();
            }
            lastQuakeIdRef.current = quake.id;
            setData(prev => ({ ...prev, quake }));
            return;
          }

          // Tsunami (code 552)
          const tsunami = parseP2PTsunami(msg);
          if (tsunami) {
            if (tsunami.cancelled) {
              setData(prev => ({ ...prev, tsunami: null }));
              return;
            }
            const isNew = lastTsunamiIdRef.current !== tsunami.id;
            if (isNew && isSoundEnabled) {
              initAudioContext();
              const hasMajor = tsunami.areas.some(a => a.grade === 'MajorWarning');
              const hasWarning = tsunami.areas.some(a => a.grade === 'Warning');
              if (hasMajor || hasWarning) playSound.alert();
              else playSound.caution();
            }
            lastTsunamiIdRef.current = tsunami.id;
            setData(prev => ({ ...prev, tsunami }));
          }
        } catch {}
      };

      ws.onclose = () => {
        clearTimeout(msgTimeoutTimer);
        if (disposed) return;
        setData(prev => ({ ...prev, status: 'Connection Lost. Reconnecting...' }));
        reconnectTimer = setTimeout(doConnect, 5000);
      };
    };

    doConnect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(msgTimeoutTimer);
      if (ws) {
        // Prevent cleanup-triggered close events from scheduling a reconnect.
        ws.onclose = null;
        ws.close();
      }
    };
  }, [isSandbox, isSoundEnabled]);

  useEffect(() => {
    if (!isSandbox) {
      // Reset when switching off sandbox
      setData({ eew: null, quake: null, tsunami: null, status: 'Using production sources...' });
      return;
    }
    return connect();
  }, [isSandbox, connect]);

  return data;
};
