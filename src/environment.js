/* ------------------------------------------------------------------ *
 *  Reusable parallax / environment renderer.                         *
 *  Fully driven by a config data object (see scene_test.js):         *
 *  painterly multi-stop sky, stars, celestial body + glow,           *
 *  N seeded silhouette layers (ridges / spires) with parallax,       *
 *  drifting fog bands, and a color-grade pass (tint + vignette).     *
 * ------------------------------------------------------------------ */
import { clamp, mulberry32, makeFbm1D, hash2, rgba, hexToRgb, TAU } from './util.js';

export class ParallaxEnvironment {
  constructor(cfg) {
    this.cfg = cfg || {};
    this.tiles = [];
    this.stars = [];
    this.w = 0; this.h = 0; this.s = 1;
    this.skyGrad = null;
    this._buildStars();
  }

  _buildStars() {
    const st = this.cfg.stars;
    this.stars = [];
    if (!st) return;
    const rnd = mulberry32(st.seed ?? 7);
    for (let i = 0; i < (st.count ?? 120); i++) {
      this.stars.push({
        x: rnd(), y: rnd() * 0.72,
        r: (st.size?.[0] ?? 0.5) + rnd() * ((st.size?.[1] ?? 1.5) - (st.size?.[0] ?? 0.5)),
        ph: rnd() * TAU, sp: 0.5 + rnd() * 1.6,
      });
    }
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h;
    this.s = clamp(dpr, 1, 2);
    this.skyGrad = null;
    this.tiles = [];
    const layers = this.cfg.layers || [];
    for (const L of layers) this.tiles.push(this._renderTile(L));
  }

  /* ---------- layer tile pre-render ---------- */
  _renderTile(L) {
    const tileW = 1500;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(tileW * this.s);
    cv.height = Math.ceil(this.h * this.s);
    const c = cv.getContext('2d');
    c.scale(this.s, this.s);

    const fbm = makeFbm1D(L.seed ?? 1, L.octaves ?? 3);
    const base = (L.base ?? 0.6) * this.h;
    const amp = L.amp ?? 60;
    const freq = L.freq ?? 0.006;

    // ridge path
    c.fillStyle = L.color;
    c.beginPath();
    c.moveTo(0, this.h + 4);
    const step = 3;
    for (let x = 0; x <= tileW; x += step) {
      let y = base - fbm(x * freq + (L.seedOff ?? 0)) * amp - (fbm(x * freq * 3.7 + 40) - 0.5) * amp * 0.35;
      c.lineTo(x, y);
    }
    c.lineTo(tileW, this.h + 4);
    c.closePath();
    c.fill();

    // spires / trees / ruins silhouettes on the ridge
    if (L.kind === 'spires' || L.spikes) {
      const sp = L.spikes || {};
      const gap = sp.gap ?? 130, rnd = mulberry32((L.seed ?? 1) * 77 + 5);
      const cells = Math.ceil(tileW / gap);
      const heights = [];
      for (let i = 0; i <= cells; i++) heights.push(rnd());
      c.beginPath();
      for (let i = 0; i < cells; i++) {
        const r = heights[i];
        if (r < (sp.density ?? 0.45)) continue;
        const cx = i * gap + gap * (0.25 + 0.5 * heights[(i + 3) % cells]);
        const hh = (sp.h ?? 90) * (0.45 + 0.8 * heights[(i + 11) % cells]);
        const ww = (sp.w ?? 26) * (0.6 + 0.7 * r);
        const gy = base - fbm(cx * freq + (L.seedOff ?? 0)) * amp + 6;
        if (sp.style === 'tree') {
          // cypress-like: thin trunk + flame crown
          c.moveTo(cx - 2, gy); c.lineTo(cx - 2, gy - hh * 0.4);
          c.quadraticCurveTo(cx - ww * 0.5, gy - hh * 0.62, cx, gy - hh);
          c.quadraticCurveTo(cx + ww * 0.5, gy - hh * 0.62, cx + 2, gy - hh * 0.4);
          c.lineTo(cx + 2, gy);
        } else if (sp.style === 'ruin') {
          // broken column / arch fragment
          c.rect(cx - ww / 2, gy - hh, ww, hh + 4);
          if (heights[(i + 7) % cells] > 0.5) c.rect(cx - ww * 1.1, gy - hh * 0.55, ww * 2.2, hh * 0.16);
        } else {
          c.moveTo(cx - ww, gy); c.lineTo(cx - ww * 0.12, gy - hh); c.lineTo(cx + ww, gy);
        }
      }
      c.fill();
    }
    return { cv, tileW, parallax: L.parallax ?? 0.2, yOff: L.yOff ?? 0 };
  }

  /* ---------- per-frame render ---------- */
  render(ctx, camX, camY, w, h, t, intensity) {
    const cfg = this.cfg;

    // sky
    if (!this.skyGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      for (const [p, col] of (cfg.sky?.stops ?? [[0, '#000'], [1, '#111']])) g.addColorStop(p, col);
      this.skyGrad = g;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, w, h);

    // stars
    if (this.stars.length) {
      const par = cfg.stars.parallax ?? 0.05;
      ctx.save();
      for (const s of this.stars) {
        let sx = (s.x * (w + 80) - camX * par) % (w + 80); if (sx < 0) sx += w + 80;
        const sy = s.y * h - camY * par * 0.5;
        const tw = 0.35 + 0.65 * Math.pow(Math.sin(t * s.sp + s.ph) * 0.5 + 0.5, 2);
        ctx.globalAlpha = tw * (0.55 + intensity * 0.45);
        ctx.fillStyle = cfg.stars.color ?? '#e8ecff';
        ctx.beginPath(); ctx.arc(sx - 40, sy, s.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // celestial body + glow
    const cel = cfg.celestial;
    if (cel) {
      const cx = cel.x * w - camX * (cel.parallax ?? 0.03);
      const cy = cel.y * h - camY * 0.02;
      const gr = (cel.glowR ?? cel.r * 6) * (1 + intensity * 0.12);
      const gcol = hexToRgb(cel.glowColor ?? cel.color ?? '#fff');
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
      g.addColorStop(0, `rgba(${gcol.r},${gcol.g},${gcol.b},${0.5 + intensity * 0.15})`);
      g.addColorStop(0.3, `rgba(${gcol.r},${gcol.g},${gcol.b},0.16)`);
      g.addColorStop(1, `rgba(${gcol.r},${gcol.g},${gcol.b},0)`);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, gr, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = cel.color ?? '#fff';
      ctx.beginPath(); ctx.arc(cx, cy, cel.r, 0, TAU); ctx.fill();
      if (cel.craters) { // subtle moon shading
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.arc(cx - cel.r * 0.3, cy - cel.r * 0.15, cel.r * 0.28, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + cel.r * 0.25, cy + cel.r * 0.3, cel.r * 0.18, 0, TAU); ctx.fill();
      }
    }

    // parallax layers far -> near, fog interleaved
    const fogs = cfg.fog || [];
    let fogIdx = 0;
    this.tiles.forEach((tile, i) => {
      const ox = -mod(camX * tile.parallax, tile.tileW);
      const oy = -camY * tile.parallax * 0.35 + tile.yOff;
      for (let x = ox; x < w; x += tile.tileW) {
        ctx.drawImage(tile.cv, x, oy, tile.tileW, this.h);
      }
      // fog band that belongs behind this layer
      const f = fogs[fogIdx];
      if (f && (f.afterLayer ?? i) === i) { this._fog(ctx, f, camX, w, h, t); fogIdx++; }
    });
    while (fogIdx < fogs.length) { this._fog(ctx, fogs[fogIdx++], camX, w, h, t); }
  }

  _fog(ctx, f, camX, w, h, t) {
    const y = (f.y ?? 0.6) * h;
    const hh = f.h ?? 70;
    const drift = (t * (f.speed ?? 6) + camX * (f.parallax ?? 0.25)) % (w * 2);
    const col = hexToRgb(f.color ?? '#8a6a8f');
    ctx.save();
    for (let k = 0; k < 2; k++) {
      const x0 = -drift - w * 0.5 + k * w * 1.2;
      const g = ctx.createLinearGradient(0, y - hh, 0, y + hh);
      g.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0)`);
      g.addColorStop(0.5, `rgba(${col.r},${col.g},${col.b},${f.alpha ?? 0.12})`);
      g.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x0 + w * 0.6, y, w * 0.85, hh, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- color grade: mood tint + vignette ---------- */
  renderGrade(ctx, w, h, intensity) {
    const g = this.cfg.grade;
    if (!g) return;
    if (g.tint) {
      ctx.save();
      ctx.globalCompositeOperation = g.mode ?? 'soft-light';
      ctx.globalAlpha = (g.tintAlpha ?? 0.16) + (g.audioTint ?? 0) * intensity;
      const lg = ctx.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, g.tint);
      lg.addColorStop(1, g.tint2 ?? g.tint);
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (g.vignette) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const v = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.42, w / 2, h * 0.52, Math.max(w, h) * 0.78);
      v.addColorStop(0, 'rgba(255,255,255,1)');
      v.addColorStop(1, `rgba(${Math.round(255 * (1 - g.vignette))},${Math.round(255 * (1 - g.vignette * 0.95))},${Math.round(255 * (1 - g.vignette * 0.9))},1)`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}

const mod = (a, n) => ((a % n) + n) % n;
