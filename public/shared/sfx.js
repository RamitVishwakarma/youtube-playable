/*
 * Tiny synth for the 3D games: tones, noise bursts, a short echo, and a few
 * presets every game shares. Respects the YouTube audio setting, the game's
 * own sound toggle and pause (suspend/resume).
 */
let ac = null;
let out = null;
let enabled = () => true;
let suspended = false;

export function initAudio(isEnabled) {
  if (isEnabled) enabled = isEnabled;
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    out = ac.createGain();
    out.gain.value = 0.6;
    const delay = ac.createDelay();
    delay.delayTime.value = 0.12;
    const fb = ac.createGain();
    fb.gain.value = 0.2;
    const wet = ac.createGain();
    wet.gain.value = 0.18;
    out.connect(ac.destination);
    out.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(ac.destination);
  } catch (_) {
    ac = null;
  }
}

const on = () => ac && !suspended && enabled() && (!window.YT || window.YT.audioEnabled());

export function suspendAudio() { suspended = true; if (ac) ac.suspend().catch(() => {}); }
export function resumeAudio() { suspended = false; if (ac) ac.resume().catch(() => {}); }

export function tone(freq, at = 0, dur = 0.2, type = 'sine', vol = 0.2, glide = 0) {
  if (!on()) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function noise(at = 0, dur = 0.2, vol = 0.2, freq = 1200, q = 0.8) {
  if (!on()) return;
  const t = ac.currentTime + at;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

const semis = (root, s) => root * Math.pow(2, s / 12);

/** Shared sound vocabulary so the games feel like one family. */
export const sfx = {
  click: () => tone(880, 0, 0.05, 'sine', 0.08),
  coin: (i = 0) => { const f = semis(1046, (i % 5) * 2); tone(f, 0, 0.08, 'square', 0.05); tone(f * 1.5, 0.05, 0.12, 'square', 0.05); },
  good: () => { tone(523, 0, 0.12, 'triangle', 0.16); tone(784, 0.07, 0.18, 'triangle', 0.16); },
  bad: () => { tone(260, 0, 0.18, 'sawtooth', 0.09, 140); noise(0, 0.12, 0.12, 500); },
  whoosh: () => noise(0, 0.25, 0.14, 900, 0.5),
  thud: () => { tone(120, 0, 0.12, 'sine', 0.3, 60); noise(0, 0.08, 0.15, 400); },
  pop: () => tone(500, 0, 0.09, 'sine', 0.18, 900),
  win: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(semis(523, s), i * 0.09, 0.4, 'triangle', 0.15)),
  lose: () => [0, -3, -7, -12].forEach((s, i) => tone(semis(330, s), i * 0.14, 0.45, 'triangle', 0.14)),
  fanfare: () => [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone(semis(523, s), i * 0.09, 0.3, 'square', 0.06)),
  rise: (k) => tone(semis(330, Math.min(24, k)), 0, 0.12, 'triangle', 0.12),
};

/**
 * A continuous voice (engine hum, wind). Returns { set(freq, vol), stop() }.
 * Silent until audio is unlocked; follows suspend/resume with the context.
 */
export function loopVoice(type = 'sawtooth', cutoff = 900) {
  let o = null, g = null, f = null;
  function ensure() {
    if (o || !ac) return;
    o = ac.createOscillator();
    g = ac.createGain();
    f = ac.createBiquadFilter();
    o.type = type;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.value = 0;
    o.connect(f).connect(g).connect(out);
    o.start();
  }
  return {
    set(freq, vol) {
      ensure();
      if (!o) return;
      const t = ac.currentTime;
      o.frequency.setTargetAtTime(freq, t, 0.05);
      g.gain.setTargetAtTime(on() ? vol : 0, t, 0.08);
    },
    stop() { if (g) g.gain.setTargetAtTime(0, ac.currentTime, 0.05); },
  };
}
