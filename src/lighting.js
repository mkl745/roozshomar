/* ------------------------------------------------------------------ *
 *  Reusable lighting system.                                         *
 *  - ambient darkness layer (half-res, soft holes punched per light) *
 *  - additive glow sprites (bloom on light sources)                  *
 *  - rim-light config (direction + color) consumed by renderers      *
 *  Lights pulse with audio intensity via `audio` weight.             *
 * ------------------------------------------------------------------ */
import { clamp, hexToRgb, rgba } from './util.js';

export class LightingSystem {
  constructor() {
    this.lights = [];
    this.ambient = { color: '#050310', alpha: 0.52 };
    this.rim = { dx: 0.55, dy: -0.62, color: '#ffcf9e', strength: 0.8 };
    this._sprites = new Map();
    this.dark = null; this.dw = 0; this.dh = 0;
    this.t = 0;
  }

  configure({ ambient, rim } = {}) {
    if (ambient) Object.assign(this.ambient, ambient);
    if (rim) Object.assign(this.rim, rim);
  }

  /** lights: [{x,y,radius,color,intensity,glow,audio,flicker,phase}] */
  setLights(list) { this.lights = (list || []).map(l => ({ glow: 1, audio: 0, flicker: 0, phase: Math.random() * 7, intensity: 1, ...l })); }

  resize(w, h) {
    this.dw = Math.max(2, Math.ceil(w / 2));
    this.dh = Math.max(2, Math.ceil(h / 2));
    this.dark = this.dark || document.createElement('canvas');
    this.dark.width = this.dw; this.dark.height = this.dh;
  }

  _sprite(color) {
    let s = this._sprites.get(color);
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 128;
    const c = s.getContext('2d');
    const { r, g, b } = hexToRgb(color);
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
    gr.addColorStop(0.25, `rgba(${r},${g},${b},0.32)`);
    gr.addColorStop(0.6, `rgba(${r},${g},${b},0.10)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    this._sprites.set(color, s);
    return s;
  }

  pulse(l, intensity) {
    let p = l.intensity + (l.audio || 0) * intensity * 0.9;
    if (l.flicker) p *= 1 + l.flicker * (Math.sin(this.t * 11.3 + l.phase) * 0.5 + Math.sin(this.t * 23.7 + l.phase * 2) * 0.5) * 0.5;
    return clamp(p, 0, 1.6);
  }

  update(dt) { this.t += dt; }

  render(ctx, camX, camY, w, h, intensity) {
    if (!this.dark) this.resize(w, h);
    const dc = this.dark.getContext('2d');
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, this.dw, this.dh);
    dc.fillStyle = rgba(this.ambient.color, this.ambient.alpha);
    dc.fillRect(0, 0, this.dw, this.dh);

    // punch soft holes
    dc.globalCompositeOperation = 'destination-out';
    for (const l of this.lights) {
      const sx = (l.x - camX) / 2, sy = (l.y - camY) / 2;
      const r = Math.max(4, l.radius / 2);
      if (sx < -r || sy < -r || sx > this.dw + r || sy > this.dh + r) continue;
      const p = this.pulse(l, intensity);
      const g = dc.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(0,0,0,${clamp(0.95 * p, 0, 1)})`);
      g.addColorStop(0.55, `rgba(0,0,0,${clamp(0.5 * p, 0, 1)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.beginPath(); dc.arc(sx, sy, r, 0, 7); dc.fill();
    }
    ctx.drawImage(this.dark, 0, 0, this.dw, this.dh, 0, 0, w, h);

    // additive bloom pass
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lights) {
      const sx = l.x - camX, sy = l.y - camY;
      const r = l.radius * 2.4;
      if (sx < -r || sy < -r || sx > w + r || sy > h + r) continue;
      const p = this.pulse(l, intensity);
      ctx.globalAlpha = clamp((0.30 + 0.55 * p) * (l.glow ?? 1), 0, 1);
      ctx.drawImage(this._sprite(l.color), sx - r, sy - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
