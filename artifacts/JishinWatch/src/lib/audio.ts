let ctx: AudioContext | null = null;
let activeNodes: OscillatorNode[] = [];

export const initAudioContext = () => {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {}
  }
  if (ctx?.state === 'suspended') ctx.resume();
  return ctx;
};

export const getCtx = (): AudioContext | null => {
  if (!ctx) initAudioContext();
  if (ctx?.state === 'suspended') ctx.resume();
  return ctx;
};

function stopAll() {
  activeNodes.forEach(n => { try { n.stop(); } catch {} });
  activeNodes = [];
}

function createTone(
  frequency: number,
  startTime: number,
  duration: number,
  type: OscillatorType,
  maxVolume = 0.25
) {
  const c = getCtx();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(frequency, startTime);
  const fadeTime = Math.min(0.01, duration * 0.1);
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(maxVolume, startTime + fadeTime);
  g.gain.setValueAtTime(maxVolume, startTime + duration - fadeTime);
  g.gain.linearRampToValueAtTime(0, startTime + duration);
  o.connect(g);
  g.connect(c.destination);
  o.start(startTime);
  o.stop(startTime + duration);
  activeNodes.push(o);
}

function playEEWForecast() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const unit = 0.10;
  const soDuration = unit * 2;
  const doDuration = unit * 1;
  const gap = unit * 1;
  const miDuration = unit * 2;
  createTone(784, now, soDuration, 'sine', 0.25);
  createTone(523, now + soDuration, doDuration, 'sine', 0.25);
  createTone(659, now + soDuration + doDuration + gap, miDuration, 'sine', 0.25);
}

function playEEWUpdate() {
  const c = getCtx();
  if (!c) return;
  createTone(659, c.currentTime, 0.15, 'sine', 0.25);
}

function playEEWFinal() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  createTone(659, now, 0.5, 'sine', 0.25);
  createTone(523, now + 0.2, 0.7, 'sine', 0.25);
}

function playEEWWarning() {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const vol = 0.18;
  for (let i = 0; i < 3; i++) {
    const s = now + i * 1.0;
    createTone(440,  s,       0.50, 'triangle', vol);
    createTone(442.5,s,       0.50, 'triangle', vol);
    createTone(554,  s,       0.50, 'triangle', vol);
    createTone(556,  s,       0.50, 'triangle', vol);
    createTone(880,  s,       0.50, 'triangle', vol);
    createTone(1108, s,       0.50, 'triangle', vol);
    createTone(330,  s + 0.5, 0.50, 'triangle', vol);
    createTone(331.5,s + 0.5, 0.50, 'triangle', vol);
    createTone(415,  s + 0.5, 0.50, 'triangle', vol);
    createTone(417,  s + 0.5, 0.50, 'triangle', vol);
    createTone(660,  s + 0.5, 0.50, 'triangle', vol);
    createTone(830,  s + 0.5, 0.50, 'triangle', vol);
  }
}

export const playSound = {
  detect: () => { stopAll(); playEEWForecast(); },
  update: () => { playEEWUpdate(); },
  caution: () => { stopAll(); playEEWWarning(); },
  alert: () => { stopAll(); playEEWWarning(); },
  end: () => { stopAll(); playEEWFinal(); },
  final: () => { stopAll(); playEEWFinal(); },
  tsunamiDanger: () => { stopAll(); playEEWWarning(); },
};
