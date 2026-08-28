/* ------------------------------------------------------------------ *
 *  Character renderer: procedural silhouette (GRIS-like figure with  *
 *  flowing dress + scarf), squash & stretch about the feet, limb     *
 *  rotation from char.pose, rim-light crescent facing the scene key  *
 *  light, soft aura. No sprite sheets.                               *
 * ------------------------------------------------------------------ */
import { clamp, hexToRgb } from './util.js';

export class CharacterRenderer {
  constructor(lighting) {
    this.lighting = lighting;
    this.oc = document.createElement('canvas');   // silhouette mask
    this.rc = document.createElement('canvas');   // rim crescent
    this.S = 2;                                    // internal supersample
    this.oc.width = this.oc.height = this.rc.width = this.rc.height = 160 * this.S;
  }

  render(ctx, char, t, opts = {}) {
    const color = opts.silhouette ?? '#0b0813';
    const rim = this.lighting.rim;
    const p = char.pose;
    const f = char.feel;

    /* ---- build silhouette in local space (feet at 0,0, facing +x) ---- */
    const o = this.oc.getContext('2d');
    o.setTransform(this.S, 0, 0, this.S, 0, 0);
    o.clearRect(0, 0, 160, 160);
    o.translate(80, 118);                 // feet anchor inside mask canvas
    o.scale(1, 1);
    o.rotate(p.lean);
    o.fillStyle = color; o.strokeStyle = color; o.lineCap = 'round'; o.lineJoin = 'round';

    const hipY = -19 + p.bob * 0.4, neckY = -34 + p.bob, headY = -40 + p.bob;

    // far limbs slightly narrower (still same silhouette color)
    const leg = (hip, knee, front) => {
      const hx = front ? 1.5 : -1.5;
      const kx = hx + Math.sin(hip) * 10.5, ky = hipY + Math.cos(hip) * 10.5;
      const ax = kx + Math.sin(hip + knee) * 10.5, ay = ky + Math.cos(hip + knee) * 10.5;
      o.lineWidth = front ? 5 : 4.4;
      o.beginPath(); o.moveTo(hx, hipY); o.lineTo(kx, ky); o.lineTo(ax, ay); o.stroke();
      return { ax, ay };
    };
    const arm = (sho, elb, front) => {
      const sx = front ? 1 : -1, sy = neckY + 3;
      const ex = sx + Math.sin(sho) * 8, ey = sy + Math.cos(sho) * 8;
      const hx2 = ex + Math.sin(sho + elb) * 7.5, hy2 = ey + Math.cos(sho + elb) * 7.5;
      o.lineWidth = front ? 4 : 3.5;
      o.beginPath(); o.moveTo(sx, sy); o.lineTo(ex, ey); o.lineTo(hx2, hy2); o.stroke();
    };

    arm(p.shoB, p.elbB, false);
    leg(p.hipB, p.kneeB, false);

    // dress / torso: tapered flowing shape
    const sway = clamp(char.vx / 340, -1, 1) * 4 + Math.sin(t * 3.1) * 0.8 * (1 - p.sf);
    o.beginPath();
    o.moveTo(-3.4, neckY - 1);
    o.bezierCurveTo(-5.5, neckY + 6, -6.5 - sway * 0.4, hipY + 2, -7.5 - sway, hipY + 9 + p.af * -3);
    o.quadraticCurveTo(-sway * 1.4, hipY + 12, 7.5 - sway * 0.4, hipY + 9 + p.af * -3);
    o.bezierCurveTo(6.5 - sway * 0.2, hipY + 2, 5.5, neckY + 6, 3.4, neckY - 1);
    o.closePath(); o.fill();
    o.lineWidth = 6.5;
    o.beginPath(); o.moveTo(0, neckY); o.lineTo(0, hipY + 2); o.stroke();

    leg(p.hipF, p.kneeF, true);

    // head
    o.beginPath(); o.arc(0.6, headY, 6.1, 0, 7); o.fill();

    arm(p.shoF, p.elbF, true);

    /* ---- rim crescent: colored silhouette minus mask shifted away from light ---- */
    const r = this.rc.getContext('2d');
    r.setTransform(this.S, 0, 0, this.S, 0, 0);
    r.clearRect(0, 0, 160, 160);
    r.globalCompositeOperation = 'source-over';
    r.drawImage(this.oc, 0, 0, 160, 160);
    r.globalCompositeOperation = 'source-in';
    r.fillStyle = rim.color;
    r.fillRect(0, 0, 160, 160);
    r.globalCompositeOperation = 'destination-out';
    const away = 2.6;   // px shift opposite the light -> leaves lit edge on light side
    // mask is baked in local space (facing +x); mirror world rim dir when facing left
    const rdx = rim.dx * (char.facing >= 0 ? 1 : -1);
    r.drawImage(this.oc, -rdx * away, -rim.dy * away, 160, 160);

    /* ---- composite into world ---- */
    ctx.save();
    ctx.translate(char.x, char.y);

    // soft aura behind figure
    const { r: rr, g: rg, b: rb } = hexToRgb(rim.color);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(0, -24, 0, 0, -24, 58);
    ag.addColorStop(0, `rgba(${rr},${rg},${rb},0.10)`);
    ag.addColorStop(1, `rgba(${rr},${rg},${rb},0)`);
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(0, -24, 58, 0, 7); ctx.fill();
    ctx.restore();

    // scarf ribbon (behind body, world coords)
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    const sc = char.scarf;
    for (let i = 0; i < sc.length - 1; i++) {
      const wdt = 5.2 * (1 - i / sc.length) + 0.7;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(sc[i].x - char.x, sc[i].y - char.y);
      ctx.lineTo(sc[i + 1].x - char.x, sc[i + 1].y - char.y);
      ctx.stroke();
    }
    ctx.restore();

    // body with squash & stretch about feet, mirrored by facing
    ctx.scale(char.facing * p.scaleX, p.scaleY);
    ctx.drawImage(this.oc, -80, -118, 160, 160);
    // rim on top, slightly additive
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.35 + rim.strength * 0.65, 0, 1);
    ctx.drawImage(this.rc, -80, -118, 160, 160);
    ctx.restore();

    ctx.restore();
  }
}
