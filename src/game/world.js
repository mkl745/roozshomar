const WORLD1 = (() => {

const GROUND_Y = 620;
const KILL_Y = 980;

const solids = [
  { x: -240, y: 620, w: 940, h: 420 },
  { x: 820, y: 620, w: 680, h: 420 },
  { x: 1000, y: 548, w: 112, h: 26, island: true },
  { x: 1190, y: 478, w: 112, h: 26, island: true },
  { x: 1500, y: 620, w: 900, h: 420 },
  { x: 1688, y: 536, w: 134, h: 84 },
  { x: 1932, y: 594, w: 114, h: 26 },
  { x: 2428, y: 560, w: 86, h: 22, island: true },
  { x: 2530, y: 620, w: 170, h: 420 },
  { x: 2836, y: 566, w: 88, h: 22, island: true },
  { x: 3040, y: 620, w: 260, h: 420 },
  { x: 3300, y: 620, w: 1000, h: 420 },
  { x: 3700, y: 556, w: 150, h: 24, island: true },
  { x: 3930, y: 492, w: 150, h: 24, island: true },
  { x: 4160, y: 430, w: 190, h: 24, island: true },
  { x: 4430, y: 520, w: 220, h: 26, island: true },
  { x: 4740, y: 452, w: 230, h: 26, island: true },
  { x: 5060, y: 430, w: 560, h: 400 }
];

const waters = [
  { x: 2700, y: 652, w: 340, h: 220, deep: false }
];

const props = [
  { tex: 'lamp', x: 1560, y: 620, scale: 1 },
  { tex: 'cart', x: 1765, y: 620, scale: 1 },
  { tex: 'bench', x: 1990, y: 620, scale: 1 },
  { tex: 'lamp', x: 2160, y: 620, scale: 1 },
  { tex: 'lamp', x: 2560, y: 620, scale: 1 },
  { tex: 'ladder', x: 3052, y: 620, scale: 1 },
  { tex: 'lamp', x: 3330, y: 620, scale: 1 },
  { tex: 'bike', x: 3530, y: 620, scale: 1 },
  { tex: 'tree', x: 4210, y: 622, scale: 1.5, back: true },
  { tex: 'lamp', x: 5105, y: 430, scale: 1 },
  { tex: 'bench', x: 5230, y: 430, scale: 0.9 }
];

const checkpoints = [
  { x: 1462, y: GROUND_Y },
  { x: 3270, y: GROUND_Y },
  { x: 4290, y: 430 }
];

const motes = [];
function M(x, y) { motes.push({ id: motes.length, x, y }); }

M(320, 578); M(360, 566); M(400, 578);
(function arcGap() {
  const cx = 762, cy = 585, r = 82;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * (1.18 + i * 0.32);
    M(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r);
  }
})();
M(1056, 496);
M(1150, 448); M(1180, 428);
M(1246, 420);
M(1360, 448);
M(1712, 468); M(1755, 448); M(1798, 468);
M(1755, 388); M(1755, 350);
M(1962, 540); M(2018, 522);
(function lampRing() {
  const cx = 2160, cy = 462;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    M(cx + Math.cos(a) * 56, cy + Math.sin(a) * 44);
  }
})();
M(2471, 500);
(function poolArc() {
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    M(2740 + t * 280, 596 - Math.sin(t * Math.PI) * 62);
  }
})();
M(2880, 512);
(function bikeRing() {
  const cx = 3530, cy = 512;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    M(cx + Math.cos(a) * 58, cy + Math.sin(a) * 40);
  }
})();
M(3775, 498);
M(3905, 442);
M(4005, 432);
M(4135, 378);
M(4255, 362);
M(4180, 292); M(4248, 258); M(4168, 226); M(4252, 196); M(4210, 162);
M(4540, 452);
M(4695, 396);
M(4855, 382);
M(5015, 360);
M(5120, 358);
(function crown() {
  const cx = 5340, cy = 356;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * (1.12 + i * 0.38);
    M(cx + Math.cos(a) * 96, cy + Math.sin(a) * 72);
  }
})();

const glyphs = [
  { kind: 'move', x: 350, y: 508, done: false, cond: 'moved' },
  { kind: 'jump', x: 640, y: 468, done: false, cond: 'jumped' }
];

const triggers = {
  wake: { x: 140 },
  bikeZone: { x: 3452, w: 165, cooldown: 0 },
  vistaZone: { x: 4990, w: 720 },
  endX: 5480,
  schoolRevealAt: 4600
};

return {
  numeral: 'I',
  name: 'Market of Memories',
  GROUND_Y, KILL_Y, solids, waters, props, checkpoints, motes,
  glyphs, triggers,
  spawn: { x: 150, y: GROUND_Y },
  bounds: { left: -240, right: 5720 },
  rainStart: 0,
  waterLook: {
    deep: [0.17, 0.10, 0.22],
    reflHi: [1.00, 0.82, 0.58],
    reflLo: [0.86, 0.55, 0.48],
    foam: [1.00, 0.95, 0.85]
  },
  skyA: {
    top: [0.42, 0.36, 0.55], up: [0.72, 0.45, 0.55], mid: [0.90, 0.58, 0.47],
    low: [1.00, 0.78, 0.52], hor: [1.00, 0.90, 0.71], glow: [1.00, 0.79, 0.47],
    cloudAmt: 0.45, cloudLit: 0.55, sunI: 1.0, sunR: 0.055, haze: 0.38
  },
  skyB: {
    top: [0.30, 0.24, 0.47], up: [0.55, 0.32, 0.53], mid: [0.83, 0.47, 0.44],
    low: [1.00, 0.66, 0.45], hor: [1.00, 0.82, 0.60], glow: [1.00, 0.66, 0.36],
    cloudAmt: 0.62, cloudLit: 0.75, sunI: 1.0, sunR: 0.075, haze: 0.46
  },
  gradeA: {
    exposure: 1.06,
    lift: [0.020, 0.010, 0.032],
    gain: [1.075, 0.985, 0.870],
    sat: 1.05, vig: 0.30, bloom: 0.85, ray: 0.62, ca: 0.9, grain: 0.045
  },
  gradeB: {
    exposure: 1.00,
    lift: [0.032, 0.014, 0.052],
    gain: [1.115, 0.905, 0.775],
    sat: 1.13, vig: 0.37, bloom: 1.02, ray: 0.85, ca: 1.25, grain: 0.055
  },
  tintsA: [
    [1.04, 1.00, 0.96], [1.06, 1.00, 0.93], [1.08, 0.99, 0.91],
    [1.10, 0.97, 0.88], [1.06, 0.98, 0.90]
  ],
  tintsB: [
    [1.13, 0.93, 0.84], [1.15, 0.94, 0.83], [1.16, 0.95, 0.83],
    [1.17, 0.96, 0.83], [1.10, 0.95, 0.86]
  ]
};
})();

const WORLD2 = (() => {

const KILL_Y = 2000;

const solids = [
  { x: -240, y: 620, w: 2320, h: 460 },
  { x: 2080, y: 840, w: 1000, h: 220 },
  { x: 2560, y: 700, w: 170, h: 26, island: true, style: 'plank' },
  { x: 2260, w: 90, h: 20, island: true, style: 'crate', followWater: true, off: -8 },
  { x: 2780, w: 90, h: 20, island: true, style: 'crate', followWater: true, off: -8 },
  { x: 2960, w: 110, h: 16, island: true, style: 'plank', followWater: true, off: -12 },
  { x: 3080, y: 560, w: 420, h: 500 },
  { x: 3600, y: 480, w: 170, h: 580, style: 'roof' },
  { x: 3870, y: 400, w: 190, h: 660, style: 'roof' },
  { x: 4150, y: 430, w: 170, h: 630, style: 'roof' },
  { x: 4410, y: 340, w: 230, h: 720, style: 'roof' },
  { x: 4730, y: 300, w: 150, h: 760, style: 'roof' },
  { x: 4960, y: 260, w: 160, h: 800, style: 'roof' },
  { x: 5200, y: 240, w: 560, h: 820, style: 'roof' }
];

const waters = [
  { x: 400, y: 630, w: 5460, h: 660, deep: true, levelStart: 630 }
];

const props = [
  { tex: 'bench', x: 300, y: 620, scale: 1, sinkTo: 655, tilt: 0.07 },
  { tex: 'lamp', x: 520, y: 620, scale: 1 },
  { tex: 'cart', x: 1520, y: 620, scale: 1, sinkTo: 704, tilt: 0.10 },
  { tex: 'lamp', x: 1750, y: 620, scale: 1 },
  { tex: 'ladder', x: 2052, y: 620, scale: 1 },
  { tex: 'bike', x: 2520, y: 826, scale: 1, tilt: -0.09 },
  { tex: 'umbrella', x: 3015, y: 560, scale: 1, followSolid: 5 },
  { tex: 'lamp', x: 3200, y: 560, scale: 1 },
  { tex: 'lamp', x: 4560, y: 340, scale: 1 },
  { tex: 'bench', x: 5330, y: 240, scale: 0.9 },
  { tex: 'window', x: 5560, y: 240, scale: 1 }
];

const checkpoints = [
  { x: 1980, y: 620 },
  { x: 3440, y: 560 },
  { x: 4560, y: 340 }
];

const motes = [];
function M(x, y) { motes.push({ id: motes.length, x, y }); }

M(280, 552); M(330, 540);
M(470, 560); M(520, 545); M(570, 560);
(function sunkCart() {
  M(1490, 662); M(1548, 684); M(1518, 716); M(1560, 738);
})();
M(1300, 560); M(1345, 545);
(function diveIn() {
  M(2140, 640); M(2200, 700); M(2255, 756);
})();
(function bikeRing() {
  const cx = 2520, cy = 762;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    M(cx + Math.cos(a) * 58, cy + Math.sin(a) * 40);
  }
})();
M(2600, 662); M(2712, 662);
M(2960, 520); M(3030, 505);
M(3150, 522); M(3240, 508); M(3330, 522);
(function roofArcs() {
  M(3700, 428); M(3810, 392); M(3920, 358);
  M(4085, 372); M(4230, 388);
  M(4380, 372); M(4480, 322); M(4580, 300);
})();
M(4790, 258); M(4880, 240); M(5020, 218);
(function windowCrown() {
  const cx = 5560, cy = 148;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * (1.15 + i * 0.35);
    M(cx + Math.cos(a) * 92, cy + Math.sin(a) * 66);
  }
})();

const glyphs = [
  { kind: 'rise', x: 2170, y: 592, done: false, cond: 'submerged' }
];

const triggers = {
  riseZones: [
    { x: 1150, lv: 606 },
    { x: 2150, lv: 566 },
    { x: 3150, lv: 524 }
  ],
  windZone: { x: 3800, w: 900 },
  endX: 5560,
  outroStopX: 5620
};

return {
  numeral: 'II',
  name: 'Farewell Rain',
  GROUND_Y: 620, KILL_Y, solids, waters, props, checkpoints, motes,
  glyphs, triggers,
  spawn: { x: 120, y: 620 },
  bounds: { left: -240, right: 5860 },
  rainStart: 0.16,
  waterLook: {
    deep: [0.05, 0.09, 0.14],
    reflHi: [0.52, 0.58, 0.62],
    reflLo: [0.38, 0.44, 0.48],
    foam: [0.72, 0.78, 0.80]
  },
  skyA: {
    top: [0.34, 0.33, 0.46], up: [0.52, 0.50, 0.58], mid: [0.66, 0.62, 0.64],
    low: [0.78, 0.74, 0.70], hor: [0.88, 0.82, 0.72], glow: [0.98, 0.86, 0.66],
    cloudAmt: 0.78, cloudLit: 0.35, sunI: 0.55, sunR: 0.06, haze: 0.52
  },
  skyB: {
    top: [0.155, 0.175, 0.26], up: [0.235, 0.265, 0.34], mid: [0.33, 0.37, 0.42],
    low: [0.44, 0.48, 0.51], hor: [0.56, 0.60, 0.61], glow: [0.65, 0.70, 0.70],
    cloudAmt: 1.0, cloudLit: 0.22, sunI: 0.0, sunR: 0.06, haze: 0.64
  },
  gradeA: {
    exposure: 0.99,
    lift: [0.010, 0.014, 0.030],
    gain: [0.930, 0.965, 1.040],
    sat: 0.88, vig: 0.36, bloom: 0.70, ray: 0.12, ca: 0.9, grain: 0.050
  },
  gradeB: {
    exposure: 0.95,
    lift: [0.008, 0.012, 0.028],
    gain: [0.865, 0.910, 1.020],
    sat: 0.74, vig: 0.43, bloom: 0.62, ray: 0.05, ca: 1.1, grain: 0.062
  },
  tintsA: [
    [0.98, 0.96, 1.02], [1.00, 0.97, 1.03], [1.02, 0.99, 1.04],
    [1.05, 1.00, 1.05], [0.98, 0.99, 1.05]
  ],
  tintsB: [
    [0.82, 0.90, 1.12], [0.85, 0.92, 1.14], [0.88, 0.95, 1.16],
    [0.92, 0.99, 1.18], [0.85, 0.94, 1.12]
  ]
};
})();

const WORLD3 = (() => {

const GROUND_Y = 620;
const KILL_Y = 1400;

const solids = [
  { x: -240, y: 620, w: 2140, h: 420 },
  { x: 1180, y: 556, w: 130, h: 22, island: true, style: 'plank' },
  { x: 1900, y: 620, w: 1500, h: 420 },
  { x: 2380, y: 572, w: 74, h: 20, island: true, style: 'plank' },
  { x: 2700, y: 548, w: 74, h: 20, island: true, style: 'plank' },
  { x: 3400, y: 600, w: 700, h: 440 },
  { x: 4100, y: 660, w: 1140, h: 380 },
  { x: 4460, y: 596, w: 90, h: 18, island: true, style: 'plank' },
  { x: 4790, y: 572, w: 90, h: 18, island: true, style: 'plank' },
  { x: 5060, y: 590, w: 90, h: 18, island: true, style: 'plank' },
  { x: 5240, y: 560, w: 280, h: 480 },
  { x: 5560, y: 480, w: 170, h: 560 },
  { x: 5800, y: 400, w: 180, h: 640 },
  { x: 6050, y: 360, w: 520, h: 680 }
];

const waters = [];

const props = [];
(function trees() {
  const spots = [260, 560, 860, 1420, 1720, 2180, 2560, 2960, 3560, 3880,
    4260, 4620, 4980, 5420, 5700, 6120];
  spots.forEach((x, i) => {
    props.push({ tex: i % 2 ? 'spookyA' : 'spookyB', x, y: 622, scale: 1.0 + ((i * 37) % 5) * 0.14, back: true });
  });
  [820, 2450, 4680, 5960].forEach((x, i) => {
    props.push({ tex: i % 2 ? 'spookyB' : 'spookyA', x, y: 640, scale: 2.3, front: true });
  });
})();
props.push({ tex: 'rootGate', x: 3220, y: 622, scale: 1 });
props.push({ tex: 'rootGate', x: 6420, y: 362, scale: 1.1, front: true });
props.push({ tex: 'lantern', x: 3700, y: 600, scale: 1.4 });

const checkpoints = [
  { x: 1860, y: GROUND_Y },
  { x: 4020, y: 600 },
  { x: 5360, y: 560 }
];

const motes = [];
function M(x, y) { motes.push({ id: motes.length, x, y }); }

M(320, 572); M(370, 558); M(420, 572);
M(720, 548);
M(905, 540); M(955, 528);
M(1245, 508);
M(1510, 545); M(1560, 532);
M(1760, 540);
(function shrineRing() {
  const cx = 3700, cy = 468;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    M(cx + Math.cos(a) * 62, cy + Math.sin(a) * 46);
  }
})();
(function huntLine() {
  M(2150, 566); M(2320, 552); M(2500, 540); M(2660, 528); M(2840, 552);
  M(3050, 562);
})();
M(3520, 548); M(3960, 540);
(function ravine() {
  M(4320, 600); M(4505, 545); M(4835, 520); M(5105, 538);
  M(4420, 660); M(4760, 660); M(5080, 660);
})();
M(5420, 505);
M(5760, 428); M(5920, 350);
(function crown() {
  const cx = 6260, cy = 300;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (1.1 + i * 0.27);
    M(cx + Math.cos(a) * 100, cy + Math.sin(a) * 74);
  }
})();

const glyphs = [];

const fogs = [
  { key: 'fogA', fac: 0.30, vfac: 0.18, baseY: 692, alpha: 0.55, stretch: 1.7, drift: 9 },
  { key: 'fogB', fac: 0.48, vfac: 0.32, baseY: 708, alpha: 0.46, stretch: 1.95, drift: -13 },
  { key: 'fogB', fac: 1.12, vfac: 1.02, baseY: 774, alpha: 0.36, stretch: 2.2, drift: 17, front: true },
  { key: 'fogA', fac: 1.42, vfac: 1.16, baseY: 794, alpha: 0.27, stretch: 2.5, drift: -22, front: true }
];

const beams = [
  { x: 700, top: 210, h: 412 },
  { x: 930, top: 190, h: 432 },
  { x: 1530, top: 200, h: 422 },
  { x: 1770, top: 220, h: 402 },
  { x: 2210, top: 195, h: 427 },
  { x: 2610, top: 185, h: 437 },
  { x: 3010, top: 205, h: 417 },
  { x: 4520, top: 230, h: 432 },
  { x: 4850, top: 215, h: 447 },
  { x: 5120, top: 235, h: 427 },
  { x: 6260, top: 150, h: 212 }
];

const triggers = {
  hunts: [
    { x: 2050, safeX: 3260 },
    { x: 4300, safeX: 6100 }
  ],
  lightCap: 1.35,
  miniHunt: { speed: 296, ahead: 860 },
  shadow: { baseSpeed: 304, accel: 11, maxSpeed: 336, lightBoost: 64, catchR: 38 },
  teases: [
    { x: 430, dx: 660, dur: 2.6 }
  ],
  endX: 6180,
  outroStopX: 6300
};

return {
  numeral: 'III',
  name: 'Forest of Shadows',
  GROUND_Y, KILL_Y, solids, waters, props, checkpoints, motes,
  glyphs, triggers, beams, fogs,
  spawn: { x: 120, y: 620 },
  bounds: { left: -240, right: 6480 },
  rainStart: 0,
  waterLook: null,
  skyA: {
    top: [0.10, 0.09, 0.17], up: [0.16, 0.13, 0.24], mid: [0.24, 0.18, 0.31],
    low: [0.34, 0.25, 0.37], hor: [0.46, 0.33, 0.42], glow: [0.72, 0.68, 0.92],
    cloudAmt: 0.5, cloudLit: 0.5, sunI: 0.38, sunR: 0.03, haze: 0.34
  },
  skyB: {
    top: [0.05, 0.04, 0.10], up: [0.09, 0.06, 0.16], mid: [0.14, 0.09, 0.21],
    low: [0.21, 0.14, 0.27], hor: [0.30, 0.20, 0.32], glow: [0.78, 0.75, 0.98],
    cloudAmt: 0.65, cloudLit: 0.65, sunI: 0.30, sunR: 0.026, haze: 0.42
  },
  gradeA: {
    exposure: 0.97,
    lift: [0.012, 0.008, 0.026],
    gain: [0.940, 0.900, 1.020],
    sat: 0.82, vig: 0.40, bloom: 0.58, ray: 0.08, ca: 1.0, grain: 0.055
  },
  gradeB: {
    exposure: 0.93,
    lift: [0.010, 0.006, 0.022],
    gain: [0.880, 0.840, 0.970],
    sat: 0.66, vig: 0.48, bloom: 0.52, ray: 0.04, ca: 1.2, grain: 0.068
  },
  tintsA: [
    [0.96, 0.93, 1.04], [0.97, 0.95, 1.05], [0.99, 0.97, 1.06],
    [1.01, 0.99, 1.07], [0.95, 0.95, 1.05]
  ],
  tintsB: [
    [0.86, 0.82, 1.10], [0.88, 0.85, 1.12], [0.90, 0.88, 1.13],
    [0.93, 0.91, 1.15], [0.88, 0.87, 1.10]
  ]
};
})();

const CHAPTERS = [
  { n: 1, numeral: 'I', name: 'Market of Memories', world: WORLD1 },
  { n: 2, numeral: 'II', name: 'Farewell Rain', world: WORLD2 },
  { n: 3, numeral: 'III', name: 'Forest of Shadows', world: WORLD3 }
];
