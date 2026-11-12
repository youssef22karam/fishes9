// Real fin geometry: spines (tapered, bowed, socketed), serrations, dermal spines, the stingray barb,
// the heterocercal vertebral lobe and the hypural-fan layout of the caudal fin.
// Everything is appended to the generator's own fin accumulator so it shares the fin shader,
// the body wave, the joints and the pattern/pigment lookup of the fin it belongs to.
import { LIMITS, DEG, clamp, lerp } from './plan.js';
const TAU = Math.PI * 2;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const vec = { sub, add, dot, cross, len, norm };
const skinW = (theta) => ((theta + Math.PI / 2) / TAU + 1) % 1;
// push one vertex with the full fin attribute set; returns its index
function pushV(acc, p, a) {
  acc.pos.push(p.x, p.y, p.z);
  acc.fin.push(a.fin[0], a.fin[1], a.fin[2], a.fin[3]);
  acc.fin2.push(a.fin2[0], a.fin2[1], a.fin2[2], a.fin2[3]);
  acc.skin.push(a.skin[0], a.skin[1], a.skin[2], a.skin[3]);
  acc.base.push(a.base.x, a.base.y, a.base.z);
  const h = a.hinge || [0, 0, 0, 0], ax = a.axis || [0, 0, 0];
  acc.hinge.push(h[0], h[1], h[2], h[3]); acc.axis.push(ax[0], ax[1], ax[2]);
  return acc.nv++;
}
// lofted tube through rings [{c, ru, rv, attr, flute?}], cross-section spanned by unit vectors U, V
function tube(acc, rings, sides, U, V) {
  const start = [];
  for (const r of rings) {
    start.push(acc.nv);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU, fl = r.flute && k % 2 ? r.flute : 1;
      pushV(acc, { x: r.c.x + (U.x * Math.cos(a) * r.ru + V.x * Math.sin(a) * r.rv) * fl, y: r.c.y + (U.y * Math.cos(a) * r.ru + V.y * Math.sin(a) * r.rv) * fl, z: r.c.z + (U.z * Math.cos(a) * r.ru + V.z * Math.sin(a) * r.rv) * fl }, r.attr);
    }
  }
  let tris = 0;
  for (let j = 0; j + 1 < rings.length; j++) for (let k = 0; k < sides; k++) {
    const a = start[j] + k, b = start[j] + ((k + 1) % sides), c = start[j + 1] + k, d = start[j + 1] + ((k + 1) % sides);
    acc.idx.push(a, c, b, b, c, d); tris += 2;
  }
  return tris;
}
const LEVEL = {
  hero: { sides: 5, path: [0.4, 0.75, 1], collar: true, serr: 6 },
  lean: { sides: 4, path: [0.55, 1], collar: false, serr: 0 },
  lod: { sides: 3, path: [1], collar: false, serr: 0 },
};
const PART = { acanth: 1, chond: 1, trigger: 1, venom: 3, catfish: 4, barb: 4, dermal: 5 };
// One spine. o: { B (skin point), d (unit direction), bend (unit, toward the tail, perpendicular to d), length, r0, taper, curve,
//                 type, sink, attr(lenT, part) -> attribute record, flat: [ru, rv] cross-section scale, serrate: 0|1|2 sides }
export function emitSpine(acc, kit, o) {
  const lv = LEVEL[kit.level] || LEVEL.hero, T = o.length, part = PART[o.type] || 1;
  const d = o.d, helper = Math.abs(d.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const U = norm(cross(d, helper)), V = norm(cross(U, d));
  const at = (s) => add(add(o.B, d, T * s), o.bend, T * o.curve * s * Math.max(0, s));
  const rad = (s) => o.r0 * (1 - (1 - o.taper) * Math.pow(clamp(s, 0, 1), 1.25));
  const fl = o.flat || [1, 1], sides = o.type === 'venom' && kit.level === 'hero' ? 6 : lv.sides;
  const flute = o.type === 'venom' && kit.level === 'hero' ? 0.62 : 0;     // venom spine: fluted section = anterolateral grooves
  const s0 = -Math.min(o.sink || 0, 0.3 * T) / T;
  const rings = [{ c: at(s0), ru: rad(0) * fl[0], rv: rad(0) * fl[1], attr: o.attr(0, part), flute }];
  for (const s of lv.path) rings.push({ c: at(s), ru: rad(s) * fl[0], rv: rad(s) * fl[1], attr: o.attr(s, part), flute: s < 1 ? flute : 0 });
  let tris = tube(acc, rings, sides, U, V);
  if (lv.collar && o.socket !== false) {                                      // fleshy socket / sheath collar at the skin line
    tris += tube(acc, [{ c: at(s0 * 0.5), ru: o.r0 * 2.0 * fl[0], rv: o.r0 * 2.0 * fl[1], attr: o.attr(0, 2) }, { c: at(0.085), ru: o.r0 * 1.22 * fl[0], rv: o.r0 * 1.22 * fl[1], attr: o.attr(0.085, 2) }], sides, U, V);
  }
  if (lv.serr && o.serrate) {                                                 // retrorse serrations (catfish spines, stingray barb)
    const dirs = o.serrate === 2 ? [V, { x: -V.x, y: -V.y, z: -V.z }] : [o.bend];
    for (const sd of dirs) for (let j = 0; j < lv.serr; j++) {
      const s = 0.3 + (0.62 * j) / lv.serr, ds = 0.5 / lv.serr, tl = rad(s) * 1.5 + T * 0.012, rr = rad(s) * (o.serrate === 2 ? fl[1] : 1) * 0.85;
      const a = pushV(acc, add(at(s), sd, rr), o.attr(s, part)), b = pushV(acc, add(at(s + ds), sd, rr * 0.9), o.attr(s + ds, part));
      const c = pushV(acc, add(add(at(s + ds * 0.15), sd, rr + tl), d, -tl * 0.7), o.attr(s, part));
      acc.idx.push(a, b, c); tris++;
    }
  }
  const tip = at(1);
  kit.spines.push({ fin: o.fin, type: o.type, len: T, r0: o.r0, rTip: rad(1), base: [o.B.x, o.B.y, o.B.z], mid: (() => { const m = at(0.55); return [m.x, m.y, m.z]; })(), tip: [tip.x, tip.y, tip.z], hMax: o.hMax || 0, free: !!o.free });
  kit.extraTris += tris;
  return tris;
}
// Spines of a fin sheet. Called from the accumulator right after the membrane grid of that fin was built,
// with the very same base()/edge()/root() closures, so spine and membrane can never drift apart.
export function emitFinSpines(acc, e, kit) {
  const sp = e.spinePlan; if (!sp || !sp.items.length) return;
  const V3 = kit.ctx.THREE.Vector3, B = new V3(), E = new V3(), Rt = new V3(), bm = e.bm, L = bm.L, fr = {};
  const cols = sp.items.map((it) => { e.base(it.b, B); e.edge(it.b, E); e.root(it.b, 1, Rt); const dv = sub(E, B); return { it, B: { x: B.x, y: B.y, z: B.z }, dv, h: len(dv), u: Rt.u, theta: Rt.theta }; });
  let hMax = cols.reduce((m, c) => Math.max(m, c.h), 0);
  if (hMax < 1e-6 * L) {   /* ADAPTATION: a lone spine on a zero-height leading edge (the source shape functions are 0 at t=0, so base == edge there) — stand it on the surface normal instead of dropping it */
    const fr2 = {}; for (const c of cols) { if (e.fallbackDir) { c.dv = { x: e.fallbackDir.x * 0.06 * L, y: e.fallbackDir.y * 0.06 * L, z: e.fallbackDir.z * 0.06 * L }; } else { bm.frame(clamp(c.u == null ? 0.5 : c.u, 0.005, 0.999), fr2); const sd = e.side || 1; c.dv = { x: fr2.nx * sd * 0.06 * L, y: fr2.ny * sd * 0.06 * L, z: 0 }; } c.h = 0.06 * L; } hMax = 0.06 * L;
  }
  const P = kit.plan.spine;
  cols.forEach((c, i) => {
    let dv = c.dv;
    if (c.h < 0.05 * hMax) { const nb = cols.slice(i + 1).find((q) => q.h > 0.05 * hMax) || cols.slice(0, i).reverse().find((q) => q.h > 0.05 * hMax); dv = nb ? nb.dv : dv; }
    const d = norm(dv);
    bm.frame(clamp(c.u == null ? 0.5 : c.u, 0.005, 0.999), fr);
    let bend = { x: fr.tx, y: fr.ty, z: 0 }; bend = sub(bend, { x: d.x * dot(bend, d), y: d.y * dot(bend, d), z: d.z * dot(bend, d) }); bend = len(bend) > 1e-6 ? norm(bend) : { x: 0, y: 0, z: 0 };
    const free = c.h < 0.32 * hMax;
    let T = Math.max(c.h, 0.32 * hMax) * (1 + P.tipExcess) * (c.it.scale || 1);
    T = clamp(T, LIMITS.spineLenL[0] * L, Math.min(LIMITS.spineLenL[1] * L, hMax * LIMITS.spineOverMembrane));
    const r0 = clamp(T * P.rel * (c.it.stout || 1), LIMITS.spineBaseL[0] * L, LIMITS.spineBaseL[1] * L);
    const w = skinW(c.theta || 0), type = c.it.type || P.type;
    emitSpine(acc, kit, {
      fin: e.cfgName || e.kind, type, B: c.B, d, bend, length: T, r0, taper: clamp(P.taper, LIMITS.spineTaper[0], LIMITS.spineTaper[1]), curve: P.curve * (type === 'trigger' ? 0.3 : 1), sink: e.sink || 0.004 * L, hMax, free,
      serrate: type === 'catfish' ? 1 : 0,
      attr: (s, part) => ({ fin: [c.it.b, clamp(s, 0, 1), (e.flex || 0) * 0.12, e.kindId], fin2: [1, 2, e.spineFrac || 0, e.physicalR || e.R], skin: [c.u || 0, w, 0, part], base: c.B, hinge: e.hinge ? [e.hinge.x, e.hinge.y, e.hinge.z, e.hinge.sg] : null, axis: e.hinge ? [e.hinge.ax, e.hinge.ay, e.hinge.az] : [e.fold || 0, 0, 0] }),
    });
  });
}
// Erectile dermal spines (puffer / porcupinefish lineage, or any genome with an inflatable skin). Mirrored left/right.
export function emitDermalSpines(acc, bm, kit) {
  const D = kit.plan.dermal; if (!D || kit.level === 'lod') return 0;
  const n = Math.round(clamp(D.count, LIMITS.dermalSpines[0], LIMITS.dermalSpines[1]) * (kit.level === 'lean' ? 0.45 : 1) / 2);
  const V3 = kit.ctx.THREE.Vector3, S = {}, N = new V3(), fr = {}, L = bm.L, r = kit.rand;
  const rows = Math.max(3, Math.round(Math.sqrt(n / 2.2))), per = Math.ceil(n / rows);
  let made = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < per; j++) {
    const theta = lerp(-Math.PI / 2 + 0.22, Math.PI / 2 - 0.22, (i + 0.5 + (r.next() - 0.5) * 0.6) / rows);
    const u = lerp(0.2, 0.86, (j + (i % 2) * 0.5 + (r.next() - 0.5) * 0.5 + 0.25) / per);
    if (u < 0.18 || u > 0.9) continue;
    const T = L * D.len * (0.7 + 0.6 * r.next()), lean = 52 * DEG;
    for (const side of [1, -1]) {
      const th = side > 0 ? theta : Math.PI - theta;
      bm.surface(u, th, S); bm.surfaceNormal(u, th, N); bm.frame(u, fr);
      const nn = norm({ x: N.x, y: N.y, z: N.z }), t = { x: fr.tx, y: fr.ty, z: 0 };
      const d = norm(add({ x: nn.x * Math.cos(lean), y: nn.y * Math.cos(lean), z: nn.z * Math.cos(lean) }, t, Math.sin(lean)));
      const Bp = { x: S.x, y: S.y, z: S.z }, w = skinW(th);
      emitSpine(acc, kit, { fin: 'dermal', type: 'dermal', B: Bp, d, bend: { x: 0, y: 0, z: 0 }, length: T, r0: Math.max(T * 0.085, LIMITS.spineBaseL[0] * L), taper: 0.06, curve: 0, sink: 0.004 * L, socket: false, free: true,
        attr: (s, part) => ({ fin: [0, clamp(s, 0, 1), 0, 8], fin2: [1, 2, 0, 2], skin: [u, w, 0, part], base: Bp }) });
      made++;
    }
  }
  return made;
}
// Serrated caudal barb on the dorsal midline of a whip tail (stingray lineage).
export function emitCaudalBarb(acc, bm, kit) {
  const Bp = kit.plan.barb; if (!Bp) return false;
  const L = bm.L, S = {}, fr = {}, lm = bm.lm || {};
  const start = bm.disc && bm.disc.dEnd > 0.3 && bm.disc.dEnd < 0.9 ? bm.disc.dEnd : lm.peduncleStart || 0.7;
  const u = clamp(start + 0.07, 0.5, 0.9);
  bm.surface(u, Math.PI / 2, S); bm.frame(u, fr);
  const t = { x: fr.tx, y: fr.ty, z: 0 }, n = { x: fr.nx, y: fr.ny, z: 0 }, a = 13 * DEG;
  const d = norm(add({ x: t.x * Math.cos(a), y: t.y * Math.cos(a), z: 0 }, n, Math.sin(a)));
  const T = Math.min(clamp(Bp.len, LIMITS.barbLenL[0], LIMITS.barbLenL[1]) * L, (1 - u) * L * 0.7);
  const B = { x: S.x, y: S.y, z: S.z };
  emitSpine(acc, kit, { fin: 'barb', type: 'barb', B, d, bend: { x: -n.x, y: -n.y, z: 0 }, length: T, r0: Math.max(T * 0.06, LIMITS.spineBaseL[0] * L), taper: 0.08, curve: 0.02, sink: 0.004 * L, flat: [0.45, 1.5], serrate: 2, free: true,
    attr: (s, part) => ({ fin: [0, clamp(s, 0, 1), 0, 8], fin2: [1, 2, 0, 2], skin: [u, 0.5, 0, part], base: B }) });
  return true;
}
// ---- caudal fin: hypural fan ---------------------------------------------------------------------------
// The old builder ran every "ray" parallel to the body axis (a flat cut-out with horizontal lines).
// Here the same outline is re-parameterised so that the principal rays radiate from the hypural plate at
// the end of the peduncle and short procurrent rays fill the leading edges. In a heterocercal tail the
// upper rays hang from the upturned vertebral axis instead. The trailing-edge outline (and therefore every
// existing tail law: span, aspect, lobe ratio, pitch, area cap) is untouched.
// o: { cols0, T(ue), Rp(ue), U(ue), D, H:{u,l}, sec:{dUp,dDn}, fr (frame at the fin root), hetero, surf(y, side, out), zOff, level }
export function caudalFan(o) {
  const pc = o.level === 'lod' ? 1 : 3, cols = o.cols0 + 2 * pc, last = cols - 1, hy = 0.86;
  const { dUp, dDn } = o.sec, fr = o.fr;
  const tipU = { x: o.D * o.Rp(1), y: o.T(1) };
  const ax0 = { x: 0, y: dUp * 0.15 }, ax1 = o.hetero ? { x: tipU.x * 0.84, y: ax0.y + (tipU.y - ax0.y) * 0.84 } : null, sh = 0.4;
  const zone = (b) => { const M = Math.round(b * last); return M < pc ? { z: -1, tau: 1 - M / pc } : M > last - pc ? { z: 1, tau: (M - (last - pc)) / pc } : { z: 0, s: (M - pc) / (last - 2 * pc) }; };
  const onAxis = (q) => ({ x: lerp(ax0.x, ax1.x, q), y: lerp(ax0.y, ax1.y, q), att: q <= 1e-6 });
  const basePt = (b) => {
    const zn = zone(b);
    if (zn.z === 0) { if (!ax1) return { x: 0, y: lerp(-dDn * hy, dUp * hy, zn.s), att: true }; return zn.s <= sh ? { x: 0, y: lerp(-dDn * hy, ax0.y, zn.s / sh), att: true } : onAxis((zn.s - sh) / (1 - sh)); }
    if (zn.z < 0) return { x: 0, y: -lerp(hy, 1, zn.tau) * dDn, att: true };
    return ax1 ? onAxis(1 - zn.tau) : { x: 0, y: lerp(hy, 1, zn.tau) * dUp, att: true };
  };
  const edgePt = (b) => {
    const zn = zone(b);
    if (zn.z === 0) return { x: o.D * o.Rp(zn.s), y: o.T(zn.s) };
    const H = zn.z < 0 ? o.H.l : o.H.u, d = zn.z < 0 ? dDn : dUp, yy = lerp(H, Math.min(d, H), Math.pow(zn.tau, 0.8)), ue = (zn.z * yy / Math.max(1e-9, H) + 1) / 2;
    return { x: o.D * o.U(ue), y: o.T(ue) };
  };
  const world = (p, out, z) => out.set(fr.px + fr.tx * p.x + fr.nx * p.y, fr.py + fr.ty * p.x + fr.ny * p.y, z || 0);
  const tmpA = {}, tmpB = {};
  return {
    cols, pc, axis: ax1 ? { a0: ax0, a1: ax1 } : null,
    attached: (b) => basePt(b).att,
    root: (b, side, out) => { const p = basePt(b); if (p.att) o.surf(p.y, side, out); else { world(p, out, side * o.zOff); out.u = 0.988; out.theta = side > 0 ? Math.PI / 2 : Math.PI / 2; } },
    base: (b, out) => { const p = basePt(b); if (p.att) { o.surf(p.y, 1, tmpA); o.surf(p.y, -1, tmpB); out.set((tmpA.x + tmpB.x) / 2, (tmpA.y + tmpB.y) / 2, (tmpA.z + tmpB.z) / 2); } else world(p, out, 0); },
    edge: (b, out) => world(edgePt(b), out, 0),
    principal: (tips) => tips.slice(pc, tips.length - pc),
    world,
  };
}
// Fleshy, tapering vertebral lobe of a heterocercal tail (the column turns up into the upper lobe; the rays hang below it).
export function emitHeteroAxis(acc, bm, kit, fan, o) {
  if (!fan.axis || kit.level === 'lod') return 0;
  const sides = kit.level === 'hero' ? 8 : 5, segs = kit.level === 'hero' ? 5 : 3, V3 = kit.ctx.THREE.Vector3, P = new V3();
  const a0 = fan.axis.a0, a1 = fan.axis.a1, dir = norm({ x: a1.x - a0.x, y: a1.y - a0.y, z: 0 });
  const fr = o.fr, Ud = { x: fr.tx * -dir.y + fr.nx * dir.x, y: fr.ty * -dir.y + fr.ny * dir.x, z: 0 }, Vd = { x: 0, y: 0, z: 1 };
  const base = new V3(); fan.world({ x: 0, y: a0.y }, base, 0);
  const rings = [];
  for (let j = 0; j <= segs; j++) {
    const q = j / segs, s = -0.06 + 1.06 * q; fan.world({ x: lerp(a0.x, a1.x, s), y: lerp(a0.y, a1.y, s) }, P, 0);
    const k = Math.pow(1 - q, 0.85);
    rings.push({ c: { x: P.x, y: P.y, z: P.z }, ru: Math.max(o.rv * 0.9 * k, bm.L * 0.0012), rv: Math.max(o.rl * 0.95 * k, bm.L * 0.001), attr: { fin: [1, clamp(s, 0, 1) * 0.85, o.flex, 5], fin2: [1, 2, 0, 2], skin: [0.988, 0.5, 1, 0], base: { x: base.x, y: base.y, z: base.z } } });
  }
  const tris = tube(acc, rings, sides, Ud, Vd); kit.extraTris += tris; kit.heteroAxis = true; return tris;
}
