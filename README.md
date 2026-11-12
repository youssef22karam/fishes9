# IchthyoGen — Hyperreal Procedural Fish Generator

This is the complete IchthyoGen project.

## Layout note

The fish engine is one large ES module, `src/engine/fishgen.js`. In this
repo it is stored as sequential parts:

```
src/engine/parts/fishgen.part01.js   (lines 1–231 of the module)
src/engine/parts/fishgen.part02.js   (lines 232–276 of the module)
src/engine/parts/fishgen.part03.js   (lines 277–319 of the module)
src/engine/parts/fishgen.part04.js   (lines 320–494 of the module)
src/engine/parts/fishgen.part05.js   (lines 495–701 of the module)
src/engine/parts/fishgen.part06.js   (lines 702–930 of the module)
src/engine/parts/fishgen.part07.js   (lines 931–1214 of the module)
src/engine/parts/fishgen.part08.js   (lines 1215–1477 of the module)
src/engine/parts/fishgen.part09.js   (lines 1478–1796 of the module)
src/engine/parts/fishgen.part10.js   (lines 1797–2036 of the module)
src/engine/parts/fishgen.part11.js   (lines 2037–2415 of the module)
src/engine/parts/fishgen.part12.js   (lines 2416–2716 of the module)
src/engine/parts/fishgen.part13.js   (lines 2717–2909 of the module)
src/engine/parts/fishgen.part14.js   (lines 2910–3091 of the module)
src/engine/parts/fishgen.part15.js   (lines 3092–3325 of the module)
src/engine/parts/fishgen.part16.js   (lines 3326–3559 of the module)
src/engine/parts/fishgen.part17.js   (lines 3560–3699 of the module)
src/engine/parts/fishgen.part18.js   (lines 3700–3938 of the module)
src/engine/parts/fishgen.part19.js   (lines 3939–4089 of the module)
```

`src/engine/mouthgeo.js` is stored the same way, as
`src/engine/parts/mouthgeo.part01.js` + `mouthgeo.part02.js`, and is
likewise reassembled by `tools/reassemble.mjs` and git-ignored as a
generated file.

The parts are **one continuous module in filename order** — the `import`
statements are in part01 and the `export { boot, FG }` is at the end of
part19. They are not separate modules: never import a part on its own, and
never reorder them. Concatenated in order they reproduce the original
`fishgen.js` byte for byte
(SHA-256 of the original: `b52877b4c5bf05dfc7ec87c5759796ad3529b9497e6d6718328778cc49c87b85`).

## Build / run

```bash
npm install
npm run build     # reassembles fishgen.js, then builds one single-file HTML in dist/
npm run dev       # reassembles, then starts the Vite dev server
```

`tools/reassemble.mjs` concatenates the parts into the generated
`src/engine/fishgen.js` (git-ignored). It runs automatically inside
`dev`/`build`. Run it on its own any time with `npm run reassemble`.

The build output is a single self-contained HTML file
(`dist/index.html`, ~1.3 MB, everything inlined via vite-plugin-singlefile).

## Global anatomy laws (mouths, eyes, fins, tails, flattened plan)

`src/engine/laws.js` holds the universal laws, expressed only through the
generator's axes (BODY PLAN, FEEDING NICHE, SWIM MODE, DEPTH/HABITAT). They
run as the `anatomy_laws` repair rule, drive the geometry builders
(`src/engine/mouthgeo.js` is the mouth constructor), and are asserted by
`src/engine/validate.js` (`tail` and `plan` invariants) and the mesh audit.
See `docs/anatomy-laws.md`; `docs/verify-report.txt` is the 10,000 / 1,000
population report (`npm run reassemble && node tools/verify.mjs`).

## Notes

- `package-lock.json` was deliberately left out: `npm install` regenerates
  it. Dependency versions are pinned in `package.json`.
- Everything else is the untouched original project: `src/App.tsx` is the UI
  shell, `src/engine/fish.css` the engine styles, `src/engine/fishgen.d.ts`
  the type declarations for the engine module.

## Working on this repo

1. Read the engine as one module: `fishgen.part01.js` through
   `fishgen.part19.js`, in order.
2. Verify with `npm install && npm run build` — the build must succeed and
   produce `dist/index.html`.

---

## Procedural genome system (added on top of the original engine)

New modules in `src/engine/` (the generated `fishgen.js` is untouched apart from small hooks in the parts):

| file | role |
|---|---|
| `clades.js`, `cladedata.js` | 59 continuous + 20 discrete trait axes; 17 clade envelopes / 41 lineages (ranges only, no species) |
| `genome.js` | seed → RNG → clade → trait vector; clamp, bounded mutation, crossover, genome hash, trait distance |
| `mapping.js` | trait vector → original engine genome paths (`body.*`, `head.*`, `fins.*`, `skin.*`…) |
| `validate.js` | **anatomy hard gate** (8 invariants; trait stage + engine `BodyModel` analytic stage) |
| `procgen.js` | pipeline: sample → mutate → map → gate → accept / resample; seed grammar `A`, `A~SALT` (mutant), `A^B.SALT` (offspring) |
| `naming.js` | genus/species + common name derived from traits and clade |
| `procui.js` | "Procedural" panel: Random, seed field, Mutate, Breed, clade bias, 24-fish gallery |

Verification: `node tools/reassemble.mjs && node tools/verify.mjs` (env `UNIQ`, `COH`, `SAMPLE`). `node tools/diag.mjs` prints per-lineage gate pass-rates.
Last full report: `docs/verify-report.txt`; screenshots in `docs/`.

Engine fix: `checkFishGeometry` read `getAttribute('aFin')` from a position attribute in its batoid branch; it now reads it from the fin geometry.
