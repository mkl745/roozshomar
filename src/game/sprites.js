const SPRITES = (() => {

const INK = '#221226';
const INK_FAR = '#170d1c';
const SCARF = '#7e2b38';
const SCARF_LIT = '#a84a52';
const CREAM = '#ffe9c8';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashN(i, seed) {
  let x = Math.imul(i ^ seed, 2654435761);
  x ^= x >>> 13;
  x = Math.imul(x, 1274126177);
  x ^= x >>> 16;
  return ((x >>> 0) % 100000) / 100000;
}

function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hashN(i, seed) * (1 - u) + hashN(i + 1, seed) * u;
}

function fbm1(x, seed, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * noise1(x * f, seed + i * 101);
    f *= 2; a *= 0.5;
  }
  return v;
}

function rimPass(ctx, w, h, strength = 0.3, aoBottom = true) {
  ctx.globalCompositeOperation = 'source-atop';
  let g = ctx.createLinearGradient(w * 0.5, 0, w, 0);
  g.addColorStop(0, 'rgba(255,196,130,0)');
  g.addColorStop(0.75, 'rgba(255,196,130,' + (strength * 0.5) + ')');
  g.addColorStop(1, 'rgba(255,222,170,' + strength + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (aoBottom) {
    let g2 = ctx.createLinearGradient(0, h * 0.72, 0, h);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(8,4,12,0.32)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function limb(ctx, ax, ay, bx, by, cx2, cy2, lw, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  if (cx2 !== undefined) ctx.lineTo(cx2, cy2);
  ctx.stroke();
}

function drawScarf(ctx, nx, ny, seed, t, facing, scale = 1) {
  const n = 8;
  const pts = [[nx, ny]];
  for (let i = 1; i < n; i++) {
    const wave = Math.sin(seed * 6.28 + i * 1.05 + t * Math.PI * 2) * (0.6 + i * 0.85);
    pts.push([
      nx - facing * (i * 4.4) * scale,
      ny - i * 0.42 * scale + wave * scale
    ]);
  }
  for (let i = 0; i < n - 1; i++) {
    const k = i / (n - 1);
    ctx.strokeStyle = i > n - 3 ? SCARF_LIT : SCARF;
    ctx.lineWidth = (5.4 - k * 4.0) * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[i][0], pts[i][1]);
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2 + Math.sin(seed * 9 + i) * 1.2;
    ctx.quadraticCurveTo(mx, my, pts[i + 1][0], pts[i + 1][1]);
    ctx.stroke();
  }
}

function J(x, y) { return { x, y }; }
function lerpJ(a, b, k) {
  return J(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
}

const POSE_STAND = {
  hip: J(0, -29), sh: J(1, -49), head: J(2, -58),
  kneeL: J(-4, -15), footL: J(-6, 0),
  kneeR: J(6, -15), footR: J(5, 0),
  elbowL: J(-6, -40), handL: J(-8, -31),
  elbowR: J(7, -40), handR: J(9, -31)
};
const POSE_SIT = {
  hip: J(-2, -10), sh: J(5, -27), head: J(7, -35),
  kneeL: J(8, -9), footL: J(13, -1),
  kneeR: J(11, -8), footR: J(18, -1),
  elbowL: J(2, -19), handL: J(6, -11),
  elbowR: J(9, -19), handR: J(13, -11)
};
const POSE_LIE = {
  hip: J(2, -5), sh: J(-14, -6), head: J(-21, -6),
  kneeL: J(11, -8), footL: J(20, -3),
  kneeR: J(14, -6), footR: J(23, -2),
  elbowL: J(-10, -2), handL: J(-4, -1),
  elbowR: J(-13, -10), handR: J(-7, -12)
};

function mixPose(a, b, k) {
  const o = {};
  for (const key in a) o[key] = lerpJ(a[key], b[key], k);
  return o;
}

function runPose(t) {
  const ph = t * Math.PI * 2;
  const bob = Math.abs(Math.cos(ph)) * 2.4;
  const p = {
    hip: J(Math.sin(ph) * 1.5, -29 + bob),
    sh: J(4 + Math.sin(ph) * 1.5, -48 + bob),
    head: J(6 + Math.sin(ph) * 1.5, -57 + bob)
  };
  const aL = Math.sin(ph) * 0.95;
  const aR = Math.sin(ph + Math.PI) * 0.95;
  function leg(a, bendPh) {
    const T = 15, S = 14;
    const bend = Math.max(0.12, Math.sin(bendPh) * 1.15 + 0.25);
    const kx = p.hip.x + Math.sin(a) * T;
    const ky = p.hip.y + Math.cos(a) * T;
    const fx = kx + Math.sin(a - bend) * S;
    const fy = ky + Math.cos(a - bend) * S;
    return { knee: J(kx, ky), foot: J(fx, Math.min(fy, -1)) };
  }
  const L = leg(aL, ph + 1.9);
  const R = leg(aR, ph + Math.PI + 1.9);
  p.kneeL = L.knee; p.footL = L.foot;
  p.kneeR = R.knee; p.footR = R.foot;
  const armA = Math.sin(ph + Math.PI) * 0.8;
  const armB = Math.sin(ph) * 0.8;
  p.elbowL = J(p.sh.x + Math.sin(armA) * 10, p.sh.y + Math.cos(armA) * 10);
  p.handL = J(p.elbowL.x + Math.sin(armA + 0.7) * 9, p.elbowL.y + Math.cos(armA + 0.7) * 9);
  p.elbowR = J(p.sh.x + Math.sin(armB) * 10, p.sh.y + Math.cos(armB) * 10);
  p.handR = J(p.elbowR.x + Math.sin(armB + 0.7) * 9, p.elbowR.y + Math.cos(armB + 0.7) * 9);
  return p;
}

const POSE_RISE = {
  hip: J(0, -30), sh: J(2, -50), head: J(4, -59),
  kneeL: J(7, -22), footL: J(3, -10),
  kneeR: J(-6, -18), footR: J(-13, -8),
  elbowL: J(-6, -56), handL: J(-10, -64),
  elbowR: J(10, -55), handR: J(15, -62)
};
const POSE_FALL = {
  hip: J(0, -29), sh: J(-1, -49), head: J(-1, -58),
  kneeL: J(6, -17), footL: J(9, -4),
  kneeR: J(-7, -16), footR: J(-11, -3),
  elbowL: J(-11, -43), handL: J(-17, -47),
  elbowR: J(10, -43), handR: J(16, -47)
};

function renderPose(ctx, p, opts) {
  const { seed, t, breathe, farColor } = opts;
  const br = 1 + Math.sin(seed * 12 + t * Math.PI * 2) * 0.015 * breathe;
  const shx = p.sh.x, shy = (p.sh.y + 20) * br - 20;

  drawScarf(ctx, p.sh.x - 2, p.sh.y + 3, seed, t, 1);

  limb(ctx, p.hip.x, p.hip.y, p.kneeR.x, p.kneeR.y, p.footR.x, p.footR.y, 5, farColor);
  limb(ctx, p.sh.x, shy, p.elbowR.x, p.elbowR.y, p.handR.x, p.handR.y, 4, farColor);

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(p.hip.x - 5, p.hip.y);
  ctx.quadraticCurveTo((p.hip.x + p.sh.x) / 2 - 5.5, (p.hip.y + shy) / 2, p.sh.x - 5, shy);
  ctx.lineTo(p.sh.x + 5, shy);
  ctx.quadraticCurveTo((p.hip.x + p.sh.x) / 2 + 5.5, (p.hip.y + shy) / 2, p.hip.x + 5, p.hip.y);
  ctx.closePath();
  ctx.fill();

  limb(ctx, p.hip.x, p.hip.y, p.kneeL.x, p.kneeL.y, p.footL.x, p.footL.y, 5, INK);
  limb(ctx, p.sh.x, shy, p.elbowL.x, p.elbowL.y, p.handL.x, p.handL.y, 4, INK);

  const hx = p.head.x, hy = p.head.y;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hx, hy, 7.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 2, hy - 6.5);
  ctx.quadraticCurveTo(hx - 10, hy - 10 + Math.sin(seed * 7 + t * 6.28) * 2, hx - 15, hy - 4);
  ctx.quadraticCurveTo(hx - 9, hy - 3, hx - 4, hy - 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(p.sh.x - 2.4, shy - 3, 5, 5);
}

function makePlayerSheet() {
  const FW = 72, FH = 104;
  const rows = [
    { name: 'idle', n: 6 },
    { name: 'run', n: 12 },
    { name: 'rise', n: 2 },
    { name: 'fall', n: 2 },
    { name: 'wake', n: 6 }
  ];
  const cols = 12;
  const [sheet, ctx] = cv(FW * cols, FH * rows.length);
  const meta = {};
  rows.forEach((row, ri) => {
    meta[row.name] = { row: ri, n: row.n };
    for (let f = 0; f < row.n; f++) {
      const ox = f * FW + FW / 2;
      const oy = ri * FH + FH - 6;
      ctx.save();
      ctx.translate(ox, oy);
      let pose, breathe = 0;
      if (row.name === 'idle') {
        pose = mixPose(POSE_STAND, POSE_STAND, 0);
        pose.sh.y += Math.sin(f / 6 * Math.PI * 2) * 0.8;
        pose.head.y += Math.sin(f / 6 * Math.PI * 2) * 0.9;
        breathe = 1;
        renderPose(ctx, pose, { seed: f * 0.37 + 0.1, t: f / 6, breathe });
      } else if (row.name === 'run') {
        pose = runPose((f + 0.5) / 12);
        renderPose(ctx, pose, { seed: f * 0.53, t: f / 12, breathe: 0 });
      } else if (row.name === 'rise') {
        renderPose(ctx, POSE_RISE, { seed: f * 0.9 + 0.3, t: f * 0.5, breathe: 0 });
      } else if (row.name === 'fall') {
        renderPose(ctx, POSE_FALL, { seed: f * 0.7 + 0.5, t: f * 0.5, breathe: 0 });
      } else if (row.name === 'wake') {
        const seq = [
          POSE_LIE,
          mixPose(POSE_LIE, POSE_LIE, 0),
          POSE_SIT,
          mixPose(POSE_SIT, POSE_STAND, 0.45),
          mixPose(POSE_SIT, POSE_STAND, 0.8),
          POSE_STAND
        ];
        const p2 = Object.assign({}, seq[f]);
        if (f === 1) { p2.sh = lerpJ(p2.sh, J(p2.sh.x, p2.sh.y - 1.5), 1); p2.head.y -= 1.5; }
        renderPose(ctx, p2, { seed: f * 0.41 + 0.2, t: f / 6, breathe: f < 2 ? 1 : 0 });
      }
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(f * FW, ri * FH, FW, FH);
      ctx.clip();
      ctx.globalCompositeOperation = 'source-atop';
      let g = ctx.createLinearGradient(f * FW + FW * 0.45, 0, f * FW + FW, 0);
      g.addColorStop(0, 'rgba(255,196,130,0)');
      g.addColorStop(0.8, 'rgba(255,206,146,0.20)');
      g.addColorStop(1, 'rgba(255,230,180,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(f * FW, ri * FH, FW, FH);
      ctx.restore();
    }
  });
  return { sheet, meta, fw: FW, fh: FH };
}

function makeAtlas() {
  const S = 256;
  const [atlas, ctx] = cv(S * 2, S * 2);

  let g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,244,216,0.9)');
  g.addColorStop(0.45, 'rgba(255,202,122,0.32)');
  g.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  ctx.save();
  ctx.translate(S * 1.5, S / 2);
  ctx.rotate(-0.5);
  g = ctx.createLinearGradient(-S * 0.45, 0, S * 0.45, 0);
  g.addColorStop(0, 'rgba(255,220,160,0)');
  g.addColorStop(0.5, 'rgba(255,250,235,1)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, S * 0.45, S * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(S / 2, S * 1.5);
  ctx.shadowColor = 'rgba(255,230,190,0.9)';
  ctx.shadowBlur = 7;
  ctx.strokeStyle = 'rgba(255,246,225,0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.stroke();
  ctx.restore();

  const rnd = mulberry32(77);
  for (let i = 0; i < 7; i++) {
    const bx = S * 1.5 + (rnd() - 0.5) * S * 0.5;
    const by = S * 1.5 + (rnd() - 0.5) * S * 0.5;
    const br = S * (0.16 + rnd() * 0.2);
    g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, 'rgba(235,225,215,0.30)');
    g.addColorStop(1, 'rgba(235,225,215,0)');
    ctx.fillStyle = g;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }

  return {
    atlas,
    uv: {
      glow: [0, 0, 0.5, 0.5],
      spark: [0.5, 0, 0.5, 0.5],
      ring: [0, 0.5, 0.5, 0.5],
      smoke: [0.5, 0.5, 0.5, 0.5]
    }
  };
}

function makeRidge(opts) {
  const { w, h, color, seed, amp, sky, type } = opts;
  const [c, ctx] = cv(w, h);
  const rnd = mulberry32(seed);

  function skyline(x) {
    let y = h * sky;
    if (type === 'mountains') {
      y -= (fbm1(x * 0.0016, seed, 4) - 0.5) * amp * 2.4;
      y -= Math.pow(Math.max(0, fbm1(x * 0.0007, seed + 55, 3) - 0.45), 1.4) * amp * 2.2;
    } else if (type === 'hills') {
      y -= (fbm1(x * 0.0022, seed, 3) - 0.5) * amp;
    } else {
      y -= (fbm1(x * 0.004, seed, 3) - 0.5) * amp * 0.5;
    }
    return y;
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  const step = 12;
  for (let x = 0; x <= w; x += step) ctx.lineTo(x, skyline(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  if (type === 'city') {
    let x = 30;
    while (x < w - 40) {
      const bw = 26 + rnd() * 66;
      const bh = 24 + rnd() * 84;
      ctx.fillRect(x, skyline(x + bw / 2) - bh + 14, bw, bh + 40);
      if (rnd() < 0.4) {
        const tx = x + bw * 0.5, ty = skyline(x + bw / 2) - bh + 14;
        ctx.fillRect(tx - 5, ty - 12, 10, 12);
        ctx.fillRect(tx - 1, ty - 18, 2, 7);
      }
      if (rnd() < 0.22) {
        const dx = x + bw * 0.5, dy = skyline(dx) - bh + 14;
        ctx.beginPath();
        ctx.arc(dx, dy, bw * 0.24, Math.PI, 0);
        ctx.fill();
      }
      x += bw + 8 + rnd() * 34;
    }
    const sx = w * 0.68;
    ctx.fillRect(sx - 55, skyline(sx) - 58, 110, 74);
    ctx.beginPath();
    ctx.moveTo(sx - 62, skyline(sx) - 58);
    ctx.lineTo(sx, skyline(sx) - 84);
    ctx.lineTo(sx + 62, skyline(sx) - 58);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(sx + 70, skyline(sx + 70) - 92, 3, 96);
    const mx = w * 0.24;
    ctx.fillRect(mx - 4, skyline(mx) - 118, 8, 134);
    ctx.beginPath();
    ctx.arc(mx, skyline(mx) - 124, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(mx - 1, skyline(mx) - 138, 2, 10);
  }

  if (type === 'hills') {
    let x = 60 + rnd() * 120;
    while (x < w - 30) {
      const th = 42 + rnd() * 34;
      const tw = th * 0.3;
      const by = skyline(x) + 8;
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.quadraticCurveTo(x - tw, by - th * 0.55, x, by - th);
      ctx.quadraticCurveTo(x + tw, by - th * 0.55, x, by);
      ctx.fill();
      if (rnd() < 0.3) {
        const ph2 = 60 + rnd() * 40;
        ctx.fillRect(x - 1.5, by - ph2, 3, ph2);
        ctx.beginPath();
        ctx.arc(x, by - ph2 - 4, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      x += 110 + rnd() * 190;
    }
  }

  if (type === 'treeline') {
    for (let x = 0; x < w; x += 14) {
      const r = 16 + fbm1(x * 0.02, seed + 9, 2) * 26;
      const cy2 = skyline(x) + 4;
      ctx.beginPath();
      ctx.arc(x, cy2, r, 0, Math.PI * 2);
      ctx.fill();
    }
    let px = 140 + rnd() * 160;
    while (px < w - 60) {
      const by = skyline(px) + 26;
      const ph2 = 105 + rnd() * 30;
      ctx.fillRect(px - 2.5, by - ph2, 5, ph2);
      ctx.fillRect(px - 20, by - ph2 + 10, 40, 3.5);
      ctx.fillRect(px - 14, by - ph2 + 22, 28, 3);
      const nxt = px + 300 + rnd() * 140;
      if (nxt < w) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(px + 18, by - ph2 + 11);
        ctx.quadraticCurveTo((px + nxt) / 2, by - ph2 + 34, nxt - 18, by - ph2 + 12);
        ctx.stroke();
      }
      px = nxt;
    }
  }

  if (type === 'meadow') {
    for (let x = 0; x < w; x += 5) {
      const bh2 = 26 + fbm1(x * 0.03, seed + 3, 2) * 58;
      const lean = Math.sin(x * 0.05 + seed) * 7 + (rnd() - 0.5) * 5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.1 + rnd() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, h + 4);
      ctx.quadraticCurveTo(x + lean * 0.4, h - bh2 * 0.55, x + lean, h - bh2);
      ctx.stroke();
      if (rnd() < 0.05) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + lean, h - bh2 - 2, 2.6 + rnd() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 26; i++) {
      const fx = rnd() * w;
      const fh2 = 30 + rnd() * 60;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, h + 4);
      ctx.lineTo(fx + (rnd() - 0.5) * 8, h - fh2);
      ctx.stroke();
    }
  }

  if (type !== 'meadow') {
    ctx.globalCompositeOperation = 'source-atop';
    const hazeTop = h * sky - amp;
    const g = ctx.createLinearGradient(0, Math.max(0, hazeTop), 0, h * 0.95);
    const a = type === 'mountains' ? 0.34 : (type === 'city' ? 0.22 : 0.12);
    g.addColorStop(0, 'rgba(255,186,128,' + a + ')');
    g.addColorStop(1, 'rgba(255,186,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  return c;
}

function makeGround(w, h, island, style = 'soil') {
  const pad = 26;
  const [c, ctx] = cv(w, h + pad);
  const rnd = mulberry32((w * 7919 + h * 31 + style.length * 977) | 0);
  const topY = pad;

  if (style === 'crate') {
    ctx.fillStyle = '#33202a';
    ctx.fillRect(0, topY, w, h + 8);
    ctx.fillStyle = '#3d2733';
    for (let py = topY + 6; py < Math.min(h + 4, topY + 60); py += 11) {
      ctx.fillRect(0, py, w, 7);
    }
    ctx.strokeStyle = '#1c1018';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, topY + 1.5, w - 3, Math.min(h - 3, 58));
    ctx.fillStyle = 'rgba(255,200,140,0.30)';
    ctx.fillRect(2, topY, w - 4, 2);
    if (!island && h > 80) {
      ctx.fillStyle = '#2a1926';
      ctx.fillRect(0, topY + 62, w, h - 62);
      const g = ctx.createLinearGradient(0, topY, 0, h + pad);
      g.addColorStop(0, 'rgba(70,40,63,0)');
      g.addColorStop(1, '#1b0e1e');
      ctx.fillStyle = g;
      ctx.fillRect(0, topY + 62, w, h - 62 + pad);
    }
    rimPass(ctx, w, h + pad, 0.26, false);
    return c;
  }
  if (style === 'plank') {
    ctx.fillStyle = '#38232e';
    ctx.beginPath();
    if (island) {
      ctx.moveTo(0, topY);
      ctx.lineTo(w, topY);
      ctx.quadraticCurveTo(w * 0.96, topY + h * 0.55, w * 0.6, h);
      ctx.quadraticCurveTo(w * 0.5, h + 10, w * 0.4, h);
      ctx.quadraticCurveTo(w * 0.04, topY + h * 0.55, 0, topY);
    } else {
      ctx.rect(0, topY, w, Math.max(10, h));
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,20,0.8)';
    ctx.lineWidth = 1.4;
    for (let gx = 14; gx < w - 8; gx += 22 + (gx % 13)) {
      ctx.beginPath();
      ctx.moveTo(gx, topY + 2);
      ctx.bezierCurveTo(gx + 3, topY + h * 0.4, gx - 3, topY + h * 0.7, gx + 1, topY + Math.min(h - 2, 18));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,205,145,0.42)';
    ctx.fillRect(2, topY, w - 4, 2.2);
    for (let i = 0; i < 4 && w > 50; i++) {
      const nx = 10 + (i + 0.5) * (w - 20) / 4;
      ctx.fillStyle = '#1c1018';
      ctx.beginPath();
      ctx.arc(nx, topY + Math.min(h - 4, 10), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    if (island) {
      ctx.strokeStyle = '#241228';
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const bx = w * (0.35 + rnd() * 0.3);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, h * 0.7);
        ctx.quadraticCurveTo(bx + (rnd() - 0.5) * 12, h * 0.9, bx + (rnd() - 0.5) * 16, h + 10 + rnd() * 10);
        ctx.stroke();
      }
    }
    rimPass(ctx, w, h + pad, 0.28, false);
    return c;
  }

  ctx.fillStyle = '#3b2138';
  ctx.beginPath();
  if (island) {
    ctx.moveTo(0, topY);
    ctx.lineTo(w, topY);
    ctx.quadraticCurveTo(w * 0.98, h * 0.75, w * 0.62, h);
    ctx.quadraticCurveTo(w * 0.5, h + 8, w * 0.38, h);
    ctx.quadraticCurveTo(w * 0.02, h * 0.75, 0, topY);
  } else {
    ctx.moveTo(0, topY + 12);
    ctx.quadraticCurveTo(0, topY, 14, topY);
    ctx.lineTo(w - 14, topY);
    ctx.quadraticCurveTo(w, topY, w, topY + 12);
    ctx.lineTo(w, h + pad);
    ctx.lineTo(0, h + pad);
  }
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, topY, 0, h + pad);
  g.addColorStop(0, '#46283f');
  g.addColorStop(0.35, '#301a30');
  g.addColorStop(1, '#1b0e1e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h + pad);

  ctx.fillStyle = '#5a3350';
  ctx.fillRect(0, topY, w, 7);
  ctx.fillStyle = 'rgba(255,198,136,0.5)';
  let rx = 4;
  while (rx < w - 8) {
    const seg = 26 + rnd() * 70;
    ctx.fillRect(rx, topY - 1, Math.min(seg, w - 8 - rx), 1.8);
    rx += seg + 6 + rnd() * 26;
  }

  for (let i = 0; i < w / 9; i++) {
    const sxp = rnd() * w;
    const syp = topY + 14 + rnd() * (h - 14);
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(sxp, syp, 1.5 + rnd() * 3.4, 1 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (let x = 3; x < w - 3; x += 7 + rnd() * 9) {
    const gh = 7 + rnd() * 15;
    const lean = Math.sin(x * 0.07 + w) * 4 + (rnd() - 0.5) * 4;
    ctx.strokeStyle = '#180b1a';
    ctx.lineWidth = 1.8 + rnd();
    ctx.beginPath();
    ctx.moveTo(x, topY + 2);
    ctx.quadraticCurveTo(x + lean * 0.4, topY - gh * 0.6, x + lean, topY - gh);
    ctx.stroke();
  }
  for (let i = 0; i < w / 80; i++) {
    const fx = rnd() * w;
    const col = ['#e8a05c', '#d95f6e', '#e8c86a'][Math.floor(rnd() * 3)];
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(fx, topY - 8 - rnd() * 10, 2 + rnd() * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#180b1a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(fx, topY + 1);
    ctx.lineTo(fx, topY - 7);
    ctx.stroke();
  }

  if (island) {
    ctx.strokeStyle = '#241228';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const bx = w * (0.3 + rnd() * 0.4);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx, h * 0.82);
      ctx.quadraticCurveTo(bx + (rnd() - 0.5) * 16, h * 0.95, bx + (rnd() - 0.5) * 22, h + 12 + rnd() * 14);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const mx = 10 + rnd() * (w - 20);
      const my = h * (0.55 + rnd() * 0.35);
      ctx.fillStyle = 'rgba(255,202,122,0.65)';
      ctx.shadowColor = '#ffca7a';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(mx, my, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  rimPass(ctx, w, h + pad, 0.26, false);
  return c;
}

function makeCart() {
  const [c, ctx] = cv(170, 148);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;

  ctx.fillRect(18, 58, 134, 52);
  ctx.fillRect(10, 52, 150, 8);

  for (let i = 0; i < 7; i++) {
    const x = 8 + i * 22.5;
    ctx.fillStyle = i % 2 ? '#33203a' : INK;
    ctx.beginPath();
    ctx.moveTo(x, 26);
    ctx.lineTo(x + 22.5, 26);
    ctx.lineTo(x + 22.5, 46);
    ctx.arc(x + 11.25, 46, 11.25, 0, Math.PI);
    ctx.lineTo(x, 26);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.fillRect(6, 22, 158, 6);
  ctx.fillRect(24, 46, 5, 14);
  ctx.fillRect(140, 46, 5, 14);

  ctx.strokeStyle = 'rgba(255,214,150,0.30)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(8 + i * 22.5, 28);
    ctx.lineTo(8 + i * 22.5, 46);
    ctx.stroke();
  }

  ctx.fillStyle = INK;
  ctx.strokeStyle = 'rgba(255,224,170,0.35)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(32, 72 + i * 12);
    ctx.quadraticCurveTo(52, 70 + i * 12, 72, 73 + i * 12);
    ctx.stroke();
  }

  function wheel(cx2, cy2, r) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,214,150,0.4)';
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx2 - Math.cos(a) * r * 0.85, cy2 - Math.sin(a) * r * 0.85);
      ctx.lineTo(cx2 + Math.cos(a) * r * 0.85, cy2 + Math.sin(a) * r * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  wheel(46, 122, 17);
  wheel(126, 122, 17);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(150, 66);
  ctx.lineTo(166, 40);
  ctx.stroke();

  ctx.fillStyle = '#8e3a44';
  ctx.beginPath();
  ctx.moveTo(152, 50);
  ctx.lineTo(162, 62);
  ctx.lineTo(142, 62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8c86a';
  ctx.beginPath();
  ctx.arc(152, 46, 5.5, 0, Math.PI * 2);
  ctx.fill();

  rimPass(ctx, 170, 148, 0.34);
  return c;
}

function makeBench() {
  const [c, ctx] = cv(120, 52);
  ctx.fillStyle = INK;
  ctx.fillRect(6, 16, 108, 8);
  ctx.fillRect(10, 2, 100, 6);
  ctx.fillRect(16, 8, 5, 10);
  ctx.fillRect(99, 8, 5, 10);
  ctx.fillRect(14, 24, 7, 26);
  ctx.fillRect(99, 24, 7, 26);
  ctx.fillRect(10, 30, 100, 5);
  rimPass(ctx, 120, 52, 0.3);
  return c;
}

function makeLamp() {
  const [c, ctx] = cv(56, 218);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(20, 218);
  ctx.lineTo(36, 218);
  ctx.lineTo(32, 196);
  ctx.lineTo(24, 196);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(26, 40, 5, 158);
  ctx.beginPath();
  ctx.moveTo(28.5, 40);
  ctx.quadraticCurveTo(28.5, 22, 44, 20);
  ctx.lineTo(44, 26);
  ctx.quadraticCurveTo(33, 27, 33, 40);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(34, 26);
  ctx.lineTo(54, 26);
  ctx.lineTo(50, 0);
  ctx.lineTo(38, 0);
  ctx.closePath();
  ctx.fill();
  ctx.clearRect(39.5, 8, 9, 12);
  ctx.fillStyle = '#ffd9a0';
  ctx.shadowColor = '#ffbe72';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(44, 13, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(44, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  rimPass(ctx, 56, 218, 0.3);
  return c;
}

function makeBike() {
  const [c, ctx] = cv(132, 86);
  const INKS = INK;
  function wheel(cx2, cy2) {
    ctx.strokeStyle = INKS;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,214,150,0.45)';
    ctx.beginPath();
    ctx.arc(cx2, cy2, 20, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + 0.3;
      ctx.beginPath();
      ctx.moveTo(cx2, cy2);
      ctx.lineTo(cx2 + Math.cos(a) * 19, cy2 + Math.sin(a) * 19);
      ctx.stroke();
    }
    ctx.fillStyle = INKS;
    ctx.beginPath();
    ctx.arc(cx2, cy2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  wheel(30, 58);
  wheel(102, 58);
  ctx.strokeStyle = INKS;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(30, 58); ctx.lineTo(58, 26); ctx.lineTo(92, 26); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(58, 26); ctx.lineTo(66, 58); ctx.lineTo(30, 58); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(66, 58); ctx.lineTo(102, 58); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(92, 26); ctx.lineTo(102, 58); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(92, 26); ctx.quadraticCurveTo(104, 22, 106, 14); ctx.stroke();
  ctx.fillStyle = INKS;
  ctx.fillRect(50, 18, 16, 5);
  ctx.beginPath();
  ctx.arc(66, 58, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(66, 58); ctx.lineTo(76, 66); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(76, 66); ctx.lineTo(84, 62); ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(103, 30); ctx.lineTo(114, 34); ctx.lineTo(112, 46); ctx.lineTo(101, 42); ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,214,150,0.35)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(104, 34 + i * 4); ctx.lineTo(111, 35 + i * 4);
    ctx.stroke();
  }
  rimPass(ctx, 132, 86, 0.32);
  return c;
}

function makeKiteTree() {
  const [c, ctx] = cv(280, 260);
  ctx.strokeStyle = '#241228';
  ctx.lineCap = 'round';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(120, 258);
  ctx.quadraticCurveTo(112, 190, 128, 120);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(126, 160);
  ctx.quadraticCurveTo(90, 130, 62, 108);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(127, 130);
  ctx.quadraticCurveTo(168, 100, 196, 84);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(128, 120);
  ctx.quadraticCurveTo(140, 70, 158, 48);
  ctx.stroke();

  const rnd = mulberry32(303);
  ctx.fillStyle = '#2c1832';
  const blobs = [
    [150, 52, 52], [100, 74, 44], [196, 66, 46], [232, 92, 36],
    [66, 96, 34], [172, 96, 42], [128, 100, 38]
  ];
  blobs.forEach(b => {
    ctx.beginPath();
    ctx.ellipse(b[0], b[1], b[2], b[2] * 0.78, rnd() * 0.8 - 0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  for (let i = 0; i < 130; i++) {
    const bi = blobs[Math.floor(rnd() * blobs.length)];
    const a = rnd() * Math.PI * 2;
    const rr = rnd() * bi[2];
    ctx.fillStyle = rnd() < 0.12 ? 'rgba(255,202,122,0.5)' : 'rgba(70,42,76,0.7)';
    ctx.beginPath();
    ctx.arc(bi[0] + Math.cos(a) * rr, bi[1] + Math.sin(a) * rr * 0.8, 1.4 + rnd() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(236, 60);
  ctx.rotate(0.5);
  ctx.fillStyle = '#8e3a44';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(14, 0);
  ctx.lineTo(0, 22);
  ctx.lineTo(-14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,150,0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -20); ctx.lineTo(0, 22); ctx.moveTo(-14, 0); ctx.lineTo(14, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#241228';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(236, 78);
  ctx.bezierCurveTo(250, 110, 220, 140, 238, 176);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const kx = 244 - i * 2, ky = 116 + i * 22;
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(rnd());
    ctx.strokeStyle = '#8e3a44';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-6, -4); ctx.lineTo(6, 4); ctx.moveTo(-6, 4); ctx.lineTo(6, -4);
    ctx.stroke();
    ctx.restore();
  }
  rimPass(ctx, 280, 260, 0.3);
  return c;
}

function makeLadder() {
  const [c, ctx] = cv(40, 104);
  ctx.strokeStyle = '#241228';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(6, 104);
  ctx.moveTo(34, 0); ctx.lineTo(34, 104);
  ctx.stroke();
  ctx.lineWidth = 3.6;
  for (let y = 8; y < 104; y += 15) {
    ctx.beginPath();
    ctx.moveTo(6, y); ctx.lineTo(34, y);
    ctx.stroke();
  }
  rimPass(ctx, 40, 104, 0.28);
  return c;
}

function makeCheckpointLantern() {
  const [c, ctx] = cv(64, 120);
  ctx.fillStyle = '#241228';
  ctx.beginPath();
  ctx.moveTo(16, 120);
  ctx.lineTo(48, 120);
  ctx.lineTo(42, 104);
  ctx.lineTo(22, 104);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(26, 62, 12, 44);
  ctx.fillRect(18, 56, 28, 10);
  ctx.fillRect(16, 24, 32, 32);
  ctx.clearRect(22, 30, 8, 20);
  ctx.clearRect(34, 30, 8, 20);
  ctx.beginPath();
  ctx.moveTo(12, 24);
  ctx.lineTo(32, 8);
  ctx.lineTo(52, 24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(32, 6, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#120a18';
  ctx.fillRect(22, 30, 8, 20);
  ctx.fillRect(34, 30, 8, 20);
  rimPass(ctx, 64, 120, 0.3);
  return c;
}

function makeSchoolFar() {
  const [c, ctx] = cv(340, 160);
  const col = '#43294c';
  ctx.fillStyle = col;
  ctx.fillRect(20, 92, 130, 52);
  ctx.fillRect(150, 76, 60, 68);
  ctx.fillRect(210, 96, 110, 48);
  ctx.beginPath();
  ctx.moveTo(142, 76);
  ctx.lineTo(180, 48);
  ctx.lineTo(218, 76);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(180, 66, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(178, 20, 2.5, 56);
  ctx.fillStyle = '#57345e';
  ctx.beginPath();
  ctx.moveTo(180.5, 20);
  ctx.lineTo(202, 26);
  ctx.lineTo(180.5, 33);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(8, 118, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(330, 122, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, 'rgba(255,170,110,0.5)');
  g.addColorStop(1, 'rgba(255,170,110,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 340, 160);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

function makeUmbrella() {
  const [c, ctx] = cv(44, 156);
  ctx.strokeStyle = '#241228';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(22, 12);
  ctx.quadraticCurveTo(30, 70, 24, 128);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(22, 10);
  ctx.quadraticCurveTo(34, 34, 28, 58);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(27, 60);
  ctx.lineTo(31, 76);
  ctx.stroke();
  ctx.fillStyle = '#8e3a44';
  ctx.beginPath();
  ctx.moveTo(21, 4);
  ctx.lineTo(26, 14);
  ctx.lineTo(18, 16);
  ctx.closePath();
  ctx.fill();
  rimPass(ctx, 44, 156, 0.3);
  return c;
}

function makeWindow() {
  const [c, ctx] = cv(96, 150);
  ctx.fillStyle = '#241228';
  ctx.beginPath();
  ctx.moveTo(8, 150);
  ctx.lineTo(8, 52);
  ctx.arc(48, 52, 40, Math.PI, 0);
  ctx.lineTo(88, 150);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createRadialGradient(48, 78, 4, 48, 78, 46);
  g.addColorStop(0, '#ffe9bd');
  g.addColorStop(0.55, '#f5b968');
  g.addColorStop(1, '#a05f3d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(17, 150);
  ctx.lineTo(17, 54);
  ctx.arc(48, 54, 31, Math.PI, 0);
  ctx.lineTo(79, 150);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#241228';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(48, 23);
  ctx.lineTo(48, 150);
  ctx.moveTo(17, 92);
  ctx.lineTo(79, 92);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeRect(4.5, 145, 87, 5);
  rimPass(ctx, 96, 150, 0.35);
  return c;
}

function makeGlyph(kind) {
  const [c, ctx] = cv(72, 72);
  ctx.strokeStyle = CREAM;
  ctx.shadowColor = 'rgba(255,220,160,0.9)';
  ctx.shadowBlur = 9;
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'move') {
    for (let i = 0; i < 2; i++) {
      const ox = 16 + i * 24;
      ctx.beginPath();
      ctx.moveTo(ox, 22);
      ctx.lineTo(ox + 15, 36);
      ctx.lineTo(ox, 50);
      ctx.stroke();
    }
  } else if (kind === 'rise') {
    for (let i = 0; i < 3; i++) {
      const oy = 56 - i * 16;
      ctx.globalAlpha = 0.45 + i * 0.27;
      ctx.beginPath();
      ctx.moveTo(22, oy);
      ctx.lineTo(36, oy - 13);
      ctx.lineTo(50, oy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    for (let i = 0; i < 2; i++) {
      const oy = 46 - i * 20;
      ctx.beginPath();
      ctx.moveTo(20, oy);
      ctx.lineTo(36, oy - 15);
      ctx.lineTo(52, oy);
      ctx.stroke();
    }
  }
  return c;
}

function makeShadow() {
  const [c, ctx] = cv(280, 380);
  const rnd = mulberry32(666);
  ctx.fillStyle = '#0b0614';
  ctx.beginPath();
  ctx.moveTo(140, 26);
  ctx.quadraticCurveTo(96, 34, 88, 84);
  ctx.quadraticCurveTo(60, 108, 58, 168);
  ctx.quadraticCurveTo(40, 240, 30, 330);
  const hem = [];
  let hx = 30;
  while (hx < 250) {
    const seg = 22 + rnd() * 26;
    hem.push([Math.min(hx + seg, 250), 330 - (8 + rnd() * 46)]);
    hx += seg;
  }
  for (const p of hem) ctx.lineTo(p[0], p[1]);
  ctx.lineTo(250, 330);
  ctx.quadraticCurveTo(240, 240, 222, 168);
  ctx.quadraticCurveTo(220, 108, 192, 84);
  ctx.quadraticCurveTo(184, 34, 140, 26);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#150c24';
  ctx.beginPath();
  ctx.moveTo(140, 52);
  ctx.quadraticCurveTo(112, 62, 106, 104);
  ctx.quadraticCurveTo(126, 128, 140, 128);
  ctx.quadraticCurveTo(154, 128, 174, 104);
  ctx.quadraticCurveTo(168, 62, 140, 52);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(120,80,170,0.20)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const sx2 = 40 + rnd() * 200;
    const sy2 = 300 - rnd() * 160;
    ctx.beginPath();
    ctx.moveTo(sx2, sy2);
    ctx.bezierCurveTo(sx2 + (rnd() - 0.5) * 60, sy2 + 40, sx2 + (rnd() - 0.5) * 80, sy2 + 70, sx2 + (rnd() - 0.5) * 90, sy2 + 100);
    ctx.stroke();
  }
  return c;
}

function makeEyes() {
  const [c, ctx] = cv(72, 28);
  function eye(x) {
    const g = ctx.createRadialGradient(x, 14, 1, x, 14, 13);
    g.addColorStop(0, 'rgba(235,228,255,1)');
    g.addColorStop(0.35, 'rgba(190,175,240,0.85)');
    g.addColorStop(1, 'rgba(140,110,210,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, 14, 12, 6.5, -0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  eye(22); eye(50);
  return c;
}

function makeBeam() {
  const [c, ctx] = cv(180, 560);
  const g = ctx.createLinearGradient(0, 0, 0, 560);
  g.addColorStop(0, 'rgba(185,195,245,0.42)');
  g.addColorStop(0.55, 'rgba(175,185,240,0.20)');
  g.addColorStop(1, 'rgba(170,180,235,0.04)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(74, 0);
  ctx.lineTo(106, 0);
  ctx.quadraticCurveTo(150, 260, 172, 548);
  ctx.lineTo(8, 548);
  ctx.quadraticCurveTo(30, 260, 74, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-in';
  const soft = ctx.createRadialGradient(90, 280, 40, 90, 280, 290);
  soft.addColorStop(0, 'rgba(0,0,0,1)');
  soft.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = soft;
  ctx.fillRect(0, 0, 180, 560);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

function makeFog(seed) {
  const [c, ctx] = cv(1024, 320);
  const rnd = mulberry32(seed);
  for (let i = 0; i < 46; i++) {
    const bx = rnd() * 1024;
    const by = 90 + rnd() * 200;
    const br = 60 + rnd() * 150;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, 'rgba(150,132,182,' + (0.05 + rnd() * 0.05) + ')');
    g.addColorStop(1, 'rgba(150,132,182,0)');
    ctx.fillStyle = g;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  const fade = ctx.createLinearGradient(0, 0, 0, 320);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.25, 'rgba(0,0,0,0)');
  fade.addColorStop(0.8, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1024, 320);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

function makeRootGate() {
  const [c, ctx] = cv(340, 310);
  ctx.strokeStyle = '#120a1a';
  ctx.lineCap = 'round';
  ctx.lineWidth = 42;
  ctx.beginPath();
  ctx.moveTo(38, 308);
  ctx.quadraticCurveTo(30, 160, 96, 78);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(302, 308);
  ctx.quadraticCurveTo(310, 160, 244, 78);
  ctx.stroke();
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(96, 78);
  ctx.quadraticCurveTo(170, 44, 244, 78);
  ctx.stroke();
  ctx.lineWidth = 10;
  for (let i = 0; i < 4; i++) {
    const k = 0.25 + i * 0.16;
    const ax = 38 + (302 - 38) * k;
    ctx.beginPath();
    ctx.moveTo(ax, 300);
    ctx.quadraticCurveTo(ax + (i % 2 ? 26 : -26), 230, ax + (i % 2 ? 10 : -10), 170);
    ctx.stroke();
  }
  rimPass(ctx, 340, 310, 0.22);
  return c;
}

function makeSpookyTree(seed) {
  const [c, ctx] = cv(260, 320);
  const rnd = mulberry32(seed);
  ctx.strokeStyle = '#160d20';
  ctx.lineCap = 'round';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.moveTo(130, 318);
  ctx.quadraticCurveTo(118, 210, 138, 120);
  ctx.stroke();
  ctx.lineWidth = 9;
  const tips = [
    [138, 120, 60, 40], [138, 120, 216, 56], [128, 170, 36, 120],
    [136, 148, 236, 130], [134, 96, 176, 18]
  ];
  for (const t of tips) {
    ctx.beginPath();
    ctx.moveTo(t[0], t[1]);
    ctx.quadraticCurveTo((t[0] + t[2]) / 2 + (rnd() - 0.5) * 40, (t[1] + t[3]) / 2 - 30, t[2], t[3]);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    const bx = 60 + rnd() * 150, by = 40 + rnd() * 160;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + (rnd() - 0.5) * 30, by - 20, bx + (rnd() - 0.5) * 46, by - 34);
    ctx.stroke();
  }
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(112, 306);
  ctx.quadraticCurveTo(80, 296, 54, 310);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(152, 306);
  ctx.quadraticCurveTo(186, 294, 212, 308);
  ctx.stroke();
  rimPass(ctx, 260, 320, 0.16);
  return c;
}

function buildAll() {
  const player = makePlayerSheet();
  const atlasData = makeAtlas();
  return {
    player,
    atlas: atlasData.atlas,
    atlasUV: atlasData.uv,
    L1: makeRidge({ w: 2048, h: 430, color: '#7a5877', seed: 11, amp: 90, sky: 0.34, type: 'mountains' }),
    L2: makeRidge({ w: 2048, h: 380, color: '#5f3f61', seed: 23, amp: 60, sky: 0.42, type: 'city' }),
    L3: makeRidge({ w: 2048, h: 340, color: '#4a2c4e', seed: 37, amp: 70, sky: 0.40, type: 'hills' }),
    L4: makeRidge({ w: 2048, h: 300, color: '#33203a', seed: 51, amp: 46, sky: 0.34, type: 'treeline' }),
    FG: makeRidge({ w: 2048, h: 240, color: '#1c1026', seed: 67, amp: 0, sky: 1, type: 'meadow' }),
    school: makeSchoolFar(),
    props: {
      cart: makeCart(),
      bench: makeBench(),
      lamp: makeLamp(),
      bike: makeBike(),
      tree: makeKiteTree(),
      ladder: makeLadder(),
      umbrella: makeUmbrella(),
      window: makeWindow()
    },
    lantern: makeCheckpointLantern(),
    shadow: makeShadow(),
    eyes: makeEyes(),
    beam: makeBeam(),
    fogA: makeFog(404),
    fogB: makeFog(909),
    rootGate: makeRootGate(),
    spookyA: makeSpookyTree(31),
    spookyB: makeSpookyTree(77),
    glyphs: {
      move: makeGlyph('move'),
      jump: makeGlyph('jump'),
      rise: makeGlyph('rise')
    }
  };
}

return { buildAll, rimPass, cv };
})();
