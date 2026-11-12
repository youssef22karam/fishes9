# IchthyoGen — global anatomy laws (mouths, eyes, fins, tails, flattened plan)

All laws live in `src/engine/laws.js` and read **only** the generator's axes:

| axis | source |
|---|---|
| BODY PLAN | anatomy family of the lineage + plan flags (`flat` 0/½/1, `cartilaginous`, `sideFlat`, `headExpanded`, `jawless`, `tubular`, `elongated`, `perch`, `solid`, `softRayed`) |
| FEEDING NICHE | functional flags of the niche (`predator`, `ambusher`, `grazer`, `planktivore`, `sifter`, `flatBenthic`, `parasite`, `suction`, `surfaceFeeder`, …) |
| SWIM MODE | `swim.mode` |
| DEPTH / HABITAT | habitat `light` (dark < 0.3, lightless ≤ 0.02 or cave flag) |

`FG.axesOf(genome)` collapses a genome to these axes. No rule, range or example is keyed to a named animal.

## Where each law acts

1. **Repair rule `anatomy_laws`** (`fishgen` rules table, runs to a fixed point with the other rules) — `LAW.repairLaws`.
2. **Geometry** — `BodyModel.law = { eye, mouth, fin, tail, flat }` drives `buildEyes`, the mouth constructor (`mouthgeo.js`), `FinBuilder`/`addPectoral`/`addCaudal`, `BodyModel.section` (disc), `buildNostrils` (spiracles).
3. **Validation** — `validate.js` imports `assertLaws` (genome level) and `checkFishGeometry` audits the mesh (cavity inside the head and ≤ 0.35 head length, teeth on the jaw margins, flattened-plan disc + margin fin + no hinged jaw). Invariants added: `tail`, `plan`.

## 1. Mouths — `mouthLaw(ax)`
* construction: `ventral` (flattened plan) · `sucker` (jawless plan or parasitic niche) · `fused` (grazing niche) · `tube` (tubular plan or suction niche) · `jawed` otherwise.
* orientation: `up` (surface / glider niches) · `down` (sifter, flat-benthic, parasite, bottom-dweller, scavenger) · `forward`.
* gape band by prey-size niche: ambush [.55,.95] · lurer/filter [.45,.9] · predator [.4,.85] · picking/plankton [.08,.32] · tube/fused ≤ .25 · default [.18,.55]. Lower bounds are relaxed only by head geometry (same limit the gape rule uses), so rules never oscillate.
* teeth class from niche: grasping (needle/fang/triangular) · crushing (molar) · comb (villiform/rasp) · plate (fused) · absent. Tooth length ≤ 0.3 × local jaw depth; roots on the inner margin only.
* construction (`mouthgeo.js`): upper + lower **lip tubes** of real thickness (lower one hinged), **jaw hinge** `hingeU` ≥ eye station and ahead of the gill opening, **cavity pocket** rooted on the aperture outline and closed by a **throat cap** at ≤ `CAVITY_MAX` = 0.35 head length — every interior vertex is clamped inside its own body section (a cavity, never a tunnel). The skin shader opens the aperture only in proportion to the jaw drop; fused mouths have `uJawOpenMax = 0`.
* sucker: underside disc, depth ≤ 0.1 head length, lip torus + floored dish. Tube: short front cap.

## 2. Eyes — `eyeLaw(ax)`
* diameter / head length band: lightless → vestigial [.05,.06] skin-covered (still 2 eyes) · dark or nocturnal → [.10,.15] · bright open-water cruising → [.05,.10] · else [.06,.14].
* pupil: vertical at the bright ambush/nocturnal extreme, horizontal at the bright bottom-oriented extreme, round otherwise (`uPupilShape`).
* placement: lateral · dorsal (flattened plan) · one side (side-flattened plan) · lateral extremity (expanded head). Protrusion = (0.8 − 0.53 + 0.14)/2 = 0.205 of the diameter ≤ 1/3.

## 3. Fins — `finLaw(ax)`
* one constructor (`FinBuilder`): base rooted on the skin, rays, translucent membrane, **scalloped trailing edge between ray tips** and a satin membrane (`FS_FIN`).
* area / lateral body area envelopes by swim mode (`FIN_ENV`), minimum ray counts (`RAY_MIN`), stiffness at the cruising end, segmented spiny front section on the perch-like plan, accessory fin only in the soft-rayed subcarangiform band, merged continuous fringe on elongated plans, ray-supported disc margin on the flattened plan.

## 4. Tails — `tailLaw(ax)`
* homocercal: outline is `homocercalOutline(a, T, notch)`, a continuous function of the swim axis T (rounded → truncate → forked → crescent); aspect band, peduncle depth cap and keel (`T ≥ .85`) interpolate from T.
* heterocercal (cartilaginous plan): the rear axis deflects upward by the plan parameter (`lobeAsym` ∈ [.2,.85]); the upper lobe is built around the deflected axis (`bend`), lower lobe shorter, lateral keels on. Lobe ratio `lobeRatioOf(d)` bounded [1.05, 4].
* whip (flattened plan): no caudal fin; slender peduncle, small rear median fins, optional tail spine (flat-benthic niche).

## 5. Flattened plan — `flatLaw(ax, g)`
Disc outline rounded ↔ angular and width ratio are plan parameters; the body carries the fused disc and the fin constructor builds its ray-supported margin. Top surface: eyes + spiracles. Bottom: ventral mouth (two lip arcs + floored slot) + 5 gill pairs. Half-form (`flat = .5`): disc front, distinct rear body with median fins and a heterocercal tail from the same construction.

## 7. Close-up presets
God Mode → camera row: **Mouth · Eye · Fin · Tail · Below** (plus Side / Dorsal / Head). All framed on landmarks, so a blind-generated set can be shot per law.
