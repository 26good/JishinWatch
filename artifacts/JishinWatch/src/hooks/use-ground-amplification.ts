import { useState, useEffect } from 'react';

export interface GroundInfo {
  arv: number;
  avs: number;
  jname: string;
}

interface CacheEntry {
  data: GroundInfo;
  ts: number;
}

const CACHE_TTL = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

async function fetchGroundInfo(lat: number, lng: number): Promise<GroundInfo> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const url = `https://www.j-shis.bosai.go.jp/map/api/sstrct/V2/meshinfo.geojson?position=${lng},${lat}&epsg=4326`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`J-SHIS HTTP ${res.status}`);
  const json = await res.json();
  const feat = json?.features?.[0]?.properties;
  if (!feat) throw new Error('No feature in J-SHIS response');

  const data: GroundInfo = {
    arv: parseFloat(feat.ARV) || 1.0,
    avs: parseFloat(feat.AVS) || 0,
    jname: feat.JNAME || '不明',
  };
  cache.set(key, { data, ts: Date.now() });
  return data;
}

export function useGroundAmplification(lat: number | null, lng: number | null) {
  const [ground, setGround] = useState<GroundInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat === null || lng === null) { setGround(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGroundInfo(lat, lng)
      .then(data => { if (!cancelled) { setGround(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(String(err)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [lat, lng]);

  return { ground, loading, error };
}
