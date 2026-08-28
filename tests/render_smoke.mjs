/* ------------------------------------------------------------------ *
 *  Headless smoke test: drives the REAL engine update+render path    *
 *  (environment tiles, lighting composite, character renderer,       *
 *  particles, checkpoints, respawn) with a stub canvas 2D context.   *
 *  Catches wiring/runtime TypeErrors that node --check cannot.       *
 *  Run: node tests/render_smoke.mjs                                  *
 * ------------------------------------------------------------------ */
import assert from 'node:assert/strict';

/* ---------- minimal DOM/canvas stubs ---------- */
const gradient = { addColorStop() {} };
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p in t) return t[p];
      return (...a) => {
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return gradient;
        if (p === 'getImageData') return { data: new Uint8Array(64) };
        return undefined;
      };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeCanvas() {
  const c = { style: {}, width: 0, height: 0, _ctx: null };
  c.getContext = () => (c._ctx ??= makeCtx());
  return c;
}
globalThis.document = {
  createElement: (tag) => makeCanvas(),
  hidden: false,
};
globalThis.window = {
  devicePixelRatio: 2,
  addEventListener() {}, removeEventListener() {},
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { Engine } = await import('../src/engine.js');
const { SHOWCASE, FEELROOM } = await import('../src/scene_test.js');

const canvas = makeCanvas();
canvas.parentElement = { getBoundingClientRect: () => ({ width: 1280, height: 720 }) };

const fakeAudio = {
  currentName: 'chapter1', isPlaying: true, muted: false,
  currentTime: 12.3, duration: 100,
  pause() {}, resume() {},
};

const engine = new Engine(canvas, { audio: fakeAudio, fadeEl: { style: {} } });
engine.resize();
engine.loadChapter(SHOWCASE);
engine.state = 'playing';

let t = 0;
const frames = (n, fn) => { for (let i = 0; i < n; i++) { t += 1000 / 60; engine.frame(t); fn?.(engine); } };

// idle
frames(30);
// run right + jump twice
engine.input.held.right = true;
frames(40);
engine.input.held.jump = true; engine.input._pressed.add('jump');
frames(3); engine.input._pressed.clear();
frames(40);
engine.input.held.jump = false; engine.input._released.add('jump');
frames(3); engine.input._released.clear();
frames(60);
engine.input.held.right = false;

// pause / resume
engine.pause(); frames(5); engine.resume(); frames(5);

// fall into the pit -> respawn cycle
engine.char.x = 1080; engine.char.y = 560; engine.input.held.right = true;
frames(120);
engine.input.held.right = false;
assert.ok(engine.respawnT >= 0 || engine.char.grounded, 'pit fall triggered respawn or safe landing');
frames(80); // let respawn finish

// scene switch to feel room and back
engine.loadChapter(FEELROOM); frames(60);
engine.loadChapter(SHOWCASE); frames(60);

// checkpoint reach
engine.char.x = engine.checkpoints[1].x; engine.char.y = engine.checkpoints[1].y;
frames(5);
assert.ok(engine.activeCp >= 1, 'checkpoint 2 activated');

const d = engine.debugInfo();
assert.ok(d.fps > 0 && d.chapter === 'showcase', 'debug info sane');
console.log('render smoke OK —', JSON.stringify(d));
