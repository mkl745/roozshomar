/* ------------------------------------------------------------------ *
 *  Test scene definitions (data-driven, no hardcoding in engine).    *
 *  `showcase`  — full visual bar: gradient dusk sky, 4 parallax      *
 *               silhouette layers, fog, moon rim light, spirit       *
 *               lights pulsing off the music.                        *
 *  `feel`      — the empty tuning room: flat ground, neutral grade.  *
 * ------------------------------------------------------------------ */

export const SHOWCASE = {
  id: 'showcase',
  spawn: [60, 560],
  worldW: 3200,
  killY: 950,
  track: 'chapter1',
  solids: [
    { x: -340, y: -500, w: 60, h: 1100 },            // back wall
    { x: -280, y: 560, w: 1280, h: 600 },            // ground A
    { x: 620, y: 496, w: 92, h: 70 },                // step 1
    { x: 790, y: 430, w: 92, h: 136 },               // step 2
    { x: 1160, y: 560, w: 560, h: 600 },             // ground B (over gap)
    { x: 1820, y: 470, w: 130, h: 26 },              // float 1
    { x: 2030, y: 390, w: 130, h: 26 },              // float 2
    { x: 2240, y: 560, w: 900, h: 600 },             // ground C
    { x: 2800, y: 440, w: 74, h: 120 },              // tower
    { x: 3140, y: -500, w: 60, h: 1100 },            // end wall
  ],
  checkpoints: [
    { x: 60, y: 560 },
    { x: 1250, y: 560 },
    { x: 2330, y: 560 },
  ],
  lighting: {
    ambient: { color: '#070312', alpha: 0.55 },
    rim: { dx: 0.55, dy: -0.62, color: '#ffd2a0', strength: 0.85 },
  },
  lights: [
    { type: 'player', dy: -30, radius: 150, color: '#ffd9a6', intensity: 0.5, glow: 0.45, audio: 0.15 },
    { type: 'orbit', cx: 700, cy: 380, rx: 150, ry: 60, speed: 0.5, radius: 95, color: '#7ff0d8', intensity: 0.8, glow: 1, audio: 0.85 },
    { type: 'orbit', cx: 2520, cy: 350, rx: 190, ry: 70, speed: 0.4, phase: 2.1, radius: 95, color: '#7ff0d8', intensity: 0.8, glow: 1, audio: 0.85 },
    { type: 'checkpoint', radius: 115, color: '#7ff0d8', intensity: 0.9, glow: 0.9, audio: 0.9 },
    { x: 2837, y: 415, radius: 130, color: '#ffb36b', intensity: 0.8, glow: 0.9, flicker: 0.3, audio: 0.3 },
  ],
  environment: {
    silhouette: '#0b0817',
    moteColor: '#7ff0d8',
    sky: {
      stops: [
        [0, '#050816'], [0.34, '#141b38'], [0.55, '#33254e'],
        [0.72, '#6d3a5c'], [0.85, '#b25a63'], [1, '#e59a6c'],
      ],
    },
    celestial: { x: 0.74, y: 0.2, r: 34, color: '#fff3dd', glowR: 220, glowColor: '#ffd9a0', craters: true, parallax: 0.03 },
    stars: { count: 130, seed: 11, parallax: 0.06, color: '#dfe6ff' },
    layers: [
      { seed: 3, parallax: 0.10, color: '#2b2148', base: 0.52, amp: 120, freq: 0.0035, octaves: 3 },
      { seed: 8, parallax: 0.22, color: '#221a3d', base: 0.64, amp: 95, freq: 0.005, kind: 'spires', spikes: { gap: 210, h: 120, w: 30, density: 0.5, style: 'ruin' } },
      { seed: 14, parallax: 0.40, color: '#180f2e', base: 0.74, amp: 70, freq: 0.006, kind: 'spires', spikes: { gap: 120, h: 95, w: 16, density: 0.55, style: 'tree' } },
      { seed: 21, parallax: 0.70, color: '#100a20', base: 0.80, amp: 50, freq: 0.008 },
    ],
    fog: [
      { y: 0.66, h: 60, color: '#8a5f8f', alpha: 0.10, speed: 7, parallax: 0.3, afterLayer: 1 },
      { y: 0.80, h: 70, color: '#5a3f6f', alpha: 0.12, speed: 10, parallax: 0.5, afterLayer: 2 },
    ],
    grade: { tint: '#472a5e', tint2: '#7a3a4a', tintAlpha: 0.14, vignette: 0.42, mode: 'soft-light', audioTint: 0.05 },
  },
};

export const FEELROOM = {
  id: 'feel',
  spawn: [0, 560],
  worldW: 2400,
  killY: 1400,
  solids: [
    { x: -4000, y: 560, w: 9000, h: 700 },
    { x: 300, y: 440, w: 140, h: 24 },
    { x: 560, y: 340, w: 140, h: 24 },
    { x: 860, y: 250, w: 140, h: 24 },
    { x: 1250, y: 470, w: 90, h: 90 },
    { x: 1420, y: 380, w: 90, h: 180 },
  ],
  checkpoints: [],
  lighting: {
    ambient: { color: '#0a0d12', alpha: 0.35 },
    rim: { dx: 0.4, dy: -0.7, color: '#cfe2ff', strength: 0.5 },
  },
  lights: [
    { type: 'player', dy: -30, radius: 200, color: '#cfd8e6', intensity: 0.55, glow: 0.35 },
  ],
  environment: {
    silhouette: '#0d1015',
    moteColor: '#9fb4cc',
    sky: { stops: [[0, '#0d1117'], [1, '#1d242e']] },
    layers: [
      { seed: 5, parallax: 0.15, color: '#161c26', base: 0.78, amp: 40, freq: 0.004 },
    ],
    grade: { tint: '#232833', tintAlpha: 0.08, vignette: 0.25 },
  },
};

export const SCENES = { showcase: SHOWCASE, feel: FEELROOM };
