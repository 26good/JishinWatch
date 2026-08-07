import { useState, useEffect, useRef } from 'react';
import { EarthquakeHistoryItem } from '../lib/utils-earthquake';
import { playSound } from '../lib/audio';

const formatLastUpdateTime = () =>
  new Date().toLocaleTimeString('ja-JP', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const useEarthquakes = (isSoundEnabled: boolean, historyLimit: number = 30) => {
  const [history, setHistory] = useState<EarthquakeHistoryItem[]>([]);
  const [selectedQuake, setSelectedQuake] = useState<EarthquakeHistoryItem | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');
  const lastQuakeIdRef = useRef<string | null>(null);
  const historyLimitRef = useRef(historyLimit);
  historyLimitRef.current = historyLimit;

  const fetchHistory = async () => {
    try {
      const res = await fetch(`https://api.p2pquake.net/v2/history?codes=551&limit=${historyLimitRef.current}`);
      const list: EarthquakeHistoryItem[] = await res.json();

      const validQuakes = list.filter(eq =>
        eq.earthquake?.hypocenter?.name &&
        eq.earthquake.hypocenter.name !== '不明' &&
        eq.earthquake.hypocenter.magnitude !== -1.0 &&
        eq.points?.length > 0
      );

      if (validQuakes.length > 0) {
        const newQuakeId = validQuakes[0].id;
        const isNew = lastQuakeIdRef.current && newQuakeId !== lastQuakeIdRef.current;

        if (isNew && isSoundEnabled) {
          if (validQuakes[0].earthquake.maxScale >= 50) {
            playSound.alert();
          } else {
            playSound.detect();
          }
        }

        if (isNew || !lastQuakeIdRef.current) {
          setSelectedQuake(validQuakes[0]);
        }

        lastQuakeIdRef.current = newQuakeId;
        setHistory(validQuakes.slice(0, historyLimitRef.current));
      }

      setLastUpdate(formatLastUpdateTime());
    } catch (e) {
      console.error('Error fetching earthquake history:', e);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [isSoundEnabled, historyLimit]);

  return { history, selectedQuake, setSelectedQuake, lastUpdate };
};
