/* ------------------------------------------------------------------ *
 *  Headless feel-tests. Runs the SHIPPED controller (src/character.js)*
 *  at the engine's fixed 120 Hz step and asserts the feel contract:  *
 *  accel curve + wind-up, stop slide, variable jump height, floaty   *
 *  rise / snappy fall, coyote time, jump buffering, landing impact.  *
 *  Run: node tests/character.test.mjs                                *
 * ------------------------------------------------------------------ */
import assert from 'node:assert/strict';
import { Character, DEFAULT_FEEL as F } from '../src/character.js';

const DT = 1 / 120;
const FLOOR = [{ x: -2000, y: 560, w: 6000, h: 400 }];
const LEDGE = [{ x: -500, y: 560, w: 700, h: 400 }];   // right edge at x=200

const noop = { moveX: 0, jumpHeld: false, jumpPressed: false, jumpReleased: false };
const step = (ch, input = noop, solids = FLOOR, n = 1) => {
  for (let i = 0; i < n; i++) ch.update(DT, input, solids);
};
const settle = (ch, solids = FLOOR) => step(ch, noop, solids, 90);

let pass = 0;
const ok = (name) => { pass++; console.log('  ✓', name); };

/* 1 — wind-up: velocity ramps, not instant */
{
  const ch = new Character(0, 560); settle(ch);
  step(ch, { moveX: 1 }, FLOOR, 6);           // 50 ms
  const v50 = ch.vx;
  step(ch, { moveX: 1 }, FLOOR, 6);
  const v100 = ch.vx;
  assert.ok(v50 > 40 && v50 < F.runMax * 0.6, `wind-up: v(50ms)=${v50.toFixed(0)} is a ramp, not instant`);
  assert.ok(v100 > v50, 'wind-up: still accelerating');
  let t = 0.1; while (ch.vx < F.runMax * 0.95 && t < 2) { step(ch, { moveX: 1 }); t += DT; }
  assert.ok(t > 0.18 && t < 0.9, `full run reached in ${t.toFixed(2)}s (curve, not teleport)`);
  ok('accel curve + wind-up');
}

/* 2 — slide on release */
{
  const ch = new Character(0, 560); settle(ch);
  step(ch, { moveX: 1 }, FLOOR, 60);
  assert.ok(ch.vx > F.runMax * 0.9, 'at top speed');
  step(ch);                                    // 1 frame after release
  assert.ok(ch.vx > F.runMax * 0.85, 'no instant stop');
  step(ch, noop, FLOOR, 6);                    // 50 ms
  assert.ok(ch.vx > F.runMax * 0.35, `slide: still gliding at 50ms (${ch.vx.toFixed(0)} px/s)`);
  let t = 0; while (Math.abs(ch.vx) > 5 && t < 2) { step(ch); t += DT; }
  assert.ok(t < 1.2, `fully stopped after ${t.toFixed(2)}s`);
  ok('stop slide');
}

/* 3 — variable jump height */
{
  const apex = (holdFrames) => {
    const ch = new Character(0, 560); settle(ch);
    let minY = 560;
    step(ch, { ...noop, jumpHeld: true, jumpPressed: true });
    for (let i = 0; i < 200; i++) {
      const held = i < holdFrames;
      step(ch, { moveX: 0, jumpHeld: held, jumpPressed: false, jumpReleased: !held && i === holdFrames });
      minY = Math.min(minY, ch.y);
    }
    return 560 - minY;
  };
  const tap = apex(4), full = apex(200);
  assert.ok(full > tap * 1.3, `hold apex ${full.toFixed(0)}px >> tap apex ${tap.toFixed(0)}px`);
  ok(`variable jump height (tap ${tap.toFixed(0)}px vs hold ${full.toFixed(0)}px)`);
}

/* 4 — floaty rise, snappy fall */
{
  const ch = new Character(0, 560); settle(ch);
  step(ch, { jumpHeld: true, jumpPressed: true });
  const y0 = ch.y;
  let up = 0; while (ch.vy < 0) { step(ch, { jumpHeld: true }); up++; }
  let down = 0; while (ch.y < y0 && down < 600) { step(ch, { jumpHeld: true }); down++; }
  assert.ok(down < up, `fall time ${down} < rise time ${up} (snappy fall)`);
  ok('asymmetric gravity');
}

/* 5 — coyote time */
{
  const ch = new Character(150, 560); settle(ch, LEDGE);
  let left = false;                            // run until the exact frame of leaving ground
  for (let i = 0; i < 120 && !left; i++) { step(ch, { moveX: 1 }, LEDGE); left = !ch.grounded; }
  assert.ok(left && ch.x > 200, 'off the ledge');
  step(ch, noop, LEDGE, 7);                    // ~58 ms of the 100 ms grace used
  assert.ok(!ch.grounded);
  step(ch, { jumpPressed: true, jumpHeld: true }, LEDGE);
  assert.ok(ch.vy < 0, 'coyote jump 58ms after leaving ledge works');
  // and the grace really expires: a late press must NOT jump
  const ch2 = new Character(150, 560); settle(ch2, LEDGE);
  left = false;
  for (let i = 0; i < 120 && !left; i++) { step(ch2, { moveX: 1 }, LEDGE); left = !ch2.grounded; }
  step(ch2, noop, LEDGE, 20);                  // 167 ms > 100 ms grace
  step(ch2, { jumpPressed: true, jumpHeld: true }, LEDGE);
  assert.ok(ch2.vy >= 0, 'grace expired after 167ms (no infinite coyote)');
  ok('coyote time (fires at 58ms, expires by 167ms)');
}

/* 6 — jump buffering */
{
  const ch = new Character(0, 300);            // falling toward floor
  step(ch, noop, FLOOR, 30);
  assert.ok(ch.vy > 0, 'falling');
  // press jump ~83 ms before impact
  let framesToLand = 0;
  { const c2 = new Character(ch.x, ch.y); c2.vy = ch.vy;
    while (c2.y < 560 && framesToLand < 600) { c2.update(DT, noop, FLOOR); framesToLand++; } }
  const pressAt = Math.max(1, framesToLand - 10);
  let landed = -1, jumped = -1, i = 0;
  for (; i < 600; i++) {
    const was = ch.grounded;
    ch.update(DT, { moveX: 0, jumpReleased: false, jumpPressed: i === pressAt, jumpHeld: i >= pressAt }, FLOOR);
    if (!was && ch.grounded && landed < 0) landed = i;
    if (ch.vy < 0 && jumped < 0) jumped = i;
    if (jumped > 0) break;
  }
  assert.ok(landed > pressAt, 'pressed before landing');
  assert.ok(jumped >= landed && jumped - landed <= 4, `buffered jump fired ${((jumped - landed) * 1000 / 120).toFixed(0)}ms after touchdown`);
  ok('jump buffering');
}

/* 7 — landing impact event (drives squash + dust) */
{
  const ch = new Character(0, 100);
  let ev = null;
  for (let i = 0; i < 400; i++) {
    ch.update(DT, noop, FLOOR);
    for (const e of ch.events) if (e.type === 'land') ev = e;
    ch.events.length = 0;
    if (ev) break;
  }
  assert.ok(ev && ev.power > F.landSquashMin, `land event power=${ev?.power?.toFixed(2)}`);
  ok('landing impact');
}

/* 8 — terminal velocity clamp */
{
  const ch = new Character(0, -3000);
  step(ch, noop, FLOOR, 400);
  assert.ok(ch.vy <= F.maxFall + 0.001, `vy clamped at ${ch.vy.toFixed(0)}`);
  ok('max fall clamp');
}

console.log(`\n${pass}/8 feel checks passed against src/character.js`);
