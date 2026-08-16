export type EarthquakeHistoryItem = {
  id: string;
  time: string;
  earthquake: {
    time: string;
    hypocenter: {
      name: string;
      latitude: number;
      longitude: number;
      depth: number;
      magnitude: number;
    };
    maxScale: number;
    domesticTsunami: string;
  };
  points: {
    pref: string;
    addr: string;
    isArea: boolean;
    scale: number;
  }[];
};

export type TsunamiGrade = 'MajorWarning' | 'Warning' | 'Watch' | string;

export type TsunamiArea = {
  name: string;
  grade: TsunamiGrade;
  immediate: boolean;
  firstHeight?: {
    arrivalTime?: string;
    condition?: string;
  };
  maxHeight?: {
    description?: string;
    value?: number;
  };
};

export type TsunamiInfo = {
  id: string;
  code: number;
  cancelled: boolean;
  time: string;
  issue?: {
    source?: string;
    time?: string;
    type?: string;
  };
  areas: TsunamiArea[];
};

export type EEWData = {
  type: string;
  isCancel: boolean;
  isFinal: boolean;
  Title: string;
  Hypocenter: string;
  OriginTime: string;
  MaxInt: string;
  MaxIntensity?: string;
  Magunitude?: string;
  Magnitude?: string;
  Latitude?: string | number;
  Longitude?: string | number;
  latitude?: string | number;
  longitude?: string | number;
  Depth: string;
  Serial: string;
};

export const getScaleText = (scale: number) => {
  const map: Record<number, string> = {
    10: '1', 20: '2', 30: '3', 40: '4', 45: '5-', 50: '5+', 55: '6-', 60: '6+', 70: '7'
  };
  return map[scale] || '?';
};

// Intensity color scale — chosen to NOT overlap with tsunami indicator colors:
//   Tsunami Watch=#facc15(yellow), Warning=#ef4444(red), MajorWarning=#8b5cf6(purple)
// 1-3: blue→teal→lime  4: amber  5-/5+: orange  6-/6+: dark-red  7: magenta
export const getIntensityColor = (scale: number | string | undefined) => {
  if (typeof scale === 'string') {
    const normalized = scale.replace('弱', '-').replace('強', '+');
    const map: Record<string, string> = {
      '1': '#60a5fa',   // blue-400
      '2': '#34d399',   // emerald-400
      '3': '#a3e635',   // lime-400
      '4': '#fbbf24',   // amber-400
      '5-': '#f97316',  // orange-500
      '5+': '#ea580c',  // orange-600
      '6-': '#dc2626',  // red-600  (darker than tsunami Warning #ef4444)
      '6+': '#991b1b',  // red-800
      '7': '#be185d',   // pink-700 (magenta — clearly distinct from tsunami purple)
    };
    return map[normalized] || '#4b89a8';
  }

  const map: Record<number, string> = {
    10: '#60a5fa',
    20: '#34d399',
    30: '#a3e635',
    40: '#fbbf24',
    45: '#f97316',
    50: '#ea580c',
    55: '#dc2626',
    60: '#991b1b',
    70: '#be185d',
  };
  return scale ? map[scale] || '#4b89a8' : '#4b89a8';
};

export const getMagColor = (mag: number) => {
  if (!Number.isFinite(mag) || mag <= 0) return '#a0a0a8';
  if (mag < 2.0) return '#3b82f6';
  if (mag < 4.0) return '#22c55e';
  if (mag < 5.0) return '#facc15';
  if (mag < 6.0) return '#f97316';
  if (mag < 7.0) return '#ef4444';
  return '#8b5cf6';
};

export const getDepthColor = (depth: number | string) => {
  if (depth === "ごく浅い" || depth === 0) return '#ef4444';
  if (typeof depth !== 'number' || !Number.isFinite(depth)) return '#a0a0a8';
  if (depth <= 30) return '#ef4444';
  if (depth <= 80) return '#facc15';
  if (depth <= 150) return '#22c55e';
  return '#3b82f6';
};

export const getTsunamiGradeLabel = (grade: TsunamiGrade) => {
  if (grade === 'MajorWarning') return '大津波警報';
  if (grade === 'Warning') return '津波警報';
  if (grade === 'Watch') return '津波注意報';
  return '津波情報';
};

// =========================================================
// 震度計算（Qwen提案式ベース）
// =========================================================
//
// 地震タイプ（内陸地殻内 / プレート境界 / 深発）ごとに異なる距離減衰パラメータを
// 持たせた対数減衰式。震央地名に含まれるキーワードと深さから地震タイプを判定する。

type EqType = 'crustal' | 'plate' | 'deep';

// 司・翠川(1999)の地震タイプ別係数 d（内陸地殻内:0、プレート間:-0.02、プレート内(深発相当):0.12）
const D_COEF: Record<EqType, number> = { crustal: 0, plate: -0.02, deep: 0.12 };

const PLATE_KEYWORDS = [
  '沖', '灘', 'トラフ', '海溝', '湾', '近海', '太平洋', '日本海溝', '千島', '南海', '東海', '日向',
];

const getEqType = (epicenterName: string, depthKm: number): EqType => {
  if (depthKm >= 100) return 'deep';
  if (PLATE_KEYWORDS.some(k => epicenterName.includes(k))) return 'plate';
  return 'crustal';
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toJmaString = (I: number): string => {
  if (I < 0.5) return '0';
  if (I < 1.5) return '1';
  if (I < 2.5) return '2';
  if (I < 3.5) return '3';
  if (I < 4.5) return '4';
  if (I < 5.0) return '5弱';
  if (I < 5.5) return '5強';
  if (I < 6.0) return '6弱';
  if (I < 6.5) return '6強';
  return '7';
};

/**
 * 司・翠川(1999)距離減衰式 — 気象庁が緊急地震速報の予測震度算出に実際に
 * 使用している経験的手法（気象庁「緊急地震速報の概要や処理手法に関する
 * 技術的参考資料」に明記）。工学的基盤(Vs=600m/s)上のPGVを求め、
 * 松岡・翠川(1994)の簡便変換とJ-SHIS地盤増幅率(ARV)で地表面PGVに補正し、
 * 翠川ほか(1999)の計測震度変換式で震度に変換する。
 *
 *   Mw = Mjma - 0.171                      （宇津 1982）
 *   L  = 10^(0.5*Mw - 1.85) / 2             断層半径（宇津 1977の相似則）
 *   X  = max(√(depth² + dist²) - L, 3)      断層最短距離（km、下限3km）
 *   log10(PGV600) = 0.58*Mw + 0.0038*depth + d
 *                    - log10(X + 0.0028*10^(0.5*Mw)) - 0.002*X - 1.29
 *   PGV400 = PGV600 * 1.31                  （松岡・翠川1994の簡便変換）
 *   PGVs   = PGV400 * ARV                   地表面PGV
 *   I = 2.68 + 1.72*log10(PGVs)             計測震度（翠川ほか 1999）
 *
 * 気象庁も「震度階級で±1程度の誤差が生じる」と公式に認めている手法であり、
 * 完璧な一致ではなく実務水準の近似値として扱う（EEWは公式警報の代替では
 * なく参考値である旨、アプリ内で明示している）。
 * なお深さ100km以深（深発地震）は運用上、司・翠川式の適用範囲外のため
 * 過大評価しやすいことが知られており、getEqTypeでdeep(d=0.12)扱いとする。
 */
const computeShiiIntensity = (
  magJma: number,
  depthKm: number,
  epicentralDistKm: number,
  arv: number,
  epicenterName: string,
): number => {
  const magW = magJma - 0.171;
  const eqType = getEqType(epicenterName, depthKm);
  const d = D_COEF[eqType];

  const faultHalfLen = Math.pow(10, 0.5 * magW - 1.85) / 2;
  const hypoDist = Math.sqrt(depthKm ** 2 + epicentralDistKm ** 2) - faultHalfLen;
  const X = Math.max(hypoDist, 3);

  const logPgv600 = 0.58 * magW + 0.0038 * depthKm + d
    - Math.log10(X + 0.0028 * Math.pow(10, 0.5 * magW))
    - 0.002 * X - 1.29;
  const pgv600 = Math.pow(10, logPgv600);

  const pgv400 = pgv600 * 1.31;
  const pgvSurface = pgv400 * Math.max(arv, 0.1);

  const I = 2.68 + 1.72 * Math.log10(Math.max(pgvSurface, 1e-6));
  return clamp(I, 0.0, 7.0);
};

/**
 * Estimate the maximum seismic intensity directly above the hypocenter,
 * from magnitude and focal depth (震央地名 not available here, so a
 * neutral 'crustal' type is assumed — this is a point-source estimate
 * only, matching the original call signature).
 */
export const computeMaxIntensity = (mag: number, depthKm: number): string => {
  if (!Number.isFinite(mag) || mag <= 0) return '?';
  const safeDepth = Math.max(0, depthKm);
  const I = computeShiiIntensity(mag, safeDepth, 0, 1.0, '');
  return toJmaString(I);
};

/**
 * Estimate seismic intensity at a specific location using the
 * 司・翠川(1999) distance-attenuation formula — see computeShiiIntensity
 * for the full derivation. ARV (地盤増幅率) is from J-SHIS 表層地盤API (V2).
 * ARV = 1.0  → engineering bedrock reference (no amplification)
 * ARV = 1.5  → typical plateau / loam ground
 * ARV = 2-4  → soft alluvial / reclaimed land
 */
export const computeIntensityAtLocation = (
  mag: number,
  depthKm: number,
  epicentralDistKm: number,
  arv: number,
  epicenterName: string = '',
): string => {
  if (!Number.isFinite(mag) || mag <= 0) return '?';
  const safeDepth = Math.max(0, depthKm);
  const safeDist = Math.max(0, epicentralDistKm);
  const I = computeShiiIntensity(mag, safeDepth, safeDist, arv, epicenterName);
  return toJmaString(I);
};

export const getTsunamiGradeColor = (grade: TsunamiGrade) => {
  if (grade === 'MajorWarning') return '#8b5cf6';
  if (grade === 'Warning') return '#FF0000';
  if (grade === 'Watch') return '#facc15';
  return '#38bdf8';
};
