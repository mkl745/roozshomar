const Engine = (() => {

const SAVE_KEY = 'rzg_save_v2';
const CAM_BASE_Y = 460;
const VIEW_H = 720;

let gl, canvas, fx, art, tex = {};
let pSky, pSprite, pWater, pParticle, pRain;
let state = 'boot';
let paused = false;
let time = 0, timeScale = 1, tsTimer = 0;
let introT = 0, outroT = 0, chapterInT = 99;
let player, cam, motes, checkpoints, collectedCount = 0;
let respawnFade = 0, pendingRespawn = false, roofStuckT = 0;
let letterbox = 1, fadeWhite = 0, fadeBlack = 0;
let qualityScale = 1, frameEMA = 16, qualityTimer = 0;
let saveDirty = false, saveTimer = 0;
let bikeCooldown = 0;
let running = false;
let lastFrame = 0, acc = 0;
let curPr = 0;
let underT = 0;
let rainAmt = 0, windSlant = 0.18, thunderT = 14;
let chapter = null, W = null;
let awareness = 0, awareT = 0, prevAware = 0, lightCooldown = 0;
let hunt = { active: false, x: 0, safeX: 0, speed: 0, t: 0, grace: 0 };
let shadowAlpha = 0, shadowY = 620, eyesBlink = 1, blinkT = 2;
let heartT = 0, caughtBoost = 0, bellPlayed = false;

let camRX = 0, camRY = 0, rvhX = 1, rvhY = 1;

const LAYER_CFG = [
  { key: 'L1', fac: 0.06, vfac: 0.10, baseY: 700, stretch: 1.5 },
  { key: 'L2', fac: 0.14, vfac: 0.22, baseY: 692, stretch: 1.42 },
  { key: 'L3', fac: 0.30, vfac: 0.42, baseY: 684, stretch: 1.35 },
  { key: 'L4', fac: 0.52, vfac: 0.68, baseY: 674, stretch: 1.26 }
];
const FG_CFG = { key: 'FG', fac: 1.22, vfac: 1.18, baseY: 700, stretch: 1.32 };

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
    const old = localStorage.getItem('rzg_save_v1');
    if (old) {
      const o = JSON.parse(old);
      return { v: 2, ch: 1, c: o.c | 0, m: o.m || [], d: !!o.d };
    }
  } catch (e) { }
  return null;
}
function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { }
}
function hasSave() {
  const s = loadSave();
  return !!(s && ((s.c | 0) > 0 || (s.m || []).length > 0 || s.ch > 1));
}

function initGLResources(canvasEl, builtArt) {
  canvas = canvasEl;
  gl = GLC.create(canvas);
  if (!gl) throw new Error('no webgl2');
  art = builtArt;

  const T = c => GLC.texFromCanvas(gl, c, {});
  tex.layers = {};
  ['L1', 'L2', 'L3', 'L4', 'FG'].forEach(k => { tex.layers[k] = T(art[k]); });
  tex.atlas = T(art.atlas);
  tex.player = T(art.player.sheet);
  tex.school = T(art.school);
  tex.lantern = T(art.lantern);
  tex.shadow = T(art.shadow);
  tex.eyes = T(art.eyes);
  tex.beam = T(art.beam);
  tex.fogA = T(art.fogA);
  tex.fogB = T(art.fogB);
  tex.props = {};
  for (const k in art.props) tex.props[k] = T(art.props[k]);
  tex.glyphs = {};
  for (const k in art.glyphs) tex.glyphs[k] = T(art.glyphs[k]);
  tex.terrainByChapter = {};

  pSky = GLC.prog(gl, GLC.QUAD_VS_SRC, SHADERS.SKY_FS);
  pSprite = GLC.prog(gl, SHADERS.SPRITE_VS, SHADERS.SPRITE_FS);
  pWater = GLC.prog(gl, SHADERS.SPRITE_VS, SHADERS.WATER_FS);
  pParticle = GLC.prog(gl, SHADERS.PARTICLE_VS, SHADERS.PARTICLE_FS);
  pRain = GLC.prog(gl, GLC.QUAD_VS_SRC, SHADERS.RAIN_FS);

  Particles.initGL(gl);
  fx = new PostFX(gl);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * qualityScale;
  const w = Math.max(320, Math.floor(window.innerWidth * dpr));
  const h = Math.max(240, Math.floor(window.innerHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
  }
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  if (fx) fx.resize(w, h);
}

function buildTerrainTextures(chN, solids) {
  if (!tex.terrainByChapter[chN]) {
    const cache = new Map();
    tex.terrainByChapter[chN] = solids.map(s => {
      const key = [s.w, s.h, s.island ? 1 : 0, s.style || 'soil'].join('_');
      if (!cache.has(key)) cache.set(key, SPRITES.makeGround(s.w, s.h, !!s.island, s.style || 'soil'));
      return GLC.texFromCanvas(gl, cache.get(key), {});
    });
  }
  return tex.terrainByChapter[chN];
}

function loadChapter(n, cpIdx) {
  chapter = CHAPTERS.find(c => c.n === n) || CHAPTERS[0];
  W = chapter.world;

  W.solids.forEach(s => { if (s.followWater) s.y = (s.off || 0) + (W.waters[0].levelStart || W.waters[0].y); });

  motes = W.motes.map(m => ({
    id: m.id, hx: m.x, hy: m.y,
    x: m.x, y: m.y,
    taken: false,
    phase: Math.random() * Math.PI * 2,
    orbit: !!(W.triggers.bikeZone && m.x > W.triggers.bikeZone.x - 10 && m.x < W.triggers.bikeZone.x + W.triggers.bikeZone.w + 20 && m.y > 380),
    orbA: Math.random() * Math.PI * 2,
    converge: 0
  }));
  checkpoints = W.checkpoints.map(c => ({ x: c.x, y: c.y, lit: false }));
  W.glyphs.forEach(g => { g.done = false; });
  (W.triggers.hunts || []).forEach(h => { h.done = false; });
  (W.triggers.teases || []).forEach(tz => { tz.done = false; });
  W.props.forEach(p => { p._k = 0; p._y = p.y; p._rot = p.tilt || 0; });
  awareness = 0; awareT = 0; prevAware = 0; lightCooldown = 0;
  hunt = { active: false, x: 0, safeX: 0, speed: 0, t: 0, grace: 0 };
  shadowAlpha = 0; shadowY = W.GROUND_Y || 620; caughtBoost = 0; bellPlayed = false;

  const takenSet = new Set();
  if (cpIdx > 0) {
    checkpoints.forEach((c, i) => { if (i < cpIdx) c.lit = true; });
  }

  const sp = cpIdx > 0 ? checkpoints[cpIdx - 1] : W.spawn;
  player = Player.create({ x: sp.x, y: sp.y });
  cam = { x: player.x, y: CAM_BASE_Y, zoom: 1, trauma: 0 };
  introT = 0; outroT = 0; chapterInT = 0;
  letterbox = 0.9; fadeWhite = 0; fadeBlack = 0;
  bikeCooldown = 0;
  timeScale = 1; tsTimer = 0;
  pendingRespawn = false; respawnFade = 0; roofStuckT = 0;
  underT = 0;
  rainAmt = W.rainStart || 0;
  thunderT = 12;
  collectedCount = 0;
  Particles.clear();

  tex.terrain = buildTerrainTextures(n, W.solids);
}

function resetRuntimeFromSave(cpIdx) {
  const save = loadSave();
  const chN = save ? (save.ch || 1) : 1;
  loadChapter(chN, cpIdx !== undefined ? cpIdx : (save ? (save.c | 0) : 0));
}

const events = {
  get time() { return time; },
  jump() { AudioSys.jump(); },
  land(hard) {
    AudioSys.land(hard);
    if (cam) cam.trauma = Math.min(1, cam.trauma + (hard ? 0.45 : 0.2));
  },
  step(wet) { AudioSys.step(wet); },
  paddle() { AudioSys.paddle(); },
  splash(x, y) { AudioSys.splash(true); Particles.splash(x, y); },
  splashSmall(x, y) { AudioSys.splash(false); Particles.ring(x, y, false); }
};

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function mixRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function lerpSky(A, B, t) {
  const o = {};
  for (const k in A) {
    if (Array.isArray(A[k])) o[k] = mixRGB(A[k], B[k], t);
    else o[k] = A[k] + (B[k] - A[k]) * t;
  }
  return o;
}

function gatherInput(auto) {
  if (auto) return auto;
  const st = Input.state;
  return {
    left: st.left, right: st.right, jumpHeld: st.jumpHeld,
    jumpPressed: Input.consumeJump()
  };
}

function dynWater() {
  for (const w of W.waters) if (w.levelStart !== undefined) return w;
  return null;
}

function update(dt) {
  time += dt;
  chapterInT += dt;
  if (tsTimer > 0) {
    tsTimer -= dt / Math.max(timeScale, 0.01);
    if (tsTimer <= 0) timeScale = 1;
    else timeScale += (1 - timeScale) * Math.min(1, dt * 2.4);
  }

  if (state === 'intro') {
    introT += dt;
    player.animLock = 'wake';
    player.animClock = Math.min(player.animClock + dt * 4.4, 5.4);
    letterbox = 1 - smoothstep(2.9, 4.1, introT);
    if (introT >= 3.1) {
      player.animLock = null;
      state = 'play';
    }
  } else if (state === 'play') {
    caughtBoost = Math.max(0, caughtBoost - dt * 1.1);
    if (chapterInT < 1.6) letterbox = 0.9 * (1 - smoothstep(0.2, 1.6, chapterInT));
    else letterbox = 0;

    if (pendingRespawn) {
      respawnFade += dt * 3.4;
      if (respawnFade >= 1) { pendingRespawn = false; doRespawn(); }
    } else {
      respawnFade = Math.max(0, respawnFade - dt * 2.6);
    }
    if (!pendingRespawn) {
      const inp = gatherInput(null);
      Player.update(player, dt, inp, W.solids, W.waters, events);
      postPhysics(dt);
      interact(dt);
      updateShadow(dt);
      checkFalls(dt);
    } else {
      Input.consumeJump();
    }
  } else if (state === 'outro') {
    outroT += dt;
    Input.consumeJump();
    if (!bellPlayed && chapter.n === 3) { bellPlayed = true; AudioSys.bellDistant(); }
    const stopX = W.triggers.outroStopX || (W.triggers.endX + 140);
    const auto = { left: false, right: player.x < stopX, jumpHeld: false, jumpPressed: false };
    if (outroT < 3.3 && !pendingRespawn) {
      Player.update(player, dt, auto, W.solids, W.waters, events);
      postPhysics(dt);
    }
    letterbox = Math.min(0.85, 0.4 + outroT * 0.3);
    fadeWhite = smoothstep(1.7, 4.15, outroT);
    if (outroT > 4.5) finishChapter();
  }

  updateFloaters(dt);
  updateWaterLevel(dt);
  updateSinkers(dt);
  updateMotes(dt);
  updateAmbient(dt);
  updateWeather(dt);
  updateCamera(dt);

  saveTimer -= dt;
  if (saveDirty && saveTimer <= 0) {
    flushSave();
    saveDirty = false;
    saveTimer = 2;
  }

  const wet = player.water && player.y - player.water.y < 30;
  AudioSys.setWind(Math.min(1, Math.abs(player.vx) / 340 + (player.y < 480 ? 0.2 : 0)) * (chapter.n === 1 ? 1 : 0.5));
}

function postPhysics(dt) {
  const wz = W.triggers.windZone;
  if (wz && player.x > wz.x && player.x < wz.x + wz.w && !player.grounded) {
    player.vx += Math.sin(time * 0.7 + player.x * 0.0013) * 150 * dt;
  }
}
let underTarget = 0;

function checkFalls(dt) {
  underTarget = player.submerged ? 1 : 0;
  if (player.y > W.KILL_Y) {
    pendingRespawn = true;
    respawnFade = 0.001;
    return;
  }
  if (player.swimming && player.submerged && player.x > 3300 && chapter.n === 2) {
    roofStuckT += dt;
    if (roofStuckT > 1.7) {
      roofStuckT = 0;
      pendingRespawn = true;
      respawnFade = 0.001;
    }
  } else {
    roofStuckT = Math.max(0, roofStuckT - dt);
  }
}

function doRespawn() {
  let cp = W.spawn;
  for (const c of checkpoints) if (c.lit) cp = c;
  player.x = cp.x; player.y = cp.y;
  player.vx = 0; player.vy = 0;
  player.inWater = false; player.swimming = false; player.submerged = false;
  cam.x = cp.x;
  if (hunt.active) {
    shadowX(player.x - 640);
    hunt.grace = 1.5;
    hunt.t *= 0.35;
    hunt.speed = Math.max(W.triggers.miniHunt.speed, hunt.speed * 0.7);
  } else {
    awareT = 0;
    lightCooldown = Math.max(lightCooldown, 2.5);
  }
  Particles.dust(cp.x, cp.y, 5);
}

function collect(m) {
  m.taken = true;
  collectedCount++;
  AudioSys.collect(time);
  Particles.collectBurst(m.x, m.y);
  saveDirty = true; saveTimer = 1.5;
}

function flushSave() {
  let cp = 0;
  for (let i = 0; i < checkpoints.length; i++) if (checkpoints[i].lit) cp = i + 1;
  writeSave({
    v: 2, ch: chapter.n, c: cp,
    m: motes.filter(m => m.taken).map(m => m.id),
    d: false
  });
}

function interact(dt) {
  bikeCooldown = Math.max(0, bikeCooldown - dt);

  for (const g of W.glyphs) {
    if (g.done) continue;
    if (g.cond === 'moved' && player.movedDist > 240) g.done = true;
    if (g.cond === 'jumped' && player.jumpedOnce) g.done = true;
    if (g.cond === 'submerged' && player.submerged) g.done = true;
  }

  const px = player.x, py = player.y - 24;
  for (const m of motes) {
    if (m.taken) continue;
    if (m.orbit && m.converge <= 0) {
      m.orbA += dt * 0.85;
      m.x = m.hx + Math.cos(m.orbA) * 13;
      m.y = m.hy + Math.sin(m.orbA * 1.3) * 9;
    } else if (m.converge > 0) {
      m.converge -= dt;
      m.x += (px - m.x) * Math.min(1, dt * 9);
      m.y += (py - m.y) * Math.min(1, dt * 9);
      if (Math.hypot(px - m.x, py - m.y) < 20) { collect(m); continue; }
    } else {
      m.phase += dt;
      const dx = px - m.x, dy = py - m.y;
      const d = Math.hypot(dx, dy);
      if (d < 86) {
        m.x += dx * Math.min(1, dt * 5.2);
        m.y += dy * Math.min(1, dt * 5.2);
      } else {
        m.x = m.hx + Math.sin(m.phase * 0.9) * 4;
        m.y = m.hy + Math.sin(m.phase * 1.5) * 6;
      }
      if (d < 26) collect(m);
    }
    if ((m.orbit || m.converge > 0) && Math.hypot(px - m.x, py - m.y) < 30) collect(m);
  }

  const bz = W.triggers.bikeZone;
  if (bz && bikeCooldown <= 0 && player.grounded &&
    player.x > bz.x && player.x < bz.x + bz.w) {
    bikeCooldown = 9;
    AudioSys.bell();
    timeScale = 0.38; tsTimer = 0.62;
    cam.trauma = Math.min(1, cam.trauma + 0.16);
    for (const m of motes) {
      if (m.orbit && !m.taken) {
        setTimeout(() => { if (!m.taken) m.converge = 1; }, 130 * (m.id % 6));
      }
    }
    Particles.burst(player.x, player.y - 60, { n: 14, speed: 190, ttl: 0.8, size: 9, uv: 'spark' });
  }

  for (const c of checkpoints) {
    if (!c.lit && Math.abs(player.x - c.x) < 44 && Math.abs(player.y - c.y) < 90) {
      c.lit = true;
      AudioSys.checkpoint();
      saveDirty = true; saveTimer = 0.4;
      Particles.burst(c.x, c.y - 84, { n: 16, speed: 130, ttl: 0.9, size: 10 });
      Particles.ring(c.x, c.y - 84, true);
    }
    if (c.lit && Math.random() < dt * 11) {
      Particles.flame(c.x + (Math.random() - 0.5) * 8, c.y - 82);
    }
  }

  if (player.x >= W.triggers.endX && state === 'play') {
    state = 'outro';
    outroT = 0;
    const hasNext = chapter.n < CHAPTERS.length;
    AudioSys.fadeMusic(AudioSys.soundOn() ? (hasNext ? 0.30 : 0.58) : 0, 3);
  }
}

function litAt(px, py) {
  if (!W.beams) return false;
  for (const b of W.beams) {
    const halfW = b.h * 0.15;
    if (Math.abs(px - b.x) < halfW && py > b.top - 20 && py < b.top + b.h + 30) return true;
  }
  return false;
}

function startHunt(safeX, speed) {
  hunt = {
    active: true,
    x: Math.min(player.x - 580, safeX - 1500),
    safeX, speed, t: 0, grace: 0.9
  };
  AudioSys.roar();
  cam.trauma = Math.min(1, cam.trauma + 0.32);
}

function endHunt() {
  if (!hunt.active) return;
  Particles.burst(hunt.x, shadowY - 120, { n: 22, speed: 90, ttl: 1.2, size: 26, grow: 2, uv: 'smoke', add: 0, r: 0.45, g: 0.38, b: 0.60, alpha: 0.4, fadePow: 0.9 });
  hunt.active = false;
  awareT = 0;
  lightCooldown = 5;
  AudioSys.dissolve();
}

function caughtNow() {
  AudioSys.caughtSting();
  caughtBoost = 1;
  pendingRespawn = true;
  respawnFade = 0.001;
}

function updateShadow(dt) {
  const S = W.triggers.shadow;
  if (!S) {
    awareness = 0;
    shadowAlpha = Math.max(0, shadowAlpha - dt);
    return;
  }

  lightCooldown = Math.max(0, lightCooldown - dt);
  blinkT -= dt;
  if (blinkT <= 0) blinkT = 2.6 + Math.random() * 3;
  eyesBlink = blinkT < 0.13 ? 0.12 : 1;

  for (const tz of (W.triggers.teases || [])) {
    if (!tz.done && player.x > tz.x) {
      tz.done = true;
      tz.t = tz.dur;
      AudioSys.whisper();
      shadowAlpha = Math.max(shadowAlpha, 0.001);
    }
    if (tz.done && tz.t > 0) tz.t -= dt;
  }

  const lit = litAt(player.x, player.y - 24);

  if (!hunt.active && state === 'play') {
    if (lit && lightCooldown <= 0 && player.grounded) awareT += dt;
    else awareT = Math.max(0, awareT - dt * 0.65);
    if (awareT >= W.triggers.lightCap) {
      startHunt(player.x + W.triggers.miniHunt.ahead, W.triggers.miniHunt.speed);
      awareT = W.triggers.lightCap * 0.4;
    }
    for (const hz of (W.triggers.hunts || [])) {
      if (!hz.done && player.x > hz.x) {
        hz.done = true;
        startHunt(hz.safeX, S.baseSpeed);
        break;
      }
    }
  }

  prevAware = awareness;
  const targetAware = hunt.active ? Math.max(awareness, 0.72) : Math.min(1, awareT / W.triggers.lightCap);
  awareness += (targetAware - awareness) * Math.min(1, dt * 3);
  if (prevAware < 0.5 && awareness >= 0.5 && !hunt.active) AudioSys.whisper();

  if (hunt.active) {
    hunt.t += dt;
    let sp = hunt.speed + S.accel * hunt.t;
    sp = Math.min(sp, S.maxSpeed);
    if (litAt(shadowX(), shadowY - 100)) sp += S.lightBoost;
    shadowX(sp * dt);
    if (hunt.grace > 0) hunt.grace -= dt;
    else if (Math.abs(shadowX() - player.x) < S.catchR &&
      Math.abs((player.y) - shadowY) < 130) {
      caughtNow();
    }
    if (player.x >= hunt.safeX) endHunt();
  } else if ((W.triggers.teases || []).some(tz => tz.t > 0)) {
    const tz = W.triggers.teases.find(t2 => t2.t > 0);
    shadowX(player.x + tz.dx);
  }

  const gyTarget = groundBelow(shadowX(), player.y);
  shadowY += (gyTarget - shadowY) * Math.min(1, dt * 6);

  const alphaTarget = hunt.active ? 1 : ((W.triggers.teases || []).some(tz => tz.t > 0) ? 0.85 : 0);
  shadowAlpha += (alphaTarget - shadowAlpha) * Math.min(1, dt * (hunt.active ? 4 : 1.6));

  if (shadowAlpha > 0.06 && !hunt.active) {
    const tz = (W.triggers.teases || []).find(t2 => t2.t > 0);
    if (tz && tz.t <= 0.05) shadowAlpha *= 0.96;
  }

  if (shadowAlpha > 0.12 && Math.random() < dt * 14) {
    Particles.spawn({
      x: shadowX() + (Math.random() - 0.5) * 130,
      y: shadowY - Math.random() * 40,
      vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 26,
      life: 1.6, size: 16 + Math.random() * 22, grow: 1.4,
      uv: 'smoke', add: 0, r: 0.16, g: 0.11, b: 0.26, alpha: 0.34, fadePow: 1
    });
  }

  if (awareness > 0.15 || hunt.active) {
    heartT -= dt;
    if (heartT <= 0) {
      const intensity = Math.max(awareness, hunt.active ? 0.85 : 0);
      heartT = 1.08 - intensity * 0.64;
      AudioSys.heart();
    }
  } else {
    heartT = 0.2;
  }
}

let _shadowX = -9999;
function shadowX(v) {
  if (v !== undefined) _shadowX = v;
  if (_shadowX === -9999) _shadowX = player.x - 600;
  return _shadowX;
}
function groundBelow(x, fallback) {
  let best = fallback;
  for (const s of W.solids) {
    if (x > s.x - 20 && x < s.x + s.w + 20 && s.y >= fallback - 260 && s.y < best) best = s.y;
  }
  return best;
}

function updateFloaters(dt) {
  W.solids.forEach((s, i) => {
    if (!s.followWater) return;
    const wtr = dynWater() || W.waters[0];
    const ny = wtr.y + (s.off || 0) + Math.sin(time * 1.4 + s.x * 0.01) * 2.5;
    const delta = ny - s.y;
    s.y = ny;
    if (player.grounded && player.groundIdx === i) {
      player.y += delta;
    }
  });
}

function updateWaterLevel(dt) {
  const dw = dynWater();
  if (!dw) return;
  let target = dw.levelStart;
  for (const z of (W.triggers.riseZones || [])) {
    if (player.x > z.x) target = Math.min(target, z.lv);
  }
  const rate = 15;
  if (dw.y > target) dw.y = Math.max(target, dw.y - rate * dt);
}

function updateSinkers(dt) {
  const dw = dynWater();
  for (const pr of W.props) {
    if (pr.sinkTo === undefined) continue;
    const surf = dw ? dw.y : 9999;
    if (surf < pr.y - 4) pr._k = Math.min(1, pr._k + dt / 6);
    else pr._k = Math.max(0, pr._k - dt / 9);
    const e = pr._k * pr._k * (3 - 2 * pr._k);
    pr._y = pr.y + (pr.sinkTo - pr.y) * e;
    pr._rot = (pr.tilt || 0) * e;
    if (pr._k > 0.02 && pr._k < 0.98 && Math.random() < dt * 6) {
      Particles.spawn({
        x: pr.x + (Math.random() - 0.5) * 50, y: pr._y - 30 - Math.random() * 40,
        vx: 0, vy: -34, life: 1.1, size: 4.5, grow: 0.8,
        uv: 'ring', add: 0, r: 0.75, g: 0.86, b: 0.95, alpha: 0.4, fadePow: 1.1
      });
    }
  }
}

function updateMotes(dt) {
  for (const m of motes) {
    if (!m.taken && Math.random() < dt * 0.45) {
      Particles.spawn({
        x: m.x + (Math.random() - 0.5) * 18, y: m.y + (Math.random() - 0.5) * 18,
        vx: 0, vy: -13, life: 0.9, size: 4.5, grow: 0.5,
        uv: 'glow', add: 1, r: 1, g: 0.87, b: 0.55, alpha: 0.45
      });
    }
  }
}

function updateAmbient(dt) {
  Particles.maintainPollen(camRX - rvhX, camRX + rvhX, camRY - rvhY, camRY + rvhY, rainAmt > 0.3 ? 12 : 46, rainAmt > 0.3 ? 4 : 11);
  Particles.cullOutside(camRX - rvhX, camRX + rvhX, camRY - rvhY, camRY + rvhY);
  if (chapter.n === 1 && player.x > 3950 && Math.random() < dt * 0.5) {
    Particles.petal(4050 + Math.random() * 500, 210 + Math.random() * 160);
  }
  if (player.submerged) {
    if (Math.random() < dt * 2.6) {
      Particles.spawn({
        x: player.x + (Math.random() - 0.5) * 10, y: player.y - 38,
        vx: (Math.random() - 0.5) * 12, vy: -46 - Math.random() * 30,
        life: 1.0, size: 3 + Math.random() * 3, grow: 0.5,
        uv: 'ring', add: 0, r: 0.8, g: 0.92, b: 1.0, alpha: 0.5, fadePow: 0.8
      });
      if (Math.random() < 0.4) AudioSys.bubble();
    }
  }
}

function updateWeather(dt) {
  const pr = curPr;
  const target = chapter.n === 2
    ? Math.min(1, 0.14 + pr * 1.15) * (0.55 + 0.45 * smoothstep(0.35, 0.75, pr))
    : 0;
  rainAmt += (target - rainAmt) * Math.min(1, dt * 0.8);
  AudioSys.setRain(rainAmt);

  const wz = W.triggers.windZone;
  const inGust = wz && player.x > wz.x && player.x < wz.x + wz.w;
  const slantTarget = 0.16 + (inGust ? 0.22 + Math.sin(time * 0.5) * 0.14 : 0) + rainAmt * 0.06;
  windSlant += (slantTarget - windSlant) * Math.min(1, dt * 1.5);

  if (rainAmt > 0.4) {
    thunderT -= dt;
    if (thunderT <= 0) {
      thunderT = 20 + Math.random() * 22;
      AudioSys.thunder();
    }
  }

  if (rainAmt > 0.03) {
    const drops = rainAmt * 90 * dt;
    let n = Math.floor(drops) + (Math.random() < drops % 1 ? 1 : 0);
    while (n-- > 0) {
      const x = camRX - rvhX + Math.random() * rvhX * 2;
      let sy = null;
      const dw = dynWater();
      if (dw && x > dw.x && x < dw.x + dw.w && dw.y < 700) sy = dw.y;
      if (sy === null) {
        for (const s of W.solids) {
          if (x > s.x && x < s.x + s.w) { if (sy === null || s.y < sy) sy = s.y; }
        }
      }
      if (sy === null || sy < camRY - rvhY - 40 || sy > camRY + rvhY + 60) continue;
      if (dw && sy === dw.y) {
        if (Math.random() < 0.22) Particles.ring(x, sy, false);
      } else {
        Particles.burst(x, sy, {
          n: 1, speed: 44, dir: -Math.PI / 2, spread: 1.6, ttl: 0.24, size: 2.6,
          grav: 900, uv: 'spark', add: 0, r: 0.72, g: 0.80, b: 0.88, alpha: 0.5
        });
      }
    }
  }

  underT += ((player.submerged ? 1 : 0) - underT) * Math.min(1, dt * 5);
  AudioSys.setSubmerged(underT > 0.4);
}

function ppu() {
  return (canvas.height / VIEW_H) * cam.zoom;
}

function updateCamera(dt) {
  let tx, ty, tz = 1;
  if (state === 'intro') {
    const k = smoothstep(0.6, 3.6, introT);
    tx = player.x + 34;
    ty = player.y - 58;
    tz = 1.55 - 0.55 * k;
    const e = 1 - Math.exp(-dt * (2.2 + k * 3.6));
    cam.x += (tx - cam.x) * e;
    cam.y += (ty - cam.y) * e;
    cam.zoom += (tz - cam.zoom) * e;
  } else {
    const vz = W.triggers.vistaZone;
    if (vz && player.x > vz.x && player.x < vz.x + vz.w) tz = 0.9;
    tx = player.x + player.facing * 66 + player.vx * 0.10;
    tx = Math.max(W.bounds.left + 90, Math.min(W.bounds.right - 80, tx));
    ty = player.y - 64;
    cam.x += (tx - cam.x) * (1 - Math.exp(-dt * 4.6));
    cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 3.4));
    cam.zoom += (tz - cam.zoom) * (1 - Math.exp(-dt * 2.1));
    cam.y = Math.min(CAM_BASE_Y + 170, Math.max(CAM_BASE_Y - 240, cam.y));
  }
  cam.trauma = Math.max(0, cam.trauma - dt * 1.7);
}

function gradeMix() {
  const pr = Math.min(1, Math.max(0, (player.x - W.spawn.x) / Math.max(1, W.triggers.endX - W.spawn.x)));
  curPr = pr;
  const A = W.gradeA, B = W.gradeB;
  const out = {};
  for (const k in A) {
    if (Array.isArray(A[k])) out[k] = A[k].map((v, i) => v + (B[k][i] - v) * pr);
    else out[k] = A[k] + (B[k] - A[k]) * pr;
  }
  if (state === 'intro') {
    const cold = 1 - smoothstep(0.5, 3.2, introT);
    out.sat -= cold * 0.22;
    out.exposure -= cold * 0.08;
  }
  if (state === 'outro') {
    out.exposure += smoothstep(0, 3, outroT) * 0.2;
    out.bloom += smoothstep(0, 3, outroT) * 0.5;
  }
  return out;
}

function spr(cx, cy, hw, hh, o = {}) {
  gl.uniform4f(pSprite.u('uRect'), cx, cy, hw, hh);
  gl.uniform1f(pSprite.u('uRot'), o.rot || 0);
  gl.uniform1i(pSprite.u('uMode'), o.mode || 0);
  gl.uniform2f(pSprite.u('uCamPos'), o.camX !== undefined ? o.camX : camRX, o.camY !== undefined ? o.camY : camRY);
  gl.uniform2f(pSprite.u('uViewHalf'), o.vhX !== undefined ? o.vhX : rvhX, o.vhY !== undefined ? o.vhY : rvhY);
  gl.uniform2f(pSprite.u('uRes'), canvas.width, canvas.height);
  gl.uniform4f(pSprite.u('uTint'), o.r !== undefined ? o.r : 1, o.g !== undefined ? o.g : 1, o.b !== undefined ? o.b : 1, o.a !== undefined ? o.a : 1);
  gl.uniform4f(pSprite.u('uUVR'), o.uvr ? o.uvr[0] : 0, o.uvr ? o.uvr[1] : 0, o.uvr ? o.uvr[2] : 1, o.uvr ? o.uvr[3] : 1);
  gl.uniform1f(pSprite.u('uFlip'), o.flip ? 1 : 0);
  gl.uniform1f(pSprite.u('uSway'), o.sway || 0);
  gl.uniform1f(pSprite.u('uTime'), time);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function render() {
  const P = ppu();
  const shX = Math.sin(time * 41.7) * cam.trauma * cam.trauma * 7;
  const shY = Math.cos(time * 37.3) * cam.trauma * cam.trauma * 7;
  const breatheY = Math.sin(time * 0.42) * 1.4;
  camRX = cam.x + shX;
  camRY = cam.y + breatheY + shY;
  rvhX = canvas.width / P / 2;
  rvhY = canvas.height / P / 2;

  fx.beginScene();
  const grade = gradeMix();
  const skyT = smoothstep(0, 0.4, curPr);
  const sky = lerpSky(W.skyA, W.skyB, skyT);
  const LC0 = LAYER_CFG[0];
  const effX1 = camRX * LC0.fac;
  const effY1 = CAM_BASE_Y + (camRY - CAM_BASE_Y) * LC0.vfac;

  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(pSky);
  const sunElev = canvas.height * (sky.sunI > 0.02 ? (0.115 - 0.062 * curPr) : 0.09);
  const horizonSY = canvas.height / 2 + (470 - effY1) * P;
  const sunSX = canvas.width * (0.76 - (effX1 - 2600) * 0.00003);
  const sunSY = horizonSY - sunElev;
  gl.uniform2f(pSky.u('uRes'), canvas.width, canvas.height);
  gl.uniform1f(pSky.u('uTime'), time);
  gl.uniform2f(pSky.u('uSunYD'), sunSX / canvas.width, sunSY / canvas.height);
  gl.uniform1f(pSky.u('uSunR'), sky.sunR);
  gl.uniform1f(pSky.u('uCamX'), camRX);
  gl.uniform3f(pSky.u('uCTop'), sky.top[0], sky.top[1], sky.top[2]);
  gl.uniform3f(pSky.u('uCUp'), sky.up[0], sky.up[1], sky.up[2]);
  gl.uniform3f(pSky.u('uCMid'), sky.mid[0], sky.mid[1], sky.mid[2]);
  gl.uniform3f(pSky.u('uCLow'), sky.low[0], sky.low[1], sky.low[2]);
  gl.uniform3f(pSky.u('uCHor'), sky.hor[0], sky.hor[1], sky.hor[2]);
  gl.uniform3f(pSky.u('uCGlow'), sky.glow[0], sky.glow[1], sky.glow[2]);
  gl.uniform1f(pSky.u('uCloudAmt'), sky.cloudAmt);
  gl.uniform1f(pSky.u('uCloudLit'), sky.cloudLit);
  gl.uniform1f(pSky.u('uSunI'), sky.sunI);
  gl.uniform1f(pSky.u('uHaze'), sky.haze);
  fx.quad.draw(gl);

  gl.useProgram(pSprite);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(pSprite.u('uT0'), 0);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  for (let i = 0; i < LAYER_CFG.length; i++) {
    drawLayer(LAYER_CFG[i], mixRGB(W.tintsA[i], W.tintsB[i], skyT));
  }

  if (W.fogs) {
    for (const f of W.fogs) {
      if (!f.front) drawFog(f);
    }
  }

  if (chapter.n === 1) {
    const schoolAlpha = smoothstep(W.triggers.schoolRevealAt, W.triggers.schoolRevealAt + 550, player.x);
    if (schoolAlpha > 0.01) {
      const wPx = art.school.width * P * 0.85;
      const hPx = art.school.height * P * 0.85;
      gl.bindTexture(gl.TEXTURE_2D, tex.school);
      spr(sunSX - wPx * 0.16, horizonSY - hPx * 0.46, wPx / 2, hPx / 2, { mode: 1, a: schoolAlpha * 0.92 });
    }
  }

  drawProps(true);
  drawTerrain();
  drawWaters();
  if (W.beams) drawBeams();
  drawProps(false);
  drawCheckpoints();
  drawShadow();
  drawMotes();
  drawGlyphs();
  drawPlayer();

  gl.useProgram(pParticle);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
  gl.uniform1i(pParticle.u('uT0'), 0);
  Particles.render(gl, pParticle, camRX, camRY, rvhX, rvhY, name => art.atlasUV[name]);

  fx.quad.bind(gl);
  gl.useProgram(pSprite);
  drawLayer(FG_CFG, mixRGB(W.tintsA[4], W.tintsB[4], skyT));

  if (W.fogs) {
    for (const f of W.fogs) {
      if (f.front) drawFog(f);
    }
  }

  if (rainAmt > 0.005) {
    gl.useProgram(pRain);
    gl.uniform1f(pRain.u('uTime'), time);
    gl.uniform1f(pRain.u('uAmt'), rainAmt);
    gl.uniform1f(pRain.u('uWind'), windSlant);
    gl.uniform2f(pRain.u('uRes'), canvas.width, canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    fx.quad.draw(gl);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  const rayVis = Math.max(0, Math.min(1, 1.25 - Math.max(0, (-sunSY) / (canvas.height * 0.5))));

  const fear = Math.max(awareness * (hunt.active ? 1 : 0.8), hunt.active ? 0.72 : 0);
  const pulse = 0.5 + 0.5 * Math.sin(time * 6.6);
  grade.vig += fear * 0.09 * (0.4 + 0.6 * pulse);
  grade.grain += fear * 0.014;
  grade.exposure -= fear * 0.05;

  fx.compose({
    time,
    threshold: 0.68,
    sunUV: [sunSX / canvas.width, 1 - sunSY / canvas.height],
    ray: grade.ray * Math.max(0.25, rayVis) * (state === 'outro' ? 1.5 : 1),
    grade,
    letterbox: letterbox + fear * 0.05,
    fadeWhite,
    fadeBlack: Math.min(1, Math.max(respawnFade * 0.92 + caughtBoost * 0.35, fadeBlack)),
    under: underT * 0.85
  });
}

function drawLayer(cfg, warm) {
  const t = tex.layers[cfg.key];
  const cnvH = art[cfg.key].height;
  const effX = camRX * cfg.fac;
  const effY = CAM_BASE_Y + (camRY - CAM_BASE_Y) * cfg.vfac;
  const period = 2048 * cfg.stretch;
  const leftEff = effX - rvhX;
  const i0 = Math.floor(leftEff / period) - 1;
  const i1 = Math.floor((effX + rvhX) / period) + 1;
  gl.bindTexture(gl.TEXTURE_2D, t);
  for (let i = i0; i <= i1; i++) {
    const cx = i * period + period / 2;
    const cy = cfg.baseY - cnvH / 2;
    spr(cx, cy, 1024 * cfg.stretch, cnvH / 2, {
      camX: effX, camY: effY,
      r: warm[0], g: warm[1], b: warm[2],
      sway: cfg.key === 'FG' ? 1 : 0
    });
  }
}

function drawFog(f) {
  const t = tex[f.key];
  const cnvH = art[f.key].height;
  const effX = camRX * f.fac + time * f.drift;
  const effY = CAM_BASE_Y + (camRY - CAM_BASE_Y) * f.vfac;
  const period = 1024 * f.stretch;
  const leftEff = effX - rvhX;
  const i0 = Math.floor(leftEff / period) - 1;
  const i1 = Math.floor((effX + rvhX) / period) + 1;
  gl.bindTexture(gl.TEXTURE_2D, t);
  for (let i = i0; i <= i1; i++) {
    const cx = i * period + period / 2;
    const cy = f.baseY - cnvH / 2;
    spr(cx, cy, 512 * f.stretch, cnvH / 2, {
      camX: effX, camY: effY,
      a: f.alpha
    });
  }
}

function drawBeams() {
  gl.bindTexture(gl.TEXTURE_2D, tex.beam);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  for (const b of W.beams) {
    if (b.x < camRX - rvhX - 200 || b.x > camRX + rvhX + 200) continue;
    const hw = b.h * 0.161;
    const flick = 0.78 + 0.22 * Math.sin(time * 0.7 + b.x * 0.01);
    spr(b.x, b.top + b.h / 2, hw, b.h / 2, { r: 0.80, g: 0.84, b: 1.0, a: 0.34 * flick });
    gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
    spr(b.x, b.top + b.h - 8, hw * 2.6, 30, { uvr: art.atlasUV.glow, r: 0.72, g: 0.78, b: 1.0, a: 0.22 * flick });
    gl.bindTexture(gl.TEXTURE_2D, tex.beam);
  }
  gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function drawShadow() {
  if (chapter.n !== 3 || shadowAlpha < 0.02) return;
  const teasing = (W.triggers.teases || []).some(tz => tz.t > 0);
  const hh = 178, hw = 131;
  const cy = shadowY - hh;
  if (!teasing) {
    const pu = 1 + Math.sin(time * 1.7) * 0.03;
    gl.bindTexture(gl.TEXTURE_2D, tex.shadow);
    spr(shadowX(), cy, hw * pu, hh * pu, { a: shadowAlpha });
  }
  const eyeY = shadowY - hh * 1.46 + Math.sin(time * 1.3) * 4;
  gl.bindTexture(gl.TEXTURE_2D, tex.eyes);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  spr(shadowX() + 5, eyeY, 26, 10 * eyesBlink, { a: Math.min(1, shadowAlpha * 1.3) });
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function drawTerrain() {
  W.solids.forEach((s, i) => {
    const t = tex.terrain[i];
    gl.bindTexture(gl.TEXTURE_2D, t);
    spr(s.x + s.w / 2, s.y - 26 + (s.h + 26) / 2, s.w / 2, (s.h + 26) / 2, {});
  });
}

function drawWaters() {
  for (const w of W.waters) {
    const wl = W.waterLook;
    gl.useProgram(pWater);
    gl.uniform1i(pWater.u('uMode'), 0);
    gl.uniform2f(pWater.u('uCamPos'), camRX, camRY);
    gl.uniform2f(pWater.u('uViewHalf'), rvhX, rvhY);
    gl.uniform2f(pWater.u('uRes'), canvas.width, canvas.height);
    gl.uniform1f(pWater.u('uRot'), 0);
    gl.uniform1f(pWater.u('uTime'), time);
    gl.uniform1f(pWater.u('uRain'), rainAmt);
    gl.uniform3f(pWater.u('uDeep'), wl.deep[0], wl.deep[1], wl.deep[2]);
    gl.uniform3f(pWater.u('uReflHi'), wl.reflHi[0], wl.reflHi[1], wl.reflHi[2]);
    gl.uniform3f(pWater.u('uReflLo'), wl.reflLo[0], wl.reflLo[1], wl.reflLo[2]);
    gl.uniform3f(pWater.u('uFoamC'), wl.foam[0], wl.foam[1], wl.foam[2]);
    gl.uniform4f(pWater.u('uRect'), w.x + w.w / 2, w.y + w.h / 2, w.w / 2, w.h / 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.useProgram(pSprite);

    if (w.levelStart !== undefined && rainAmt > 0.02) {
      gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
      for (const pr of W.props) {
        if (pr.tex !== 'lamp') continue;
        const img = art.props.lamp;
        const gy = (pr._y !== undefined ? pr._y : pr.y) - img.height * pr.scale + 13 * pr.scale;
        if (gy < w.y) continue;
        const depth = Math.min(140, gy - w.y);
        const flick = 0.75 + Math.sin(time * 7 + pr.x) * 0.12 + Math.sin(time * 23 + pr.x * 3) * 0.06;
        spr(pr.x + 16 * pr.scale, w.y + depth / 2, 9, depth / 2, {
          uvr: art.atlasUV.glow, r: 0.62, g: 0.74, b: 0.86, a: 0.20 * flick * rainAmt
        });
      }
    }
  }
}

function drawProps(back) {
  for (const pr of W.props) {
    if (!!pr.back !== !!back) continue;
    const img = art.props[pr.tex];
    const t = tex.props[pr.tex];
    gl.bindTexture(gl.TEXTURE_2D, t);
    const hw = img.width * pr.scale / 2;
    const hh = img.height * pr.scale / 2;
    let cx = pr.x, cy = (pr._y !== undefined ? pr._y : pr.y) - hh;
    if (pr.followSolid !== undefined) {
      const s = W.solids[pr.followSolid];
      cx = s.x + s.w / 2;
      cy = s.y - hh;
    }
    spr(cx, cy, hw, hh, { rot: pr._rot || pr.tilt || 0 });
    if (pr.tex === 'lamp') {
      gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
      const gx = cx + 16 * pr.scale;
      const gy = cy + hh - img.height * pr.scale + 13 * pr.scale;
      const pu = 0.78 + Math.sin(time * 0.9 + cx) * 0.12;
      spr(gx, gy, 58 * pu, 58 * pu, { uvr: art.atlasUV.glow, r: 0.82, g: 0.88, b: 1.0, a: chapter.n === 2 ? 0.22 : 0.32 });
      gl.bindTexture(gl.TEXTURE_2D, t);
    }
    if (pr.tex === 'window') {
      gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
      const pu = 1 + Math.sin(time * 1.3) * 0.08;
      spr(cx, cy + hh * 0.1, 130 * pu, 130 * pu, { uvr: art.atlasUV.glow, r: 1, g: 0.76, b: 0.42, a: 0.34 });
      gl.bindTexture(gl.TEXTURE_2D, t);
    }
    if (pr.tex === 'lantern' && pr.scale >= 1.3) {
      gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
      const pu = 1 + Math.sin(time * 1.9 + cx) * 0.10;
      spr(cx, cy - hh * 0.55, 60 * pu, 60 * pu, { uvr: art.atlasUV.glow, r: 1, g: 0.70, b: 0.36, a: 0.40 });
      gl.bindTexture(gl.TEXTURE_2D, t);
    }
  }
}

function drawCheckpoints() {
  for (const c of checkpoints) {
    gl.bindTexture(gl.TEXTURE_2D, tex.lantern);
    spr(c.x, c.y - 60, 32, 60, {});
    if (c.lit) {
      gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
      const pu = 1 + Math.sin(time * 2.1 + c.x) * 0.14;
      spr(c.x, c.y - 88, 34 * pu, 34 * pu, { uvr: art.atlasUV.glow, r: 1, g: 0.66, b: 0.32, a: 0.48 });
      gl.bindTexture(gl.TEXTURE_2D, tex.lantern);
    }
  }
}

function drawMotes() {
  gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
  for (const m of motes) {
    if (m.taken) continue;
    let under = 0;
    for (const w of W.waters) if (m.y > w.y + 6 && m.x > w.x && m.x < w.x + w.w) under = 1;
    const pu = 1 + Math.sin(time * (under ? 1.4 : 2.4) + m.phase) * 0.16;
    spr(m.x, m.y, 30 * pu, 30 * pu, { uvr: art.atlasUV.glow, r: 1, g: under ? 0.86 : 0.78, b: under ? 0.62 : 0.42, a: under ? 0.5 : 0.62 });
    spr(m.x, m.y, 9, 9, { uvr: art.atlasUV.glow, r: 1, g: 0.97, b: 0.86, a: 0.95 });
  }
}

function drawGlyphs() {
  for (const g of W.glyphs) {
    if (g.done) continue;
    const bob = Math.sin(time * 1.8 + g.x) * 7;
    const pu = 0.62 + Math.sin(time * 2.6 + g.x * 0.1) * 0.06;
    gl.bindTexture(gl.TEXTURE_2D, tex.glyphs[g.kind]);
    spr(g.x, g.y + bob, 36 * pu, 36 * pu, { a: 0.5 + Math.sin(time * 3) * 0.18 });
  }
}

function drawPlayer() {
  const fr = Player.getFrame(player, art.player.meta);
  const fw = art.player.fw, fh = art.player.fh;
  const cols = 12, rows = 5;
  const uvr = [fr.idx / cols, fr.row / rows, 1 / cols, 1 / rows];
  const swimRot = player.swimming ? Math.sin(time * 2.6) * 0.07 + player.vy * 0.00022 : 0;
  const cx = player.x;
  const cy = player.y - (fh / 2 - 6) * player.sy;
  gl.bindTexture(gl.TEXTURE_2D, tex.player);
  spr(cx, cy, fw / 2 * player.sx, fh / 2 * player.sy, {
    flip: player.facing < 0, uvr, rot: swimRot
  });
  if (player.water && !player.swimming) {
    gl.bindTexture(gl.TEXTURE_2D, tex.atlas);
    spr(player.x, player.water.y + 3, 44, 14, {
      uvr: art.atlasUV.glow, r: 0.8, g: 0.88, b: 0.98, a: 0.28
    });
  }
}

function finishChapter() {
  state = 'end';
  const hasNext = chapter.n < CHAPTERS.length;
  writeSave({
    v: 2, ch: hasNext ? chapter.n + 1 : chapter.n,
    c: 0, m: [], d: !hasNext
  });
  UI.showEnd(collectedCount, motes.length, {
    numeral: chapter.numeral,
    name: chapter.name,
    nextNumeral: hasNext ? CHAPTERS[chapter.n].numeral : null,
    nextName: hasNext ? CHAPTERS[chapter.n].name : null
  });
  UI.playHud(false);
}

function frame(nowMs) {
  if (!running) return;
  const now = nowMs / 1000;
  if (!lastFrame) lastFrame = now;
  const rawDt = Math.min(0.05, Math.max(0.0001, now - lastFrame));
  lastFrame = now;

  frameEMA = frameEMA * 0.95 + rawDt * 1000 * 0.05;
  qualityTimer += rawDt;
  if (qualityTimer > 2.5) {
    qualityTimer = 0;
    if (frameEMA > 23 && qualityScale > 0.62) { qualityScale = Math.max(0.62, qualityScale - 0.14); resize(); }
    else if (frameEMA < 14.5 && qualityScale < 1) { qualityScale = Math.min(1, qualityScale + 0.08); resize(); }
  }

  if (Input.consumePause() && (state === 'play' || state === 'intro')) togglePause();

  if (!paused && (state === 'intro' || state === 'play' || state === 'outro')) {
    acc += rawDt * timeScale;
    const STEP = 1 / 120;
    let steps = 0;
    while (acc >= STEP && steps < 6) { update(STEP); acc -= STEP; steps++; }
    if (steps === 6) acc = 0;
  } else {
    Input.consumeJump();
  }

  if (state !== 'boot' && state !== 'title') render();
  requestAnimationFrame(frame);
}

function togglePause() {
  paused = !paused;
  if (paused) { UI.showPause(); AudioSys.pauseAll(); }
  else { UI.hidePause(); AudioSys.resumeAll(); }
}

function beginChapter(n, cpIdx, opts) {
  UI.hideTitle();
  UI.hideEnd();
  opts = opts || {};
  loadChapter(n, cpIdx || 0);
  AudioSys.setChapter(n);
  AudioSys.setDrone(n === 3 ? 1 : 0);
  if (n === 1 && cpIdx === 0 && !opts.skipWake) {
    state = 'intro';
    introT = 0;
    letterbox = 1;
    AudioSys.wakeSwell();
  } else {
    state = 'play';
    chapterInT = 0;
    letterbox = 0.9;
  }
  AudioSys.fadeMusic(AudioSys.soundOn() ? 0.42 : 0, 4);
  const wakeIntro = (n === 1 && cpIdx === 0 && !opts.skipWake);
  if (!wakeIntro) {
    UI.showChapterToast(CHAPTERS.find(c => c.n === n).numeral, CHAPTERS.find(c => c.n === n).name, n > 1);
  }
  UI.playHud(true);
  Input.primeTouchHints('ontouchstart' in window);
  paused = false;
}

function begin(useContinue) {
  const cont = useContinue && hasSave();
  const save = cont ? loadSave() : null;
  beginChapter(save ? (save.ch || 1) : 1, cont ? (save.c | 0) : 0, { skipWake: cont && (save.c | 0) > 0 });
}
function nextChapter() {
  beginChapter(chapter.n + 1, 0, {});
}
function restartChapter() {
  if (paused) togglePause();
  beginChapter(chapter.n, 0, { skipWake: chapter.n > 1 });
}
function replayChapter() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
  beginChapter(1, 0, {});
}
function resume() { if (paused) togglePause(); }

function boot(canvasEl) {
  running = true;
  art = SPRITES.buildAll();
  initGLResources(canvasEl, art);
  resize();
  loadChapter(1, 0);
  AudioSys.setChapter(1);
  state = 'title';

  const chip = document.getElementById('chip-pause');
  chip.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); togglePause(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'play' || state === 'intro') && !paused) togglePause();
  });
  window.addEventListener('resize', () => resize());

  requestAnimationFrame(frame);
}

return {
  boot, begin, resume, restartChapter, replayChapter, nextChapter, hasSave,
  get state() { return state; }
};
})();
