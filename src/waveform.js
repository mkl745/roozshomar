// Waveform-reactive visuals utility.
//
// A waveform JPG is a mirrored trace (mint on maroon). At load time we scan it
// once into a per-column 0..1 intensity array (vertical trace extent / height),
// so per-frame cost is a single lerped array lookup. The mint-vs-maroon rule
// (g > r + 30 && g > 120) also rejects the white timestamp text and UI blobs.
//
// Exposes getAudioIntensity(currentTime, duration) -> smoothed 0..1, and with no
// arguments samples the currently-playing track via the linked AudioManager.
import { clamp, lerp } from './util.js';

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

export class WaveformSampler {
  constructor() {
    this.trace = null;      // Float32Array, 0..1 per pixel column
    this.width = 0;
    this.url = null;
    this.smooth = 0;        // attack/release-smoothed value
    this._lastCall = 0;
    this._audio = null;
  }

  // Lets getAudioIntensity() work with no arguments.
  link(audioManager) { this._audio = audioManager; }

  async load(url) {
    if (this.url === url && this.trace) return true;
    try {
      const img = await loadImage(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, w, h).data;
      const raw = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        let minY = 1e9, maxY = -1;
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          const r = d[i], g = d[i + 1];
          if (g > r + 30 && g > 120) {           // mint trace, not text/blobs
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        raw[x] = maxY >= 0 ? (maxY - minY + 1) / h : 0;
      }
      // 3-tap smooth across columns, then normalize so the 95th percentile ~0.92
      const tr = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        tr[x] = (raw[Math.max(0, x - 1)] + 2 * raw[x] + raw[Math.min(w - 1, x + 1)]) * 0.25;
      }
      const sorted = Array.from(tr).sort((a, b) => a - b);
      const p95 = sorted[Math.floor(w * 0.95)] || 1;
      const scale = 0.92 / Math.max(1e-4, p95);
      for (let x = 0; x < w; x++) tr[x] = clamp(tr[x] * scale, 0, 1);
      this.trace = tr; this.width = w; this.url = url;
      return true;
    } catch (e) {
      console.warn('[waveform] load failed', url, e);
      return false;
    }
  }

  // Unsmoothed 0..1 at a track time.
  rawAt(time, duration) {
    if (!this.trace || !(duration > 0)) return 0;
    const x = clamp(time / duration, 0, 0.9999) * (this.width - 1);
    const i = Math.floor(x);
    return lerp(this.trace[i], this.trace[Math.min(i + 1, this.width - 1)], x - i);
  }

  // Average energy over the next `seconds` of the track (anticipation visuals).
  upcoming(time, duration, seconds = 1.5) {
    if (!this.trace || !(duration > 0)) return 0;
    const x0 = clamp(time / duration, 0, 1) * (this.width - 1);
    const x1 = clamp((time + seconds) / duration, 0, 1) * (this.width - 1);
    const a = Math.floor(x0), b = Math.max(a + 1, Math.floor(x1));
    let s = 0;
    for (let x = a; x < b; x++) s += this.trace[x];
    return s / (b - a);
  }

  // THE api. Smoothed (fast attack, slow musical release) 0..1 intensity.
  getAudioIntensity(time, duration, dt) {
    let t = time, d = duration;
    if (t === undefined && this._audio) { t = this._audio.currentTime; d = this._audio.duration || 1; }
    const v = this.rawAt(t, d);
    const now = performance.now() / 1000;
    const ddt = dt !== undefined ? dt : clamp(now - (this._lastCall || now), 0, 0.1);
    this._lastCall = now;
    const rate = v > this.smooth ? 18 : 6.5;
    this.smooth += (v - this.smooth) * (1 - Math.exp(-rate * ddt));
    return this.smooth;
  }
}

export const waveform = new WaveformSampler();
