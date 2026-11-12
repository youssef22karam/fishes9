// New fin audits. They run inside the generator's own checkFishGeometry() next to the existing checks
// (no existing threshold was touched). Each check reads the built geometry / recorded joint data and
// compares it with LIMITS (plan.js).
import { LIMITS, DEG } from './plan.js';
import { rotAbout, weights } from './joints.js';
export function audit(fish, ctx) {
  const errs = [], info = fish.info && fish.info.finKit, bm = fish.bm;
  if (!info) return ['fin anatomy record missing'];
  const L = bm.L, tol = LIMITS.penetrationTolL * L, depth = ctx.depthInside, add = (m) => { if (!errs.includes(m)) errs.push(m); };
  for (const p of info.problems || []) add('fin plan: ' + p);
  // --- spines: count, length, taper, base thickness, socket, not through the body -------------------
  for (const fin in info.expected) {
    const exp = info.expected[fin].expected, got = (info.built && info.built[fin]) || 0;
    const capN = fin === 'dermal' ? LIMITS.dermalSpines[1] : fin === 'barb' ? 1 : LIMITS.spineCount[1];   /* FIX (fishes8 port): dermal spines / the barb have their own LIMITS entries, which Fable's audit ignored */
    if (exp > capN) add(`spine count above limit on ${fin}`);
    if (info.level === 'lod' ? got > exp : got !== exp) add(`spine count mismatch on ${fin}`);
  }
  for (const s of info.spines || []) {
    const r = s.len / L;
    if (!(r >= LIMITS.spineLenL[0] - 1e-9 && r <= LIMITS.spineLenL[1] + 1e-9)) add('spine length out of bounds');
    if (!s.free && s.hMax > 0 && s.len > s.hMax * LIMITS.spineOverMembrane + 1e-9) add('spine longer than its membrane allows');
    if (s.r0 / L < LIMITS.spineBaseL[0] - 1e-9 || s.r0 / L > LIMITS.spineBaseL[1] + 1e-9) add('spine base thickness out of bounds');
    if (!(s.rTip / s.r0 <= LIMITS.spineTaper[1] + 1e-9)) add('spine is not tapered to a point');
    const d = [s.tip[0] - s.base[0], s.tip[1] - s.base[1], s.tip[2] - s.base[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1, k = Math.min(0.12 * s.len, 0.006 * L) / dl;
    if (!(depth({ x: s.base[0] - d[0] * k, y: s.base[1] - d[1] * k, z: s.base[2] - d[2] * k }) > 0)) add('spine socket is not seated in the skin');
    if (depth({ x: s.mid[0], y: s.mid[1], z: s.mid[2] }) > tol || depth({ x: s.tip[0], y: s.tip[1], z: s.tip[2] }) > tol) add('spine passes through the body');
  }
  // --- joints: hinge placement and swing limits ------------------------------------------------------
  const J = info.joints || {};
  for (const kind of ['pectoral', 'pelvic']) {
    const j = J[kind]; if (!j) continue;
    if (!(depth(j.hinge) > 0)) add(`${kind} hinge floats outside the body wall`);
    if (j.sinkOverL > LIMITS.hingeSinkL + 1e-9) add(`${kind} hinge sunk deeper than the wall law`);
    if (!j.mirrored) add(`${kind} left/right joints are not mirror images`);
    if (kind === 'pectoral') { if (!(j.foldMin >= LIMITS.pecAbdDeg[0] * DEG - 1e-9 && j.foldMin <= LIMITS.pecAbdDeg[1] * DEG + 1e-9)) add('pectoral fold limit outside the abduction clamp'); }
    else if (!(j.foldMax >= 0 && j.foldMax <= LIMITS.pelvicFoldDeg[1] * DEG + 1e-9 && j.flareMax >= 0 && j.flareMax <= LIMITS.pelvicFlareDeg[1] * DEG + 1e-9)) add('pelvic swing limit out of range');
  }
  for (const m of info.median || []) if (!(m.foldDeg >= 0 && m.foldDeg <= LIMITS.medianFoldDeg[1])) add('median fin fold limit out of range');
  const U = fish.uniforms;
  if (U && U.uJointLim) {
    const v = U.uJointLim.value;
    if (J.pectoral && Math.abs(v.x - Math.max(LIMITS.pecAbdDeg[0] * DEG, J.pectoral.foldMin)) > 1e-6) add('shader pectoral limit differs from the joint record');
    if (J.pelvic && (Math.abs(v.z - J.pelvic.foldMax) > 1e-6 || Math.abs(v.w - J.pelvic.flareMax) > 1e-6)) add('shader pelvic limit differs from the joint record');
    if (!(U.uFinPose.value.z >= LIMITS.caudalLag[0] - 1e-9 && U.uFinPose.value.z <= LIMITS.caudalLag[1] + 1e-9)) add('caudal phase lag out of range');
  }
  // --- posed geometry: fully folded fins must not enter the body; paired fins must be mirror images --
  const geo = fish.parts && fish.parts.fins && fish.parts.fins.geometry;
  if (geo) {
    const P = geo.getAttribute('position'), F = geo.getAttribute('aFin'), H = geo.getAttribute('aHinge'), A = geo.getAttribute('aAxis'), B = geo.getAttribute('aBase');
    const sum = { 3: [0, 0, 0, 0, 0, 0, 0, 0], 4: [0, 0, 0, 0, 0, 0, 0, 0] };
    const stride = Math.max(1, Math.floor(P.count / 1400)); let bad = { 3: 0, 4: 0, m: 0 }, finite = true;
    for (let i = 0; i < P.count; i++) {
      const kind = Math.round(F.getW(i)), sg = H.getW(i);
      if (!Number.isFinite(H.getX(i) + H.getY(i) + H.getZ(i) + A.getX(i) + A.getY(i) + A.getZ(i))) finite = false;
      if ((kind === 3 || kind === 4) && sg !== 0) { const s = sum[kind], o = sg > 0 ? 0 : 4; s[o] += P.getX(i); s[o + 1] += P.getY(i); s[o + 2] += P.getZ(i) * sg; s[o + 3]++; }
      if (i % stride) continue;
      const lt = F.getY(i); if (lt <= 0.3) continue;
      const p = { x: P.getX(i), y: P.getY(i), z: P.getZ(i) };
      if ((kind === 3 || kind === 4) && sg > 0) {
        const j = kind === 3 ? J.pectoral : J.pelvic; if (!j) continue;
        const ang = kind === 3 ? (Math.max(LIMITS.pecAbdDeg[0] * DEG, j.foldMin) - j.builtAbd) * weights.pectoral(lt) : -j.foldMax * weights.pelvic(lt);
        const d0 = depth(p), q = rotAbout(p, j.hinge, j.axis, ang);
        if (depth(q) > Math.max(tol, d0 * 1.05 + tol * 0.25) * 1.5) bad[kind]++;
      } else if ((kind === 1 || kind === 2) && sg === 0 && A.getX(i) !== 0) {
        const a = A.getX(i) * weights.median(lt), c = Math.cos(a), s = Math.sin(a), x = p.x - B.getX(i), y = p.y - B.getY(i);
        if (depth({ x: B.getX(i) + x * c - y * s, y: B.getY(i) + x * s + y * c, z: p.z }) > tol * 1.5) bad.m++;
      }
    }
    if (!finite) add('non-finite joint attributes');
    if (bad[3]) add('folded pectoral fin passes through the body');
    if (bad[4]) add('folded pelvic fin passes through the body');
    if (bad.m) add('folded median fin passes through the body');
    for (const k of [3, 4]) { const s = sum[k]; if (s[3] !== s[7] || Math.abs(s[0] - s[4]) + Math.abs(s[1] - s[5]) + Math.abs(s[2] - s[6]) > 1e-4 * L * Math.max(1, s[3])) add((k === 3 ? 'pectoral' : 'pelvic') + ' fins are not mirror images'); }
  }
  // --- caudal fan + lineage features ----------------------------------------------------------------
  if (info.caudal) { if (info.caudal.pc < 1) add('caudal fin has no procurrent rays'); if (info.caudal.hetero && info.level !== 'lod' && !info.heteroAxis) add('heterocercal tail without a vertebral lobe'); }
  if (info.plan.adipose && info.level !== 'lod' && !(fish.info.finAreas && fish.info.finAreas.adipose > 0)) add('lineage adipose fin missing');
  return errs;
}
