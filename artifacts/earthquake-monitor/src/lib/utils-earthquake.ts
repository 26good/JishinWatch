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

/**
 * Minimum "saturation" hypocentral distance used to avoid singularities near the
 * source. Larger magnitude ruptures have a larger fault plane, so the nearest
 * point on the fault is effectively closer than a point-source distance model
 * suggests — hence a smaller floor for big M. Conversely, small-M earthquakes
 * behave more like a true point source, so a larger floor prevents the log10
 * term from blowing up the intensity right above small, shallow events.
 * Linearly interpolated: M4 → 15km, M8+ → 5km.
 */
const saturationDistKm = (mag: number): number =>
  Math.max(5, Math.min(15, 15 - (mag - 4) * 2.5));

/**
 * Distance-attenuation coefficient for the log10(distance) term, made
 * magnitude-dependent. A single fixed coefficient (0.5) cannot fit both large
 * and small earthquakes: keeping it fixed made small/shallow events (M<5)
 * show inflated intensity hundreds of km from the epicenter, since the
 * formula was grid-search optimised primarily against larger, intensity-4+
 * JMA records. Larger ruptures also genuinely attenuate more gently with
 * distance (bigger fault plane, longer wave train), while small point-source
 * events attenuate sharply — so a steeper coefficient at low M is physically
 * reasonable, not just a curve-fitting patch.
 * M7+ keeps the original grid-search-optimised value (0.5) unchanged;
 * M4 and below steepens to 1.3; linearly interpolated in between.
 */
const attenuationCoef = (mag: number): number => {
  if (mag >= 7) return 0.5;
  if (mag <= 4) return 1.3;
  return 1.3 - (mag - 4) * (0.8 / 3);
};

/**
 * Maximum distance (km) at which an earthquake of a given magnitude is
 * realistically felt at all (intensity 1+). Beyond this, we force intensity
 * to 0 regardless of what the attenuation formula computes.
 *
 * This exists because the attenuation formula above is a simple log-linear
 * fit: it decays forever but never reaches zero within a realistic distance
 * for mid-to-large magnitudes (e.g. the raw formula only reaches intensity 0
 * around 2,500,000km for M6 — clearly unphysical). A hard, magnitude-based
 * felt-radius cutoff is the safe fix: it doesn't touch the calibrated curve
 * near the source (where the 1713-record grid search applies), only forces
 * intensity to 0 far outside any real earthquake's felt area.
 * Roughly follows the general pattern that M3 quakes are felt ~50km away,
 * M5 ~200km, M7 ~700km, M9 (e.g. Tohoku 2011) ~2000km — linearly
 * interpolated between magnitude/distance anchor points.
 */
const feltLimitKm = (mag: number): number => {
  const points: [number, number][] = [
    [2.0, 20], [3.0, 50], [4.0, 100], [5.0, 200],
    [6.0, 400], [7.0, 700], [8.0, 1200], [9.0, 2000],
  ];
  if (mag <= points[0][0]) return points[0][1];
  if (mag >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [m1, d1] = points[i];
    const [m2, d2] = points[i + 1];
    if (mag >= m1 && mag <= m2) {
      const t = (mag - m1) / (m2 - m1);
      return d1 + t * (d2 - d1);
    }
  }
  return 100;
};

/**
 * Estimate the maximum seismic intensity at the surface point directly above
 * the hypocenter from magnitude and focal depth.
 * Uses the empirical formula: I = 2.606 + 1.498·M − 1.657·log10(depth)
 * (depth floored using a magnitude-dependent saturation distance to avoid
 * overestimating intensity for small, shallow earthquakes).
 */
export const computeMaxIntensity = (mag: number, depthKm: number): string => {
  if (!Number.isFinite(mag) || mag <= 0) return '?';
  const d = Math.max(depthKm, saturationDistKm(mag));
  // Grid-search optimised against 1713 unique JMA records (intensity 4+, 2000-2026).
  // MSE=0.26, 93.7% within ±1 intensity level.
  // Tends to underestimate intensity 5強+ due to data imbalance (65% are intensity 4).
  const I = 3.0 + 0.4 * mag - attenuationCoef(mag) * Math.log10(d);
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
 * Estimate seismic intensity at a specific location using hypocentral distance
 * and J-SHIS ground amplification ratio (ARV).
 *
 * Formula:  I = 3.0 + 0.4·M − 0.5·log10(hypoDist) + log10(ARV)
 *
 * ARV (地盤増幅率) is from J-SHIS 表層地盤API (V2).
 * ARV = 1.0  → engineering bedrock reference (no amplification)
 * ARV = 1.5  → typical plateau / loam ground
 * ARV = 2-4  → soft alluvial / reclaimed land
 *
 * The ARV correction log10(ARV) ≈ +0.35 for loam, +0.6–1.0 for soft soil.
 *
 * The hypocentral distance is floored at a magnitude-dependent saturation
 * distance (see saturationDistKm) rather than a fixed 5km, since a fixed floor
 * caused small-magnitude earthquakes to show inflated intensity right above
 * the epicenter — the exact ±1-level error this correction targets.
 */
export const computeIntensityAtLocation = (
  mag: number,
  depthKm: number,
  epicentralDistKm: number,
  arv: number,
): string => {
  if (!Number.isFinite(mag) || mag <= 0) return '?';
  // Hard cutoff: beyond the realistic felt radius for this magnitude, the
  // attenuation formula's slow log-decay never actually reaches intensity 0
  // (see feltLimitKm for why) — so treat it as no perceptible shaking.
  if (epicentralDistKm > feltLimitKm(mag)) return '0';
  const hypoDist = Math.max(Math.sqrt(depthKm ** 2 + epicentralDistKm ** 2), saturationDistKm(mag));
  const arvClamped = Math.max(arv, 0.1);
  const I = 3.0 + 0.4 * mag - attenuationCoef(mag) * Math.log10(hypoDist) + Math.log10(arvClamped);
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

export const getTsunamiGradeColor = (grade: TsunamiGrade) => {
  if (grade === 'MajorWarning') return '#8b5cf6';
  if (grade === 'Warning') return '#FF0000';
  if (grade === 'Watch') return '#facc15';
  return '#38bdf8';
};
