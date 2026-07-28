import { useState, useRef, useCallback } from 'react';
import { EEWData, EarthquakeHistoryItem, TsunamiInfo, computeIntensityAtLocation } from '../lib/utils-earthquake';
import { PREF_COORDS, PACIFIC_COASTAL_PREFS } from '../lib/pref-coords';
import { initAudioContext, playSound } from '../lib/audio';

const fmt = (d: Date) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

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

// 震度文字列 → 10倍整数（scale値）
const scaleTextToNum = (text: string): number => {
  const map: Record<string, number> = {
    '0': 0, '1': 10, '2': 20, '3': 30, '4': 40,
    '5弱': 45, '5強': 50, '6弱': 55, '6強': 60, '7': 70,
  };
  return map[text] ?? 0;
};

const scaleToText = (s: number) => {
  const rev: Record<number, string> = { 0: '0', 10: '1', 20: '2', 30: '3', 40: '4', 45: '5弱', 50: '5強', 55: '6弱', 60: '6強', 70: '7' };
  return rev[s] || '4';
};

// 主要な震源候補エリア（海溝・トラフ沿いの海域中心）
type EpicenterZone = { name: string; latRange: [number, number]; lngRange: [number, number]; offshore: boolean };
const EPICENTER_ZONES: EpicenterZone[] = [
  { name: '三陸沖',                   latRange: [38.0, 41.5], lngRange: [142.5, 144.5], offshore: true },
  { name: '日本海溝',                 latRange: [35.5, 38.0], lngRange: [141.0, 143.0], offshore: true },
  { name: '根室沖',                   latRange: [41.5, 43.5], lngRange: [144.5, 147.0], offshore: true },
  { name: '相模トラフ',               latRange: [34.7, 35.5], lngRange: [138.8, 140.0], offshore: true },
  { name: '南海トラフ（東海）',        latRange: [33.5, 34.8], lngRange: [137.0, 138.8], offshore: true },
  { name: '南海トラフ（紀伊半島沖）',   latRange: [32.8, 33.8], lngRange: [135.5, 137.0], offshore: true },
  { name: '南海トラフ（四国沖）',      latRange: [32.0, 33.2], lngRange: [132.5, 135.5], offshore: true },
  { name: '日向灘',                   latRange: [31.0, 32.5], lngRange: [131.5, 132.5], offshore: true },
  { name: '南西諸島（沖縄近海）',       latRange: [24.0, 27.0], lngRange: [123.0, 129.0], offshore: true },
  { name: '択捉島沖',                 latRange: [43.5, 45.5], lngRange: [147.0, 149.0], offshore: true },
];

const randRange = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

type ScenarioQuake = {
  lat: number;
  lng: number;
  depth: number;
  mag: number;
  hypoName: string;
  offshore: boolean;
  points: { pref: string; addr: string; isArea: boolean; scale: number }[];
  maxScale: number;
};

// 震源・M・深さから、各都道府県の震度分布と最大震度を計算する
const buildScenario = (): ScenarioQuake => {
  const zone = pick(EPICENTER_ZONES);
  const lat = randRange(zone.latRange[0], zone.latRange[1]);
  const lng = randRange(zone.lngRange[0], zone.lngRange[1]);
  const mag = Math.round(randRange(7.0, 9.0) * 10) / 10; // M7.0〜9.0、常に7以上
  const depth = Math.round(randRange(10, 100));

  const points = Object.entries(PREF_COORDS)
    .map(([pref, coord]) => {
      const distKm = haversineKm(lat, lng, coord.lat, coord.lng);
      const text = computeIntensityAtLocation(mag, depth, distKm, 1.0);
      const scale = scaleTextToNum(text);
      return { pref, addr: coord.addr, isArea: false, scale };
    })
    .filter(p => p.scale >= 10) // 震度1未満は表示しない
    .sort((a, b) => b.scale - a.scale);

  const maxScale = points.length > 0 ? points[0].scale : 10;

  return { lat, lng, depth, mag, hypoName: zone.name, offshore: zone.offshore, points, maxScale };
};

const makeEEW = (
  serial: number, mag: string, maxInt: string, warning: boolean, final: boolean,
  originTime: string, lat: number, lng: number, depth: number, hypoName: string,
): EEWData => ({
  type: 'jma_eew',
  isCancel: false,
  isFinal: final,
  Title: warning ? '緊急地震速報（警報）' : '緊急地震速報（予報）',
  Hypocenter: hypoName,
  OriginTime: originTime,
  MaxInt: maxInt,
  Magnitude: mag,
  Latitude: lat,
  Longitude: lng,
  Depth: depth.toString(),
  Serial: serial.toString(),
});

const makeQuake = (scenario: ScenarioQuake, originTime: string): EarthquakeHistoryItem => ({
  id: `test-${Date.now()}`,
  time: originTime,
  earthquake: {
    time: originTime,
    hypocenter: { name: scenario.hypoName, latitude: scenario.lat, longitude: scenario.lng, depth: scenario.depth, magnitude: scenario.mag },
    maxScale: scenario.maxScale,
    domesticTsunami: scenario.offshore && scenario.depth < 60 ? 'Warning' : 'None',
  },
  points: scenario.points,
});

// 津波の警報レベルをM・深さ・震源が海域かどうかから判定
const decideTsunamiGrade = (scenario: ScenarioQuake): 'MajorWarning' | 'Warning' | 'Watch' | null => {
  if (!scenario.offshore || scenario.depth >= 80) return null;
  if (scenario.mag >= 8.3) return 'MajorWarning';
  if (scenario.mag >= 7.7) return 'Warning';
  if (scenario.mag >= 7.0) return 'Watch';
  return null;
};

// 震源座標から見た北海道側の最も近い予報区名を大まかに判定する
// (Map.tsx側のclassifyHokkaidoZoneと対になる簡易ロジック)
const hokkaidoZoneFromEpicenter = (lat: number, lng: number): string => {
  if (lat >= 43.5 && lng <= 143.0) return lng <= 141.5 ? '北海道日本海沿岸北部' : 'オホーツク海沿岸';
  if (lat >= 43.0 && lng > 143.0) return '北海道太平洋沿岸東部';
  if (lng <= 140.8) return '北海道太平洋沿岸西部';
  if (lng <= 142.5) return '北海道太平洋沿岸中部';
  return '北海道太平洋沿岸東部';
};

// 震源に近い太平洋沿岸県を到達予想順に並べ、津波情報を組み立てる
const makeTsunami = (scenario: ScenarioQuake, grade: 'Watch' | 'Warning' | 'MajorWarning'): TsunamiInfo => {
  const nearCoasts = PACIFIC_COASTAL_PREFS
    .map(pref => ({ pref, dist: haversineKm(scenario.lat, scenario.lng, PREF_COORDS[pref].lat, PREF_COORDS[pref].lng) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 5);

  const gradeAt = (i: number): 'MajorWarning' | 'Warning' | 'Watch' => {
    if (i === 0) return grade;
    if (i === 1) return grade === 'MajorWarning' ? 'Warning' : grade === 'Warning' ? 'Watch' : 'Watch';
    return 'Watch';
  };

  const heightFor = (g: string) => g === 'MajorWarning'
    ? { description: '５ｍ以上', value: 5 }
    : g === 'Warning'
    ? { description: '３ｍ', value: 3 }
    : { description: '１ｍ未満', value: 0.5 };

  return {
    id: `test-tsunami-${Date.now()}`,
    code: 552,
    cancelled: false,
    time: new Date().toISOString(),
    issue: { source: '気象庁', time: new Date().toISOString(), type: 'Focus' },
    areas: nearCoasts.map((c, i) => {
      const g = gradeAt(i);
      const arrivalMin = 10 + Math.round(c.dist / 20);
      // 北海道は予報区(沿岸の方角)まで指定しないと、震源と反対側の海岸まで
      // 警報色で塗られてしまうため、震源座標から予報区名を判定して付与する
      const name = c.pref === '北海道' ? hokkaidoZoneFromEpicenter(scenario.lat, scenario.lng) : c.pref;
      return {
        name,
        grade: g,
        immediate: false,
        firstHeight: { arrivalTime: `約${arrivalMin}分後` },
        maxHeight: heightFor(g),
      };
    }),
  };
};

export const PHASE_LABELS = [
  '',
  '第1報 受信',
  '第2報 更新',
  '第3報 更新',
  '警報発令',
  '警報継続',
  '最終報',
  '地震確定',
  '津波注意報',
  '津波警報',
  '大津波警報',
];

export const TEST_TOTAL_PHASES = 10;
export const TEST_TOTAL_SEC = 170;

export const useTestMode = () => {
  const [isTestMode, setIsTestMode] = useState(false);
  const [testEEW, setTestEEW] = useState<EEWData | null>(null);
  const [testQuake, setTestQuake] = useState<EarthquakeHistoryItem | null>(null);
  const [testTsunami, setTestTsunami] = useState<TsunamiInfo | null>(null);
  const [testPhase, setTestPhase] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const soundRef = useRef(true);

  const stop = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setIsTestMode(false);
    setTestEEW(null);
    setTestQuake(null);
    setTestTsunami(null);
    setTestPhase(0);
  }, []);

  const start = useCallback((soundEnabled: boolean) => {
    soundRef.current = soundEnabled;
    const origin = new Date();
    const originStr = fmt(origin);

    // 毎回ランダムな震源・M(常に7以上)・深さでシナリオを生成し、
    // 各都道府県の震度は震源からの距離とMから計算する
    const scenario = buildScenario();
    const finalMaxInt = scaleToText(scenario.maxScale);

    setIsTestMode(true);
    setTestPhase(0);
    setTestEEW(null);
    setTestQuake(null);
    setTestTsunami(null);
    timersRef.current.forEach(clearTimeout);

    const snd = (fn: () => void) => {
      if (soundRef.current) { initAudioContext(); fn(); }
    };

    // EEWは実際の速報と同様、第1報は震源・Mともに粗い推定で、
    // 続報が数秒おきに連続して届き、徐々に確定値へ収束していく。
    const magEstimates = [
      Math.max(5.5, scenario.mag - randRange(1.0, 1.8)),
      Math.max(5.8, scenario.mag - randRange(0.4, 1.0)),
      Math.max(6.2, scenario.mag - randRange(0.1, 0.5)),
      scenario.mag,
      scenario.mag,
    ];
    const intEstimates = [
      scaleToText(Math.max(10, scenario.maxScale - 20)),
      scaleToText(Math.max(20, scenario.maxScale - 10)),
      scaleToText(Math.max(30, scenario.maxScale - 5)),
      finalMaxInt,
      finalMaxInt,
    ];
    const isWarningLevel = scenario.maxScale >= 50; // 震度5強以上で警報級

    const timeline: { delay: number; fn: () => void }[] = [
      // 第1〜3報は本番同様、数秒おきに立て続けに更新される
      { delay: 0, fn: () => {
        setTestEEW(makeEEW(1, magEstimates[0].toFixed(1), intEstimates[0], false, false, originStr, scenario.lat, scenario.lng, scenario.depth, scenario.hypoName));
        setTestPhase(1);
        snd(playSound.caution);
      }},
      { delay: 3000, fn: () => {
        setTestEEW(makeEEW(2, magEstimates[1].toFixed(1), intEstimates[1], false, false, originStr, scenario.lat, scenario.lng, scenario.depth, scenario.hypoName));
        setTestPhase(2);
        snd(playSound.update);
      }},
      { delay: 6000, fn: () => {
        setTestEEW(makeEEW(3, magEstimates[2].toFixed(1), intEstimates[2], isWarningLevel, false, originStr, scenario.lat, scenario.lng, scenario.depth, scenario.hypoName));
        setTestPhase(3);
        snd(isWarningLevel ? playSound.alert : playSound.update);
      }},
      { delay: 10000, fn: () => {
        setTestEEW(makeEEW(4, magEstimates[3].toFixed(1), intEstimates[3], isWarningLevel, false, originStr, scenario.lat, scenario.lng, scenario.depth, scenario.hypoName));
        setTestPhase(4);
        snd(playSound.update);
      }},
      { delay: 22000, fn: () => {
        setTestEEW(makeEEW(5, magEstimates[4].toFixed(1), intEstimates[4], isWarningLevel, true, originStr, scenario.lat, scenario.lng, scenario.depth, scenario.hypoName));
        setTestPhase(5);
        snd(playSound.end);
      }},
      { delay: 40000, fn: () => {
        setTestEEW(null);
        setTestQuake(makeQuake(scenario, originStr));
        setTestPhase(6);
      }},
    ];

    // 津波はシナリオ次第で発生させる（内陸直下型・深発地震では発生しない）
    const tsunamiGrade = decideTsunamiGrade(scenario);
    if (tsunamiGrade) {
      const gradeOrder: ('Watch' | 'Warning' | 'MajorWarning')[] =
        tsunamiGrade === 'MajorWarning' ? ['Watch', 'Warning', 'MajorWarning']
        : tsunamiGrade === 'Warning' ? ['Watch', 'Warning']
        : ['Watch'];
      const tsunamiDelays = [55000, 70000, 85000];
      const tsunamiPhaseStart = 8;
      const soundFor = (g: string) => g === 'MajorWarning' ? playSound.tsunamiDanger : g === 'Warning' ? playSound.alert : playSound.caution;
      gradeOrder.forEach((g, i) => {
        timeline.push({ delay: tsunamiDelays[i], fn: () => {
          setTestTsunami(makeTsunami(scenario, g));
          setTestPhase(tsunamiPhaseStart + i);
          snd(soundFor(g));
        }});
      });
    }

    timeline.push({ delay: TEST_TOTAL_SEC * 1000, fn: stop });

    timersRef.current = timeline.map(({ delay, fn }) => setTimeout(fn, delay));
  }, [stop]);

  const toggle = useCallback((soundEnabled: boolean) => {
    if (isTestMode) stop(); else start(soundEnabled);
  }, [isTestMode, start, stop]);

  return { isTestMode, testEEW, testQuake, testTsunami, testPhase, toggle, stop };
};
