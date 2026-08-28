// Core engine: fixed-step loop, high-DPI canvas, chapter state machine,
// checkpoints, pause/resume, camera with audio-driven micro-shake, and the
// compositing pipeline (env -> world -> darkness -> glow -> bloom -> grade).
import { Input } from './input.js';
import { audio } from './audio.js';
import { waveform } from './waveform.js';
import { LightingSystem } from './lighting.js';
import { Environment } from './environment.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { makeCanvas, clamp, damp, rgb, TAU } from './util.js';

const STEP = 1 / 120;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.env = new Environment();
    this.lighting = new LightingSystem();
    this.particles = new Particles();
    this.player = new Player(this);

    this.solids = [];
    this.checkpoints = [];
    this.bounds = null;
    this.chapters = {};
    this.chapter = null;

    this.state = 'boot';            // boot | ready | playing | paused
    this.time = 0;
    this.fps = 60;
    this.showFps = false;
    this.audioIntensity = 0;
    this.flash = 0;
    this.kickV = 0;
    this.cam = { x: 0, y: 0, sx: 0, sy: 0 };
    this.onStateChange = null;

    waveform.link(audio);
    audio.onTrackChange = (name) => waveform.load(`waveform/${name}.jpg`);

    this._last = 0; this._acc = 0;
    addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((ts) => this._loop(ts));
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.dpr = clamp(devicePixelRatio || 1, 1, 2);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.lighting.resize(w, h);
    this.bloom = makeCanvas(w / 4, h / 4);
    this.bctx = this.bloom.getContext('2d');
  }

  registerChapter(name, def) { this.chapters[name] = def; }

  loadChapter(name) {
    const def = this.chapters[name];
    this.chapter = def;
    this.chapterName = name;
    def.setup(this);
    const cp = this.checkpoints[0];
    this.player.reset(cp.x, cp.y);
    this._setState('ready');
  }

  start() { if (this.state === 'ready') this._setState('playing'); }

  _setState(s) {
    this.state = s;
    if (this.onStateChange) this.onStateChange(s);
  }

  togglePause() {
    if (this.state === 'playing') { this._setState('paused'); audio.pause(); }
    else if (this.state === 'paused') { this._setState('playing'); audio.resume(); }
  }

  kick(amount) { this.kickV = Math.max(this.kickV, amount); }

  respawn() {
    const cp = this.checkpoints[this.checkpointIndex || 0];
    this.player.reset(cp.x, cp.y);
    this.flash = 0.7;
    this.particles.spark(cp.x, cp.y - 30, 14, rgb(this.env.mood.rim));
  }

  // ------------------------------------------------------------------ loop
  _loop(ts) {
    requestAnimationFrame((t2) => this._loop(t2));
    if (!this._last) this._last = ts;
    const raw = (ts - this._last) / 1000;
    this._last = ts;
    const dt = clamp(raw, 0, 0.05);
    if (raw > 0) this.fps = damp(this.fps, 1 / raw, 2, dt);

    // global keys work in every state
    if (this.input.pressed('pause') && (this.state === 'playing' || this.state === 'paused')) this.togglePause();
    if (this.input.pressed('fps')) this.showFps = !this.showFps;

    if (this.state === 'playing') {
      this._acc += dt;
      while (this._acc >= STEP) { this._update(STEP); this._acc -= STEP; }
    }
    this._render(dt);
    this.input.endFrame();
  }

  _update(dt) {
    this.time += dt;
    this.audioIntensity = waveform.getAudioIntensity();
    this.env.update(dt);
    this.lighting.ambient = this.env.mood.ambient;
    if (this.chapter.update) this.chapter.update(this, dt);
    this.player.update(dt, this.input);
    this.lighting.update(dt, this.time, this.audioIntensity, this);
    this.particles.update(dt);
    if (this.input.pressed('respawn')) this.respawn();
    this._camera(dt);
    this._checkpoints();
    if (this.bounds && this.player.y > this.bounds.killY) this.respawn();
    this.kickV = damp(this.kickV, 0, 6, dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  _camera(dt) {
    const p = this.player;
    const tx = p.x + p.face * 46 + p.vx * 0.14 - this.w * 0.5;
    const ty = p.y - 60 - this.h * 0.7;   // character low third, sky gets the frame
    this.cam.x = damp(this.cam.x, tx, 4.5, dt);
    this.cam.y = damp(this.cam.y, ty, 4, dt);
    if (this.bounds) {
      const b = this.bounds;
      this.cam.x = (b.maxX - b.minX <= this.w) ? (b.minX + b.maxX) / 2 - this.w / 2 : clamp(this.cam.x, b.minX, b.maxX - this.w);
      this.cam.y = (b.maxY - b.minY <= this.h) ? (b.minY + b.maxY) / 2 - this.h / 2 : clamp(this.cam.y, b.minY, b.maxY - this.h);
    }
    const m = this.env.mood;
    const micro = this.audioIntensity * (m.shake ?? 0.5) * 1.5 + this.kickV * 2.4;
    const t = this.time;
    this.cam.sx = (Math.sin(t * 53.7) + Math.sin(t * 31.3) * 0.5) * 0.6 * micro;
    this.cam.sy = (Math.cos(t * 47.1) + Math.sin(t * 27.7) * 0.5) * 0.6 * micro;
  }

  _checkpoints() {
    const p = this.player;
    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      if (!cp.taken && Math.abs(p.x - cp.x) < 34 && Math.abs(p.y - cp.y) < 70) {
        cp.taken = true;
        this.checkpointIndex = i;
        this.particles.spark(cp.x, cp.y - 34, 18, rgb(this.env.mood.rim));
        this.kick(0.7);
      }
    }
  }

  // -------------------------------------------------------------- rendering
  _render(dt) {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.env.render(ctx, this, this.time);

    // world space
    ctx.save();
    ctx.translate(-this.cam.x + this.cam.sx, -this.cam.y + this.cam.sy);
    this._solids(ctx);
    if (this.chapter.drawWorld) this.chapter.drawWorld(this, ctx);
    this._checkpointOrbs(ctx);
    this.particles.draw(ctx);
    this.player.draw(ctx, this);
    ctx.restore();

    // lighting: darkness veil + additive glow
    this.lighting.renderDarkness(ctx, this);
    this.lighting.renderGlow(ctx, this);

    // bloom: blur the glow buffer, add back
    const b = this.bloom, bx = this.bctx;
    bx.setTransform(1, 0, 0, 1, 0, 0);
    bx.clearRect(0, 0, b.width, b.height);
    bx.filter = 'blur(4px)';
    bx.drawImage(this.lighting.glowCanvas, 0, 0, b.width, b.height);
    bx.filter = 'none';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    ctx.drawImage(b, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // color grade + vignette
    const m = this.env.mood;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = rgb(m.tint, m.tintAmt);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.42, w / 2, h * 0.55, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    if (this.flash > 0) {
      ctx.fillStyle = rgb(m.rim, this.flash * 0.45);
      ctx.fillRect(0, 0, w, h);
    }

    this._hud(ctx);
  }

  _solids(ctx) {
    const m = this.env.mood;
    for (const s of this.solids) {
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + Math.min(s.h, 460));
      g.addColorStop(0, rgb(m.ground));
      g.addColorStop(1, 'rgb(0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      // rim-lit top edge sells the silhouette against the dark mass
      ctx.fillStyle = rgb(m.rim, 0.12);
      ctx.fillRect(s.x, s.y, s.w, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(s.x, s.y + 2, s.w, 1);
    }
  }

  _checkpointOrbs(ctx) {
    const m = this.env.mood;
    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      const bob = Math.sin(this.time * 2 + i) * 3;
      const y = cp.y - 34 + bob;
      const active = i <= (this.checkpointIndex || 0);
      ctx.fillStyle = rgb(m.rim, active ? 0.95 : 0.4);
      ctx.beginPath();
      ctx.arc(cp.x, y, active ? 5.5 : 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgb(m.rim, active ? 0.5 : 0.18);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cp.x, y, 9 + Math.sin(this.time * 3 + i) * 1.5, 0, TAU);
      ctx.stroke();
      const sx = cp.x - this.cam.x + this.cam.sx, sy = y - this.cam.y + this.cam.sy;
      this.lighting.screenGlow(sx, sy, 60, m.rim, (active ? 0.5 : 0.22) * (0.7 + 0.3 * this.audioIntensity));
    }
  }

  _hud(ctx) {
    const m = this.env.mood;
    ctx.textBaseline = 'top';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('← → / A D  move   ·   space  jump   ·   1–5  music   ·   P  pause   ·   R  respawn   ·   F  fps', 14, this.h - 24);

    const name = audio.trackName || '—';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(name + '.mp3', this.w - 14, 14);
    // live intensity bar straight off the waveform sampler
    const bw = 90;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(this.w - 14 - bw, 32, bw, 4);
    ctx.fillStyle = rgb(m.rim, 0.9);
    ctx.fillRect(this.w - 14 - bw, 32, bw * clamp(this.audioIntensity, 0, 1), 4);
    ctx.textAlign = 'left';

    if (this.showFps) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(`${Math.round(this.fps)} fps`, 14, 14);
    }
  }
}
