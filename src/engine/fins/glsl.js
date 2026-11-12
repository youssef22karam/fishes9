// GLSL spliced into the generator's fin shader (see tools/fin-hooks.mjs for the exact splice points).
// kind ids (aFin.w): 1 dorsal, 2 anal, 3 pectoral, 4 pelvic, 5 caudal, 6 adipose, 7 finlet, 8 dermal spine / barb
// part ids (aSkin.w): 0 membrane, 1 bone spine, 2 socket collar (skin), 3 venom spine (sheathed), 4 dark keratin (catfish spine, barb), 5 dermal spine
export const glsl = {
  vertexDecl: 'uniform vec4 uFinPose, uJointLim, uFinRip;',
  // after the pectoral joint, before the body wave
  vertexJoints: `
  if(kind == 4.0 && aHinge.w != 0.0){                 /* pelvic joint: tuck flat against the belly (-) or flare as a brake (+); the base stays in the wall */
    float sgp = aHinge.w, pz = clamp(uFinPose.y, -1.0, 1.0), angp = (pz >= 0.0 ? pz*uJointLim.w : pz*uJointLim.z) * smoothstep(0.0, .35, lenT);
    vec3 prp = vec3(p.xy, p.z*sgp), nrp = vec3(n.xy, n.z*sgp), rrp = prp - aHinge.xyz;
    rrp = rotA(rrp, aAxis, angp); nrp = rotA(nrp, aAxis, angp); prp = aHinge.xyz + rrp; p = vec3(prp.xy, prp.z*sgp); n = vec3(nrp.xy, nrp.z*sgp);
  }
  if((kind == 1.0 || kind == 2.0) && aHinge.w == 0.0){
    if(aAxis.x != 0.0){                               /* median fin: every ray / spine pivots on its own base, laying the fin back; limit is per fin (aAxis.x) */
      float angm = clamp(uFinPose.x, 0.0, 1.0) * aAxis.x * smoothstep(0.0, .22, lenT), cm = cos(angm), sm = sin(angm);
      vec3 pvm = aBase + inflateDisp(aBase), rrm = p - pvm; rrm.xy = vec2(cm*rrm.x - sm*rrm.y, sm*rrm.x + cm*rrm.y); n.xy = vec2(cm*n.x - sm*n.y, sm*n.x + cm*n.y); p = pvm + rrm;
    }
    float ram = kind == 1.0 ? uFinRip.x : uFinRip.y;  /* undulating median fins (knifefish, boxfish, flatfish...): travelling wave along the fin base */
    if(ram > 0.0) p.z += sin(rayT*6.2831853*uFinRip.z - t*6.2831853*uFinRip.w) * lenT*lenT * uLen * ram * tissue;
  }
  /* tail blade: follows the peduncle with a phase lag that grows along each ray and toward the lobe tips */
  float finLag = kind == 5.0 ? uFinPose.z * lenT * (.5 + abs(rayT - .5)) * (1.0 - .6*aSkin.z) : 0.0;`,
  fragDecl: 'uniform vec4 uFinPatA, uFinPatB, uFinOcel, uFinAnat;',
  // replaces the old scallop + crude frequency-doubling "branch"
  fragRays: `
  float part = vSkin.w;
  float spZone = step(rayT, sf + .5/max(R-1.0, 1.0)) * step(.001, sf);                    /* membrane between (and just behind) the spines */
  float cellR = floor(rayT*(R-1.0));
  float notch = mix(.12*(.55 + .9*uFinAnat.y*hash12(vec2(cellR, 3.7)+uSeed)), uFinAnat.x, spZone);
  if(part<.5 && vSkin.z<.5 && lenT > 1.0-notch*(4.0*rl*rl)) discard;                      /* ragged, scalloped margin; deeply incised between spines so the membrane stops short of each tip */
  float softR = 1.0 - isSpine;                                                            /* soft rays branch dichotomously toward the tip; spines never branch */
  float d1 = abs(rl - .25*smoothstep(.5, 1.0, lenT));
  float d2 = abs(d1 - .115*smoothstep(.76, 1.0, lenT));
  float rd = mix(rl, d2, softR);
  float rw = rayW*mix(1.0, .62, softR*smoothstep(.5, .9, lenT));
  ray = 1.0 - smoothstep(rw, rw+.07, rd);
  if(part<.5 && lenT > memb && ray < .55 && vSkin.z<.5) discard;`,
  // before the alpha computation
  fragPattern: `
  float soft = 1.0 - root; float finClear = 0.0;
  if(vSkin.z < .5 && part < .5){
    float seg = smoothstep(.0, .22, abs(fract(lenT*uFinAnat.w) - .5));                    /* lepidotrichia are jointed: cross-segments along each soft ray */
    col *= 1.0 - .22*ray*(1.0-seg)*softR*soft;
    col = mix(col, skin*fibre*(.9+.2*blotch), uFinPatA.w*(1.0 - .55*lenT)*soft);          /* body pattern runs on along the rays: no seam at the fin base */
    int pt = int(uFinPatA.x + .5); float pf = uFinPatA.y, ps = uFinPatA.z*soft;
    if(pt == 1){ float per = 2.0 + floor(pf*.25); col = mix(col, uAccent, ps*smoothstep(.3,.44,abs(fract(floor(rayT*(R-1.0)+.5)/per + .25) - .5))*(.45+.55*ray)); }       /* ray-aligned stripes */
    else if(pt == 2){ vec2 q = vec2(rayT*(R-1.0), lenT*pf*.9); vec2 l = fract(q) - .5; float j = hash12(floor(q) + uSeed + 7.3);
      col = mix(col, uAccent*.75, ps*(1.0 - smoothstep(.14,.3,length(l*vec2(1.0,1.35))))*step(.3, j)*(1.0-ray)); }                                                    /* membrane-only spots between the rays */
    else if(pt == 3){ finClear = ps; col = mix(col, mix(uAccent, uFinCol, .4)*1.15, ps*ray); }                                                                        /* clear membrane, coloured rays */
    else if(pt == 4){ float band = smoothstep(.28,.42,abs(fract(lenT*pf*.5 + .12*sin(rayT*9.0)) - .5)); col = mix(col, uAccent*.65, ps*band*(.4+.6*ray)); }           /* banded rays */
  }
  { float fk = vFin.w;
    if(part < .5 && fk < 7.5){
      float mg = smoothstep(1.0 - uFinPatB.x, 1.0 - uFinPatB.x*.3, lenT)*step(.001, uFinPatB.x)*soft;                                                                 /* dark or pale margin */
      col = uFinPatB.y < 0.0 ? mix(col, col*.16, -uFinPatB.y*mg) : mix(col, col*1.35 + .22, uFinPatB.y*mg);
      float le = fk > 4.5 && fk < 5.5 ? max(1.0 - smoothstep(.0,.06,rayT), smoothstep(.94,1.0,rayT)) : 1.0 - smoothstep(.0,.08,rayT);
      col *= 1.0 - uFinPatB.z*le*soft;                                                                                                                                /* darker leading ray(s) */
      float okd = uFinPatB.w;
      if((okd > .5 && okd < 1.5 && fk > .5 && fk < 1.5) || (okd > 1.5 && fk > 4.5 && fk < 5.5)){                                                                      /* ocellus centred on a ray */
        float ocx = fk > 4.5 ? .5 : floor(uFinOcel.x*(R-1.0)+.5)/max(R-1.0, 1.0), ocy = fk > 4.5 ? .16 : uFinOcel.y;
        float dd = length(vec2((rayT - ocx)*(fk > 4.5 ? .9 : 1.6), lenT - ocy))/uFinOcel.z;
        col = mix(col, vec3(.015), 1.0 - smoothstep(.5,.66,dd));
        col = mix(col, vec3(.96,.9,.68), smoothstep(.66,.76,dd)*(1.0 - smoothstep(.9,1.04,dd))*uFinOcel.w);
      }
    }
  }`,
  // after alpha, before the normal
  fragFinish: `
  if(part < .5 && vSkin.z < .5 && finClear > 0.0) a = mix(a, mix(.34, 1.0, max(ray, root)), finClear);
  if(part > .5){                                                                          /* real spines: bone / keratin, never membrane */
    vec3 bone = mix(vec3(.84,.8,.7), uFinCol, .25); float tipT = smoothstep(.5, 1.0, lenT);
    vec3 sc = mix(bone*.8, bone*1.06, tipT);
    if(part > 1.5 && part < 2.5) sc = skin*.9;                                            /* socket collar */
    else if(part > 2.5 && part < 3.5) sc = mix(skin*1.04, bone*1.08, smoothstep(.5,.72,lenT));   /* venom spine: glandular sheath, bare tip */
    else if(part > 3.5 && part < 4.5) sc = mix(bone*.5, bone*.86, tipT);
    else if(part > 4.5) sc = mix(skin*1.06 + .04, vec3(.93,.9,.82), smoothstep(.15,.6,lenT));
    col = sc; a = 1.0;
  }`,
  // after the normal: rays stand proud of the membrane (lit relief, not a painted line)
  fragBump: `
  if(part < .5 && vSkin.z < .5){
    float hgt = ray*(1.0-root)*(1.0 + .5*isSpine); vec3 dpx = dFdx(vWP), dpy = dFdy(vWP); float hx = dFdx(hgt), hy = dFdy(hgt);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1); vec3 gr = sign(det)*(hx*r1 + hy*r2);
    N = normalize(abs(det)*N - uLen*.002*gr);
  }`,
};
