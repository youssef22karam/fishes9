// Fin anatomy plan: every value here is derived from the genome (seed + schema parameters) and the
// lineage (clade path / anatomy family). Nothing is keyed on a species id. All numbers stay inside
// LIMITS, and the audit (audit.js) re-checks the built fish against the same table.
export const DEG = Math.PI / 180;
export const LIMITS = {
  spineCount: [0, 40],          // geometric spines per fin
  spineLenL: [0.003, 0.45],     // spine length / body length
  spineOverMembrane: 1.75,      // spine may not exceed 1.75 x the tallest membrane of its fin (free first spines excepted by min length)
  spineBaseL: [0.0012, 0.03],   // base radius / body length  (minimum base thickness law)
  spineTaper: [0.02, 0.35],     // tip radius / base radius
  tipExcess: [0.08, 0.24],      // how far a spine tip stands proud of its membrane
  incision: [0.16, 0.45],       // depth of the membrane notch between two spines
  hingeSinkL: 0.02,             // KEPT from the old pectoral law (oI) and the fin-root law (Qn.sink): hinge sits <= 2% L inside the wall
  pecAbdDeg: [5, 55],           // KEPT from the old pectoral law (t0)
  pecSweepDeg: [-25, 35],       // KEPT from the old pectoral law (t0)
  pelvicFoldDeg: [0, 70],
  pelvicFlareDeg: [0, 25],
  medianFoldDeg: [0, 70],
  caudalLag: [0.03, 0.16],      // tail-blade phase lag at the ray tips, in swim cycles
  penetrationTolL: 0.004,       // a posed fin vertex may sit at most 0.4% L under the skin
  dermalSpines: [0, 140],
  barbLenL: [0.04, 0.1],
  pattern: { carry: [0, 0.9], freq: [2, 14], strength: [0, 0.85], margin: [0, 0.16], tone: [-1, 1], lead: [0, 0.6], ocelR: [0.08, 0.22] },
};
// Lineage traits, inherited down the clade path (same granularity as the generator's own ANATOMY table).
const LINEAGE = {
  chondrichthyes: { rays: 'cerato' },
  sarcopterygii: { rays: 'lobed' },
  bichir: { rays: 'lobedPaired' },
  siluriform: { spine: 'catfish', adipose: true, pectoralSpine: true },
  salmonid: { adipose: true },
  characin: { adipose: true },
  myctophid: { adipose: true },
  scorpaenid: { spine: 'venom' },
  triggerfish: { spine: 'trigger' },
  pufferfish: { dermal: true },
  stingray: { barb: true },
};
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function rng(seedStr) {
  let h1 = 0xdeadbeef ^ 0x9e3779b9, h2 = 0x41c6ce57;
  const s = String(seedStr);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  let a = h1 >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), pick: (pairs) => { let tot = 0; for (const p of pairs) tot += p[1]; let r = next() * tot; for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; } return pairs[pairs.length - 1][0]; } };
}
export function lineageOf(cladeIds) {
  const out = { rays: 'lepido', spine: 'acanth', adipose: false, pectoralSpine: false, dermal: false, barb: false };
  for (const id of cladeIds || []) if (LINEAGE[id]) Object.assign(out, LINEAGE[id]);
  return out;
}
const PATTERN_TYPES = ['none', 'rayStripes', 'membraneSpots', 'clearRays', 'bandedRays'];
export function makePlan(genome, bm, cladeIds) {
  const g = genome, f = g.fins, sk = g.skin, lin = lineageOf(cladeIds);
  const fam = (bm.a && bm.a.family) || 'rayfin';
  const cart = !!(bm.ax && bm.ax.plan && bm.ax.plan.cartilaginous) || lin.rays === 'cerato';
  const r = rng(String(g.meta.seed) + '|' + (g.meta.clade || '') + '|fin-anatomy');
  const dSp = f.dorsal.present ? f.dorsal.spines | 0 : 0;
  const spiny = !cart && dSp >= 2 && lin.spine !== 'catfish';
  const L = LIMITS;
  const spine = {
    type: cart ? 'chond' : lin.spine,
    tipExcess: r.range(L.tipExcess[0], L.tipExcess[1]) * (fam === 'lion' ? 1 : 0.8),
    curve: r.range(0.03, 0.14),                       // backward bow, fraction of length
    rel: r.range(0.028, 0.05),                        // base radius / length
    taper: r.range(0.04, 0.16),                       // tip radius / base radius
    incision: clamp(r.range(L.incision[0], L.incision[1]) + (fam === 'lion' ? 0.2 : 0), L.incision[0], L.incision[1]),
  };
  // --- fin pattern (ray-structure aware), seeded and range-validated -------------------------------
  const pat = sk.pattern, small = g.body.length < 0.1;
  const w = [
    ['none', 1.0],
    ['rayStripes', 0.7 + (pat === 'stripes' ? 1.2 : 0)],
    ['membraneSpots', 0.5 + (['spots', 'reticulate', 'mottle', 'eyespot'].includes(pat) ? 1.4 : 0)],
    ['clearRays', 0.25 + (sk.translucency > 0.3 ? 2.5 : 0) + (small ? 1.2 : 0) + ((f.caudal.opacity || 1) < 0.7 ? 0.6 : 0)],
    ['bandedRays', 0.45 + (['bars', 'saddles', 'disruptive'].includes(pat) ? 1.4 : 0) + (fam === 'lion' ? 2 : 0)],
  ];
  const type = cart ? 'none' : r.pick(w);
  const ps = clamp(sk.patternStrength == null ? 0.6 : sk.patternStrength, 0, 1);
  const carryBase = cart ? 0.85 : ['bars', 'saddles', 'disruptive'].includes(pat) ? r.range(0.55, 0.9) : r.range(0.15, 0.55);
  const hasMargin = r.next() < (cart ? 0.45 : 0.6), darkMargin = r.next() < 0.6;
  const ocelKind = cart ? 0 : pat === 'eyespot' ? (r.next() < 0.5 ? 1 : 2) : r.next() < (spiny ? 0.08 : 0.03) ? 1 : 0;
  const pattern = {
    type, typeId: PATTERN_TYPES.indexOf(type),
    carry: clamp(carryBase * (cart ? 1 : 0.5 + 0.5 * ps), L.pattern.carry[0], L.pattern.carry[1]),
    freq: clamp(Math.round(r.range(L.pattern.freq[0], L.pattern.freq[1])), L.pattern.freq[0], L.pattern.freq[1]),
    strength: type === 'none' ? 0 : clamp(r.range(0.3, 0.85) * (0.55 + 0.45 * ps), L.pattern.strength[0], L.pattern.strength[1]),
    margin: hasMargin ? r.range(0.045, L.pattern.margin[1]) : 0,
    tone: hasMargin ? (darkMargin ? -r.range(0.4, 1) : r.range(0.4, 1)) : 0,
    lead: r.next() < 0.5 ? r.range(0.15, L.pattern.lead[1]) : 0,
    ocel: { kind: ocelKind, rayT: r.range(0.62, 0.85), lenT: r.range(0.3, 0.55), r: r.range(L.pattern.ocelR[0], L.pattern.ocelR[1]), ring: r.range(0.5, 1) },
  };
  // --- motion ---------------------------------------------------------------------------------------
  const mode = g.swim.mode;
  const cruise = bm.law && bm.law.fin && typeof bm.law.fin.cruise === 'number' ? clamp(bm.law.fin.cruise, 0, 1)
    : mode === 'thunniform' ? 1 : mode === 'carangiform' ? 0.7 : mode === 'subcarangiform' ? 0.45 : 0.1;
  const flex = clamp(f.caudal.flex == null ? 0.3 : f.caudal.flex, 0, 1);
  const lagCycles = clamp(0.03 + 0.26 * flex, L.caudalLag[0], L.caudalLag[1]);
  // median-fin undulation (travelling wave along the fin base): [dorsal amp, anal amp, waves along fin, cycles per swim cycle]
  let ripple = [0, 0, 2, 1];
  const contD = f.dorsal.shape === 'continuous', oldAnguRipple = mode === 'anguilliform' && f.dorsal.flex > 0.9;
  if (fam === 'knife') ripple = [0, oldAnguRipple ? 0 : 0.03, r.range(2, 3.2), 2];
  else if (mode === 'ostraciiform' || fam === 'rigid' || fam === 'molid') ripple = [0.022, 0.022, r.range(1.2, 2), 3];
  else if (fam === 'pipe') ripple = [0.02, 0, 3, 5];
  else if (fam === 'flatfish' || (contD && !oldAnguRipple)) ripple = [0.012, 0.012, r.range(2.5, 4), 1];
  const dermal = lin.dermal || sk.inflate ? { count: Math.round(r.range(70, L.dermalSpines[1] - 30)), len: r.range(0.022, 0.05) } : null;
  const barb = lin.barb ? { len: r.range(L.barbLenL[0] + 0.01, L.barbLenL[1] - 0.01) } : null;
  return {
    lineage: lin, family: fam, cartilaginous: cart, spiny, softRays: cart ? 'cerato' : lin.rays,
    spine, pelvicSpine: spiny && f.pelvic.present, pectoralSpine: lin.pectoralSpine && f.pectoral.present,
    adipose: lin.adipose && !cart && !!(f.adipose && f.adipose.present), dermal, barb, pattern,   /* ADAPTATION: in this source the adipose fin is a genome axis — the plan only promises it when the genome actually builds one */
    cruiseFold: cruise, lagCycles, ripple,
    segments: Math.round(r.range(12, 24)),            // lepidotrichial joints drawn along each soft ray
    ragged: r.range(0.25, 0.9),                       // irregularity of the trailing-edge scallops
  };
}
export function planProblems(plan) {
  const e = [], L = LIMITS, p = plan.pattern, inR = (v, [a, b]) => v >= a - 1e-9 && v <= b + 1e-9;
  if (!inR(plan.spine.tipExcess, [0.05, L.tipExcess[1]])) e.push('spine tip excess out of range');
  if (!inR(plan.spine.incision, L.incision)) e.push('spine membrane incision out of range');
  if (!inR(plan.spine.taper, L.spineTaper)) e.push('spine taper out of range');
  if (!inR(plan.lagCycles, L.caudalLag)) e.push('caudal phase lag out of range');
  if (!inR(p.carry, L.pattern.carry) || !inR(p.strength, L.pattern.strength) || !inR(p.margin, L.pattern.margin) || !inR(p.tone, L.pattern.tone) || !inR(p.lead, L.pattern.lead)) e.push('fin pattern parameter out of range');
  if (p.typeId < 0 || p.typeId > 4) e.push('fin pattern type unknown');
  if (p.ocel.kind && !inR(p.ocel.r, L.pattern.ocelR)) e.push('fin ocellus radius out of range');
  if (plan.dermal && !inR(plan.dermal.count, L.dermalSpines)) e.push('dermal spine count out of range');
  if (plan.barb && !inR(plan.barb.len, L.barbLenL)) e.push('caudal barb length out of range');
  return e;
}
