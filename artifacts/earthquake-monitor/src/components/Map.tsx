import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, GeoJSON, MapContainer, Marker, Polyline, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { EEWData, EarthquakeHistoryItem, TsunamiInfo, getIntensityColor, getScaleText, getTsunamiGradeColor } from '../lib/utils-earthquake';

type UserLocation = { lat: number; lng: number } | null;

export type TsunamiSource = {
  lat: number;
  lng: number;
  time: string;
  grade: string;
} | null;

type Props = {
  currentQuake: EarthquakeHistoryItem | null;
  eew: EEWData | null;
  tsunami: TsunamiInfo | null;
  tsunamiSource: TsunamiSource;
  userLocation: UserLocation;
  onSetUserLocation: (loc: UserLocation) => void;
  settingLocation: boolean;
  userNearestPref?: string | null;
  userLocationIntensity?: string | null;
  showObsPoints?: boolean;
  showEEWMap?: boolean;
  granularity?: 'pref' | 'municipality';
};

const P_WAVE_SPEED_KM_PER_SEC = 6.0;
const S_WAVE_SPEED_KM_PER_SEC = 3.5;
const TSUNAMI_SPEED_KM_PER_SEC = 0.2; // ~720 km/h open ocean
const MAX_WAVE_RADIUS_KM = 2500;

const getWaveRadiusKm = (quakeTime: string, depth: number, speed: number, now: number) => {
  const originTime = new Date(quakeTime.replace(/-/g, '/')).getTime();
  if (!Number.isFinite(originTime)) return 0;
  const elapsedSeconds = Math.max(0, (now - originTime) / 1000);
  const travelDistance = elapsedSeconds * speed;
  const surfaceDistance = Math.sqrt(Math.max(0, travelDistance ** 2 - Math.max(0, depth) ** 2));
  return Math.min(surfaceDistance, MAX_WAVE_RADIUS_KM);
};

const getTsunamiWaveRadiusKm = (originTime: string, now: number) => {
  const ts = new Date(originTime.replace(/-/g, '/')).getTime();
  if (!Number.isFinite(ts)) return 0;
  const elapsed = Math.max(0, (now - ts) / 1000);
  return Math.min(elapsed * TSUNAMI_SPEED_KM_PER_SEC, 4000);
};

const parseCoordinate = (value: string | number | undefined) => {
  if (value === undefined || value === null) return 0;
  const coordinate = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(coordinate) ? coordinate : 0;
};

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Compute JMA intensity scale (×10 integer) from hypocentral distance using
// calibrated attenuation: I = 3.0 + 0.4·M − coef·log10(D), D = hypocentral km.
// Always returns a value (no null) so every prefecture gets colored.
// Same magnitude-dependent saturation floor as computeIntensityAtLocation in
// utils-earthquake.ts — prevents small/shallow EEW events from painting an
// unrealistically large area on the shake map. M4 → 15km, M8+ → 5km.
const saturationDistKm = (mag: number): number =>
  Math.max(5, Math.min(15, 15 - (mag - 4) * 2.5));

// Same magnitude-dependent attenuation coefficient as utils-earthquake.ts —
// a fixed 0.5 coefficient let small/shallow events (M<5) show inflated
// intensity hundreds of km away. M7+ keeps the original grid-search value.
const attenuationCoef = (mag: number): number => {
  if (mag >= 7) return 0.5;
  if (mag <= 4) return 1.3;
  return 1.3 - (mag - 4) * (0.8 / 3);
};

const estimateEEWScale = (surfaceDistKm: number, depthKm: number, magnitude: number): number => {
  if (magnitude <= 0) return 10;
  const floor = saturationDistKm(magnitude);
  const D = Math.max(Math.sqrt(surfaceDistKm ** 2 + Math.max(floor, depthKm) ** 2), floor);
  const I = 3.0 + 0.4 * magnitude - attenuationCoef(magnitude) * Math.log10(D);
  // Convert continuous intensity to JMA scale×10 steps
  const steps = [10, 20, 30, 40, 45, 50, 55, 60, 70];
  const raw = Math.round(I * 10); // e.g. 2.3 → 23
  // Find nearest step at or below raw
  let scale = 10;
  for (const s of steps) {
    if (raw >= s) scale = s;
    else break;
  }
  return Math.min(70, Math.max(10, scale));
};

const AutoZoomToEpicenter = ({
  quake,
  eewLat,
  eewLng,
}: {
  quake: EarthquakeHistoryItem | null;
  eewLat?: number;
  eewLng?: number;
}) => {
  const map = useMap();
  useEffect(() => {
    if (quake && quake.earthquake.hypocenter.latitude > 0) {
      map.flyTo(
        [quake.earthquake.hypocenter.latitude, quake.earthquake.hypocenter.longitude],
        Math.max(map.getZoom(), 7),
        { duration: 1.2 }
      );
    } else if (eewLat && eewLat > 0 && eewLng && eewLng > 0) {
      map.flyTo([eewLat, eewLng], Math.max(map.getZoom(), 6), { duration: 1.0 });
    }
  }, [map, quake?.id, eewLat, eewLng]);
  return null;
};

const MapClickHandler = ({
  settingLocation,
  onSetUserLocation,
}: {
  settingLocation: boolean;
  onSetUserLocation: (loc: UserLocation) => void;
}) => {
  useMapEvents({
    click(e) {
      if (settingLocation) {
        onSetUserLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return null;
};

// 津波情報のエリア名(気象庁の予報区名)から、都道府県名と、
// 北海道の場合は予報区名(沿岸の区分)を判定する。
// 北海道は6つの予報区に分かれており、それぞれ別の沿岸を指すため、
// 都道府県名だけで判定すると反対側の海岸まで警報色で塗られてしまう。
const HOKKAIDO_ZONE_NAMES = [
  '北海道太平洋沿岸東部', '北海道太平洋沿岸中部', '北海道太平洋沿岸西部',
  '北海道日本海沿岸北部', '北海道日本海沿岸南部', 'オホーツク海沿岸',
];
const getTsunamiAreaInfo = (name: string): { pref: string; zone: string | null } | null => {
  const hokkaidoZone = HOKKAIDO_ZONE_NAMES.find(z => name.includes(z));
  if (hokkaidoZone) return { pref: '北海道', zone: hokkaidoZone };
  if (name.includes('北海道')) return { pref: '北海道', zone: null }; // 未知の北海道区分は全域扱い(フォールバック)
  const match = name.match(/[^\s、]+?[都道府県]/);
  return match ? { pref: match[0], zone: null } : null;
};

const useAnimationNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now());
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!active) return;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 80) {
        setNow(Date.now());
        last = ts;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);
  return now;
};

// 北海道の海岸線セグメントを、気象庁の津波予報区(6区分)に近似的に分類する。
// GeoJSONには予報区の属性が無いため、セグメントの重心の緯度経度から簡易的に判定する。
const classifyHokkaidoZone = (coords: [number, number][]): string => {
  const n = coords.length;
  const avgLat = coords.reduce((s, c) => s + c[0], 0) / n;
  const avgLng = coords.reduce((s, c) => s + c[1], 0) / n;

  // 宗谷岬(45.5N, 141.9E)を起点に、日本海側(西)・オホーツク側(北東)・太平洋側(南)を大まかに分ける
  if (avgLat >= 44.0 && avgLng <= 142.0) {
    // 北西〜西: 日本海沿岸
    return avgLat >= 44.8 ? '北海道日本海沿岸北部' : '北海道日本海沿岸南部';
  }
  if (avgLat >= 43.8 && avgLng > 142.0 && avgLng <= 145.3) {
    // 北〜北東: オホーツク海沿岸
    return 'オホーツク海沿岸';
  }
  // 南側: 太平洋沿岸を経度で3分割(西部/中部/東部)
  if (avgLng <= 140.8) return '北海道太平洋沿岸西部';
  if (avgLng <= 143.5) return '北海道太平洋沿岸中部';
  return '北海道太平洋沿岸東部';
};

// Extract coastline segments from prefecture GeoJSON.
// A coastline edge is an outer-ring edge that appears in exactly one prefecture
// (not shared with any neighbour). Holes (inner rings) are ignored.
const extractCoastlines = (geoData: any): Array<{ pref: string; zone: string | null; coords: [number, number][] }> => {
  if (!geoData?.features) return [];

  // --- Step 1: Count every edge on every outer ring ---
  const edgeCounts = new Map<string, number>();
  for (const feature of geoData.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    const outerRings: number[][][] = [];
    if (geom.type === 'Polygon') outerRings.push(geom.coordinates[0]);
    else if (geom.type === 'MultiPolygon')
      for (const poly of geom.coordinates) outerRings.push(poly[0]);

    for (const ring of outerRings) {
      if (!ring || ring.length < 2) continue;
      for (let i = 0; i < ring.length - 1; i++) {
        const a = `${ring[i][0]},${ring[i][1]}`;
        const b = `${ring[i + 1][0]},${ring[i + 1][1]}`;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        edgeCounts.set(k, (edgeCounts.get(k) || 0) + 1);
      }
    }
  }

  // --- Step 2: Walk each outer ring and emit coast segments ---
  const result: Array<{ pref: string; zone: string | null; coords: [number, number][] }> = [];
  for (const feature of geoData.features) {
    const pref = feature.properties?.nam_ja || feature.properties?.name || '';
    const geom = feature.geometry;
    if (!geom || !pref) continue;
    const outerRings: number[][][] = [];
    if (geom.type === 'Polygon') outerRings.push(geom.coordinates[0]);
    else if (geom.type === 'MultiPolygon')
      for (const poly of geom.coordinates) outerRings.push(poly[0]);

    for (const ring of outerRings) {
      if (!ring || ring.length < 2) continue;
      let seg: [number, number][] = [];
      const flush = () => {
        if (seg.length >= 2) {
          const zone = pref === '北海道' ? classifyHokkaidoZone(seg) : null;
          result.push({ pref, zone, coords: seg });
        }
        seg = [];
      };
      for (let i = 0; i < ring.length - 1; i++) {
        const a = `${ring[i][0]},${ring[i][1]}`;
        const b = `${ring[i + 1][0]},${ring[i + 1][1]}`;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgeCounts.get(k) === 1) {
          // coast edge
          if (seg.length === 0) seg.push([ring[i][1], ring[i][0]]);
          seg.push([ring[i + 1][1], ring[i + 1][0]]);
        } else {
          // shared edge — flush current segment
          flush();
        }
      }
      flush();
    }
  }
  return result;
};

export const EarthquakeMap = ({ currentQuake, eew, tsunami, tsunamiSource, userLocation, onSetUserLocation, settingLocation, userNearestPref, userLocationIntensity, showObsPoints = true, showEEWMap = true, granularity = 'pref' }: Props) => {
  const [geoData, setGeoData] = useState<any>(null);
  const [muniGeoData, setMuniGeoData] = useState<any>(null);

  const hasTsunamiInfo = !!tsunami && tsunami.areas.length > 0;
  // キーは都道府県名、または北海道の場合は "都道府県名|予報区名" の複合キー。
  // これにより、北海道の一部予報区だけに警報が出ている場合でも、
  // 該当しない沿岸(反対側など)まで塗られることがなくなる。
  const tsunamiPrefGrades: Record<string, string> = {};
  tsunami?.areas.forEach(area => {
    const info = getTsunamiAreaInfo(area.name);
    if (!info) return;
    const key = info.zone ? `${info.pref}|${info.zone}` : info.pref;
    const current = tsunamiPrefGrades[key];
    if (!current || area.grade === 'MajorWarning' || (area.grade === 'Warning' && current !== 'MajorWarning')) {
      tsunamiPrefGrades[key] = area.grade;
    }
  });

  const coastlines = useMemo(() => geoData ? extractCoastlines(geoData) : [], [geoData]);

  const eewEpicenter =
    eew && !eew.isCancel
      ? {
          lat: parseCoordinate(eew.Latitude ?? eew.latitude),
          lng: parseCoordinate(eew.Longitude ?? eew.longitude),
          depth: parseInt(eew.Depth || '0', 10) || 0,
          time: eew.OriginTime,
        }
      : null;

  const waveEpicenter =
    eewEpicenter && eewEpicenter.lat > 0 && eewEpicenter.lng > 0 ? eewEpicenter : null;

  const animationActive = !!waveEpicenter;
  const now = useAnimationNow(animationActive);

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson')
      .then(r => r.json())
      .then(data => setGeoData(data));
  }, []);

  // Municipality-level boundaries are ~8.7MB, so only fetch them when the user
  // actually switches to the more granular view, and only once.
  useEffect(() => {
    if (granularity === 'municipality' && !muniGeoData) {
      fetch('https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/geojson/s0010/N03-21_210101.json')
        .then(r => r.json())
        .then(data => setMuniGeoData(data))
        .catch(() => {});
    }
  }, [granularity, muniGeoData]);

  const prefScales: Record<string, number> = {};
  if (currentQuake) {
    currentQuake.points.forEach(p => {
      prefScales[p.pref] = Math.max(prefScales[p.pref] || 0, p.scale);
    });
  }

  // Municipality-level scales: color only municipalities with actual observed
  // intensity data (no distance-based estimation — see muniScales below).
  const muniScales = useMemo(() => {
    if (granularity !== 'municipality' || !currentQuake || !muniGeoData) return null;

    // Build a lookup from observed point address text -> scale, to match against municipality names.
    // We only color municipalities with actual observed data — no distance-based estimation,
    // since a point-source intensity formula badly overestimates the affected radius for
    // small/shallow earthquakes (e.g. an M2.8 quake showing intensity 3 hundreds of km away).
    const observed = currentQuake.points.map(p => ({
      pref: p.pref,
      addr: (p.addr || '').replace(/[市区町村郡]$/, ''),
      scale: p.scale,
    }));

    const result: Record<string, number> = {};
    for (const feature of muniGeoData.features) {
      const props = feature.properties || {};
      const code = props.N03_007;
      if (!code) continue;
      const pref = props.N03_001 || '';
      const city = (props.N03_003 || '') + (props.N03_004 || '');

      // Try to match an observed point in the same prefecture whose address is contained in this municipality's name (or vice versa)
      const match = observed.find(o =>
        o.pref === pref && o.addr && (city.includes(o.addr) || o.addr.includes(city.replace(/[市区町村郡]$/, '')))
      );

      if (match && match.scale > 0) {
        result[code] = match.scale;
      }
    }
    return result;
  }, [granularity, currentQuake, muniGeoData]);

  // Style function for the municipality-level GeoJSON layer (used when granularity === 'municipality')
  const getMuniStyle = (feature: any) => {
    const code = feature.properties?.N03_007;
    const scale = code && muniScales ? muniScales[code] : undefined;
    if (scale === undefined) {
      // No intensity data (incl. intensity 0 / out of range) — keep the boundary
      // line visible so municipality borders are always shown, but leave the
      // fill transparent so the underlying prefecture layer's land color shows
      // through instead of this layer appearing to paint every municipality.
      return {
        color: '#3a3a50',
        weight: 0.4,
        fillColor: 'transparent',
        fillOpacity: 0,
        opacity: 1,
      };
    }
    return {
      color: '#3a3a50',
      weight: 0.4,
      fillColor: getIntensityColor(scale),
      fillOpacity: 1,
      opacity: 1,
    };
  };

  const getStyle = (feature: any) => {
    let fillColor = '#15151b';
    let fillOpacity = 1;
    let borderColor = '#3a3a50';
    let borderWeight = 0.8;
    const featureText = JSON.stringify(feature.properties);

    if (currentQuake && !(granularity === 'municipality' && muniGeoData)) {
      for (const pref in prefScales) {
        const prefName = pref.replace(/[県府都]$/, '');
        if (featureText.includes(prefName)) {
          fillColor = getIntensityColor(prefScales[pref]);
          break;
        }
      }
    }

    // EEW shake map: always override with per-prefecture intensity estimate during active EEW
    if (showEEWMap && eew && !eew.isCancel && eewEpicenter && eewEpicenter.lat > 0) {
      const mag = parseFloat((eew as any).Magunitude || eew.Magnitude || '0');
      if (mag > 0) {
        // Use the largest polygon ring to avoid computing distances to small islands
        let coords: number[][] = feature.geometry.coordinates[0];
        if (feature.geometry.type === 'MultiPolygon') {
          let maxLen = 0;
          for (const poly of feature.geometry.coordinates as number[][][][]) {
            if (poly[0].length > maxLen) { maxLen = poly[0].length; coords = poly[0]; }
          }
        }
        let latSum = 0, lngSum = 0, pts = 0;
        coords.forEach(pt => { lngSum += pt[0]; latSum += pt[1]; pts++; });
        if (pts > 0) {
          const surfaceDistKm = haversineKm(latSum / pts, lngSum / pts, eewEpicenter.lat, eewEpicenter.lng);
          const estimated = estimateEEWScale(surfaceDistKm, eewEpicenter.depth, mag);
          fillColor = getIntensityColor(estimated);
          fillOpacity = 0.82;
        }

        // Override with J-SHIS ARV-corrected intensity for user's nearest prefecture
        if (userNearestPref && userLocationIntensity) {
          const prefName = userNearestPref.replace(/[県府都]$/, '');
          if (featureText.includes(prefName)) {
            fillColor = getIntensityColor(userLocationIntensity);
            fillOpacity = 0.92;
            borderColor = '#ffffff';
            borderWeight = 2;
          }
        }
      }
    }

    return {
      color: borderColor,
      weight: borderWeight,
      fillColor,
      fillOpacity,
      opacity: 1,
    };
  };

  const createIcon = (scale: number) =>
    L.divIcon({
      className: '',
      html: `<div class="intensity-icon" style="background-color:${getIntensityColor(scale)}">${getScaleText(scale)}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

  const epicenterIcon = L.divIcon({
    className: 'epicenter-mark',
    html: `×`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  const userLocationIcon = L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#38bdf8;border:3px solid #fff;box-shadow:0 0 8px #38bdf8;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  const pWaveRadius = waveEpicenter
    ? getWaveRadiusKm(waveEpicenter.time, waveEpicenter.depth, P_WAVE_SPEED_KM_PER_SEC, now) * 1000
    : 0;
  const sWaveRadius = waveEpicenter
    ? getWaveRadiusKm(waveEpicenter.time, waveEpicenter.depth, S_WAVE_SPEED_KM_PER_SEC, now) * 1000
    : 0;

  const tsunamiWaveRadius = tsunamiSource && tsunamiSource.lat > 0
    ? getTsunamiWaveRadiusKm(tsunamiSource.time, now) * 1000
    : 0;

  const tsunamiWaveColor = getTsunamiGradeColor(tsunamiSource?.grade || 'Watch');

  const geoKey = `${currentQuake?.id || 'default'}-${JSON.stringify(tsunamiPrefGrades)}-eew${eew?.Serial || '0'}-up${userNearestPref || ''}-ui${userLocationIntensity || ''}`;

  return (
    <MapContainer
      center={[37.5, 137.5]}
      zoom={5.5}
      zoomControl={false}
      attributionControl={false}
      minZoom={4}
      style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
      className={settingLocation ? 'cursor-crosshair' : ''}
    >
      <AutoZoomToEpicenter quake={currentQuake} eewLat={eewEpicenter?.lat} eewLng={eewEpicenter?.lng} />
      <ZoomControl position="bottomright" />
      <MapClickHandler settingLocation={settingLocation} onSetUserLocation={onSetUserLocation} />

      {geoData && (
        <GeoJSON key={geoKey} data={geoData} style={getStyle} />
      )}

      {granularity === 'municipality' && muniGeoData && (
        <GeoJSON key={`muni-${geoKey}`} data={muniGeoData} style={getMuniStyle} />
      )}

      {/* Tsunami coastline highlights: only coast-facing edges colored */}
      {hasTsunamiInfo && coastlines.map((coast, i) => {
        const key = coast.zone ? `${coast.pref}|${coast.zone}` : coast.pref;
        // 北海道で予報区判定できているセグメントは、複合キーが存在しない場合は
        // 都道府県名だけの全域指定(フォールバック)にも一致させる
        const grade = tsunamiPrefGrades[key] ?? (coast.zone ? tsunamiPrefGrades[coast.pref] : undefined);
        if (!grade) return null;
        const color = getTsunamiGradeColor(grade);
        return (
          <React.Fragment key={`tsunami-coast-${i}`}>
            {/* White shadow underlay for visibility when the tsunami color is close to nearby colors */}
            <Polyline
              positions={coast.coords}
              pathOptions={{
                color: '#ffffff',
                weight: 10,
                opacity: 0.55,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              interactive={false}
            />
            <Polyline
              positions={coast.coords}
              pathOptions={{
                color,
                weight: 7,
                opacity: 0.92,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              interactive={false}
            />
          </React.Fragment>
        );
      })}

      {/* EEW P wave */}
      {waveEpicenter && pWaveRadius > 0 && (
        <Circle
          center={[waveEpicenter.lat, waveEpicenter.lng]}
          radius={pWaveRadius}
          pathOptions={{
            color: '#4cc9f0',
            fillColor: '#4cc9f0',
            fillOpacity: 0.04,
            opacity: 0.85,
            weight: 2,
            dashArray: '8 8',
          }}
          interactive={false}
        />
      )}

      {/* EEW S wave */}
      {waveEpicenter && sWaveRadius > 0 && (
        <Circle
          center={[waveEpicenter.lat, waveEpicenter.lng]}
          radius={sWaveRadius}
          pathOptions={{
            color: '#f97316',
            fillColor: '#f97316',
            fillOpacity: 0.06,
            opacity: 0.9,
            weight: 3,
          }}
          interactive={false}
        />
      )}

      {currentQuake && currentQuake.earthquake.hypocenter.latitude > 0 && (
        <Marker
          position={[currentQuake.earthquake.hypocenter.latitude, currentQuake.earthquake.hypocenter.longitude]}
          icon={epicenterIcon}
          interactive={false}
        />
      )}

      {/* EEW epicenter (shown when no confirmed quake yet) */}
      {eewEpicenter && eewEpicenter.lat > 0 && !currentQuake && (
        <Marker
          position={[eewEpicenter.lat, eewEpicenter.lng]}
          icon={epicenterIcon}
          interactive={false}
        />
      )}

      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={userLocationIcon}
          interactive={false}
        />
      )}

      {showObsPoints && currentQuake && !(eew && !eew.isCancel) && geoData && geoData.features.map((feature: any, i: number) => {
        let matchedPref: string | null = null;
        for (const pref in prefScales) {
          const prefName = pref.replace(/[県府都]$/, '');
          if (JSON.stringify(feature.properties).includes(prefName)) {
            matchedPref = pref;
            break;
          }
        }
        if (!matchedPref) return null;

        // Use the largest polygon ring (most points) to avoid placing icons on small islands
        let coords: number[][] = feature.geometry.coordinates[0];
        if (feature.geometry.type === 'MultiPolygon') {
          let maxLen = 0;
          for (const poly of feature.geometry.coordinates as number[][][][]) {
            if (poly[0].length > maxLen) { maxLen = poly[0].length; coords = poly[0]; }
          }
        }
        let latSum = 0, lngSum = 0, pts = 0;
        coords.forEach((pt: number[]) => { lngSum += pt[0]; latSum += pt[1]; pts++; });

        return (
          <Marker
            key={i}
            position={[latSum / pts, lngSum / pts]}
            icon={createIcon(prefScales[matchedPref])}
            interactive={false}
          />
        );
      })}
    </MapContainer>
  );
};
