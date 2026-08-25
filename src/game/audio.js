const AudioSys = (() => {

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

let ctx = null;
let master = null;
let muffle = null;
let sfxBus = null;
let musicBus = null;
let windGain = null;
let rainGain = null;
let musicEl = null;
let musicChapter = 0;
let musicAvailable = false;
let comboIdx = 0;
let lastCollectAt = 0;
let unlocked = false;
let submerged = false;

function soundOn() {
  return localStorage.getItem('rz_sound') !== '0';
}

function unlock() {
  if (unlocked) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14;
    master.ratio.value = 6;
    muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 19000;
    muffle.Q.value = 0.4;
    master.connect(muffle);
    muffle.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    buildAmbience();
    unlocked = true;
  } catch (e) { }
  applySoundPref();
}

function applySoundPref() {
  const on = soundOn();
  if (ctx && ctx.state === 'suspended' && on) ctx.resume().catch(() => { });
  if (!on && ctx && ctx.state === 'running') ctx.suspend().catch(() => { });
}

function setSound(on) {
  localStorage.setItem('rz_sound', on ? '1' : '0');
  applySoundPref();
}

function makeNoiseBuffer(seconds, brownish) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) {
    if (brownish) {
      v = v * 0.98 + (Math.random() * 2 - 1) * 0.02;
      d[i] = v * 8;
    } else {
      d[i] = Math.random() * 2 - 1;
    }
  }
  return buf;
}

function buildAmbience() {
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = makeNoiseBuffer(2, true);
  windSrc.loop = true;
  const wbp = ctx.createBiquadFilter();
  wbp.type = 'bandpass';
  wbp.frequency.value = 480;
  wbp.Q.value = 0.55;
  windGain = ctx.createGain();
  windGain.gain.value = 0.02;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.11;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.01;
  lfo.connect(lfoG);
  lfoG.connect(windGain.gain);
  windSrc.connect(wbp);
  wbp.connect(windGain);
  windGain.connect(master);
  windSrc.start();
  lfo.start();

  const rainSrc = ctx.createBufferSource();
  rainSrc.buffer = makeNoiseBuffer(2, false);
  rainSrc.loop = true;
  const rhp = ctx.createBiquadFilter();
  rhp.type = 'highpass';
  rhp.frequency.value = 1500;
  const rlp = ctx.createBiquadFilter();
  rlp.type = 'lowpass';
  rlp.frequency.value = 7200;
  rainGain = ctx.createGain();
  rainGain.gain.value = 0;
  const pLfo = ctx.createOscillator();
  pLfo.frequency.value = 0.31;
  const pLfoG = ctx.createGain();
  pLfoG.gain.value = 0.008;
  pLfo.connect(pLfoG);
  pLfoG.connect(rainGain.gain);
  rainSrc.connect(rhp);
  rhp.connect(rlp);
  rlp.connect(rainGain);
  rainGain.connect(master);
  rainSrc.start();
  pLfo.start();
}

function setChapter(n) {
  if (musicChapter === n) return;
  musicChapter = n;
  musicAvailable = false;
  if (musicEl) { try { musicEl.pause(); } catch (e) { } musicEl = null; }
  const candidates = [
    'assets/music/chapter' + n + '.mp3',
    'music/chapter' + n + '.mp3',
    'chapter' + n + '.mp3'
  ];
  let idx = 0;
  tryNext();
  function tryNext() {
    if (idx >= candidates.length) { musicAvailable = false; return; }
    const path = candidates[idx++];
    const el2 = new Audio();
    el2.loop = true;
    el2.volume = 0;
    el2.preload = 'auto';
    el2.addEventListener('canplay', function onCan() {
      if (musicChapter !== n) return;
      musicEl = el2;
      musicAvailable = true;
    }, { once: true });
    el2.addEventListener('error', function onErr() {
      el2.removeEventListener('canplay', onCan);
      if (musicChapter !== n) return;
      tryNext();
    }, { once: true });
    el2.src = path;
    el2.load();
  }
}

function fadeMusic(target, secs) {
  if (!ctx || !soundOn()) return;
  if (musicEl && musicAvailable) {
    try {
      musicEl.play().catch(() => { });
      const startVol = musicEl.volume;
      const t0 = performance.now();
      function step() {
        if (!musicEl) return;
        const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
        musicEl.volume = startVol + (target - startVol) * k;
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    } catch (e) { }
  } else if (target > 0 && musicEl) {
    setTimeout(() => { if (musicAvailable) fadeMusic(target, secs); }, 800);
  }
}

function pauseAll() {
  if (ctx) ctx.suspend().catch(() => { });
  if (musicEl) musicEl.pause();
}
function resumeAll() {
  if (soundOn() && ctx) ctx.resume().catch(() => { });
  if (musicEl && musicAvailable) musicEl.play().catch(() => { });
}

function env(g, t0, peak, dur, attack = 0.005) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(freq, dur, type, peak, detune = 0, dest) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(g);
  g.connect(dest || sfxBus || master);
  const t0 = ctx.currentTime;
  env(g, t0, peak, dur);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return g;
}

function noiseBurst(dur, filterType, f0, f1, peak, q = 1, dest) {
  if (!ctx) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const flt = ctx.createBiquadFilter();
  flt.type = filterType;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, ctx.currentTime);
  flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), ctx.currentTime + dur);
  const g = ctx.createGain();
  env(g, ctx.currentTime, peak, dur, 0.004);
  src.connect(flt);
  flt.connect(g);
  g.connect(dest || sfxBus || master);
  src.start();
  src.stop(ctx.currentTime + dur + 0.05);
}

let delaySend = null;
function getDelay() {
  if (delaySend) return delaySend;
  delaySend = ctx.createDelay(1.0);
  delaySend.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  delaySend.connect(fb);
  fb.connect(delaySend);
  delaySend.connect(wet);
  wet.connect(sfxBus);
  return delaySend;
}

function ready() { return unlocked && soundOn() && ctx; }

function collect(now) {
  if (!ready()) return;
  if (now - lastCollectAt > 2.4) comboIdx = 0;
  lastCollectAt = now;
  const f = PENTA[Math.min(comboIdx, PENTA.length - 1)];
  comboIdx++;
  const g = tone(f, 0.5, 'triangle', 0.16);
  g.connect(getDelay());
  tone(f * 2, 0.32, 'sine', 0.05);
  if (comboIdx === 8) {
    setTimeout(() => { tone(PENTA[4], 0.7, 'sine', 0.09); tone(PENTA[7], 0.9, 'sine', 0.07); }, 90);
  }
}

function jump() {
  if (!ready()) return;
  noiseBurst(0.16, 'bandpass', 700, 220, 0.10, 1.2);
  tone(250, 0.09, 'sine', 0.06);
}

function land(hard) {
  if (!ready()) return;
  noiseBurst(hard ? 0.13 : 0.07, 'lowpass', hard ? 420 : 300, 90, hard ? 0.14 : 0.08);
  tone(hard ? 95 : 130, 0.09, 'sine', hard ? 0.12 : 0.06);
}

function step(wet) {
  if (!ready()) return;
  if (wet) noiseBurst(0.09, 'bandpass', 900, 500, 0.05, 0.8);
  else noiseBurst(0.04, 'highpass', 900, 1400, 0.022, 0.7);
}

function splash(big) {
  if (!ready()) return;
  noiseBurst(big ? 0.34 : 0.2, 'lowpass', big ? 1100 : 900, 260, big ? 0.17 : 0.10, 0.8);
  setTimeout(() => noiseBurst(0.14, 'bandpass', 1600, 700, 0.05, 1), 70);
}

function paddle() {
  if (!ready()) return;
  noiseBurst(0.26, 'bandpass', 340, 560, 0.045, 0.9);
}

function bubble() {
  if (!ready()) return;
  const f = 650 + Math.random() * 480;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(f * 1.7, ctx.currentTime + 0.09);
  env(g, ctx.currentTime, 0.03, 0.12, 0.01);
  o.connect(g);
  g.connect(sfxBus);
  o.start();
  o.stop(ctx.currentTime + 0.15);
}

function bell() {
  if (!ready()) return;
  [1567.98, 2093.0].forEach((f, i) => {
    setTimeout(() => {
      tone(f, 0.65, 'sine', 0.13);
      tone(f * 2.41, 0.22, 'sine', 0.035);
    }, i * 110);
  });
}

function checkpoint() {
  if (!ready()) return;
  [392, 523.25, 659.25].forEach((f, i) => {
    setTimeout(() => {
      const g = tone(f, 1.1, 'sine', 0.09);
      g.connect(getDelay());
    }, i * 130);
  });
}

function thunder() {
  if (!ready()) return;
  const dur = 2.6 + Math.random() * 1.4;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) {
    v = v * 0.985 + (Math.random() * 2 - 1) * 0.03;
    d[i] = v;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(220, ctx.currentTime);
  lp.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + dur * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.28);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start();
}

function uiTick() {
  if (!ready()) return;
  tone(660, 0.06, 'sine', 0.06);
}

function wakeSwell() {
  if (!ready()) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 2.6);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.8);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.4);
  o.connect(g);
  g.connect(sfxBus);
  o.start();
  o.stop(ctx.currentTime + 3.5);
}

function chime() {
  if (!ready()) return;
  [659.25, 987.77].forEach((f, i) => {
    setTimeout(() => {
      const g = tone(f, 1.4, 'sine', 0.07);
      g.connect(getDelay());
    }, i * 200);
  });
}

let droneOsc = null;
function ensureDrone() {
  if (droneOsc || !ctx) return;
  const g = ctx.createGain();
  g.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  g.connect(lp);
  lp.connect(master);
  [55, 82.41, 110.5].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sine';
    o.frequency.value = f;
    o.detune.value = (i - 1) * 6;
    const og = ctx.createGain();
    og.gain.value = i === 2 ? 0.35 : 1;
    o.connect(og);
    og.connect(g);
    o.start();
  });
  droneOsc = g;
}
function setDrone(level) {
  if (!ctx) return;
  ensureDrone();
  droneOsc.gain.linearRampToValueAtTime(level * 0.05, ctx.currentTime + 1.5);
}

function heart() {
  if (!ready()) return;
  tone(52, 0.20, 'sine', 0.13);
  setTimeout(() => tone(48, 0.16, 'sine', 0.08), 130);
}

function whisper() {
  if (!ready()) return;
  noiseBurst(0.8, 'bandpass', 520, 1250, 0.035, 2.4);
}

function roar() {
  if (!ready()) return;
  const dur = 1.5;
  [38, 57].forEach(f => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(f * 0.82, ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur + 0.1);
  });
  noiseBurst(dur, 'lowpass', 140, 60, 0.09, 0.7);
}

function dissolve() {
  if (!ready()) return;
  noiseBurst(1.1, 'bandpass', 320, 2300, 0.045, 1.4);
  tone(660, 1.2, 'sine', 0.03);
}

function caughtSting() {
  if (!ready()) return;
  [220, 233, 311].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    o.type = 'sawtooth';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.02);
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.06 + i * 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(ctx.currentTime + i * 0.02);
    o.stop(ctx.currentTime + 0.65);
  });
  noiseBurst(0.5, 'lowpass', 200, 50, 0.14, 0.7);
}

function bellDistant() {
  if (!ready()) return;
  [0, 1900].forEach((delay, k) => {
    setTimeout(() => {
      [659.25, 1318.5, 987.77].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1000;
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime((i === 0 ? 0.05 : 0.018) * (k ? 0.6 : 1), ctx.currentTime + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.4);
        o.connect(lp); lp.connect(g); g.connect(master);
        o.start(); o.stop(ctx.currentTime + 2.5);
      });
    }, delay);
  });
}

function setWind(level) {
  if (!windGain) return;
  windGain.gain.linearRampToValueAtTime(0.012 + level * 0.026, ctx.currentTime + 0.4);
}
function setRain(level) {
  if (!rainGain) return;
  rainGain.gain.linearRampToValueAtTime(level * 0.05, ctx.currentTime + 0.6);
}
function setSubmerged(on) {
  if (submerged === on || !muffle) return;
  submerged = on;
  muffle.frequency.cancelScheduledValues(ctx.currentTime);
  muffle.frequency.setTargetAtTime(on ? 560 : 19000, ctx.currentTime, 0.08);
}

return {
  unlock, setSound, soundOn, collect, jump, land, step, splash, paddle,
  bubble, bell, checkpoint, thunder, uiTick, wakeSwell, chime,
  heart, whisper, roar, dissolve, caughtSting, bellDistant,
  pauseAll, resumeAll, fadeMusic, setChapter, setWind, setRain, setSubmerged, setDrone,
  resetCombo() { comboIdx = 0; }
};
})();
