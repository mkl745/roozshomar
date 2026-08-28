// Soft-sprite particle system: landing/run dust, checkpoint sparks, ambient motes.
import { makeCanvas, TAU, clamp } from './util.js';

const spriteCache = new Map();
function softSprite(color) {
  if (spriteCache.has(color)) return spriteCache.get(color);
  // parse r,g,b out of any rgb()/rgba() form
  const n = (color.match(/\d+(?:\.\d+)?/g) || [255, 255, 255]).map(Number);
  const [r, g, b] = n;
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  const g2 = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g2.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  g2.addColorStop(0.45, `rgba(${r},${g},${b},0.38)`);
  g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = g2;
  x.fillRect(0, 0, 64, 64);
  spriteCache.set(color, c);
  return c;
}

export class Particles {
  constructor() { this.list = []; }

  _push(p) { if (this.list.length < 600) this.list.push(p); }

  // Impact dust puff (the "weight" seller).
  dust(x, y, count, power = 1, color = 'rgb(200,190,180)') {
    for (let i = 0; i < count; i++) {
      const a = Math.PI * (1 + Math.random());            // upward-ish hemisphere
      const s = (20 + Math.random() * 70) * power;
      this._push({
        type: 'dust', x: x + (Math.random() - 0.5) * 14, y: y - Math.random() * 4,
        vx: Math.cos(a) * s * (Math.random() < 0.5 ? 1 : -1) * 0.6 + (Math.random() - 0.5) * 30,
        vy: -Math.abs(Math.sin(a)) * s * 0.5,
        life: 0, max: 0.4 + Math.random() * 0.5,
        size: 3 + Math.random() * 5, grow: 14 + Math.random() * 10,
        color,
      });
    }
  }

  // Glowing spark (checkpoints, embers).
  spark(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = 30 + Math.random() * 90;
      this._push({
        type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0, max: 0.5 + Math.random() * 0.7, size: 1.5 + Math.random() * 2.5,
        grow: 0, color,
      });
    }
  }

  // Drifting ambient mote.
  mote(x, y, color, size = 2) {
    this._push({
      type: 'mote', x, y, vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 8,
      life: 0, max: 2.5 + Math.random() * 3, size, grow: 0, color,
    });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) { this.list.splice(i, 1); continue; }
      if (p.type === 'dust') {
        p.vx *= Math.exp(-4 * dt); p.vy = p.vy * Math.exp(-3 * dt) - 14 * dt;
        p.size += p.grow * dt;
      } else if (p.type === 'spark') {
        p.vy += 60 * dt; p.vx *= Math.exp(-1.5 * dt);
      } else {
        p.x += Math.sin((p.life + p.y) * 1.7) * 6 * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      const t = p.life / p.max;
      const a = p.type === 'dust' ? 0.34 * (1 - t) : 0.8 * (t < 0.15 ? t / 0.15 : 1 - t);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.drawImage(softSprite(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    ctx.globalAlpha = 1;
  }
}
