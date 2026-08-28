/* ------------------------------------------------------------------ *
 *  Waveform-reactive visuals utility.                                *
 *  Loads a waveform JPG (cyan trace on dark bg), scans each pixel    *
 *  column for the trace envelope and stores a 0..1 intensity curve.  *
 *  getAudioIntensity() then maps the playing track's currentTime /   *
 *  duration onto that curve (with attack/release smoothing) so       *
 *  chapters can drive particles, light pulses and camera shake.      *
 * ------------------------------------------------------------------ */
import { clamp, lerp, approach } from './util.js';

const MARGIN_X = 0.015;   // ignore left ruler / right button UI of the jpgs
const MARGIN_TOP = 0.06;

export class WaveformSampler {
  constructor(url) { this.url = url; this.ready = false; }

  async load() {
    if (this.ready) return this;
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = this.url;
    });
    const w = this.w = img.naturalWidth, h = this.h = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const data = c.getImageData(0, 0, w, h).data;

    const env = new Float32Array(w);
    const x0 = Math.floor(w * MARGIN_X), x1 = Math.ceil(w * (1 - MARGIN_X));
    const y0 = Math.floor(h * MARGIN_TOP);
    for (let x = x0; x < x1; x++) {
      let minY = -1, maxY = -1;
      for (let y = y0; y < h; y++) {
        const o = (y * w + x) * 4;
        const r = data[o], g = data[o + 1], b = data[o + 2];
        // cyan/mint trace: green dominant over red, bright
        if (g > 110 && g - r > 36 && g - b > 10) {
          if (minY < 0) minY = y;
          maxY = y;
        }
      }
      env[x] = minY < 0 ? 0 : (maxY - minY + 1) / h;
    }
    // adaptive normalize against the 98th percentile peak
    const sorted = Array.from(env).sort((a, b) => a - b);
    const peak = Math.max(0.08, sorted[Math.floor(sorted.length * 0.98)]);
    // moving-average smooth (5 columns) + perceptual gamma
    const sm = this.curve = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += env[xx]; n++; } }
      sm[x] = Math.pow(clamp(s / n / peak, 0, 1), 0.85);
    }
    this.ready = true;
    return this;
  }

  /** Raw 0..1 intensity at normalized time u in [0,1]. */
  sampleNorm(u) {
    if (!this.ready) return 0;
    const x = clamp(u, 0, 1) * (this.w - 1);
    const i = Math.floor(x), f = x - i;
    return lerp(this.curve[i], this.curve[Math.min(i + 1, this.w - 1)], f);
  }
}

class WaveformReactor {
  constructor() {
    this.samplers = new Map();   // track name -> WaveformSampler
    this.audio = null;
    this.value = 0;              // smoothed intensity, current track
  }
  register(trackName, url) { this.samplers.set(trackName, new WaveformSampler(url)); }
  bindAudio(audioManager) { this.audio = audioManager; }
  async preload(trackName) {
    const s = this.samplers.get(trackName);
    if (s) await s.load();
  }
  async preloadAll() { for (const s of this.samplers.values()) await s.load().catch(() => {}); }

  /** Per-frame update: follows the playing track with attack/release. */
  update(dt) {
    const a = this.audio;
    let target = 0;
    if (a && a.isPlaying && a.currentName) {
      const s = this.samplers.get(a.currentName);
      if (s && s.ready) target = s.sampleNorm(a.currentTime / a.duration);
    }
    const rate = target > this.value ? 34 : 6.5;   // fast attack, slow release
    this.value = approach(this.value, target, rate, dt);
  }

  getAudioIntensity() { return this.value; }

  /** Explicit form: intensity of `trackName` at (t, duration). */
  intensityAt(trackName, t, duration) {
    const s = this.samplers.get(trackName);
    return s ? s.sampleNorm(duration > 0 ? t / duration : 0) : 0;
  }
}

export const reactor = new WaveformReactor();

/** The public hook chapters use for audio-reactive visuals. */
export function getAudioIntensity() { return reactor.getAudioIntensity(); }
