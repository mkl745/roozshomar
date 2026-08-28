// Reusable parallax / environment renderer, fully data-driven.
// configure({sun, layers:[geometry], mood}) — geometry is fixed per scene,
// colors live in a "mood" object that setMood() retargets; the current palette
// eases toward the target every frame so grading shifts smoothly with mood.
//
// Mood shape (identical across moods so values can lerp):
//   sky:[5], sun:{color,alpha}, stars:n, haze, layers:[6], ground,
//   tint, tintAmt, ambient:{color,darkness}, rim, scarf, shake
import { mulberry32, TAU, clamp, rgb, mixRgb, makeCanvas, deepColorize, deepMix } from './util.js';

const TILE = 2400;                 // layer-space period (harmonics are integer freqs of this)
const FREQS = [2, 3, 5, 8, 13];
const AMPS = [0.42, 0.28, 0.22, 0.16, 0.10];

export class Environment {
  constructor() {
    this.sun = { x: 0.7, y: 0.3, r: 46 };
    this.layers = [];
    this.cur = null; this.target = null;
    this.stars = [];
  }

  configure(cfg) {
    this.sun = { ...this.sun, ...cfg.sun };
    this.layers = cfg.layers.map((L, i) => {
      const rnd = mulberry32(L.seed ?? i * 1013 + 7);
      const comps = FREQS.map((f, k) => ({
        f, a: AMPS[k] * (0.75 + rnd() * 0.5), p: rnd() * TAU,
      }));
      const features = [];
      if (L.type === 'spires' || L.type === 'trees') {
        const n = Math.floor(TILE / (L.type === 'spires' ? 260 : 130));
        for (let j = 0; j < n; j++) {
          features.push({
            u: rnd() * TILE,
            hgt: (L.type === 'spires' ? 90 : 26) * (0.5 + rnd()),
            wid: (L.type === 'spires' ? 16 : 10) * (0.6 + rnd() * 0.8),
          });
        }
      }
      return { type: 'ridge', ...L, comps, features };
    });
    const srnd = mulberry32(4242);
    this.stars = Array.from({ length: 150 }, () => ({
      fx: srnd(), fy: srnd() * 0.62, r: 0.6 + srnd() * 1.3,
      sp: 0.5 + srnd() * 2.2, ph: srnd() * TAU,
    }));
    this.cur = deepColorize(cfg.mood);
    this.target = deepColorize(cfg.mood);
  }

  setMood(mood) { this.target = deepColorize(mood); }
  get mood() { return this.cur; }

  update(dt) {
    deepMix(this.cur, this.target, 1 - Math.exp(-1.7 * dt));
  }

  _ridge(L, u, h) {
    let y = L.base * h;
    for (const c of L.comps) y += Math.sin((TAU * u * c.f) / TILE + c.p) * c.a * L.amp;
    return y;
  }

  render(ctx, engine, t) {
    const { w, h } = engine;
    const m = this.cur;
    const cam = engine.cam;

    // Painterly multi-stop sky. Stops sit high so the warm horizon band
    // reads ABOVE the far ridge, not hidden behind it.
    const sky = ctx.createLinearGradient(0, 0, 0, h * 1.02);
    const pos = [0, 0.4, 0.55, 0.66, 0.78];
    for (let i = 0; i < 5; i++) sky.addColorStop(pos[i], rgb(m.sky[i]));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun / moon disc (+ glow goes to the bloom-fed glow buffer).
    const sx = this.sun.x * w - cam.x * 0.02, sy = this.sun.y * h - cam.y * 0.02;
    engine.lighting.screenGlow(sx, sy, this.sun.r * 5.6, m.sun.color, 0.8 * m.sun.alpha);
    const disc = ctx.createRadialGradient(sx, sy, 0, sx, sy, this.sun.r);
    disc.addColorStop(0, rgb(m.sun.color, 0.95 * m.sun.alpha));
    disc.addColorStop(0.75, rgb(m.sun.color, 0.75 * m.sun.alpha));
    disc.addColorStop(1, rgb(m.sun.color, 0));
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(sx, sy, this.sun.r, 0, TAU); ctx.fill();

    // Stars.
    if (m.stars > 0.02) {
      ctx.fillStyle = '#ffffff';
      for (const s of this.stars) {
        const tw = 0.35 + 0.65 * Math.pow(Math.sin(t * s.sp + s.ph) * 0.5 + 0.5, 2);
        ctx.globalAlpha = m.stars * tw * 0.8;
        ctx.fillRect(s.fx * w, s.fy * h, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }

    // Parallax silhouette layers, far -> near.
    for (let i = 0; i < this.layers.length; i++) {
      this._layer(ctx, this.layers[i], m.layers[i], m.haze, engine);
    }

    // Horizon haze band.
    const hz = ctx.createLinearGradient(0, h * 0.5, 0, h);
    hz.addColorStop(0, rgb(m.haze, 0));
    hz.addColorStop(0.6, rgb(m.haze, 0.10));
    hz.addColorStop(1, rgb(m.haze, 0.20));
    ctx.fillStyle = hz;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
  }

  _layer(ctx, L, color, haze, engine) {
    const { w, h } = engine;
    const cam = engine.cam;
    const off = cam.x * L.parallax;
    const yOff = (cam.y - 420) * L.parallax * 0.45;
    const col = mixRgb(color, haze, clamp(L.fog, 0, 1) * 0.6);
    ctx.fillStyle = rgb(col);

    const k0 = Math.floor((off - 100) / TILE);
    const k1 = Math.floor((off + w + 100) / TILE);
    ctx.beginPath();
    ctx.moveTo(-20, h + 60);
    for (let k = k0; k <= k1; k++) {
      const start = Math.max(0, k * TILE - off - 10);
      const end = Math.min(w + 10, (k + 1) * TILE - off + 10);
      for (let sxx = start; sxx <= end; sxx += 8) {
        const u = sxx + off;
        ctx.lineTo(sxx, this._ridge(L, u, h) + yOff);
      }
    }
    ctx.lineTo(w + 20, h + 60);
    ctx.closePath();
    ctx.fill();

    // Features (spires / conifers) riding on the ridge.
    if (L.features.length) {
      ctx.beginPath();
      for (let k = k0; k <= k1; k++) {
        for (const f of L.features) {
          const u = k * TILE + f.u;
          const sx = u - off;
          if (sx < -60 || sx > w + 60) continue;
          const y = this._ridge(L, u, h) + yOff + 6;
          if (L.type === 'spires') {
            ctx.moveTo(sx - f.wid, y);
            ctx.lineTo(sx - f.wid * 0.2, y - f.hgt);
            ctx.lineTo(sx + f.wid * 0.25, y - f.hgt * 0.86);
            ctx.lineTo(sx + f.wid, y);
          } else {
            ctx.moveTo(sx - f.wid, y);
            ctx.lineTo(sx, y - f.hgt * 1.7);
            ctx.lineTo(sx + f.wid, y);
            ctx.moveTo(sx - f.wid * 0.7, y - f.hgt * 0.8);
            ctx.lineTo(sx, y - f.hgt * 2.3);
            ctx.lineTo(sx + f.wid * 0.7, y - f.hgt * 0.8);
          }
        }
      }
      ctx.fill();
    }
  }
}
