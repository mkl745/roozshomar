const Particles = (() => {

const MAX = 480;
const FLOATS_PER_VERT = 8;
const VERTS = 6;

const pool = [];
const freeList = [];

const addBuf = new Float32Array(MAX * VERTS * FLOATS_PER_VERT);
const alphaBuf = new Float32Array(MAX * VERTS * FLOATS_PER_VERT);
let addVAO = null, alphaVAO = null, addVBO = null, alphaVBO = null;

function initGL(gl) {
  function setup(buf) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    return vao;
  }
  addVBO = gl.createBuffer();
  alphaVBO = gl.createBuffer();
  [addVAO, alphaVAO] = [setup(addVBO), setup(alphaVBO)];
  gl.bindVertexArray(null);
}

function spawn(cfg) {
  let p;
  if (freeList.length) p = freeList.pop();
  else if (pool.length < MAX) { p = {}; pool.push(p); }
  else p = pool[Math.floor(Math.random() * MAX)];
  Object.assign(p, {
    x: 0, y: 0, vx: 0, vy: 0,
    age: 0, life: 1,
    size: 8, grow: 0,
    grav: 0, drag: 0,
    uv: [0, 0, 1, 1], add: 1,
    r: 1, g: 1, b: 1, alpha: 1, fadePow: 1,
    fadeIn: 0.12,
    rot: Math.random() * Math.PI * 2, vr: 0,
    swayAmp: 0, swayPh: Math.random() * Math.PI * 2
  }, cfg);
  return p;
}

function update(dt, time) {
  for (let i = pool.length - 1; i >= 0; i--) {
    const p = pool[i];
    p.age += dt;
    if (p.age >= p.life) {
      const last = pool.pop();
      if (i < pool.length) pool[i] = last;
      freeList.push(p);
      continue;
    }
    p.vy += p.grav * dt;
    if (p.drag) {
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
    }
    if (p.swayAmp) p.vx += Math.sin(time * 2.2 + p.swayPh) * p.swayAmp * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];

function writeBatch(arr, list, camX, camY, vhX, vhY, atlasUVOf) {
  let o = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const k = p.age / p.life;
    let a = p.alpha;
    if (p.age < p.fadeIn * p.life) a *= p.age / (p.fadeIn * p.life);
    a *= Math.pow(1 - k, p.fadePow);
    const size = p.size * (1 + p.grow * k);
    const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
    const hs = size / 2;
    const uvr = atlasUVOf(p.uv);
    const cu = [uvr[0], uvr[0] + uvr[2], uvr[0] + uvr[2], uvr[0], uvr[0] + uvr[2], uvr[0]];
    const cvv = [uvr[1], uvr[1], uvr[1] + uvr[3], uvr[1], uvr[1] + uvr[3], uvr[1] + uvr[3]];
    for (let v = 0; v < 6; v++) {
      const cxw = p.x + (CORNERS[v][0] * cs - CORNERS[v][1] * sn) * hs;
      const cyw = p.y + (CORNERS[v][0] * sn + CORNERS[v][1] * cs) * hs;
      arr[o++] = (cxw - camX) / vhX;
      arr[o++] = -(cyw - camY) / vhY;
      arr[o++] = cu[v];
      arr[o++] = cvv[v];
      arr[o++] = p.r; arr[o++] = p.g; arr[o++] = p.b;
      arr[o++] = a;
    }
  }
  return o / (VERTS * FLOATS_PER_VERT);
}

function render(gl, prog, camX, camY, vhX, vhY, resolveUV) {
  const adds = [], alphas = [];
  for (const p of pool) (p.add ? adds : alphas).push(p);

  gl.useProgram(prog);

  function flush(list, buf, vao, blendAdd) {
    if (!list.length) return;
    const quads = writeBatch(buf, list, camX, camY, vhX, vhY, resolveUV);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, quads * VERTS * FLOATS_PER_VERT);
    gl.blendFunc(gl.SRC_ALPHA, blendAdd ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, quads * VERTS);
    gl.bindVertexArray(null);
  }

  flush(alphas, alphaBuf, alphaVAO, false);
  flush(adds, addBuf, addVAO, true);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindVertexArray(null);
}

function clear() { pool.length = 0; freeList.length = 0; }

function burst(x, y, opts) {
  const n = opts.n || 8;
  for (let i = 0; i < n; i++) {
    const a = opts.dir !== undefined
      ? opts.dir + (Math.random() - 0.5) * (opts.spread || 1)
      : Math.random() * Math.PI * 2;
    const sp = (opts.speed || 120) * (0.5 + Math.random() * 0.7);
    spawn({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: (opts.ttl || 0.7) * (0.7 + Math.random() * 0.6),
      size: (opts.size || 10) * (0.6 + Math.random() * 0.8),
      grow: opts.grow !== undefined ? opts.grow : 0.6,
      grav: opts.grav || 0,
      drag: opts.drag !== undefined ? opts.drag : 2.5,
      uv: opts.uv || 'glow',
      add: opts.add !== undefined ? opts.add : 1,
      r: opts.r ?? 1, g: opts.g ?? 0.85, b: opts.b ?? 0.55,
      alpha: opts.alpha || 0.9,
      fadePow: opts.fadePow || 1.4,
      vr: (Math.random() - 0.5) * 6
    });
  }
}

function dust(x, y, n = 4, dir = 0) {
  burst(x, y - 2, {
    n, speed: 46, dir: dir === 0 ? undefined : dir, spread: 2.4,
    ttl: 0.65, size: 13, grow: 1.6, grav: -14, drag: 3,
    uv: 'smoke', add: 0, r: 0.82, g: 0.72, b: 0.66, alpha: 0.30, fadePow: 1.1
  });
}

function collectBurst(x, y) {
  burst(x, y, { n: 10, speed: 150, ttl: 0.6, size: 11, uv: 'spark', r: 1, g: 0.92, b: 0.62 });
  spawn({
    x, y, life: 0.55, size: 14, grow: 9, drag: 0,
    uv: 'ring', add: 1, r: 1, g: 0.88, b: 0.6, alpha: 0.75, fadePow: 1.2
  });
  burst(x, y, { n: 5, speed: 60, dir: -Math.PI / 2, spread: 0.9, ttl: 1.0, size: 8, grav: -60, uv: 'glow' });
}

function ring(x, y, big) {
  spawn({
    x, y, life: big ? 0.9 : 0.5, size: big ? 20 : 10, grow: big ? 16 : 8,
    uv: 'ring', add: 1, r: 1, g: 0.85, b: 0.58, alpha: big ? 0.5 : 0.35, fadePow: 1.5
  });
}

function flame(x, y) {
  spawn({
    x: x + (Math.random() - 0.5) * 6, y,
    vx: (Math.random() - 0.5) * 8, vy: -26 - Math.random() * 22,
    life: 0.7 + Math.random() * 0.5,
    size: 7 + Math.random() * 6, grow: -0.45,
    uv: 'glow', add: 1,
    r: 1, g: 0.62 + Math.random() * 0.2, b: 0.28,
    alpha: 0.5, fadePow: 1.6
  });
}

function splash(x, surfaceY) {
  for (let i = 0; i < 12; i++) {
    spawn({
      x: x + (Math.random() - 0.5) * 26, y: surfaceY,
      vx: (Math.random() - 0.5) * 130, vy: -80 - Math.random() * 140,
      life: 0.5 + Math.random() * 0.3, size: 4 + Math.random() * 4,
      grav: 420, uv: 'glow', add: 0,
      r: 0.95, g: 0.78, b: 0.62, alpha: 0.5, fadePow: 1
    });
  }
  Particles.ring(x, surfaceY, true);
}

function petal(x, y) {
  spawn({
    x, y,
    vx: -14 - Math.random() * 20, vy: 10 + Math.random() * 16,
    life: 5 + Math.random() * 3,
    size: 7 + Math.random() * 5, grow: 0,
    drag: 0.15, grav: 2,
    uv: 'spark', add: 0, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2.4,
    swayAmp: 34,
    r: 0.93, g: 0.62, b: 0.48, alpha: 0.5, fadePow: 1.6, fadeIn: 0.25
  });
}

function maintainPollen(camLeft, camRight, camTop, camBot, target, windX) {
  let count = 0;
  for (const p of pool) if (p._pollen) count++;
  if (count < target) {
    for (let i = 0; i < target - count; i++) {
      spawn({
        _pollen: true,
        x: camLeft + Math.random() * (camRight - camLeft),
        y: camTop + Math.random() * (camBot - camTop),
        vx: (windX || 8) + (Math.random() - 0.5) * 12,
        vy: -4 - Math.random() * 8,
        life: 4 + Math.random() * 5,
        size: 3.5 + Math.random() * 5,
        uv: 'glow', add: 1,
        r: 1, g: 0.84, b: 0.52, alpha: 0.34 + Math.random() * 0.2,
        fadePow: 1.2, fadeIn: 0.3,
        swayAmp: 26
      });
    }
  }
}

function cullOutside(left, right, top, bot) {
  for (const p of pool) {
    if (p.x < left - 300 || p.x > right + 300 || p.y > bot + 320 || p.y < top - 400) {
      p.age = p.life;
    }
  }
}

return {
  initGL, update, render, clear, spawn, burst, dust, collectBurst,
  ring, flame, splash, petal, maintainPollen, cullOutside,
  get count() { return pool.length; }
};
})();
