// Test scene: one small hand-tuned room that exercises every system —
// steps for coyote time, a gap for jump distance, floating platforms,
// three checkpoints, lantern lights, and 5 mood palettes (one per track)
// so keys 1–5 demonstrate crossfade + grading shift together.

export const TRACKS = ['chapter1', 'chapter2', 'chapter3', 'dreammode', 'hardcore'];

// Fixed mood shape (all moods share it so palettes can ease into each other).
export const MOODS = {
  chapter1: {
    sky: ['#171233', '#33204f', '#6d3560', '#c05a63', '#f2a05e'],
    sun: { color: '#ffd9a0', alpha: 0.85 },
    stars: 0.15,
    haze: '#e8927c',
    layers: ['#6f4a77', '#5c3a67', '#492c54', '#371f40', '#241428', '#120a15'],
    ground: '#0d0812',
    tint: '#ff9a6a', tintAmt: 0.10,
    ambient: { color: '#241a2e', darkness: 0.42 },
    rim: '#ffcf9e', scarf: '#e8506a', shake: 0.6,
  },
  chapter2: {
    sky: ['#070d18', '#0d1c2e', '#16334a', '#28536b', '#7fa8b0'],
    sun: { color: '#cfe8ee', alpha: 0.55 },
    stars: 0.5,
    haze: '#9fc4cc',
    layers: ['#41627c', '#35526a', '#2a4257', '#1f3244', '#142130', '#0a1119'],
    ground: '#070d13',
    tint: '#7fb6c9', tintAmt: 0.12,
    ambient: { color: '#0a1420', darkness: 0.5 },
    rim: '#bfe6ef', scarf: '#5aa7c0', shake: 0.4,
  },
  chapter3: {
    sky: ['#040507', '#090b0f', '#101319', '#181b22', '#23262e'],
    sun: { color: '#e0525f', alpha: 0.3 },
    stars: 0.25,
    haze: '#3a3f4a',
    layers: ['#2c2e38', '#24262e', '#1c1d24', '#15161b', '#0e0f13', '#08090c'],
    ground: '#060709',
    tint: '#8a2f3a', tintAmt: 0.10,
    ambient: { color: '#05060a', darkness: 0.62 },
    rim: '#e0525f', scarf: '#c03a4a', shake: 1.0,
  },
  dreammode: {
    sky: ['#120d29', '#221847', '#372768', '#544090', '#8f6fc0'],
    sun: { color: '#e6d6ff', alpha: 0.7 },
    stars: 0.7,
    haze: '#b79ae0',
    layers: ['#6a55a8', '#584591', '#47367a', '#372963', '#261c48', '#150f2b'],
    ground: '#0e0a1c',
    tint: '#9a7fe0', tintAmt: 0.12,
    ambient: { color: '#1a1430', darkness: 0.45 },
    rim: '#d9c6ff', scarf: '#b58ae6', shake: 0.5,
  },
  hardcore: {
    sky: ['#0a0404', '#180907', '#2b0f09', '#47190b', '#7a2c10'],
    sun: { color: '#ff7a3a', alpha: 0.75 },
    stars: 0.1,
    haze: '#c96a3a',
    layers: ['#7c3a24', '#662e1d', '#502416', '#3b1a10', '#27110a', '#140806'],
    ground: '#0d0503',
    tint: '#ff5a2a', tintAmt: 0.12,
    ambient: { color: '#120604', darkness: 0.55 },
    rim: '#ffb08a', scarf: '#ff6a3a', shake: 1.4,
  },
};

const LAYER_GEOMETRY = [
  { type: 'dunes',  parallax: 0.06, seed: 11, base: 0.60, amp: 34, fog: 0.9 },
  { type: 'ridge',  parallax: 0.12, seed: 22, base: 0.67, amp: 60, fog: 0.72 },
  { type: 'spires', parallax: 0.22, seed: 33, base: 0.73, amp: 48, fog: 0.52 },
  { type: 'trees',  parallax: 0.38, seed: 44, base: 0.80, amp: 42, fog: 0.32 },
  { type: 'ridge',  parallax: 0.60, seed: 55, base: 0.90, amp: 34, fog: 0.14 },
  { type: 'ridge',  parallax: 1.15, seed: 66, base: 1.04, amp: 46, fog: 0 },
];

export const TEST_CHAPTER = {
  music: 'chapter1',

  setup(engine) {
    engine.solids = [
      { x: -300, y: 760, w: 1500, h: 600 },   // starting ground
      { x: 1200, y: 680, w: 220, h: 700 },    // step up (coyote test)
      { x: 1420, y: 600, w: 260, h: 800 },    // ledge
      // gap 1680..1900 -> kill plane below
      { x: 1720, y: 520, w: 150, h: 26 },     // floating platform over the gap
      { x: 1900, y: 700, w: 1600, h: 700 },   // right ground
      { x: 2300, y: 520, w: 160, h: 26 },     // tower platforms
      { x: 2560, y: 420, w: 160, h: 26 },
    ];
    engine.checkpoints = [
      { x: 40, y: 760, taken: true },
      { x: 1980, y: 700, taken: false },
      { x: 3200, y: 700, taken: false },
    ];
    engine.checkpointIndex = 0;
    engine.bounds = { minX: -300, maxX: 3500, minY: -120, maxY: 880, killY: 1250 };

    engine.env.configure({
      sun: { x: 0.72, y: 0.33, r: 54 },
      layers: LAYER_GEOMETRY,
      mood: MOODS.chapter1,
    });

    engine.lighting.configure({
      lights: [
        { attach: 'player', radius: 150, color: '#ffd9a8', intensity: 0.8, pulseSpeed: 2.2, pulseAmp: 0.55 },
        { x: 1310, y: 560, radius: 180, color: '#ffb066', intensity: 0.9, flicker: 0.14, pulseSpeed: 3.1, pulseAmp: 0.6 },
        { x: 2060, y: 580, radius: 180, color: '#ffb066', intensity: 0.9, flicker: 0.14, pulseSpeed: 2.6, pulseAmp: 0.6 },
        { x: 3240, y: 580, radius: 180, color: '#ffb066', intensity: 0.9, flicker: 0.14, pulseSpeed: 3.4, pulseAmp: 0.6 },
      ],
    });
  },

  // small lantern props so the warm pools of light have a visible source
  drawWorld(engine, ctx) {
    const L = engine.lighting.lights;
    for (let i = 1; i <= 3 && i < L.length; i++) {
      const l = L[i];
      const base = i === 1 ? 680 : 700;
      ctx.strokeStyle = '#0a0a10';
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(l.x - 9, base); ctx.lineTo(l.x - 9, l.y + 18); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(l.x - 9, l.y + 18); ctx.quadraticCurveTo(l.x - 6, l.y + 6, l.x, l.y + 8); ctx.stroke();
      ctx.fillStyle = '#0a0a10';
      ctx.fillRect(l.x - 5, l.y - 4, 10, 15);
      ctx.fillStyle = `rgba(${l.color[0] | 0},${l.color[1] | 0},${l.color[2] | 0},0.9)`;
      ctx.fillRect(l.x - 2.5, l.y - 1, 5, 9);
    }
  },

  update(engine, dt) {
    // ambient motes drifting up from the lanterns — density rides the track energy
    const rate = 1.6 + engine.audioIntensity * 7;
    if (Math.random() < dt * rate) {
      const l = engine.lighting.lights[1 + Math.floor(Math.random() * 3)];
      engine.particles.mote(l.x + (Math.random() - 0.5) * 60, l.y + 20, 'rgb(255,190,120)', 1.6);
    }
  },
};
