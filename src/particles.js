/* ------------------------------------------------------------------ *
 *  Particles: landing dust puffs, jump wisps, ambient audio motes.   *
 * ------------------------------------------------------------------ */
import { clamp, lerp, TAU } from './util.js';

export class ParticleSystem {
  constructor() { this.list = []; this.moteTimer = 0; }

  clear() { this.list.length = 0; }

  /** Impact dust: brief grounded puff that sells weight. */
  dust(x, y, power, dir) {
    const n = Math.round(5 + power * 9);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + 0.7 * Math.random());       // upward fan
      const sp = (26 + Math.random() * 70) * (0.5 + power);
      this.list.push({
        kind: 'dust',
        x: x + (Math.random() - 0.5) * 14, y: y - 1,
        vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1) - dir * 22,
        vy: -Math.sin(a) * sp * 0.7,
        r: 2.2 + Math.random() * 3.4 * power,
        life: 0, ttl: 0.42 + Math.random() * 0.34,
        grow: 14 + Math.random() * 10,
      });
    }
  }

  jumpWisp(x, y, dir) {
    for (let i = 0; i < 4; i++) this.list.push({
      kind: 'dust', x: x - dir * (3 + Math.random() * 5), y: y - 2 - Math.random() * 4,
      vx: -dir * (20 + Math.random() * 40), vy: 20 + Math.random() * 30,
      r: 1.6 + Math.random() * 1.8, life: 0, ttl: 0.3 + Math.random() * 0.2, grow: 8,
    });
  }

  /** Ambient floating motes; spawn density scales with audio intensity. */
  motes(dt, camX, camY, w, h, intensity, color) {
    this.moteTimer -= dt;
    const rate = 2.2 + intensity * 14;                        // per second
    while (this.moteTimer <= 0) {
      this.moteTimer += 1 / rate;
      this.list.push({
        kind: 'mote', color,
        x: camX + Math.random() * w, y: camY + Math.random() * h,
        vx: (Math.random() - 0.5) * 9, vy: -8 - Math.random() * 14 - intensity * 22,
        r: 0.8 + Math.random() * 1.9, life: 0, ttl: 2.4 + Math.random() * 2.6,
        ph: Math.random() * TAU,
      });
    }
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.ttl) { L.splice(i, 1); continue; }
      if (p.kind === 'dust') {
        p.vx *= Math.exp(-3.2 * dt);
        p.vy = p.vy * Math.exp(-3.2 * dt) - 26 * dt;          // dust rises slightly
        p.r += p.grow * dt;
      } else {
        p.x += Math.sin(p.life * 2.1 + p.ph) * 7 * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  /** pass 'back' for motes behind char, 'front' for dust in front. */
  draw(ctx, pass) {
    for (const p of this.list) {
      const t = p.life / p.ttl;
      if (pass === 'back' ? p.kind !== 'mote' : p.kind !== 'dust') continue;
      if (p.kind === 'dust') {
        const a = (1 - t) * 0.34;
        ctx.fillStyle = `rgba(210,190,205,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      } else {
        const a = Math.sin(Math.PI * t) * 0.8;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color || 'rgba(127,240,216,1)';
        ctx.globalAlpha = a * 0.75;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = a * 0.22;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
  }
}
