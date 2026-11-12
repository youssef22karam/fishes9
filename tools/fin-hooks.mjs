// FinKit hook map (Fable 5.2 fin anatomy, src/engine/fins/) — every splice point in the source.
// fishgen.js is GENERATED from src/engine/parts/*.js; all hooks below live in the parts.
//  part01: import * as FINKIT from './fins/index.js'
//  FinBuilder.add (part10): sp.ridge(i) thickness factor; sp.flexAt(t) per-column flex;
//    sp.fleshyAt(t,s) -> aSkin.z tissue flag; no-hinge vertices take aAxis.x = sp.fold (median fold limit).
//  addRidgeFin (part10): sp built, FINKIT.median(bm, t, sp) before fb.add(sp), FINKIT.spines(fb, sp) after.
//  addPectoral / addPelvic (part10): FINKIT.paired(...) before add (writes the hinge), spines + pairedDone after.
//  buildFish (part10/11): FINKIT.begin after bm creation; FINKIT.finish before fb.build();
//    info.finKit = FINKIT.info(bm).
//  makeUniforms (part12): return spreads ...FINKIT.uniforms(bm) (uFinPose/uJointLim/uFinRip/uFinPatA/uFinPatB/uFinOcel/uFinAnat).
//  VS_FIN (part12): ${FINKIT.glsl.vertexDecl} after the uPec uniforms; ${FINKIT.glsl.vertexJoints}
//    after the kind==3 pectoral block, before applyWave.
//  FS_FIN (part12): ${FINKIT.glsl.fragDecl} in the header; ${FINKIT.glsl.fragRays} replaces the
//    scallop-discard + branch block; ${FINKIT.glsl.fragPattern} before the alpha line;
//    ${FINKIT.glsl.fragFinish} before the normal; ${FINKIT.glsl.fragBump} after the normal flip.
//  checkFishGeometry (part15): FINKIT.audit(fish, {depthInside}) errors merged before the budget check.
//  tailgeo.js buildCaudal: FINKIT.caudalOpts(bm, csp) before fb.add(csp) (fleshy stalk only;
//    the hypural-fan re-parameterisation was NOT applied — see CHANGES.md).
