/* ------------------------------------------------------------------ *
 *  roozshomar narrative platformer — shared math / misc helpers      *
 * ------------------------------------------------------------------ */

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp  = (a, b, t) => a + (b - a) * t;

export const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutBack = (t) => {
  t = clamp(t, 0, 1);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Frame-rate independent exponential approach: cur -> target at `rate` (1/s). */
export const approach = (cur, target, rate, dt) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Deterministic PRNG (mulberry32). Returns () => [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash1 = (i, seed) => {
  let h = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453123;
  return h - Math.floor(h);
};

/** 1-D value noise, smooth (quintic) interpolation, range ~[0,1]. */
export function makeNoise1D(seed) {
  return function noise(x) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * f * (f * (f * 6 - 15) + 10);
    return lerp(hash1(i, seed), hash1(i + 1, seed), u);
  };
}

/** Fractal value noise, `octaves` layers, range ~[0,1]. */
export function makeFbm1D(seed, octaves = 3) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(makeNoise1D(seed + o * 101.3));
  return function fbm(x) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += layers[o](x * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
  };
}

/** Cheap 2-ish-D hash noise for star twinkle etc. */
export const hash2 = (x, y, seed) => {
  let h = Math.sin(x * 127.1 + y * 269.5 + seed * 311.7) * 43758.5453123;
  return h - Math.floor(h);
};

/** RGBA hex '#rrggbb' -> {r,g,b}. */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const rgba = (hex, a) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Lerp between two hex colors, returns 'rgb(r,g,b)'. */
export function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return `rgb(${Math.round(lerp(a.r, b.r, t))},${Math.round(lerp(a.g, b.g, t))},${Math.round(lerp(a.b, b.b, t))})`;
}
