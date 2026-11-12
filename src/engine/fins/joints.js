// Fin joints: hinge placement, per-fish swing limits and the pose that drives them.
// KEPT from the older pectoral system that is still in the bundle (law.pec, pose solver, shader hinge):
//   rest abduction + lag from the swim class, the 5..55 deg abduction / -25..35 deg sweep clamps, the 2% L sink.
// NEW: the hinge is actually written into the geometry (the current builder never did, so the joint was dead),
//   the built abduction is measured instead of assumed, every fish gets its own fold-flat limit from a
//   penetration search against the body, and pelvic + median fins get joints of their own.
import { LIMITS, DEG, clamp, smooth } from './plan.js';
import { vec } from './geometry.js';
const { sub, add, dot, cross, len, norm } = vec;
export function rotAbout(p, H, a, g) {
  const v = sub(p, H), c = Math.cos(g), s = Math.sin(g), k = dot(a, v) * (1 - c), cr = cross(a, v);
  return { x: H.x + v.x * c + cr.x * s + a.x * k, y: H.y + v.y * c + cr.y * s + a.y * k, z: H.z + v.z * c + cr.z * s + a.z * k };
}
const wPec = (lenT) => smooth(0, 0.4, lenT), wPel = (lenT) => smooth(0, 0.35, lenT), wMed = (lenT) => smooth(0, 0.22, lenT);
export const weights = { pectoral: wPec, pelvic: wPel, median: wMed };
// Hinge of a paired fin. cb: { base(w,out), edge(w,out), normal(w,out) } are the builder's own closures (actual side).
export function pairedHinge(bm, kit, kind, side, cb) {
  const V3 = kit.ctx.THREE.Vector3, P = new V3(), Q = new V3(), L = bm.L, can = (v) => ({ x: v.x, y: v.y, z: v.z * side });
  const B = (w) => { cb.base(w, P); return can(P); }, E = (w) => { cb.edge(w, Q); return can(Q); };
  const B0 = B(0), B1 = B(1), Bm = B(0.5);
  cb.normal(0.5, P); const N = norm(can(P));
  let d = { x: 0, y: 0, z: 0 }, span = 0;
  for (const w of [0.15, 0.35, 0.5, 0.65, 0.85]) { const v = sub(E(w), B(w)); d = add(d, v); span = Math.max(span, len(v)); }
  d = norm(d);
  let a = norm(sub(B0, B1)); if (!(len(sub(B0, B1)) > 1e-9)) a = norm(cross(N, d));
  if (dot(cross(a, d), N) < 0) a = { x: -a.x, y: -a.y, z: -a.z };           // +rotation about the axis = abduction (away from the wall)
  const dperp = norm(sub(d, { x: a.x * dot(d, a), y: a.y * dot(d, a), z: a.z * dot(d, a) }));
  const built = Math.asin(clamp(dot(dperp, N), -1, 1));
  // sink the hinge into the body wall: 2% L (old law) but never deeper than the local wall allows
  let sink = LIMITS.hingeSinkL * L;
  const depthAt = (s) => kit.ctx.depthInside(add(Bm, N, -s));
  for (let i = 0; i < 6 && depthAt(sink) < sink * 0.3; i++) sink *= 0.6;
  const H = add(Bm, N, -sink);
  const pl = norm(cross(a, d));
  const j = { kind, hinge: H, axis: a, normal: N, sink, sinkOverL: sink / L, builtAbd: built, len: span, lenOverL: span / L, plate: { x: pl.x, y: pl.y, z: pl.z * side }, mirrored: true };
  const prev = kit.joints[kind];
  if (side > 0 || !prev) kit.joints[kind] = Object.assign(prev || {}, j);
  else prev.mirrored = len(sub(prev.hinge, H)) < 1e-3 * L && len(sub(prev.axis, a)) < 0.05 && Math.abs(prev.len - span) < 1e-3 * L;   /* ADAPTATION: this source builds each side independently (Fable's builder mirrored one canonical sheet exactly), so the record comparison uses a numerical tolerance */
  return { x: H.x, y: H.y, z: H.z, sg: side, ax: a.x, ay: a.y, az: a.z, n: j.plate };
}
// After the fin sheet exists: search the joint limits against the body (side +1 only; the other side is its mirror).
export function pairedLimits(acc, bm, kit, kind, side, v0, v1) {
  const j = kit.joints[kind]; if (!j || side < 0) return;
  const L = bm.L, tol = LIMITS.penetrationTolL * L, S = [];
  const stride = Math.max(1, Math.floor((v1 - v0) / 260));
  for (let i = v0; i < v1; i += stride) { const lt = acc.fin[i * 4 + 1]; if (lt > 0.3) S.push({ p: { x: acc.pos[i * 3], y: acc.pos[i * 3 + 1], z: acc.pos[i * 3 + 2] * side }, lt }); }
  const depth = (p) => kit.ctx.depthInside(p);
  for (const s of S) s.d0 = depth(s.p);
  const ok = (ang, w) => S.every((s) => depth(rotAbout(s.p, j.hinge, j.axis, ang * w(s.lt))) <= Math.max(tol, s.d0 * 1.05 + tol * 0.25));
  if (kind === 'pectoral') {
    const lo = LIMITS.pecAbdDeg[0] * DEG, hi = LIMITS.pecAbdDeg[1] * DEG;
    let fold = clamp(j.builtAbd, lo, hi);
    for (let a = lo; a < fold - 1e-6; a += 2.5 * DEG) if (ok(a - j.builtAbd, wPec)) { fold = a; break; }
    j.foldMin = fold;                                   // smallest abduction this fish can reach without touching the body
    j.restAbd = clamp(((bm.law && bm.law.pec && bm.law.pec.restAbd) || 12) * DEG, fold, hi);
  } else {
    const capF = LIMITS.pelvicFoldDeg[1] * DEG; let fold = 0;
    for (let a = capF; a > 1e-6; a -= 7 * DEG) if (ok(-a, wPel)) { fold = a; break; }
    j.foldMax = fold;
    j.flareMax = clamp(LIMITS.pecAbdDeg[1] * DEG - j.builtAbd, 0, LIMITS.pelvicFlareDeg[1] * DEG);
    if (!ok(j.flareMax, wPel)) j.flareMax = 0;
  }
  j.samples = S.length;
}
// Median fin (dorsal / anal): every ray pivots at its own base about the lateral axis, so the fin can be laid back.
// Returns the signed maximum fold angle (rad); 0 for fins that cannot be depressed.
export function medianFold(bm, kit, t, cb) {
  const V3 = kit.ctx.THREE.Vector3, B = new V3(), E = new V3(), fr = {}, L = bm.L, plan = kit.plan;
  const soft = t.shape === 'continuous' || t.kind === 'finlet' || t.kind === 'adipose';
  const rigid = plan.cartilaginous || (['triangle', 'falcate'].includes(t.shape) && !(t.spineFrac > 0.3));
  let cap = soft ? 0 : rigid ? (plan.cartilaginous ? 0 : 8) : LIMITS.medianFoldDeg[1] - 6;
  bm.frame(clamp((t.u0 + t.u1) / 2, 0.005, 0.999), fr);
  cb.base(0.5, B); cb.edge(0.5, E);
  const sgn = Math.sign((E.x - B.x) * fr.ty - (E.y - B.y) * fr.tx) || t.side || 1;
  const tol = LIMITS.penetrationTolL * L, test = (deg) => {
    const a = sgn * deg * DEG, c = Math.cos(a), s = Math.sin(a);
    for (const b of [0.12, 0.3, 0.5, 0.7, 0.88]) {
      cb.base(b, B); cb.edge(b, E);
      for (const f of [1, 0.6]) { const x = (E.x - B.x) * f, y = (E.y - B.y) * f; if (kit.ctx.depthInside({ x: B.x + x * c - y * s, y: B.y + x * s + y * c, z: B.z }) > tol) return false; }
    }
    return true;
  };
  while (cap > 0 && !test(cap)) cap -= 6;
  cap = Math.max(0, cap);
  kit.median.push({ kind: t.kind, cfg: t.cfg || t.kind, foldDeg: cap, sign: sgn });
  return sgn * cap * DEG;
}
export function jointUniformValues(bm, kit) {
  const p = kit.joints.pectoral, v = kit.joints.pelvic, lawRest = ((bm.law && bm.law.pec && bm.law.pec.restAbd) || 12) * DEG;
  return [p && p.foldMin != null ? Math.max(LIMITS.pecAbdDeg[0] * DEG, p.foldMin) : LIMITS.pecAbdDeg[0] * DEG, p ? p.builtAbd : lawRest, v ? v.foldMax || 0 : 0, v ? v.flareMax || 0 : 0];
}
// Per-frame pose. `pose` is the result of the existing pectoral solver (degrees) and may be adjusted here.
export function framePose(fish, pose, st) {
  const kit = fish && fish.bm && fish.bm.finKit, U = fish && fish.uniforms; if (!kit || !U || !U.uFinPose) return;
  const a = kit.anim || (kit.anim = { fold: 0, pelv: 0, t: performance.now() });
  const now = performance.now(), dt = clamp((now - a.t) / 1000, 0, 0.1); a.t = now;
  const sp = clamp(st.speed || 0, 0, 1), brake = clamp(st.brake || 0, 0, 1), turn = Math.abs(clamp(st.turn || 0, -1, 1));
  let fold = 0, pelv = 0, snap = false;
  if (st.test === 'fold') {                               // test hook: everything adducted / depressed to its limit
    fold = 1; pelv = -1; snap = true;
    for (const s of [pose.L, pose.R]) if (s) { s.aM = LIMITS.pecAbdDeg[0]; s.aA = 0; s.sA = 0; s.sM = 0; }
  } else if (st.test) { snap = true; pelv = st.test === 'power' ? 0.6 : 0; }
  else if (!st.still) {
    const cr = kit.plan.cruiseFold;
    fold = cr * 0.9 * smooth(0.35, 0.9, sp) * (1 - brake) * (1 - turn);       // cruisers lay the dorsal back at speed, erect it to brake/turn
    pelv = clamp(-cr * smooth(0.3, 0.85, sp) * (1 - turn) + brake, -1, 1);    // pelvics tuck when cruising, flare as brakes
  }
  const k = snap ? 1 : 1 - Math.exp(-dt * 4);
  a.fold += (fold - a.fold) * k; a.pelv += (pelv - a.pelv) * k;
  U.uFinPose.value.set(clamp(a.fold, 0, 1), clamp(a.pelv, -1, 1), kit.plan.lagCycles, 1);
}
