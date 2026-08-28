/* ------------------------------------------------------------------ *
 *  Character controller — pure logic, no DOM.                        *
 *  Feel model: accel/decel curves with run wind-up + stop slide,     *
 *  variable-height jump, floaty rise / snappy fall, coyote time,     *
 *  jump buffering, squash-and-stretch spring, procedural pose.       *
 *  Verified by tests/character.test.mjs (runs in Node).              *
 * ------------------------------------------------------------------ */
import { clamp, lerp, approach, smoothstep, TAU } from './util.js';

export const DEFAULT_FEEL = {
  width: 20, height: 44,

  // horizontal
  runMax: 340,            // px/s top run speed
  groundAccelRate: 13,    // exponential rate toward target while pushing
  groundDecelRate: 7.0,   // release -> slight slide before stop
  groundBrakeRate: 16,    // pushing against velocity
  airAccelRate: 5.4,
  airDecelRate: 1.3,      // air drift keeps momentum
  windupTime: 0.18,       // s of reduced accel at start of a run (wind-up)
  windupFloor: 0.42,      // accel multiplier at t=0 of wind-up

  // vertical
  jumpVel: 735,
  gravityUp: 1950,
  gravityDown: 2560,      // ~1.31x fall gravity: floaty rise, snappy fall
  gravityHoldMult: 0.86,  // while jump held & rising -> floatier
  apexMult: 0.78,         // extra hang near apex
  apexWindow: 80,         // |vy| window for apex hang
  jumpCutMult: 0.45,      // vy *= this on early release
  jumpCutMinVel: 150,
  maxFall: 980,
  coyoteTime: 0.10,
  bufferTime: 0.12,

  // juice
  landSquashMin: 0.22,    // min impact (0..1) that triggers squash+dust
};

/** Axis-separated AABB solver. solids: [{x,y,w,h}]. Mutates char.      *
 *  Returns { landed, landSpeed, hitWall }. char.y = feet position.     */
export function moveAndCollide(char, solids, dt) {
  const f = char.feel;
  const out = { landed: false, landSpeed: 0, hitWall: 0 };
  const hw = f.width / 2;

  // --- X axis
  char.x += char.vx * dt;
  let box = { x: char.x - hw, y: char.y - f.height, w: hw * 2, h: f.height };
  for (const s of solids) {
    if (box.x < s.x + s.w && box.x + box.w > s.x && box.y < s.y + s.h && box.y + box.h > s.y) {
      if (char.vx > 0) char.x = s.x - hw;
      else if (char.vx < 0) char.x = s.x + s.w + hw;
      out.hitWall = Math.sign(char.vx) || out.hitWall;
      char.vx = 0;
      box.x = char.x - hw;
    }
  }

  // --- Y axis
  const wasGrounded = char.grounded;
  char.grounded = false;
  char.y += char.vy * dt;
  box = { x: char.x - hw, y: char.y - f.height, w: hw * 2, h: f.height };
  for (const s of solids) {
    if (box.x < s.x + s.w && box.x + box.w > s.x && box.y < s.y + s.h && box.y + box.h > s.y) {
      if (char.vy > 0) {
        char.y = s.y;
        if (!wasGrounded) { out.landed = true; out.landSpeed = char.vy; }
        char.grounded = true;
        char.vy = 0;
      } else if (char.vy < 0) {
        char.y = s.y + s.h + f.height;
        char.vy = 0;
      }
      box.y = char.y - f.height;
    }
  }
  return out;
}

export class Character {
  constructor(x, y, feel = DEFAULT_FEEL) {
    this.feel = feel;
    this.reset(x, y);
  }

  reset(x, y) {
    this.x = x; this.y = y;           // y = feet
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.facing = 1;
    this.coyote = 0; this.buffer = 0;
    this.windupT = 1; this.moveDir = 0;
    this.jumpCutDone = true;
    this.runPhase = 0;
    this.airBlend = 0;
    this.s = 0; this.sv = 0;          // squash spring ( + = squashed )
    this.stretchV = 0;
    this.landT = 9;
    this.events = [];                 // drained by engine: {type,power,x,y,dir}
    // scarf chain (world coords), attached at neck each step
    this.scarf = [];
    for (let i = 0; i < 11; i++) this.scarf.push({ x: x - i * 3.4, y: y - 36 });
    this.pose = this.computePose(0);
  }

  /** input: { moveX: -1..1, jumpHeld, jumpPressed, jumpReleased } */
  update(dt, input, solids) {
    const f = this.feel;
    const moveX = clamp(input.moveX || 0, -1, 1);

    /* ---------- horizontal: curved accel / decel ---------- */
    if (this.grounded && moveX !== 0) {
      const dir = Math.sign(moveX);
      if (dir !== this.moveDir) { this.moveDir = dir; this.windupT = 0; } // new push -> wind-up
      this.windupT += dt;
    } else if (moveX === 0) this.moveDir = 0;

    const target = moveX * f.runMax;
    let rate;
    if (this.grounded) {
      if (moveX === 0) rate = f.groundDecelRate;                                  // slide to stop
      else if (Math.sign(this.vx) === Math.sign(moveX) && Math.abs(this.vx) < f.runMax)
        rate = f.groundAccelRate * lerp(f.windupFloor, 1, smoothstep(this.windupT / f.windupTime));
      else rate = f.groundBrakeRate;                                              // turning / braking
    } else {
      rate = moveX !== 0 ? f.airAccelRate : f.airDecelRate;
    }
    this.vx = approach(this.vx, target, rate, dt);
    if (moveX === 0 && this.grounded && Math.abs(this.vx) < 12) this.vx = 0;
    if (Math.abs(this.vx) > 4 || moveX !== 0) this.facing = this.vx !== 0 ? Math.sign(this.vx) : (moveX !== 0 ? Math.sign(moveX) : this.facing);

    /* ---------- jump: buffer + coyote ---------- */
    this.coyote = this.grounded ? f.coyoteTime : this.coyote - dt;
    this.buffer = input.jumpPressed ? f.bufferTime : this.buffer - dt;
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = -f.jumpVel;
      this.grounded = false;
      this.coyote = 0; this.buffer = 0;
      this.jumpCutDone = false;
      this.s = -0.16; this.sv = 0;                       // launch stretch
      this.events.push({ type: 'jump', x: this.x, y: this.y, dir: this.facing });
    }
    // variable height: early release cuts the arc
    if (input.jumpReleased && !this.jumpCutDone && this.vy < -f.jumpCutMinVel) {
      this.vy *= f.jumpCutMult;
      this.jumpCutDone = true;
    }

    /* ---------- gravity: floaty rise, snappy fall, apex hang ---------- */
    let g = this.vy < 0
      ? f.gravityUp * (input.jumpHeld ? f.gravityHoldMult : 1)
      : f.gravityDown;
    if (Math.abs(this.vy) < f.apexWindow) g *= f.apexMult;
    this.vy = Math.min(this.vy + g * dt, f.maxFall);

    /* ---------- integrate + collide ---------- */
    const res = moveAndCollide(this, solids, dt);
    if (res.landed) {
      const impact = clamp(res.landSpeed / f.maxFall, 0, 1);
      this.landT = 0;
      if (impact > f.landSquashMin) {
        this.s = 0.34 * impact; this.sv = 0;             // impact squash
        this.events.push({ type: 'land', power: impact, x: this.x, y: this.y, dir: this.vx >= 0 ? 1 : -1 });
      }
    }
    if (res.hitWall) this.events.push({ type: 'wall', x: this.x, y: this.y - f.height * 0.5, dir: -res.hitWall });
    this.landT += dt;

    /* ---------- squash spring (stiff, slight overshoot) ---------- */
    this.sv += (-260 * this.s - 16 * this.sv) * dt;
    this.s = clamp(this.s + this.sv * dt, -0.3, 0.45);
    const stTarget = this.grounded ? 0
      : clamp(-this.vy / 2600, 0, 0.11) + clamp(this.vy / 3200, 0, 0.06);
    this.stretchV = approach(this.stretchV, stTarget, 14, dt);
    this.airBlend = approach(this.airBlend, this.grounded ? 0 : 1, 12, dt);

    /* ---------- run cycle / phase ---------- */
    const sf = clamp(Math.abs(this.vx) / f.runMax, 0, 1);
    if (this.grounded) this.runPhase += this.vx * dt * 0.055;
    this.speedFactor = approach(this.speedFactor ?? 0, sf, 10, dt);

    /* ---------- scarf follow chain ---------- */
    const neck = this.neckPos();
    this.scarf[0].x = neck.x; this.scarf[0].y = neck.y;
    const seg = 3.6;
    for (let i = 1; i < this.scarf.length; i++) {
      const p = this.scarf[i], q = this.scarf[i - 1];
      let dx = p.x - q.x, dy = p.y - q.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const tx = q.x + dx * seg, ty = q.y + dy * seg;
      const k = 1 - Math.exp(-26 * dt);
      const wi = i / this.scarf.length;
      p.x += (tx - p.x) * k - this.vx * 0.12 * dt * wi;                    // wind trail
      p.y += (ty - p.y) * k + (16 * dt) * wi + Math.sin((this.time ?? 0) * 6 + i) * 6 * dt * wi; // droop + flutter
    }
    this.time = (this.time ?? 0) + dt;

    this.pose = this.computePose(this.time);
    return res;
  }

  neckPos() { return { x: this.x - this.facing * 1.5, y: this.y - this.feel.height + 8 }; }

  /** Procedural pose: limb angles + bobs. Renderer draws from this. */
  computePose(t) {
    const f = this.feel;
    const sf = this.speedFactor ?? 0;
    const af = this.airBlend ?? 0;
    const ph = this.runPhase;

    // legs (radians, 0 = straight down, + = forward)
    let hipF = Math.sin(ph) * 0.9 * sf;
    let hipB = Math.sin(ph + Math.PI) * 0.9 * sf;
    let kneeF = Math.max(0, Math.sin(ph + 2.4)) * 1.05 * sf + 0.12 * sf;
    let kneeB = Math.max(0, Math.sin(ph + Math.PI + 2.4)) * 1.05 * sf + 0.12 * sf;

    // airborne pose: rise -> trail, fall -> reach for landing
    const vyN = clamp(this.vy / f.maxFall, -1, 1);
    const airHipF = vyN < 0 ? -0.55 : -1.05;
    const airHipB = vyN < 0 ? 0.35 : 0.5;
    const airKneeF = vyN < 0 ? 0.7 : 0.55;
    const airKneeB = vyN < 0 ? 0.5 : 0.8;
    hipF = lerp(hipF, airHipF, af); hipB = lerp(hipB, airHipB, af);
    kneeF = lerp(kneeF, airKneeF, af); kneeB = lerp(kneeB, airKneeB, af);

    // arms counter-swing
    const shoF = lerp(Math.sin(ph + Math.PI) * 0.62 * sf, vyN < 0 ? -2.2 : -1.6, af);
    const shoB = lerp(Math.sin(ph) * 0.62 * sf, vyN < 0 ? 0.5 : 0.8, af);
    const elbF = 0.35 + 0.3 * sf; const elbB = 0.35 + 0.3 * sf;

    // torso/head motion
    const bob = Math.sin(ph * 2) * 1.5 * sf * (1 - af);
    const breathe = Math.sin(t * 2.3) * 1.1 * (1 - sf) * (1 - af);
    const lean = 0.15 * clamp(this.vx / f.runMax, -1, 1) * (1 - af * 0.4) + af * 0.06 * this.facing;

    const squash = this.s + this.stretchV;
    return {
      hipF, hipB, kneeF, kneeB, shoF, shoB, elbF, elbB,
      bob: bob + breathe, lean,
      scaleX: 1 + squash * 0.72,
      scaleY: 1 - squash,
      sf, af,
    };
  }
}
