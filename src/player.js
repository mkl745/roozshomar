// Character controller: accel/decel curves, variable-height jump, asymmetric
// gravity, coyote time, jump buffering, squash-and-stretch, procedural limbs,
// scarf verlet ribbon, landing impact (squash + dust + micro-shake).
import { clamp, damp, lerp, TAU } from './util.js';

export const TUNE = {
  w: 24, h: 54,
  run: 335,
  accelGround: 10,   // wind-up into a run
  accelAir: 6,
  decelGround: 5.0,  // slight slide on release
  decelAir: 1.1,
  decelTurn: 13,     // hard brake when reversing
  jumpV: 620,
  gravUp: 1500, gravDown: 2500,   // floaty rise, snappy fall
  holdGravMult: 0.6,              // while jump held & rising
  jumpCut: 0.45,                  // release-early velocity scale
  coyote: 0.10, buffer: 0.12,
  maxFall: 980,
};

export class Player {
  constructor(engine) {
    this.e = engine;
    this.time = 0;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x; this.y = y;            // feet-center
    this.vx = 0; this.vy = 0;
    this.face = 1;
    this.grounded = false;
    this.coyote = 0; this.buffer = 0;
    this.jumpHeld = false;
    this.phase = 0;
    this.squash = 1; this.squashV = 0;
    this.landT = 0;
    this.scarf = Array.from({ length: 7 }, () => ({ x, y: y - 42, ox: x, oy: y - 42 }));
  }

  update(dt, input) {
    const T = TUNE;
    this.time += dt;
    const dir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);

    // ---- horizontal: curves, not steps ----
    if (dir !== 0) {
      this.face = dir;
      const reversing = this.grounded && Math.sign(this.vx) === -dir && Math.abs(this.vx) > 40;
      const rate = this.grounded ? (reversing ? T.decelTurn : T.accelGround) : T.accelAir;
      this.vx = damp(this.vx, dir * T.run, rate, dt);
      // skid dust on hard reversal
      if (reversing && Math.abs(this.vx) > 150 && Math.random() < dt * 22) {
        this.e.particles.dust(this.x, this.y, 1, 0.5);
      }
    } else {
      this.vx = damp(this.vx, 0, this.grounded ? T.decelGround : T.decelAir, dt);
      if (Math.abs(this.vx) < 4) this.vx = 0;
    }

    // ---- jump: buffer + coyote ----
    if (input.pressed('jump')) this.buffer = T.buffer;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? T.coyote : Math.max(0, this.coyote - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = -T.jumpV;
      this.grounded = false;
      this.coyote = 0; this.buffer = 0;
      // arm the release-cut only if the key is still down: a buffered tap
      // (released before takeoff) must give a full jump, not an instant cut
      this.jumpHeld = input.isDown('jump');
      this.squash = 1.14; this.squashV = 0;      // stretch
      this.e.particles.dust(this.x, this.y, 4, 0.5);
    }
    // variable height: cut on release
    if (this.jumpHeld && !input.isDown('jump')) {
      this.jumpHeld = false;
      if (this.vy < 0) this.vy *= T.jumpCut;
    }

    // ---- gravity: floaty rise, snappy fall ----
    const g = this.vy < 0
      ? (this.jumpHeld ? T.gravUp * T.holdGravMult : T.gravUp)
      : T.gravDown;
    this.vy = clamp(this.vy + g * dt, -2200, T.maxFall);

    // ---- integrate + collide ----
    this._collide(dt);

    // ---- squash & stretch spring ----
    const target = !this.grounded ? clamp(1 + Math.abs(this.vy) / 4200, 1, 1.12) : 1;
    this.squashV += ((target - this.squash) * 110 - this.squashV * 13) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, 0.66, 1.35);
    this.landT = Math.max(0, this.landT - dt);

    // ---- animation phase + scarf ----
    this.phase += this.vx * dt * 0.055;
    this._scarf(dt);
  }

  _collide(dt) {
    const T = TUNE, hw = T.w / 2;
    const solids = this.e.solids;

    this.x += this.vx * dt;
    for (const s of solids) {
      if (this.x + hw > s.x && this.x - hw < s.x + s.w && this.y > s.y + 2 && this.y - T.h < s.y + s.h - 2) {
        if (this.vx > 0) this.x = s.x - hw;
        else if (this.vx < 0) this.x = s.x + s.w + hw;
        this.vx = 0;
      }
    }

    const wasGrounded = this.grounded;
    const prevVy = this.vy;
    this.y += this.vy * dt;
    this.grounded = false;
    for (const s of solids) {
      if (this.x + hw > s.x && this.x - hw < s.x + s.w && this.y > s.y && this.y - T.h < s.y + s.h) {
        if (this.vy > 0 && prevVy >= 0) {
          this.y = s.y; this.vy = 0; this.grounded = true;
        } else if (this.vy < 0) {
          this.y = s.y + s.h + T.h; this.vy = 0;
        }
      }
    }

    // ---- landing impact ----
    if (!wasGrounded && this.grounded && prevVy > 380) {
      this.landT = 0.22;
      this.squash = clamp(1 - prevVy / 2600, 0.72, 0.9);
      this.squashV = 0;
      this.e.particles.dust(this.x, this.y, Math.round(5 + prevVy / 90), clamp(prevVy / 700, 0.5, 1.4));
      this.e.kick(clamp(prevVy / 900, 0, 1) * 1.8);
    }
  }

  _scarf(dt) {
    const nx = this.x - this.face * 3, ny = this.y - this.h + 12;
    const pts = this.scarf;
    pts[0].x = nx; pts[0].y = ny; pts[0].ox = nx; pts[0].oy = ny;
    const wind = -this.vx * 0.9 - this.face * 30;
    const flutter = this.e.audioIntensity * 26;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.ox) * 0.84, vy = (p.y - p.oy) * 0.84;
      p.ox = p.x; p.oy = p.y;
      p.x += vx + (wind + Math.sin(this.time * 9 + i * 1.7) * flutter) * dt * dt * 60;
      p.y += vy + (26 + Math.cos(this.time * 8 + i) * flutter * 0.6) * dt * dt * 60;
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - 6.5) / d;
        b.x -= dx * diff; b.y -= dy * diff;
        if (i === 1) { a.x = pts[0].x; a.y = pts[0].y; }
      }
    }
  }

  groundBelow() {
    let best = Infinity;
    for (const s of this.e.solids) {
      if (this.x >= s.x && this.x <= s.x + s.w && s.y >= this.y - 1) best = Math.min(best, s.y);
    }
    return best;
  }

  // ------------------------------------------------------------- rendering
  draw(ctx, engine) {
    const m = engine.env.mood;
    const runAmt = clamp(Math.abs(this.vx) / TUNE.run, 0, 1);
    const air = !this.grounded;

    // soft shadow
    const gy = this.groundBelow();
    if (gy < Infinity) {
      const d = gy - this.y;
      if (d < 170) {
        const a = (1 - d / 170) * 0.34;
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.beginPath();
        ctx.ellipse(this.x, gy + 2, 16 * (1 - d / 340) + 6, 4.2, 0, 0, TAU);
        ctx.fill();
      }
    }

    const sy = this.squash;
    const sx = 1 + (1 - sy) * 0.75;
    const rim = engine.lighting.rimInfo(this.x, this.y - 30, engine);
    const rimA = clamp(0.22 + rim.strength * 0.45, 0, 0.8) * (0.75 + 0.25 * engine.audioIntensity);

    const pose = this._pose(runAmt, air);

    // rim-light crescent: silhouette copy shifted toward the light, under the body
    ctx.save();
    ctx.translate(this.x + rim.dx * 2.6, this.y + rim.dy * 2.6);
    ctx.scale(this.face * sx, sy);
    this._body(ctx, pose, m.rim, rimA);
    ctx.restore();

    // scarf behind body
    this._drawScarf(ctx, m);

    // body
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * sx, sy);
    this._body(ctx, pose, '#0b0d13', 1);
    ctx.restore();
  }

  _pose(runAmt, air) {
    const idle = this.grounded && runAmt < 0.05;
    const bob = idle
      ? Math.sin(this.time * 2.2) * 1.3
      : Math.abs(Math.sin(this.phase)) * 2.4 * runAmt;
    return {
      runAmt, air, bob, idle,
      lean: 1.5 + runAmt * 4 + clamp(this.vx * this.face * 0.006, -2, 5),
      vy: this.vy,
      landT: this.landT,
    };
  }

  _body(ctx, p, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const hipY = -26, shY = -40 - p.bob * 0.4;
    const lean = p.lean;

    // legs
    ctx.lineWidth = 7;
    for (let s = 0; s < 2; s++) {
      const ph = this.phase + s * Math.PI;
      let fx, fy, knee;
      if (!p.air) {
        fx = Math.sin(ph) * 11 * p.runAmt + (s ? 1.5 : -1.5);
        fy = -Math.max(0, Math.cos(ph)) * 7 * p.runAmt;
        knee = 4 + 5 * p.runAmt;
      } else if (p.vy < 0) {           // rising: tuck
        fx = s ? 7 : -3; fy = s ? -15 : -11; knee = 7;
      } else {                          // falling: reach/trail
        fx = s ? 8 : -7; fy = s ? -7 : -2; knee = 5;
      }
      const hx = s ? 2 : -2;
      ctx.beginPath();
      ctx.moveTo(hx, hipY);
      ctx.quadraticCurveTo((hx + fx) / 2 + knee, (hipY + fy) / 2 - 2, fx, fy);
      ctx.stroke();
    }

    // arms (opposite phase, raised in air)
    ctx.lineWidth = 5.5;
    for (let s = 0; s < 2; s++) {
      const ph = this.phase + s * Math.PI;
      let hx2, hy2;
      if (!p.air) {
        hx2 = lean * 0.5 + Math.sin(ph + Math.PI) * 8 * p.runAmt;
        hy2 = shY + 12 - Math.cos(ph) * 3 * p.runAmt + (p.idle ? Math.sin(this.time * 2.2 + s) * 0.8 : 0);
      } else {
        hx2 = s ? lean + 7 : lean - 6; hy2 = shY + (s ? 2 : 5) - clamp(-p.vy * 0.012, 0, 8);
      }
      ctx.beginPath();
      ctx.moveTo(lean * 0.5, shY + 2);
      ctx.quadraticCurveTo(lean * 0.5 + (hx2 - lean * 0.5) * 0.4 - 2, shY + 8, hx2, hy2);
      ctx.stroke();
    }

    // torso
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(lean, shY);
    ctx.stroke();

    // head
    ctx.beginPath();
    ctx.arc(lean + 1.5, shY - 9 - p.bob * 0.3, 7.2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawScarf(ctx, m) {
    const pts = this.scarf;
    ctx.strokeStyle = m.scarf ? `rgba(${m.scarf[0] | 0},${m.scarf[1] | 0},${m.scarf[2] | 0},0.95)` : 'rgba(230,80,110,0.95)';
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = lerp(5.5, 1.2, i / (pts.length - 1));
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
}
