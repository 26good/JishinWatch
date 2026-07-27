import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { initAudioContext } from './lib/audio';
import { useEarthquakes } from './hooks/use-earthquakes';
import { useEEW } from './hooks/use-eew';
import { useTsunami } from './hooks/use-tsunami';
import { useNotifications } from './hooks/use-notifications';
import { useTestMode, PHASE_LABELS, TEST_TOTAL_PHASES } from './hooks/use-test-mode';
import { useGroundAmplification } from './hooks/use-ground-amplification';
import { useP2PQuakeRealtime } from './hooks/use-p2pquake-sandbox';
import { EarthquakeMap } from './components/Map';
import type { TsunamiSource } from './components/Map';
import {
  getScaleText,
  getMagColor,
  getDepthColor,
  getIntensityColor,
  getTsunamiGradeColor,
  getTsunamiGradeLabel,
  computeMaxIntensity,
  computeIntensityAtLocation,
  type EEWData,
} from './lib/utils-earthquake';

const queryClient = new QueryClient();

const formatClockTime = () =>
  new Date().toLocaleTimeString('ja-JP', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const P_WAVE_SPEED = 6.0;
const S_WAVE_SPEED = 3.5;


const arvLabel = (arv: number): string => {
  if (arv < 0.9) return '揺れにくい地盤';
  if (arv < 1.3) return '普通の地盤';
  if (arv < 2.0) return 'やや揺れやすい地盤';
  if (arv < 3.0) return '揺れやすい地盤';
  return '非常に揺れやすい地盤';
};

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parseCoordinate = (value: string | number | undefined): number => {
  if (value === undefined || value === null) return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

// Prefecture center coordinates for nearest-prefecture lookup
const PREF_CENTERS = [
  { name: '北海道', lat: 43.06, lng: 142.96 },
  { name: '青森県', lat: 40.82, lng: 140.74 },
  { name: '岩手県', lat: 39.70, lng: 141.15 },
  { name: '宮城県', lat: 38.27, lng: 140.87 },
  { name: '秋田県', lat: 39.72, lng: 140.10 },
  { name: '山形県', lat: 38.24, lng: 140.36 },
  { name: '福島県', lat: 37.75, lng: 140.47 },
  { name: '茨城県', lat: 36.34, lng: 140.45 },
  { name: '栃木県', lat: 36.57, lng: 139.88 },
  { name: '群馬県', lat: 36.39, lng: 139.06 },
  { name: '埼玉県', lat: 35.86, lng: 139.65 },
  { name: '千葉県', lat: 35.61, lng: 140.12 },
  { name: '東京都', lat: 35.69, lng: 139.69 },
  { name: '神奈川県', lat: 35.45, lng: 139.64 },
  { name: '新潟県', lat: 37.90, lng: 139.02 },
  { name: '富山県', lat: 36.70, lng: 137.21 },
  { name: '石川県', lat: 36.59, lng: 136.63 },
  { name: '福井県', lat: 36.07, lng: 136.22 },
  { name: '山梨県', lat: 35.66, lng: 138.57 },
  { name: '長野県', lat: 36.65, lng: 138.18 },
  { name: '岐阜県', lat: 35.39, lng: 136.72 },
  { name: '静岡県', lat: 34.98, lng: 138.38 },
  { name: '愛知県', lat: 35.18, lng: 136.91 },
  { name: '三重県', lat: 34.73, lng: 136.51 },
  { name: '滋賀県', lat: 35.00, lng: 135.87 },
  { name: '京都府', lat: 35.02, lng: 135.76 },
  { name: '大阪府', lat: 34.69, lng: 135.50 },
  { name: '兵庫県', lat: 34.69, lng: 135.18 },
  { name: '奈良県', lat: 34.68, lng: 135.83 },
  { name: '和歌山県', lat: 34.23, lng: 135.17 },
  { name: '鳥取県', lat: 35.50, lng: 133.81 },
  { name: '島根県', lat: 35.47, lng: 133.05 },
  { name: '岡山県', lat: 34.66, lng: 133.93 },
  { name: '広島県', lat: 34.40, lng: 132.46 },
  { name: '山口県', lat: 34.19, lng: 131.47 },
  { name: '徳島県', lat: 34.07, lng: 134.56 },
  { name: '香川県', lat: 34.34, lng: 134.04 },
  { name: '愛媛県', lat: 33.84, lng: 132.77 },
  { name: '高知県', lat: 33.56, lng: 133.53 },
  { name: '福岡県', lat: 33.61, lng: 130.42 },
  { name: '佐賀県', lat: 33.25, lng: 130.30 },
  { name: '長崎県', lat: 32.74, lng: 129.87 },
  { name: '熊本県', lat: 32.79, lng: 130.74 },
  { name: '大分県', lat: 33.24, lng: 131.61 },
  { name: '宮崎県', lat: 31.91, lng: 131.42 },
  { name: '鹿児島県', lat: 31.56, lng: 130.56 },
  { name: '沖縄県', lat: 26.21, lng: 127.68 },
] as const;

const CITY_PRESETS = [
  { label: '札幌', lat: 43.0618, lng: 141.3545 },
  { label: '仙台', lat: 38.2688, lng: 140.8721 },
  { label: '東京', lat: 35.6895, lng: 139.6917 },
  { label: '横浜', lat: 35.4437, lng: 139.6380 },
  { label: '名古屋', lat: 35.1815, lng: 136.9066 },
  { label: '大阪', lat: 34.6937, lng: 135.5023 },
  { label: '広島', lat: 34.3853, lng: 132.4553 },
  { label: '福岡', lat: 33.5904, lng: 130.4017 },
  { label: '那覇', lat: 26.2124, lng: 127.6809 },
];

type UserLocation = { lat: number; lng: number; label?: string } | null;

const loadSavedLocation = (): UserLocation => {
  try {
    const s = localStorage.getItem('user_location_v1');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
};
const saveLocation = (loc: UserLocation) => {
  try {
    if (loc) localStorage.setItem('user_location_v1', JSON.stringify(loc));
    else localStorage.removeItem('user_location_v1');
  } catch {}
};

// Intensity scale labels for the observation points panel
const SCALE_LABELS: Record<number, string> = {
  10: '1', 20: '2', 30: '3', 40: '4', 45: '5弱', 50: '5強', 55: '6弱', 60: '6強', 70: '7',
};

function Home() {
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(formatClockTime);
  const [userLocation, setUserLocation] = useState<UserLocation>(loadSavedLocation);
  const [settingLocation, setSettingLocation] = useState(false);
  const [showLocationPanel, setShowLocationPanel] = useState(false);
  const [bottomTab, setBottomTab] = useState<'history' | 'points'>('history');
  const [showUpdatePanel, setShowUpdatePanel] = useState(false);
  const [showObsPoints, setShowObsPoints] = useState(true);
  const [leftTab, setLeftTab] = useState<'quake' | 'settings'>('quake');
  const [showEEWMap, setShowEEWMap] = useState(true);
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const locationPanelRef = useRef<HTMLDivElement>(null);
  const updatePanelRef = useRef<HTMLDivElement>(null);

  const { isEnabled: notifEnabled, permission: notifPermission, toggle: toggleNotif, notify } = useNotifications();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const { ground: groundInfo } = useGroundAmplification(
    userLocation?.lat ?? null,
    userLocation?.lng ?? null,
  );

  // Audio resume
  useEffect(() => {
    const resume = () => initAudioContext();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(formatClockTime()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close location panel outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locationPanelRef.current && !locationPanelRef.current.contains(e.target as Node)) {
        if (!settingLocation) setShowLocationPanel(false);
      }
      if (updatePanelRef.current && !updatePanelRef.current.contains(e.target as Node)) {
        setShowUpdatePanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingLocation]);

  // Escape cancels location setting
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingLocation(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSoundToggle = () => {
    if (!isSoundEnabled) initAudioContext();
    setIsSoundEnabled(v => !v);
  };

  const handleSetUserLocation = useCallback((loc: UserLocation) => {
    setUserLocation(loc);
    saveLocation(loc);
    setSettingLocation(false);
    setShowLocationPanel(false);
  }, []);

  const { history, selectedQuake: liveSelectedQuake, setSelectedQuake, lastUpdate } = useEarthquakes(isSoundEnabled);
  const { eew: liveEEW, status } = useEEW(isSoundEnabled);
  const { tsunami: liveTsunami, lastTsunamiUpdate } = useTsunami(isSoundEnabled);
  const p2pRealtime = useP2PQuakeRealtime(isSandboxMode, isSoundEnabled);

  // ── Test mode ──────────────────────────────────────────────────────────
  const { isTestMode, testEEW, testQuake, testTsunami, testPhase, toggle: toggleTest } = useTestMode();
  const eew = isTestMode ? testEEW : isSandboxMode ? p2pRealtime.eew : liveEEW;
  const selectedQuake = isTestMode ? testQuake : isSandboxMode ? p2pRealtime.quake : liveSelectedQuake;
  const tsunami = isTestMode ? testTsunami : isSandboxMode ? p2pRealtime.tsunami : liveTsunami;
  const sandboxStatus = isSandboxMode ? p2pRealtime.status : null;
  const isTestModeRef = useRef(false);
  isTestModeRef.current = isTestMode;

  // Shift+T → start / stop test replay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTest(isSoundEnabled);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleTest, isSoundEnabled]);
  // ───────────────────────────────────────────────────────────────────────

  // ── Notification triggers ──────────────────────────────────────────────
  const lastNotifiedQuakeRef = useRef<string | null>(null);
  const lastNotifiedEEWRef = useRef<string | null>(null);
  const lastNotifiedTsunamiRef = useRef<string | null>(null);

  useEffect(() => {
    if (isTestModeRef.current) return;
    if (!selectedQuake) return;
    if (lastNotifiedQuakeRef.current === selectedQuake.id) return;
    lastNotifiedQuakeRef.current = selectedQuake.id;
    notifyRef.current(
      `quake-${selectedQuake.id}`,
      `地震発生 — ${selectedQuake.earthquake.hypocenter.name}`,
      `最大震度 ${getScaleText(selectedQuake.earthquake.maxScale)} / M${selectedQuake.earthquake.hypocenter.magnitude}`
    );
  }, [selectedQuake?.id]);

  useEffect(() => {
    if (isTestModeRef.current) return;
    if (!eew) return;
    const key = `${eew.Serial}`;
    if (lastNotifiedEEWRef.current === key) return;
    lastNotifiedEEWRef.current = key;
    notifyRef.current(
      `eew-${key}`,
      eew.Title || '緊急地震速報',
      `${eew.Hypocenter} 推定最大震度 ${eew.MaxInt} / M${eew.Magunitude || eew.Magnitude}`
    );
  }, [eew?.Serial]);

  useEffect(() => {
    if (isTestModeRef.current) return;
    if (!tsunami) return;
    if (lastNotifiedTsunamiRef.current === tsunami.id) return;
    lastNotifiedTsunamiRef.current = tsunami.id;
    const level = tsunami.areas.some(a => a.grade === 'MajorWarning') ? 'MajorWarning'
      : tsunami.areas.some(a => a.grade === 'Warning') ? 'Warning' : 'Watch';
    notifyRef.current(
      `tsunami-${tsunami.id}`,
      `${getTsunamiGradeLabel(level)} 発表`,
      tsunami.areas.slice(0, 4).map(a => a.name).join('・')
    );
  }, [tsunami?.id]);
  // ────────────────────────────────────────────────────────────────────────

  // ── Dynamic tab title ──────────────────────────────────────────────────
  const newQuakeTimeRef = useRef<number>(0);
  const lastTitleQuakeIdRef = useRef<string | null>(null);
  const eewForTitleRef = useRef(eew);
  eewForTitleRef.current = eew;
  const historyForTitleRef = useRef(history);
  historyForTitleRef.current = history;
  const tsunamiForTitleRef = useRef(tsunami);
  tsunamiForTitleRef.current = tsunami;

  // Track when a new earthquake first appears in history
  useEffect(() => {
    const latest = history[0];
    if (!latest || lastTitleQuakeIdRef.current === latest.id) return;
    lastTitleQuakeIdRef.current = latest.id;
    newQuakeTimeRef.current = Date.now();
    // If the tab is already visible, auto-clear the blinking after 10 s
    const t = !document.hidden ? setTimeout(() => { newQuakeTimeRef.current = 0; }, 10000) : null;
    return () => { if (t) clearTimeout(t); };
  }, [history[0]?.id]);

  // Clear "新着" blinking as soon as the user switches back to this tab
  useEffect(() => {
    const clearBlink = () => { newQuakeTimeRef.current = 0; };
    const onVisChange = () => { if (!document.hidden) clearBlink(); };
    window.addEventListener('focus', clearBlink);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('focus', clearBlink);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, []);

  // Blink the tab title based on current state
  useEffect(() => {
    const BASE = '地震監視モニター';
    let blink = false;
    const tick = () => {
      blink = !blink;
      const ev = eewForTitleRef.current;
      const hist = historyForTitleRef.current;
      const ageSec = (Date.now() - newQuakeTimeRef.current) / 1000;
      if (ev && !ev.isCancel) {
        const isWarn = ev.Title?.includes('警報');
        const place = ev.Hypocenter || '震源調査中';
        const evMag = parseFloat(ev.Magunitude || ev.Magnitude || '0');
        const evDepth = parseInt(ev.Depth || '0') || 5;
        const scale = ev.MaxInt?.trim() || computeMaxIntensity(evMag, evDepth);
        document.title = blink
          ? `${isWarn ? '🚨' : '🔔'} ${place} 震度${scale} | 緊急地震速報`
          : `緊急地震速報 | ${BASE}`;
      } else if (ageSec < 60 && hist[0]) {
        const eq = hist[0];
        const place = eq.earthquake.hypocenter.name;
        const scale = getScaleText(eq.earthquake.maxScale);
        document.title = blink
          ? `【新着】震度${scale} ${place} | ${BASE}`
          : `${BASE}`;
      } else {
        const ts = tsunamiForTitleRef.current;
        if (ts && ts.areas.length > 0 && !ts.cancelled) {
          const lvl = ts.areas.some(a => a.grade === 'MajorWarning') ? '大津波警報'
            : ts.areas.some(a => a.grade === 'Warning') ? '津波警報' : '津波注意報';
          document.title = blink ? `🌊 ${lvl} 発表中 | ${BASE}` : `${BASE}`;
        } else {
          document.title = BASE;
        }
      }
    };
    const id = setInterval(tick, 900);
    tick();
    return () => { clearInterval(id); document.title = '地震監視モニター'; };
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const displayData = eew || selectedQuake;
  const isEEWMode = !!eew;

  const tsunamiLevel =
    tsunami?.areas.some(a => a.grade === 'MajorWarning') ? 'MajorWarning' :
    tsunami?.areas.some(a => a.grade === 'Warning') ? 'Warning' :
    tsunami?.areas.some(a => a.grade === 'Watch') ? 'Watch' : null;

  // Tsunami simulation source — use selected quake's epicenter when tsunami is active
  const tsunamiSource: TsunamiSource =
    tsunami && !tsunami.cancelled && selectedQuake && selectedQuake.earthquake.hypocenter.latitude > 0
      ? {
          lat: selectedQuake.earthquake.hypocenter.latitude,
          lng: selectedQuake.earthquake.hypocenter.longitude,
          time: selectedQuake.time,
          grade: tsunamiLevel || 'Watch',
        }
      : null;

  const currentMagnitude = isEEWMode
    ? parseFloat(eew.Magunitude || eew.Magnitude || '0')
    : selectedQuake?.earthquake.hypocenter.magnitude || 0;
  const currentDepth = isEEWMode
    ? parseInt(eew.Depth || '0')
    : selectedQuake?.earthquake.hypocenter.depth || 0;

  // When the EEW API MaxInt is empty, fall back to intensity computed from M and depth
  const eewApiMaxInt = isEEWMode ? (eew.MaxInt?.trim() ?? '') : '';
  const eewComputedMaxInt = isEEWMode ? computeMaxIntensity(currentMagnitude, currentDepth) : '';
  const eewDisplayMaxInt = eewApiMaxInt || eewComputedMaxInt;
  const eewIntIsComputed = isEEWMode && !eewApiMaxInt && !!eewComputedMaxInt;

  // 警報判定: APIのTitleに「警報」が含まれる、または表示最大震度（API値 or 計算値）が5弱以上
  const isWarning = !!eew && (
    !!eew.Title?.includes('警報') ||
    /[567]/.test(eewDisplayMaxInt)
  );

  const currentIntensityColor = getIntensityColor(
    isEEWMode ? eewDisplayMaxInt : selectedQuake?.earthquake.maxScale
  );
  const currentMagColor = getMagColor(currentMagnitude);
  const currentDepthColor = getDepthColor(currentDepth);

  // P/S wave radii for the wave legend
  let eewElapsedSec = 0;
  let pRadiusKm = 0;
  let sRadiusKm = 0;
  if (isEEWMode && eew) {
    const originTs = new Date(eew.OriginTime?.replace(/-/g, '/')).getTime();
    if (Number.isFinite(originTs)) {
      eewElapsedSec = Math.max(0, (Date.now() - originTs) / 1000);
      const depth = parseInt(eew.Depth || '0') || 0;
      pRadiusKm = Math.min(Math.sqrt(Math.max(0, (eewElapsedSec * P_WAVE_SPEED) ** 2 - depth ** 2)), 2500);
      sRadiusKm = Math.min(Math.sqrt(Math.max(0, (eewElapsedSec * S_WAVE_SPEED) ** 2 - depth ** 2)), 2500);
    }
  }

  // EEW countdown to user's location
  type Countdown = { pSec: number | null; sSec: number | null; distKm: number };
  let countdown: Countdown | null = null;
  if (isEEWMode && userLocation && eew) {
    const epiLat = parseCoordinate(eew.Latitude ?? eew.latitude);
    const epiLng = parseCoordinate(eew.Longitude ?? eew.longitude);
    if (epiLat !== 0 && epiLng !== 0) {
      const distKm = haversineKm(userLocation.lat, userLocation.lng, epiLat, epiLng);
      const originTs = new Date(eew.OriginTime?.replace(/-/g, '/')).getTime();
      const elapsedSec = Number.isFinite(originTs) ? Math.max(0, (Date.now() - originTs) / 1000) : 0;
      const pSec = Math.round(distKm / P_WAVE_SPEED - elapsedSec);
      const sSec = Math.round(distKm / S_WAVE_SPEED - elapsedSec);
      countdown = { pSec: pSec > 0 ? pSec : null, sSec: sSec > 0 ? sSec : null, distKm };
    }
  }

  const userNearestPref: string | null = (() => {
    if (!userLocation) return null;
    let minDist = Infinity, nearest = '';
    for (const p of PREF_CENTERS) {
      const d = haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng);
      if (d < minDist) { minDist = d; nearest = p.name; }
    }
    return nearest || null;
  })();

  const userLocationIntensity: string | null =
    isEEWMode && countdown && groundInfo
      ? computeIntensityAtLocation(
          currentMagnitude,
          currentDepth,
          countdown.distKm,
          groundInfo.arv,
        )
      : null;

  // Observation points sorted by scale (highest first)
  const sortedPoints = selectedQuake
    ? [...selectedQuake.points].sort((a, b) => b.scale - a.scale)
    : [];

  // Find nearest prefecture to user location, then get intensity observed there
  const nearestPrefResult: { prefName: string; maxScale: number; points: typeof sortedPoints } | null =
    userLocation && selectedQuake && selectedQuake.points.length > 0
      ? (() => {
          let minDist = Infinity;
          let nearestPref = '';
          for (const p of PREF_CENTERS) {
            const d = haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng);
            if (d < minDist) { minDist = d; nearestPref = p.name; }
          }
          const prefPoints = selectedQuake.points.filter(pt => pt.pref === nearestPref);
          if (prefPoints.length === 0) return null;
          const maxScale = Math.max(...prefPoints.map(pt => pt.scale));
          return { prefName: nearestPref, maxScale, points: prefPoints };
        })()
      : null;

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white dark">

      {/* ── Test mode indicator (bottom-right, unobtrusive) ─────────────── */}
      {isTestMode && (
        <div className="absolute bottom-4 right-4 z-[200] flex items-center gap-2 rounded-lg border border-white/15 bg-black/70 backdrop-blur-sm px-3 py-1.5 shadow-lg">
          <span className="text-white/70 text-[11px] font-bold tracking-wide">テスト</span>
          <span className="text-white/40 text-[10px]">
            {PHASE_LABELS[testPhase] || '準備中'} ({testPhase}/{TEST_TOTAL_PHASES})
          </span>
          <button
            className="text-white/60 text-[11px] font-bold hover:text-white cursor-pointer border border-white/20 rounded px-1.5 py-0.5 hover:bg-white/10"
            onClick={() => toggleTest(isSoundEnabled)}
          >
            ✕
          </button>
        </div>
      )}
      {/* ─────────────────────────────────────────────────────────────────── */}

      <EarthquakeMap
        currentQuake={selectedQuake}
        eew={eew}
        tsunami={tsunami}
        tsunamiSource={tsunamiSource}
        userLocation={userLocation}
        onSetUserLocation={handleSetUserLocation}
        settingLocation={settingLocation}
        userNearestPref={userNearestPref}
        userLocationIntensity={userLocationIntensity}
        showObsPoints={showObsPoints}
        showEEWMap={showEEWMap}
      />

      {/* Top-right button row */}
      <div className="absolute top-5 right-5 z-50 flex items-center gap-2">

        {/* Location button */}
        <div ref={locationPanelRef} className="relative">
          <button
            onClick={() => {
              if (settingLocation) { setSettingLocation(false); return; }
              setShowLocationPanel(v => !v);
            }}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all duration-300 backdrop-blur-md border cursor-pointer
              ${settingLocation
                ? 'text-yellow-300 border-yellow-300 bg-yellow-300/10 animate-pulse'
                : userLocation
                  ? 'text-[#38bdf8] border-[#38bdf8]/60 bg-[#38bdf8]/10'
                  : 'text-[#a0a0a8] border-white/20 bg-black/50'}`}
          >
            📍 {settingLocation ? '地図をクリック...' : (userLocation?.label ?? (userLocation ? `${userLocation.lat.toFixed(2)},${userLocation.lng.toFixed(2)}` : '位置を設定'))}
          </button>

          {showLocationPanel && !settingLocation && (
            <div className="absolute top-full right-0 mt-2 w-64 rounded-2xl border border-white/15 bg-[#141419]/95 p-3 shadow-2xl backdrop-blur-md">
              <div className="mb-2 text-xs font-bold text-white/60">都市から選ぶ</div>
              <div className="grid grid-cols-3 gap-1 mb-3">
                {CITY_PRESETS.map(city => (
                  <button
                    key={city.label}
                    className={`rounded-lg px-2 py-1.5 text-xs font-bold transition-colors cursor-pointer
                      ${userLocation?.label === city.label
                        ? 'bg-[#38bdf8]/30 text-[#38bdf8] border border-[#38bdf8]/40'
                        : 'bg-white/8 hover:bg-white/15 text-white/80'}`}
                    onClick={() => handleSetUserLocation({ lat: city.lat, lng: city.lng, label: city.label })}
                  >
                    {city.label}
                  </button>
                ))}
              </div>
              <button
                className="w-full rounded-lg bg-[#38bdf8]/15 border border-[#38bdf8]/30 px-3 py-2 text-xs font-bold text-[#38bdf8] hover:bg-[#38bdf8]/25 cursor-pointer mb-1"
                onClick={() => { setSettingLocation(true); setShowLocationPanel(false); }}
              >
                🗺 地図をクリックして設定
              </button>
              {userLocation && (
                <button
                  className="w-full rounded-lg bg-red-900/20 border border-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900/40 cursor-pointer"
                  onClick={() => handleSetUserLocation(null)}
                >
                  位置をリセット
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* EEW P/S wave legend + shake map legend */}
      {isEEWMode && (
        <div className="wave-legend absolute top-20 right-5 z-50 rounded-2xl border border-white/10 bg-[#141419]/85 px-4 py-3 text-xs text-white/80 backdrop-blur-md shadow-2xl min-w-[175px]">
          <div className="mb-2 font-bold text-white/90">P波・S波 推定到達範囲</div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-8 rounded-full border border-[#4cc9f0] shrink-0"></span>
            <span>P波 約 <b>{Math.round(pRadiusKm)}</b> km</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-8 rounded-full bg-[#f97316]/50 ring-1 ring-[#f97316] shrink-0"></span>
            <span>S波 約 <b>{Math.round(sRadiusKm)}</b> km</span>
          </div>
          <div className="text-white/40">経過 {Math.floor(eewElapsedSec)} 秒</div>
          {userLocation && countdown && (
            <div className="mt-3 border-t border-white/10 pt-2 space-y-0.5">
              <div className="text-white/70 mb-1 font-semibold">{userLocation.label ?? '設定地点'} まで</div>
              <div className="text-[#4cc9f0]">P波: {countdown.pSec !== null ? `約 ${countdown.pSec} 秒後` : '通過済み'}</div>
              <div className="text-[#f97316]">S波: {countdown.sSec !== null ? `約 ${countdown.sSec} 秒後` : '通過済み'}</div>
              <div className="text-white/35 pt-0.5">距離 {Math.round(countdown.distKm)} km</div>
              {userLocationIntensity && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="text-white/60 text-[11px] mb-1">あなたの地点の推定震度</div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-xl font-sans font-black px-2 py-0.5 rounded"
                      style={{ backgroundColor: getIntensityColor(userLocationIntensity), color: '#fff' }}
                    >
                      {userLocationIntensity}
                    </span>
                    {groundInfo && (
                      <span className="text-white/35 text-[10px] leading-tight">
                        {arvLabel(groundInfo.arv)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {isEEWMode && !userLocation && (
            <div className="mt-2 text-white/35 text-[11px]">📍 位置を設定すると到達時刻を表示</div>
          )}

        </div>
      )}

      {/* Left panel */}
      <div className={`ui-layer absolute ${isTestMode ? 'top-14' : 'top-5'} left-5 w-[350px] h-[calc(100vh-40px)] z-50 flex flex-col gap-3 pointer-events-none`}>

        {/* Main tab bar: 地震情報 / 設定 */}
        <div className="flex flex-shrink-0 rounded-xl overflow-hidden border border-white/10 bg-[#141419]/85 backdrop-blur-md pointer-events-auto shadow-xl">
          <button
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${leftTab === 'quake' ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white/70'}`}
            onClick={() => setLeftTab('quake')}
          >
            地震情報
          </button>
          <div className="w-px bg-white/10 self-stretch" />
          <button
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${leftTab === 'settings' ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white/70'}`}
            onClick={() => setLeftTab('settings')}
          >
            ⚙ 設定
          </button>
        </div>

        {leftTab === 'quake' && displayData && (
          <div className={`rounded-xl overflow-hidden shadow-2xl flex-shrink-0 border border-white/10 transition-colors duration-300 pointer-events-auto
            ${isEEWMode ? (isWarning ? 'bg-[#d33c30]/10' : 'bg-[#d37e30]/10') : 'bg-[#202434]'}`}
          >
            <div className="flex items-stretch text-base font-bold">
              <div className={`flex-1 p-3 flex items-center justify-center text-white
                ${isEEWMode
                  ? (isWarning ? 'eew-warning-header tracking-wider' : 'eew-forecast-header tracking-wider')
                  : 'bg-[#3b5078]'}`}
              >
                {isEEWMode ? (eew.Title || '緊急地震速報') : 'ℹ 各地の震度情報'}
              </div>
              {isEEWMode && (
                <div className={`p-3 flex items-center justify-center text-white text-sm
                  ${isWarning ? 'bg-[#d93b3b]' : 'bg-[#d98c3b]'}`}
                >
                  第{eew.Serial || '1'}報
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="mb-4 flex flex-col-reverse">
                <div className="text-2xl font-bold leading-tight">
                  {isEEWMode
                    ? (eew.Hypocenter?.length > 0 ? eew.Hypocenter : '震源調査中')
                    : selectedQuake?.earthquake.hypocenter.name}
                  <span className="text-sm font-normal ml-2">
                    {isEEWMode ? 'で地震' : 'で地震がありました'}
                  </span>
                </div>
                <div className="text-sm text-gray-300 mt-1">
                  {isEEWMode
                    ? `${eew.OriginTime || '--:--'} 発生`
                    : `${selectedQuake
                        ? new Date(selectedQuake.earthquake.time.replace(/-/g, '/')).toLocaleString('ja-JP', {
                            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })
                        : '--/-- --:--'} ごろ`}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg mb-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
                style={{ backgroundColor: currentIntensityColor }}
              >
                <div className="text-lg font-bold leading-tight">
                  {isEEWMode && (
                    <div className="text-sm font-normal">
                      {eewIntIsComputed ? 'M・深さから計算' : '推定'}
                    </div>
                  )}
                  最大震度
                </div>
                <div className="text-5xl font-sans font-black leading-none text-white">
                  {isEEWMode
                    ? (eewDisplayMaxInt ? eewDisplayMaxInt.replace('弱', '-').replace('強', '+') : '?')
                    : (selectedQuake ? getScaleText(selectedQuake.earthquake.maxScale) : '-')}
                </div>
              </div>

              <div className="flex justify-between items-center mb-2 font-semibold text-base">
                <div>マグニチュード</div>
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-sans font-normal" style={{ color: currentMagColor }}>
                    {isEEWMode
                      ? parseFloat(eew.Magunitude || eew.Magnitude || '0').toFixed(1)
                      : (selectedQuake && selectedQuake.earthquake.hypocenter.magnitude !== -1.0
                          ? selectedQuake.earthquake.hypocenter.magnitude.toFixed(1)
                          : '不明')}
                  </div>
                  <div className="w-2.5 h-[26px] rounded-sm"
                    style={{ backgroundColor: currentMagColor, boxShadow: `0 0 12px ${currentMagColor}` }} />
                </div>
              </div>

              <div className="flex justify-between items-center mb-2 font-semibold text-base">
                <div>深さ</div>
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-sans font-normal flex items-baseline" style={{ color: currentDepthColor }}>
                    {isEEWMode
                      ? parseInt(eew.Depth || '0')
                      : (selectedQuake?.earthquake.hypocenter.depth === 0
                          ? 'ごく浅い'
                          : selectedQuake?.earthquake.hypocenter.depth || '--')}
                    <span className="text-sm ml-1">
                      {isEEWMode || (selectedQuake && selectedQuake.earthquake.hypocenter.depth !== 0) ? 'km' : ''}
                    </span>
                  </div>
                  <div className="w-2.5 h-[26px] rounded-sm"
                    style={{ backgroundColor: currentDepthColor, boxShadow: `0 0 12px ${currentDepthColor}` }} />
                </div>
              </div>

              {/* Nearest prefecture intensity for user location (non-EEW only) */}
              {!isEEWMode && nearestPrefResult && (
                <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2 bg-white/5 border border-white/10">
                  <div className="text-sm text-white/70">
                    <div className="text-[11px] text-white/40 mb-0.5">現在地付近 ({nearestPrefResult.prefName})</div>
                    <div className="font-semibold">最寄りの震度</div>
                  </div>
                  <div
                    className="text-3xl font-black font-sans px-3 py-1 rounded-lg"
                    style={{ color: '#fff', backgroundColor: getIntensityColor(nearestPrefResult.maxScale) }}
                  >
                    {SCALE_LABELS[nearestPrefResult.maxScale] ?? '?'}
                  </div>
                </div>
              )}
              {!isEEWMode && userLocation && selectedQuake && !nearestPrefResult && (
                <div className="mt-3 text-center text-xs text-white/30 py-1">
                  現在地付近 ({
                    (() => {
                      let minDist = Infinity; let name = '';
                      for (const p of PREF_CENTERS) {
                        const d = haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng);
                        if (d < minDist) { minDist = d; name = p.name; }
                      }
                      return name;
                    })()
                  }) の観測なし
                </div>
              )}

              <div
                className={`mt-4 font-bold text-[0.95rem] leading-snug rounded-lg p-3 text-center
                  ${isEEWMode ? 'text-[#f4d03f] text-left bg-transparent !p-0' : ''}`}
                style={isEEWMode ? undefined : (tsunamiLevel ? {
                  backgroundColor: getTsunamiGradeColor(tsunamiLevel),
                  color: tsunamiLevel === 'Watch' ? '#111827' : '#fff',
                  boxShadow: `0 0 18px ${getTsunamiGradeColor(tsunamiLevel)}55`,
                } : { backgroundColor: '#3c4961', color: '#fff' })}
              >
                {isEEWMode
                  ? (isWarning
                      ? '緊急地震速報（警報）発表\n強い揺れに警戒してください'
                      : '緊急地震速報（予報）発表\n今後の情報に注意してください')
                  : tsunamiLevel
                    ? `${getTsunamiGradeLabel(tsunamiLevel)} 発表中`
                    : selectedQuake && !['None', 'NonEffective'].includes(selectedQuake.earthquake.domesticTsunami ?? 'None')
                      ? '津波情報 調査中'
                      : '津波の心配なし'}
              </div>
            </div>
          </div>
        )}

        {leftTab === 'quake' && (
        <div className="glass-panel flex-grow flex flex-col overflow-hidden min-h-0 rounded-xl pointer-events-auto">
          {/* Tab bar */}
          <div className="flex border-b border-white/10 flex-shrink-0">
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer
                ${bottomTab === 'history' ? 'text-white border-b-2 border-[#4cd0a7]' : 'text-[#a0a0a8] hover:text-white'}`}
              onClick={() => setBottomTab('history')}
            >
              地震履歴
            </button>
            <button
              className={`flex-1 py-2 text-sm font-semibold transition-colors cursor-pointer relative
                ${bottomTab === 'points' ? 'text-white border-b-2 border-[#4cd0a7]' : 'text-[#a0a0a8] hover:text-white'}`}
              onClick={() => setBottomTab('points')}
            >
              観測地点
              {selectedQuake && (
                <span className="ml-1 text-xs text-white/40">({sortedPoints.length})</span>
              )}
            </button>
          </div>

          {bottomTab === 'history' && (
            <div className="flex flex-col overflow-hidden flex-grow p-3">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs text-[#a0a0a8]">最終更新：{lastUpdate}</span>
              </div>
              <div className="history-list overflow-y-auto flex-grow flex flex-col gap-2 p-px custom-scrollbar">
                {history.map(eq => {
                  const scale = eq.earthquake.maxScale;
                  const timeStr = eq.earthquake.time.substring(5, 16).replace('-', '/');
                  return (
                    <div
                      key={eq.id}
                      className={`flex items-center bg-black/30 border border-white/5 rounded-lg p-2 gap-2 cursor-pointer transition-colors duration-200 flex-shrink-0 hover:bg-white/10
                        ${selectedQuake?.id === eq.id ? 'ring-1 ring-[#4cd0a7] bg-white/5' : ''}`}
                      onClick={() => setSelectedQuake(eq)}
                    >
                      <div
                        className="min-w-[32px] h-[32px] rounded-full flex items-center justify-center font-mono text-base border-2 border-white/20"
                        style={{ backgroundColor: getIntensityColor(scale) }}
                      >
                        {getScaleText(scale)}
                      </div>
                      <div className="flex flex-col flex-grow overflow-hidden">
                        <div className="text-[0.65rem] text-[#a0a0a8]">{timeStr}</div>
                        <div className="text-[0.85rem] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                          {eq.earthquake.hypocenter.name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {bottomTab === 'points' && (
            <div className="flex flex-col overflow-hidden flex-grow p-3">
              {!selectedQuake ? (
                <div className="flex-grow flex items-center justify-center text-white/30 text-sm">
                  地震を選択してください
                </div>
              ) : (
                <>
                  <div className="text-xs text-[#a0a0a8] mb-2 flex-shrink-0">
                    {selectedQuake.earthquake.hypocenter.name} — {sortedPoints.length} 観測点
                  </div>
                  <div className="overflow-y-auto flex-grow flex flex-col gap-1 custom-scrollbar">
                    {sortedPoints.map((pt, i) => {
                      const color = getIntensityColor(pt.scale);
                      const label = SCALE_LABELS[pt.scale] || '?';
                      return (
                        <div key={i} className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1.5 border border-white/5 flex-shrink-0">
                          <div
                            className="min-w-[28px] h-[28px] rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {label}
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <div className="text-[0.85rem] font-medium text-white/90 whitespace-nowrap overflow-hidden text-ellipsis">
                              {pt.addr || pt.pref}
                            </div>
                            <div className="text-[0.65rem] text-white/40">{pt.pref}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {leftTab === 'settings' && (
          <div className="glass-panel flex-grow rounded-xl pointer-events-auto overflow-y-auto custom-scrollbar p-4 flex flex-col gap-5">
            <div>
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">表示</div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white/90">観測点マーカー</div>
                    <div className="text-[11px] text-white/40">震度数字を地図に表示</div>
                  </div>
                  <button
                    onClick={() => setShowObsPoints(v => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 border ${showObsPoints ? 'bg-[#38bdf8] border-[#38bdf8]' : 'bg-white/10 border-white/20'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${showObsPoints ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white/90">EEW推定震度マップ</div>
                    <div className="text-[11px] text-white/40">EEW発報時に全県の推定震度を塗る</div>
                  </div>
                  <button
                    onClick={() => setShowEEWMap(v => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 border ${showEEWMap ? 'bg-[#38bdf8] border-[#38bdf8]' : 'bg-white/10 border-white/20'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${showEEWMap ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>
              </div>
            </div>

            <div className="border-t border-white/8 pt-4">
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">音声・通知</div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white/90">アラート音</div>
                    <div className="text-[11px] text-white/40">EEW・津波警報時の音声通知</div>
                  </div>
                  <button
                    onClick={handleSoundToggle}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 border ${isSoundEnabled ? 'bg-[#38bdf8] border-[#38bdf8]' : 'bg-white/10 border-white/20'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isSoundEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white/90">プッシュ通知</div>
                    <div className="text-[11px] text-white/40">
                      {notifPermission === 'denied' ? '通知がブロックされています（ブラウザ設定を確認）' : 'EEW・津波警報をブラウザ通知でお知らせ'}
                    </div>
                  </div>
                  <button
                    onClick={toggleNotif}
                    disabled={notifPermission === 'denied'}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 border ${notifPermission === 'denied' ? 'bg-white/5 border-white/10 cursor-not-allowed' : notifEnabled ? 'bg-[#38bdf8] border-[#38bdf8]' : 'bg-white/10 border-white/20'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${notifEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>
              </div>
            </div>

            <div className="border-t border-white/8 pt-4">
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">震度スケール</div>
              <div className="grid grid-cols-3 gap-1.5">
                {([10,20,30,40,45,50,55,60,70] as const).map(s => (
                  <div key={s} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 bg-black/30 border border-white/5">
                    <div className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white shrink-0"
                      style={{ backgroundColor: getIntensityColor(s) }}>
                      {SCALE_LABELS[s]}
                    </div>
                    <div className="text-[10px] text-white/50 leading-tight">{getIntensityColor(s)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/8 pt-4">
              <div className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">データソース</div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-white/90">P2P地震情報 サンドボックス</div>
                    <div className="text-[11px] text-white/40">過去の地震・津波データを約30秒間隔で再生</div>
                  </div>
                  <button
                    onClick={() => setIsSandboxMode(v => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 border ${isSandboxMode ? 'bg-amber-500 border-amber-500' : 'bg-white/10 border-white/20'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isSandboxMode ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>
                {isSandboxMode && (
                  <div className="text-[10px] text-amber-400/80 bg-amber-400/8 rounded-lg px-2 py-1.5 border border-amber-400/15">
                    接続先: wss://api-realtime-sandbox.p2pquake.net/v2/ws
                    <br />再生中: 2023/4/1〜10/19の地震・津波データ
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/8 pt-4 mt-auto">
              <div className="text-[11px] text-white/25 text-center">地震監視モニター Ver 2.2.0</div>
            </div>
          </div>
        )}

      </div>

      {/* Clock + update status */}
      <div ref={updatePanelRef} className="current-time-panel absolute top-5 left-[390px] z-50 flex items-center gap-2">
        <div className="rounded-xl border border-white/10 bg-[#141419]/85 px-4 py-3 text-white backdrop-blur-md shadow-2xl">
          <div className="text-sm font-bold text-white">現在時刻</div>
          <div className="text-sm text-white">{currentTime}</div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowUpdatePanel(v => !v)}
            className="rounded-xl border border-white/10 bg-[#141419]/85 px-3 py-3 text-white backdrop-blur-md shadow-2xl hover:bg-white/10 transition-colors cursor-pointer"
            title="最終更新状況"
          >
            <div className="text-[10px] text-white/50 leading-tight">最終</div>
            <div className="text-[10px] text-white/50 leading-tight">更新</div>
          </button>
          {showUpdatePanel && (
            <div className="absolute top-full left-0 mt-2 w-56 rounded-xl border border-white/15 bg-[#141419]/95 p-3 shadow-2xl backdrop-blur-md text-xs space-y-2">
              <div className="text-white/50 font-bold mb-1">最終更新状況</div>
              <div className="flex justify-between items-center">
                <span className="text-white/70">地震情報</span>
                <span className="text-white font-mono">{lastUpdate}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/70">津波情報</span>
                <span className="text-white font-mono">{lastTsunamiUpdate}</span>
              </div>
              <div className="border-t border-white/10 pt-2">
                <div className="text-white/50 mb-0.5">EEW接続</div>
                <div className={`font-semibold ${status.includes('Online') ? 'text-green-400' : 'text-yellow-400'}`}>
                  {status}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tsunami panel */}
      {tsunami && tsunami.areas.length > 0 && (
        <div
          className={`tsunami-panel absolute top-20 right-5 z-50 w-[360px] max-w-[calc(100vw-40px)] rounded-2xl border bg-[#141419]/92 p-4 text-white backdrop-blur-md shadow-2xl
            ${isEEWMode || tsunamiSource ? 'hidden' : ''}`}
          style={{ borderColor: tsunamiLevel ? `${getTsunamiGradeColor(tsunamiLevel)}55` : 'rgba(255,255,255,0.15)' }}
        >
          <div className="mb-3">
            <div className="text-lg font-black" style={{ color: tsunamiLevel ? getTsunamiGradeColor(tsunamiLevel) : '#fff' }}>
              {tsunamiLevel ? getTsunamiGradeLabel(tsunamiLevel) : '津波情報'} 発表中
            </div>
            <div className="text-xs text-white/60">最終更新：{lastTsunamiUpdate}</div>
          </div>
          <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar">
            {tsunami.areas.map(area => {
              const arrived = area.immediate;
              return (
                <div
                  key={`${area.name}-${area.grade}`}
                  className="rounded-lg border border-white/10 bg-black/35 p-2"
                  style={arrived ? { borderColor: `${getTsunamiGradeColor(area.grade)}88` } : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{area.name}</span>
                    <div className="flex items-center gap-1">
                      {arrived && (
                        <span className="rounded px-2 py-0.5 text-xs font-black bg-white text-black animate-pulse">
                          到達済み
                        </span>
                      )}
                      <span
                        className="rounded px-2 py-0.5 text-xs font-black"
                        style={{
                          backgroundColor: getTsunamiGradeColor(area.grade),
                          color: area.grade === 'Watch' ? '#111827' : '#fff',
                        }}
                      >
                        {getTsunamiGradeLabel(area.grade)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-white/75">
                    {arrived
                      ? '津波到達中 / '
                      : `到達予想：${area.firstHeight?.condition || area.firstHeight?.arrivalTime || '調査中'} / `}
                    高さ：{area.maxHeight?.description || '不明'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="status-bar absolute bottom-5 right-5 z-50 flex items-center gap-2">
        <button
          onClick={() => toggleTest(isSoundEnabled)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer backdrop-blur-md
            ${isTestMode
              ? 'text-red-300 border-red-400/60 bg-red-900/50 shadow-[0_0_10px_rgba(220,38,38,0.3)]'
              : 'text-white/35 border-white/10 bg-[#141419]/85 hover:text-white/60'}`}
        >
          {isTestMode ? '⏹ TEST終了' : 'TEST'}
        </button>
        <div className="bg-[#141419]/85 backdrop-blur-md px-4 py-2 rounded-full text-xs text-[#a0a0a8]">
          {isSandboxMode ? (sandboxStatus || 'Sandbox...') : status} | Ver 2.2.0
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
