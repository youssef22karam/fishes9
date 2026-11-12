// FinKit: fin / tail / spine anatomy, joints and ray-aware patterns for the procedural fish generator.
// Bundled as an IIFE (global `FinKit`) and called from a handful of hooks in the recovered generator
// source (tools/fin-hooks.mjs lists every hook). Global, seeded, parameter driven: no species ids.
import { LIMITS, DEG, makePlan, planProblems, rng, clamp } from './plan.js';
import * as G from './geometry.js';
import * as J from './joints.js';
import { glsl } from './glsl.js';
import { audit } from './audit.js';
export { LIMITS, glsl, audit };
let THREE = null;
export function setup(o) { THREE = o.THREE; }
export const HERO_BUDGET = 40000;
export function level(detail, opts) { return !detail ? 'lod' : (opts && (opts.finLean || opts.quality === 'med')) ? 'lean' : 'hero'; }
/* ADAPTATION (fishes8 source): the source BodyModel has no depthInside(). This factory adapts the
   checker's own inBody logic (frame + section + halfWidthAtY): signed depth of a point, positive
   when inside the body wall, reduced by the tangential distance from the nearest frame station. */
export function depthInsideFor(bm) {
  const fr = {}, s = {};
  return (p) => {
    const cand = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24; bm.frame(u, fr); const dx = p.x - fr.px, dy = p.y - fr.py; cand.push([dx * dx + dy * dy, u]); }
    cand.sort((a, b) => a[0] - b[0]);
    let best = -Infinity;
    for (const [d2, u] of cand.slice(0, 3)) {   /* a loft: inside any bracketing cross-section's prism counts as inside */
      bm.frame(u, fr); bm.section(u, s);
      const ly = (p.x - fr.px) * fr.nx + (p.y - fr.py) * fr.ny;
      const hw = bm.halfWidthAtY(s, clamp(ly, -s.dDn * .99, s.dUp * .99));
      const tang = Math.sqrt(Math.max(0, d2 - ly * ly));
      const d = Math.min(hw - Math.abs(p.z), Math.min(s.dUp - ly, ly + s.dDn)) - Math.max(0, tang - 0.03 * bm.L) * 0.5;   /* soft tangential falloff: only far beyond the ends is a point truly outside */
      if (d > best) best = d;
    }
    return best;
  };
}
export function begin(bm, genome, ctx) {
  if (ctx.THREE) THREE = ctx.THREE;
  if (!ctx.depthInside) ctx.depthInside = depthInsideFor(bm);   /* ADAPTATION: source has no depthInside */
  bm.finKit = { level: ctx.level, ctx, plan: makePlan(genome, bm, ctx.cladeIds), spines: [], joints: {}, median: [], fins: {}, extraTris: 0, caudal: null, heteroAxis: false, rand: rng(String(genome.meta.seed) + '|fin-geometry') };
  return bm.finKit;
}
const expect = (kit, name, n) => { (kit.fins[name] = kit.fins[name] || { expected: 0 }).expected += n; };
// column layout: `m` mesh columns per ray interval so that every ray sits exactly on a mesh column
function columns(rays, minCols, maxCols) {
  const iv = Math.max(1, rays - 1); let m = Math.max(1, Math.ceil((minCols - 1) / iv));
  while (m > 1 && m * iv + 1 > maxCols) m--;
  return { m, cols: m * iv + 1 };
}
// ---- median fins (dorsal, anal, finlets, adipose) ---------------------------------------------------
export function median(bm, t, o) {
  const kit = bm.finKit; if (!kit) return o;
  const plan = kit.plan, name = t.cfg || t.kind, gf = (bm.g.fins && bm.g.fins[name]) || {}, hero = kit.level === 'hero', lod = kit.level === 'lod';
  o.cfgName = name;
  if (t.kind === 'adipose') { o.fleshyAt = () => 1; o.thickness *= 2.4; o.physicalR = 2; o.flex = Math.min(o.flex, 0.05); return o; }   // fleshy lobe, no rays
  if (t.kind === 'finlet') return o;
  const old = o.R;
  let S = 0, N = 0;
  if (t.spineFrac > 0) {
    if (bm.a.separatedDorsal && t.kind === 'dorsal' && !t.cfg && t.rays === 5) { S = 1; N = 4; }
    else { S = clamp(gf.spines | 0, 0, LIMITS.spineCount[1]); N = Math.max(1, gf.rays | 0); }
  }
  const lead = ['triangle', 'falcate'].includes(t.shape), type = plan.spine.type, feature = ['catfish', 'trigger', 'chond'].includes(type);
  if (S > 0 && !lod) {
    const R = S + N, c = columns(R, old, Math.max(old, 61));      // physical ray count = genome spines + rays, so exactly S spiny rays exist
    o.physicalR = R; o.spineFrac = S / R; o.R = c.cols;
    if (hero && c.m >= 2) o.ridge = (M) => { const q = 0.5 + 0.5 * Math.cos((2 * Math.PI * (M % c.m)) / c.m); return 0.55 + 0.95 * q * q; };
    const items = [];
    for (let k = 0; k < S; k++) {
      const it = { b: k / (R - 1), type };
      if (lead && it.b < 0.02) { it.b = 0; it.toward = gf.apex || 0.36; it.scale = 0.97; }        // first spine of a pointed fin is its leading edge
      if (type === 'trigger') { it.scale = [1, 0.5, 0.26][Math.min(k, 2)]; it.stout = [2.1, 1.3, 1][Math.min(k, 2)]; }   // locking spine + trigger
      else if (type === 'catfish') it.stout = 1.7;
      else if (type === 'chond') it.stout = 1.8;
      items.push(it);
    }
    o.spinePlan = { items }; expect(kit, name, items.length);
    o.flexAt = (b) => (b <= S / R ? o.flex * 0.15 : o.flex);       // the spiny part is stiff, the soft part behind it flexes
  } else if (S > 0 && lod && feature) {                            // lowest LOD: only silhouette-defining spines, 3-sided
    const items = []; for (let k = 0; k < Math.min(S, 2); k++) items.push({ b: lead && k === 0 ? 0 : k / Math.max(1, S + N - 1), toward: lead && k === 0 ? gf.apex || 0.36 : undefined, scale: lead && k === 0 ? 0.97 : type === 'trigger' ? [1, 0.5][k] : 1, stout: 1.8, type });
    o.spinePlan = { items }; expect(kit, name, items.length);
  } else if (!lod && hero && !S) {
    const rays = o.physicalR || o.R, c = columns(rays, old, Math.max(old, 61));
    if (c.m >= 2 && rays >= 4) { o.R = c.cols; o.ridge = (M) => { const q = 0.5 + 0.5 * Math.cos((2 * Math.PI * (M % c.m)) / c.m); return 0.55 + 0.95 * q * q; }; }
  }
  if (plan.cartilaginous) o.fleshyAt = () => 1;                    // ceratotrichia are buried: fins are skin-covered, no visible rays
  else if (plan.softRays === 'lobed' && name !== 'dorsal') o.fleshyAt = (b, r) => (r < 0.42 ? 1 : 0);   // lobed fin: fleshy stalk, fringe of rays
  o.side = t.side;   /* ADAPTATION: emitFinSpines needs the fin side for its zero-height fallback */
  o.fold = J.medianFold(bm, kit, t, { base: o.base, edge: o.edge });
  kit.extraTris += Math.max(0, o.R - old) * o.K * 4;
  return o;
}
// ---- paired fins (pectoral, pelvic) -------------------------------------------------------------------
export function paired(bm, kind, side, o) {
  const kit = bm.finKit; if (!kit) return o;
  const plan = kit.plan, tmp = new THREE.Vector3(), lod = kit.level === 'lod';
  const normal = (w, out) => { o.root(w, 0, tmp); bm.surfaceNormal(tmp.u, tmp.theta, out); };
  const h = J.pairedHinge(bm, kit, kind, side, { base: o.base, edge: o.edge, normal });
  o.hinge = h; o.cfgName = kind; o.side = side;
  { const B5 = new THREE.Vector3(), E5 = new THREE.Vector3(); o.base(0.5, B5); o.edge(0.5, E5); const dv = { x: E5.x - B5.x, y: E5.y - B5.y, z: E5.z - B5.z }, dl = Math.hypot(dv.x, dv.y, dv.z); o.fallbackDir = dl > 1e-9 ? { x: dv.x / dl, y: dv.y / dl, z: dv.z / dl } : null; }   /* ADAPTATION: a spine on a zero-height fin edge stands along the fin's own mid direction (the body-frame normal points into the belly for pelvic fins) */
  if (h.n && Number.isFinite(h.n.x + h.n.y + h.n.z) && Math.hypot(h.n.x, h.n.y, h.n.z) > 0.5) o.normal = new THREE.Vector3(h.n.x, h.n.y, h.n.z);   // real plate normal: the fin gets true thickness
  if (kind === 'pectoral' && plan.pectoralSpine) { o.spinePlan = { items: [{ b: 0, type: 'catfish', stout: 1.8 }] }; expect(kit, kind, 1); }
  else if (kind === 'pelvic' && plan.pelvicSpine && !lod) { o.spinePlan = { items: [{ b: 0, toward: 0.3, scale: 0.9, type: plan.spine.type === 'trigger' ? 'acanth' : plan.spine.type }] }; expect(kit, kind, 1); }
  if (plan.cartilaginous) o.fleshyAt = () => 1;
  else if (plan.softRays === 'lobed' || plan.softRays === 'lobedPaired') o.fleshyAt = (b, r) => (r < 0.45 ? 1 : 0);
  return o;
}
/* ADAPTATION (fishes8 port): medianFold searches the fold limit on the base/edge closures, but the
   built sheet's vertices sit offset from that line (collar, thickness, sink). After the sheet exists,
   re-run the audit's own posed check on the real vertices and scale the written fold limit down
   until it passes — the same search-against-the-body method Fable used for the paired fins. */
export function medianVerify(acc, bm, e, v0) {
  const kit = bm.finKit; if (!kit || !e.fold) return;
  const rec = kit.median[kit.median.length - 1]; if (!rec || rec.cfg !== (e.cfgName || e.kind)) return;
  const L = bm.L, tol = LIMITS.penetrationTolL * L * 1.5, depth = kit.ctx.depthInside, fold = e.fold, S = [];
  for (let i = v0; i < acc.nv; i++) { const lt = acc.fin[i * 4 + 1]; if (lt > 0.3) S.push(i); }
  const wMed = J.weights.median;
  const ok = (sc) => S.every((i) => { const lt = acc.fin[i * 4 + 1], a = fold * sc * wMed(lt), c = Math.cos(a), sn = Math.sin(a), bx = acc.base[i * 3], by = acc.base[i * 3 + 1], x = acc.pos[i * 3] - bx, y = acc.pos[i * 3 + 1] - by; return depth({ x: bx + x * c - y * sn, y: by + x * sn + y * c, z: acc.pos[i * 3 + 2] }) <= tol; });
  let sc = 1; while (sc > 0 && !ok(sc)) sc = Math.round((sc - 0.1) * 10) / 10;
  if (sc < 1) { for (let i = v0; i < acc.nv; i++) if (acc.axis[i * 3] === fold) acc.axis[i * 3] = fold * sc; rec.foldDeg *= sc; e.fold = fold * sc; }
}
export function pairedDone(acc, bm, kind, side, v0) {
  const kit = bm.finKit; if (!kit) return;
  J.pairedLimits(acc, bm, kit, kind, side, v0, acc.nv); sync(bm);
}
export function spines(acc, e) { const kit = e.bm && e.bm.finKit; if (kit) G.emitFinSpines(acc, e, kit); }
// ---- caudal fin ---------------------------------------------------------------------------------------
export function caudal(bm, o) {
  const kit = bm.finKit, fan = G.caudalFan(Object.assign({ level: kit ? kit.level : 'hero' }, o));
  if (kit) kit.caudal = { cols: fan.cols, pc: fan.pc, hetero: !!fan.axis };
  return fan;
}
export function caudalOpts(bm, o) {
  const kit = bm.finKit; if (!kit) return o;
  o.cfgName = 'caudal';
  if (kit.plan.cartilaginous) o.fleshyAt = () => 1;
  else if (kit.plan.softRays === 'lobed') o.fleshyAt = (b, r) => (r < 0.3 && Math.abs(b - 0.5) < 0.2 ? 1 : 0);
  if (kit.caudal) kit.extraTris += 2 * kit.caudal.pc * o.K * 4;   /* ADAPTATION: no fan in this source build (see CHANGES.md) */
  return o;
}
export function caudalDone(acc, bm, fan, o) { return bm.finKit ? G.emitHeteroAxis(acc, bm, bm.finKit, fan, o) : 0; }
// ---- whole fish ---------------------------------------------------------------------------------------
export function finish(acc, bm) {
  const kit = bm.finKit; if (!kit) return;
  const n = G.emitDermalSpines(acc, bm, kit); if (n) expect(kit, 'dermal', n);
  if (G.emitCaudalBarb(acc, bm, kit)) expect(kit, 'barb', 1);
  sync(bm);
}
export function shouldLean(bm, info, opts) { const kit = bm.finKit; return !!kit && kit.level === 'hero' && !(opts && opts.finLean) && info.tris > HERO_BUDGET && kit.extraTris > 0; }
export function uniforms(bm) {
  const kit = bm.finKit, V4 = THREE.Vector4;
  if (!kit) return { uFinPose: { value: new V4(0, 0, 0.06, 1) }, uJointLim: { value: new V4(5 * DEG, 12 * DEG, 0, 0) }, uFinRip: { value: new V4(0, 0, 2, 1) }, uFinPatA: { value: new V4(0, 4, 0, 0.3) }, uFinPatB: { value: new V4(0, 0, 0, 0) }, uFinOcel: { value: new V4(0.7, 0.4, 0.15, 1) }, uFinAnat: { value: new V4(0.3, 0.5, 0, 16) } };
  const P = kit.plan, p = P.pattern;
  bm._finU = {
    uFinPose: { value: new V4(0, 0, P.lagCycles, 1) },
    uJointLim: { value: new V4(...J.jointUniformValues(bm, kit)) },
    uFinRip: { value: new V4(...P.ripple) },
    uFinPatA: { value: new V4(p.typeId, p.freq, p.strength, p.carry) },
    uFinPatB: { value: new V4(p.margin, p.tone, p.lead, p.ocel.kind) },
    uFinOcel: { value: new V4(p.ocel.rayT, p.ocel.lenT, p.ocel.r, p.ocel.ring) },
    uFinAnat: { value: new V4(P.spine.incision, P.ragged, kit.level === 'lod' ? 0 : 1, P.segments) },
  };
  return bm._finU;
}
function sync(bm) { if (bm._finU && bm.finKit) bm._finU.uJointLim.value.set(...J.jointUniformValues(bm, bm.finKit)); }
export function frame(fish, pose, state) { J.framePose(fish, pose, state); }
export function info(bm) {
  const kit = bm.finKit; if (!kit) return null;
  const R2D = 180 / Math.PI, pec = kit.joints.pectoral, pel = kit.joints.pelvic, lawPec = bm.law && bm.law.pec, P = kit.plan;
  const stats = { extraTris: kit.extraTris, spines: kit.spines.length };
  if (pec) {
    stats.pecLenOverL = pec.lenOverL; stats.pecBuiltAbdDeg = pec.builtAbd * R2D; if (pec.foldMin != null) stats.pecFoldMinDeg = pec.foldMin * R2D;
    if (lawPec && lawPec.lo != null) stats.pecOutsideOldLengthBand = pec.lenOverL < lawPec.lo - 0.004 || pec.lenOverL > lawPec.hi + 0.004 ? 1 : 0;   // dormant old law, measured only
  }
  if (pel) stats.pelvFoldDeg = (pel.foldMax || 0) * R2D;
  if (kit.median.length) stats.medianFoldDeg = Math.max(...kit.median.map((m) => m.foldDeg));
  const built = {}; for (const s of kit.spines) built[s.fin] = (built[s.fin] || 0) + 1;
  const slim = (j) => j && { hinge: j.hinge, axis: j.axis, sinkOverL: j.sinkOverL, builtAbd: j.builtAbd, lenOverL: j.lenOverL, mirrored: j.mirrored, foldMin: j.foldMin, restAbd: j.restAbd, foldMax: j.foldMax, flareMax: j.flareMax };
  return {
    level: kit.level, extraTris: kit.extraTris, stats, expected: kit.fins, built, spines: kit.spines, joints: { pectoral: slim(pec), pelvic: slim(pel) }, median: kit.median, caudal: kit.caudal, heteroAxis: kit.heteroAxis,
    plan: { spineType: P.spine.type, spiny: P.spiny, softRays: P.softRays, adipose: P.adipose, pattern: P.pattern, lagCycles: P.lagCycles, ripple: P.ripple, dermal: P.dermal, barb: P.barb, cruiseFold: P.cruiseFold },
    problems: planProblems(P),
    summary: { lvl: kit.level, spines: built, pat: P.pattern.type, extra: kit.extraTris, rays: P.softRays },
  };
}
