const Player = (() => {

const HALF_W = 9;
const HEIGHT = 46;

function create(spawn) {
  return {
    x: spawn.x, y: spawn.y,
    vx: 0, vy: 0,
    facing: 1,
    grounded: false,
    wasGrounded: false,
    groundIdx: -1,
    water: null,
    swimming: false,
    submerged: false,
    coyote: 0, buffer: 0,
    sx: 1, sy: 1,
    animName: 'idle',
    animClock: 0,
    animLock: null,
    strideDist: 0,
    stepSide: 1,
    movedDist: 0,
    jumpedOnce: false,
    paddleClock: 0
  };
}

function moveToward(cur, target, maxDelta) {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

function aabb(p) {
  return { l: p.x - HALF_W, r: p.x + HALF_W, t: p.y - HEIGHT, b: p.y };
}

function overlaps(a, s) {
  return a.l < s.x + s.w && a.r > s.x && a.t < s.y + s.h && a.b > s.y;
}

function update(p, dt, input, solids, waters, events) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const prevVy = p.vy;
  const prevFeetY = p.y;
  const wasSwimming = p.swimming;
  p.wasGrounded = p.grounded;

  let wat = null;
  for (const w of waters) {
    if (p.x > w.x && p.x < w.x + w.w && p.y > w.y + 4) { wat = w; break; }
  }
  p.water = wat;
  p.swimming = !!(wat && prevFeetY - wat.y >= 28);
  p.submerged = !!(wat && p.y - HEIGHT * 0.72 > wat.y);

  if (p.swimming && !wasSwimming) {
    events.splash(p.x, wat.y);
    Particles.burst(p.x, wat.y, {
      n: 8, speed: 150, dir: -Math.PI / 2, spread: 2.2, ttl: 0.5, size: 5,
      grav: 620, uv: 'spark', add: 0, r: 0.82, g: 0.90, b: 0.97, alpha: 0.5
    });
  }

  if (p.swimming) {
    const depth = p.y - wat.y;
    p.vx = moveToward(p.vx, dir * 195, 950 * dt);
    if (dir !== 0) p.facing = dir;

    const eq = wat.y + 24;
    p.vy += (eq - p.y) * 5.4 * dt;
    p.vy *= Math.exp(-2.3 * dt);

    if (input.jumpHeld) {
      p.vy -= 1400 * dt;
      p.vy = Math.max(p.vy, -250);
      p.paddleClock -= dt;
      if (p.paddleClock <= 0) {
        p.paddleClock = 0.34;
        events.paddle();
        Particles.ring(p.x, wat.y - 2, false);
        Particles.burst(p.x, wat.y, {
          n: 3, speed: 70, dir: -Math.PI / 2, spread: 1.4, ttl: 0.35, size: 4,
          grav: 520, uv: 'glow', add: 0, r: 0.85, g: 0.92, b: 0.98, alpha: 0.38
        });
      }
    } else {
      p.paddleClock = 0;
    }

    if (input.jumpPressed) {
      if (depth < 48) {
        p.vy = -660;
        events.jump();
        events.splashSmall(p.x, wat.y);
      } else {
        p.vy -= 430;
      }
      p.buffer = 0;
    }
    p.coyote = 0;
    p.grounded = false;
  } else {
    const wetWalk = !!wat && (p.y - wat.y) < 30;
    const maxRun = wetWalk ? 255 : 340;
    const accel = p.grounded ? 2700 : 1800;
    const fric = p.grounded ? 2500 : 350;
    if (dir !== 0) {
      p.vx = moveToward(p.vx, dir * maxRun, accel * dt);
      p.facing = dir;
    } else {
      p.vx = moveToward(p.vx, 0, fric * dt);
    }

    let g;
    if (p.vy < 0) g = input.jumpHeld ? 1980 : 3650;
    else if (Math.abs(p.vy) < 125) g = 1380;
    else g = 3000;
    p.vy = Math.min(p.vy + g * dt, 1280);

    if (p.grounded) p.coyote = 0.11;
    else p.coyote = Math.max(0, p.coyote - dt);

    if (input.jumpPressed) p.buffer = 0.14;
    else p.buffer = Math.max(0, p.buffer - dt);

    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -838;
      p.grounded = false;
      p.groundIdx = -1;
      p.buffer = 0;
      p.coyote = 0;
      p.jumpedOnce = true;
      p.sx = 0.86; p.sy = 1.18;
      events.jump();
      Particles.dust(p.x, p.y, 3, p.facing > 0 ? Math.PI : 0);
      if (wetWalk) {
        Particles.burst(p.x, p.y, {
          n: 5, speed: 120, ttl: 0.4, size: 4, grav: 600,
          uv: 'spark', add: 0, r: 0.82, g: 0.90, b: 0.97, alpha: 0.45
        });
      }
    }
    if (wat) p.vx *= Math.exp(-1.7 * dt);
  }

  p.x += p.vx * dt;
  let box = aabb(p);
  for (const s of solids) {
    if (!overlaps(box, s)) continue;
    if (s.followWater) continue;
    if (p.vx > 0) p.x = s.x - HALF_W;
    else if (p.vx < 0) p.x = s.x + s.w + HALF_W;
    p.vx = 0;
    box = aabb(p);
  }

  p.y += p.vy * dt;
  box = aabb(p);
  p.grounded = false;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (!overlaps(box, s)) continue;
    if (prevVy >= 0 && p.y - prevVy * dt <= s.y + 16) {
      p.y = s.y;
      if (!p.wasGrounded && p.vy > 240) {
        const hard = p.vy > 720;
        events.land(hard);
        p.sx = hard ? 1.24 : 1.16;
        p.sy = hard ? 0.76 : 0.84;
        Particles.dust(p.x - 8, p.y, 3, 0);
        Particles.dust(p.x + 8, p.y, 3, Math.PI);
      } else if (!p.wasGrounded) {
        p.sx = 1.08; p.sy = 0.94;
      }
      p.vy = 0;
      p.grounded = true;
      p.groundIdx = i;
    } else if (p.vy < 0) {
      p.y = s.y + s.h + HEIGHT;
      p.vy = 0;
    }
    box = aabb(p);
  }

  const k = 1 - Math.exp(-dt * 11);
  p.sx += (1 - p.sx) * k;
  p.sy += (1 - p.sy) * k;

  if (p.grounded && !p.swimming && Math.abs(p.vx) > 60) {
    p.strideDist += Math.abs(p.vx) * dt;
    if (p.strideDist > 36) {
      p.strideDist = 0;
      p.stepSide *= -1;
      events.step(!!(p.water && p.y - p.water.y < 30));
      Particles.dust(p.x - p.facing * 6, p.y, 1, p.facing > 0 ? Math.PI : 0);
    }
  }

  p.movedDist += Math.abs(p.vx) * dt;
  chooseAnim(p, dt);
}

function chooseAnim(p, dt) {
  let name;
  if (p.animLock) name = p.animLock;
  else if (p.swimming) name = 'fall';
  else if (!p.grounded) name = p.vy < -30 ? 'rise' : (p.vy > 30 ? 'fall' : p.animName);
  else if (Math.abs(p.vx) > 26) name = 'run';
  else name = 'idle';

  if (name !== p.animName) {
    p.animName = name;
    if (name !== 'rise' && name !== 'fall') p.animClock = 0;
  }
  const speeds = { idle: 6, run: 0, rise: 7, fall: 7, wake: 4.6 };
  if (name === 'run') {
    p.animClock += dt * (9 + Math.min(9, Math.abs(p.vx) * 0.032));
  } else {
    p.animClock += dt * (speeds[name] || 6);
  }
}

function getFrame(p, meta) {
  const m = meta[p.animName] || meta.idle;
  const idx = Math.floor(p.animClock) % m.n;
  return { row: m.row, idx, n: m.n };
}

return { create, update, getFrame, HALF_W, HEIGHT };
})();
