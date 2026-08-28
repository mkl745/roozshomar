/* ------------------------------------------------------------------ *
 *  Core engine: fixed-timestep loop, high-DPI canvas, chapter state  *
 *  machine, checkpoints / respawn, pause-resume, camera with audio   *
 *  micro-shake, and the render pipeline that composes environment,   *
 *  world, character, particles, lighting and grade.                  *
 * ------------------------------------------------------------------ */
import { clamp, approach, lerp, rgba, hexToRgb } from './util.js';
import { Character } from './character.js';
import { Input } from './input.js';
import { ParticleSystem } from './particles.js';
import { LightingSystem } from './lighting.js';
import { ParallaxEnvironment } from './environment.js';
import { CharacterRenderer } from './character_draw.js';
import { getAudioIntensity, reactor } from './waveform.js';

export const STEP = 1 / 120;

export class Engine {
  constructor(canvas, { audio, fadeEl } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.fadeEl = fadeEl;
    this.input = new Input();
    this.particles = new ParticleSystem();
    this.lighting = new LightingSystem();
    this.charDraw = new CharacterRenderer(this.lighting);

    this.state = 'title';              // title | playing | paused | respawn
    this.chapter = null;
    this.char = null;
    this.solids = [];
    this.checkpoints = [];
    this.activeCp = 0;
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.acc = 0;
    this.last = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.fps = 60; this._fpsN = 0; this._fpsT = 0;
    this.respawnT = -1;
    this.shakePh = Math.random() * 10;
    this._raf = 0;
    this.onEvent = null;               // (type, data) -> main/UI
  }

  /* ---------------- lifecycle ---------------- */
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.w = Math.max(320, r.width);
    this.h = Math.max(240, r.height);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    if (this.env) this.env.resize(this.w, this.h, this.dpr);
    this.lighting.resize(this.w, this.h);
  }

  /** Chapter state machine: load a chapter definition object. */
  loadChapter(def) {
    this.chapter = def;
    this.env = new ParallaxEnvironment(def.environment);
    this.env.resize(this.w, this.h, this.dpr);
    this.lighting.configure(def.lighting);
    this.lightDefs = def.lights || [];
    this.solids = def.solids || [];
    this.checkpoints = (def.checkpoints || []).map(c => ({ ...c, active: false }));
    this.activeCp = 0;
    if (this.checkpoints[0]) this.checkpoints[0].active = true;
    this.killY = def.killY ?? 1200;
    this.worldW = def.worldW ?? 3000;
    this.char = new Character(def.spawn[0], def.spawn[1], def.feel);
    this.particles.clear();
    this.cam.x = this.char.x - this.w / 2;
    this.cam.y = this.char.y - this.h * 0.62;
    this.respawnT = -1;
  }

  start() {
    this.input.attach(window);
    this.last = performance.now();
    const loop = (t) => { this._raf = requestAnimationFrame(loop); this.frame(t); };
    this._raf = requestAnimationFrame(loop);
  }
  destroy() { cancelAnimationFrame(this._raf); this.input.detach(); }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.audio?.pause(); this.onEvent?.('pause'); } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.audio?.resume(); this.onEvent?.('resume'); } }
  begin() { if (this.state === 'title') { this.state = 'playing'; this.onEvent?.('begin'); } }

  /* ---------------- frame ---------------- */
  frame(t) {
    const dt = clamp((t - this.last) / 1000, 0, 0.25);
    this.last = t;
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsT); this._fpsN = 0; this._fpsT = 0; }

    if (this.state === 'playing' || this.state === 'respawn' || this.state === 'title') {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 10) { this.update(STEP); this.acc -= STEP; n++; }
      if (n === 10) this.acc = 0;
    }
    this.render();
    this.input.endFrame();
  }

  /* ---------------- update ---------------- */
  update(dt) {
    this.time += dt;
    reactor.update(dt);
    const intensity = getAudioIntensity();
    this.lighting.update(dt);

    if (this.state !== 'paused' && this.char) {
      if (this.state === 'playing') {
        const snap = this.input.snapshot();
        this.char.update(dt, snap, this.solids);
        this.input.consumeJumpEdges();
        for (const ev of this.char.events) {
          if (ev.type === 'land') this.particles.dust(ev.x, ev.y, ev.power, ev.dir);
          if (ev.type === 'jump') this.particles.jumpWisp(ev.x, ev.y, ev.dir);
        }
        this.char.events.length = 0;

        // checkpoints
        for (let i = this.activeCp + 1; i < this.checkpoints.length; i++) {
          const c = this.checkpoints[i];
          if (Math.abs(this.char.x - c.x) < 26 && Math.abs(this.char.y - c.y) < 70) {
            for (let k = 0; k <= i; k++) this.checkpoints[k].active = true;
            this.activeCp = i;
            this.onEvent?.('checkpoint', c);
          }
        }
        if (this.char.y > this.killY) this.startRespawn();
      }
      if (this.respawnT >= 0) {
        this.respawnT += dt;
        const fade = this.respawnT < 0.28 ? this.respawnT / 0.28 : 1 - (this.respawnT - 0.28) / 0.4;
        if (this.fadeEl) this.fadeEl.style.opacity = clamp(fade, 0, 1);
        if (this.respawnT >= 0.28 && !this._teleported) {
          this._teleported = true;
          const c = this.checkpoints[this.activeCp] || { x: this.chapter.spawn[0], y: this.chapter.spawn[1] };
          this.char.reset(c.x, c.y);
        }
        if (this.respawnT >= 0.68) { this.respawnT = -1; this._teleported = false; if (this.fadeEl) this.fadeEl.style.opacity = 0; }
      }
    }

    // camera
    if (this.char) {
      const lookX = this.char.facing * 46 + this.char.vx * 0.07;
      const tx = clamp(this.char.x + lookX - this.w / 2, -80, this.worldW - this.w + 80);
      const ty = clamp(this.char.y - this.h * 0.62, -200, (this.killY - 260) - this.h + 240);
      this.cam.x = approach(this.cam.x, tx, 5.2, dt);
      this.cam.y = approach(this.cam.y, ty, 4.2, dt);
      this.cam.shake = intensity * 1.35;
    }

    // lights (evaluated per frame from data defs)
    this.evalLights(intensity);

    // particles
    this.particles.motes(dt, this.cam.x, this.cam.y, this.w, this.h, intensity, this.chapter?.environment?.moteColor);
    this.particles.update(dt);
  }

  startRespawn() {
    if (this.respawnT >= 0) return;
    this.respawnT = 0; this._teleported = false;
    this.onEvent?.('respawn');
  }

  evalLights(intensity) {
    const L = [];
    for (const d of this.lightDefs) {
      const l = { ...d };
      switch (d.type) {
        case 'player':
          l.x = this.char.x + (d.dx ?? 0); l.y = this.char.y + (d.dy ?? -26); break;
        case 'orbit':
          l.x = d.cx + Math.cos(this.time * d.speed + (d.phase ?? 0)) * d.rx;
          l.y = d.cy + Math.sin(this.time * d.speed * (d.speedY ?? 1) + (d.phase ?? 0)) * d.ry;
          break;
        case 'checkpoint': {
          const c = this.checkpoints[d.index ?? this.activeCp];
          if (!c) continue;
          l.x = c.x; l.y = c.y - 40;
          l.intensity = c.active ? (d.intensity ?? 0.9) : 0.12;
          break;
        }
        default: break; // static: x,y as given
      }
      L.push(l);
    }
    this.lighting.setLights(L);
  }

  /* ---------------- render ---------------- */
  render() {
    const { ctx, w, h } = this;
    if (!w || !this.env) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const intensity = getAudioIntensity();
    const sh = this.cam.shake ?? 0;
    const sx = (Math.sin(this.time * 47.3 + this.shakePh) + Math.sin(this.time * 31.7)) * 0.5 * sh;
    const sy = (Math.sin(this.time * 53.9 + this.shakePh * 2) + Math.sin(this.time * 27.1)) * 0.5 * sh;
    const camX = this.cam.x + sx, camY = this.cam.y + sy;

    this.env.render(ctx, camX, camY, w, h, this.time, intensity);

    ctx.save();
    ctx.translate(-camX, -camY);

    // world solids as silhouettes with lit top edge
    const rim = this.lighting.rim;
    const sil = this.chapter?.environment?.silhouette ?? '#0b0817';
    for (const s of this.solids) {
      if (s.x + s.w < camX - 40 || s.x > camX + w + 40) continue;
      ctx.fillStyle = sil;
      ctx.beginPath();
      const rr2 = Math.min(7, s.w / 2);
      if (ctx.roundRect) ctx.roundRect(s.x, s.y, s.w, s.h, [rr2, rr2, 0, 0]);
      else ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(rim.color, 0.16 * rim.strength);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x + 2, s.y + 0.8); ctx.lineTo(s.x + s.w - 2, s.y + 0.8); ctx.stroke();
      ctx.restore();
    }

    // checkpoints: pole + pennant + orb
    for (let i = 0; i < this.checkpoints.length; i++) {
      const c = this.checkpoints[i];
      ctx.strokeStyle = sil; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - 46); ctx.stroke();
      ctx.fillStyle = c.active ? (this.chapter?.environment?.moteColor ?? '#7ff0d8') : rgba('#7ff0d8', 0.25);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - 46); ctx.lineTo(c.x + 16, c.y - 41); ctx.lineTo(c.x, c.y - 36);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y - 50, c.active ? 3.4 + intensity * 2 : 2.4, 0, 7); ctx.fill();
    }

    // contact shadow for weight
    if (this.char) {
      let gy = Infinity;
      for (const s of this.solids) {
        if (this.char.x > s.x && this.char.x < s.x + s.w && s.y >= this.char.y - 1) gy = Math.min(gy, s.y);
      }
      if (gy < Infinity) {
        const d = gy - this.char.y;
        if (d < 150) {
          const a = 0.30 * (1 - d / 150);
          ctx.fillStyle = `rgba(0,0,0,${a})`;
          ctx.beginPath();
          ctx.ellipse(this.char.x, gy + 2, 16 * (1 - d / 300), 4.2, 0, 0, 7);
          ctx.fill();
        }
      }
    }

    this.particles.draw(ctx, 'back');
    if (this.char) this.charDraw.render(ctx, this.char, this.time, { silhouette: sil });
    this.particles.draw(ctx, 'front');
    ctx.restore();

    this.lighting.render(ctx, camX, camY, w, h, intensity);
    this.env.renderGrade(ctx, w, h, intensity);
  }

  debugInfo() {
    return {
      fps: this.fps,
      state: this.state,
      x: this.char?.x.toFixed(0), y: this.char?.y.toFixed(0),
      vx: this.char?.vx.toFixed(0), vy: this.char?.vy.toFixed(0),
      grounded: this.char?.grounded,
      intensity: getAudioIntensity().toFixed(2),
      chapter: this.chapter?.id,
      track: this.audio?.currentName ?? '—',
    };
  }
}
