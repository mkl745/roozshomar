// Reusable lighting system: darkness layer with punched light pools,
// additive glow sprites (fed to the engine's bloom pass), and a rim-light
// vector query used by the player silhouette.
import { makeCanvas, rgb, clamp, lerp, TAU, hexToRgb } from './util.js';

const glowCache = new Map();
function glowSprite(c) {
  const key = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
  if (glowCache.has(key)) return glowCache.get(key);
  const s = makeCanvas(128, 128);
  const x = s.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, rgb(c, 0.85));
  g.addColorStop(0.25, rgb(c, 0.38));
  g.addColorStop(0.6, rgb(c, 0.12));
  g.addColorStop(1, rgb(c, 0));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glowCache.set(key, s);
  return s;
}

export class LightingSystem {
  constructor() {
    this.lights = [];
    this.ambient = { color: [10, 12, 26], darkness: 0.5 };
    this.lightCanvas = null; this.lctx = null;
    this.glowCanvas = null; this.gctx = null;
    this.t = 0; this.audio = 0;
  }

  // cfg: { lights: [{x,y,radius,color,intensity,pulseSpeed,pulseAmp,flicker,attach}] }
  configure(cfg) {
    this.lights = (cfg?.lights || []).map((l) => ({
      x: 0, y: 0, radius: 160, intensity: 1,
      pulseSpeed: 0, pulseAmp: 0, flicker: 0, attach: null,
      phase: Math.random() * TAU,
      ...l,
      color: typeof l.color === 'string' ? hexToRgb(l.color) : (l.color || [255, 210, 150]),
      live: l.intensity ?? 1,
    }));
  }

  resize(w, h) {
    // darkness wants some resolution (crisp pools); glow is soft additive
    // light, quarter-res reads identically and saves fill-rate.
    this.lightCanvas = makeCanvas(w * 0.5, h * 0.5);
    this.lctx = this.lightCanvas.getContext('2d');
    this.glowCanvas = makeCanvas(w * 0.35, h * 0.35);
    this.gctx = this.glowCanvas.getContext('2d');
  }

  update(dt, t, audioIntensity, engine) {
    this.t = t; this.audio = audioIntensity;
    for (const l of this.lights) {
      const pulse = 1 + l.pulseAmp * audioIntensity * (0.6 + 0.4 * Math.sin(t * l.pulseSpeed + l.phase));
      const flick = 1 + l.flicker * (Math.sin(t * 23 + l.phase) * Math.sin(t * 7.3 + l.phase * 2)) * 0.5;
      l.live = clamp(l.intensity * pulse * flick, 0, 2);
      if (l.attach === 'player' && engine.player) {
        l.x = engine.player.x; l.y = engine.player.y - 34;
      }
    }
  }

  _screen(wx, wy, engine) {
    return [wx - engine.cam.x + engine.cam.sx, wy - engine.cam.y + engine.cam.sy];
  }

  // Dark veil with holes punched at lights.
  renderDarkness(ctx, engine) {
    const { w, h } = engine;
    const lx = this.lctx;
    lx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    lx.clearRect(0, 0, w, h);
    lx.fillStyle = rgb(this.ambient.color, clamp(this.ambient.darkness, 0, 0.92));
    lx.fillRect(0, 0, w, h);
    lx.globalCompositeOperation = 'destination-out';
    for (const l of this.lights) {
      const [sx, sy] = this._screen(l.x, l.y, engine);
      const r = l.radius * (1 + 0.12 * this.audio * l.pulseAmp);
      if (sx < -r || sx > w + r || sy < -r || sy > h + r) continue;
      const g = lx.createRadialGradient(sx, sy, 0, sx, sy, r);
      const a = clamp(l.live, 0, 1) * 0.92;
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = g;
      lx.beginPath(); lx.arc(sx, sy, r, 0, TAU); lx.fill();
    }
    lx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.lightCanvas, 0, 0, w, h);
  }

  // Additive glow sprites; glowCanvas also feeds the engine bloom pass.
  renderGlow(ctx, engine) {
    const { w, h } = engine;
    const gx = this.gctx;
    gx.setTransform(0.35, 0, 0, 0.35, 0, 0);
    gx.clearRect(0, 0, w, h);
    for (const l of this.lights) {
      const [sx, sy] = this._screen(l.x, l.y, engine);
      this.screenGlow(sx, sy, l.radius * 0.8, l.color, 0.26 * l.live);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glowCanvas, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Screen-space additive glow (used for sun, checkpoints, etc.).
  screenGlow(sx, sy, radius, color, alpha) {
    if (alpha <= 0.003) return;
    const gx = this.gctx;
    gx.globalCompositeOperation = 'lighter';
    gx.globalAlpha = clamp(alpha, 0, 1);
    gx.drawImage(glowSprite(color), sx - radius, sy - radius, radius * 2, radius * 2);
    gx.globalAlpha = 1;
    gx.globalCompositeOperation = 'source-over';
  }

  // Direction + strength of rim light at a world point (for silhouettes).
  rimInfo(x, y, engine) {
    let dx = 0.45, dy = -0.75, s = 0.25;   // faint moon fallback
    for (const l of this.lights) {
      const ddx = l.x - x, ddy = l.y - y;
      const d = Math.hypot(ddx, ddy) + 1;
      const wgt = (l.live * l.radius) / (d * d) * 60;
      dx += (ddx / d) * wgt; dy += (ddy / d) * wgt; s += wgt;
    }
    const len = Math.hypot(dx, dy) || 1;
    return { dx: dx / len, dy: dy / len, strength: clamp(s, 0, 1.4) };
  }
}
