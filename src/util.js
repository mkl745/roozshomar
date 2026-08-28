// roozshomar platformer engine — shared math / color / canvas helpers.
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Framerate-independent exponential approach (the workhorse of "soft" feel).
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const smoothstep = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// Deterministic PRNG for procedural terrain / stars.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgb = (c, a = 1) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export const mixRgb = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// '#rrggbb' -> [r,g,b] recursively, leaving numbers untouched.
export function deepColorize(o) {
  if (Array.isArray(o)) return o.map(deepColorize);
  if (o && typeof o === 'object') {
    const r = {};
    for (const k in o) r[k] = deepColorize(o[k]);
    return r;
  }
  if (typeof o === 'string' && o[0] === '#') return hexToRgb(o);
  return o;
}

// Mutates `cur` toward `tgt` by t (same shape; arrays of numbers = colors/vectors).
export function deepMix(cur, tgt, t) {
  for (const k in tgt) {
    const b = tgt[k];
    const a = cur[k];
    if (Array.isArray(b) && typeof b[0] === 'number') {
      for (let i = 0; i < b.length; i++) a[i] = lerp(a[i], b[i], t);
    } else if (typeof b === 'number') {
      cur[k] = lerp(a, b, t);
    } else if (b && typeof b === 'object') {
      deepMix(a, b, t);
    }
  }
  return cur;
}
