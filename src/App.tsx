import { useEffect, useRef } from 'react';
import './engine/fish.css';
import './ui.css';

export default function App() {
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (window as any).__fgShowError = function (msg: string) {
      const o = document.getElementById('errOverlay'), t = document.getElementById('errText');
      if (o && t) { t.textContent += (t.textContent ? '\n\n' : '') + msg; o.classList.remove('hidden'); }
      else console.error(msg);
    };
    const onErr = (e: ErrorEvent) => (window as any).__fgShowError((e.message || 'Error') + '\n' + (e.filename || '') + ':' + (e.lineno || '') + (e.error && e.error.stack ? '\n' + e.error.stack : ''));
    const onRej = (e: PromiseRejectionEvent) => (window as any).__fgShowError('Unhandled rejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
    addEventListener('error', onErr); addEventListener('unhandledrejection', onRej);
    import('./engine/fishgen.js').then(m => m.boot()).catch(e => (window as any).__fgShowError(String(e && e.stack ? e.stack : e)));
    return () => { removeEventListener('error', onErr); removeEventListener('unhandledrejection', onRej); };
  }, []);

  /* ── simplified UI: instant, compositor-driven poof on every new fish + "Explore environment" ──
     The poof is plain DOM + CSS transform/opacity animations, so it runs on the GPU compositor thread and stays smooth even while
     the main thread is busy building the next fish. The build itself is started two frames AFTER the poof, hidden under it. */
  useEffect(() => {
    const $ = (id: string) => document.getElementById(id) as any;
    const gl = $('gl') as HTMLElement, layer = $('poof') as HTMLElement, name = $('fishName');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const R = () => Math.min(innerWidth, innerHeight);
    const burst = (big: boolean) => {
      if (reduce) return;
      const r = R(), f = document.createDocumentFragment(), add = (cls: string, vars: Record<string, string>, ms: number) => {
        const e = document.createElement('i'); e.className = cls; for (const k in vars) e.style.setProperty(k, vars[k]);
        e.style.animationDuration = ms + 'ms'; e.addEventListener('animationend', () => e.remove(), { once: true }); f.appendChild(e);
      };
      const n = big ? 1 : .6;
      for (let i = 0; i < 12 * n + 2; i++) { const a = Math.random() * 6.2832, d = r * (.1 + Math.random() * .26); add('pf-puff', { '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d * .75 + 'px', '--sz': r * (.14 + Math.random() * .16) + 'px', '--s': String(1.2 + Math.random() * .9), '--hue': String(172 + Math.random() * 28) }, 620 + Math.random() * 300); }
      for (let i = 0; i < 14 * n; i++) { const a = Math.random() * 6.2832, d = r * (.12 + Math.random() * .34); add('pf-bub', { '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d - r * .12 + 'px', '--sz': 5 + Math.random() * 14 + 'px' }, 700 + Math.random() * 500); }
      for (let i = 0; i < 9 * n; i++) { const a = Math.random() * 6.2832, d = r * (.1 + Math.random() * .3); add('pf-star', { '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px', '--sz': 8 + Math.random() * 12 + 'px', '--hue': String(45 + Math.random() * 150) }, 450 + Math.random() * 350); }
      add('pf-ring', { '--sz': r * .5 + 'px' }, 520);
      layer.appendChild(f);
    };
    let waiting = 0, safety = 0;
    const hideOld = () => { gl.classList.remove('fish-in'); gl.classList.add('fish-out'); };
    const reveal = () => { clearTimeout(safety); waiting = 0; gl.classList.remove('fish-out', 'fish-in'); void gl.offsetWidth; gl.classList.add('fish-in'); burst(false); };
    /* start a generation: poof first (instant), build after two painted frames */
    const startWith = (run: () => void) => {
      if (waiting) return; waiting = 1; burst(true); hideOld();
      clearTimeout(safety); safety = window.setTimeout(reveal, 9000);
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(run, 0)));
    };
    const mo = new MutationObserver(() => { if (waiting) reveal(); else { gl.classList.remove('fish-out', 'fish-in'); void gl.offsetWidth; gl.classList.add('fish-in'); burst(true); } });
    mo.observe(name, { childList: true, characterData: true, subtree: true });

    const btnRandom = $('btnRandom') as HTMLButtonElement; let replay = false;
    const onRandom = (e: Event) => { if (replay) return; e.stopImmediatePropagation(); e.preventDefault(); startWith(() => { replay = true; btnRandom.click(); replay = false; }); };
    btnRandom.addEventListener('click', onRandom, true);

    /* Explore environment = the original v11 "New Fish" button: a fresh realistic species / lineage for the chosen environment (seed cleared, normal generate path) */
    const caption = $('exploreCaption'), hab = $('selHabitat') as HTMLSelectElement, sp = $('selSpecies') as HTMLSelectElement;
    const habLabel = () => hab.options[hab.selectedIndex]?.text || '';
    const idleText = () => { caption.textContent = habLabel() ? 'Environment: ' + habLabel() : 'Pick an environment, or just create a fish'; };
    $('btnExplore').addEventListener('click', () => {
      caption.textContent = 'Exploring ' + habLabel();
      startWith(() => { sp.value = ''; $('selClade').value = ''; $('selNiche').value = ''; (document.querySelector('[data-act="generate"]') as HTMLElement).click(); setTimeout(() => { caption.textContent = 'Exploring ' + habLabel() + ' · ' + ((name.firstChild && name.firstChild.textContent) || ''); }, 0); });
    });
    btnRandom.addEventListener('click', () => { setTimeout(idleText, 0); });
    hab.addEventListener('change', () => { sp.value = ''; idleText(); }, true);
    const iv = setInterval(() => { if (hab.options.length) { idleText(); clearInterval(iv); } }, 300);
    return () => { mo.disconnect(); btnRandom.removeEventListener('click', onRandom, true); clearInterval(iv); clearTimeout(safety); };
  }, []);

  return (
    <>
      <canvas id="gl" />
      <div id="poof" aria-hidden="true" />
      <div className="brandmark">HyperFish<small>procedural fish generator</small></div>
      <div id="hud"><div id="fishName">…</div><div id="fishSci"></div><div id="fishTags"></div><div id="stats"></div></div>
      <main className="dock">
        <div id="exploreCaption" className="dock-caption">Pick an environment, or just create a fish</div>
        <button id="btnRandom" className="mega" title="Create a brand-new random fish adapted to the chosen environment"><span className="mega-ico" aria-hidden="true">✦</span><span>Create random fish</span></button>
        <div className="env-row">
          <label className="env"><span>Environment</span><select id="selHabitat" title="Environment" aria-label="Environment"></select></label>
          <button id="btnExplore" className="explore" title="Walk through the real fish species that live in this environment, one by one">Explore environment <span aria-hidden="true">→</span></button>
        </div>
      </main>
      <div className="legacy" aria-hidden="true">
      <header className="bar top">
        <div className="brand">IchthyoGen<small>Hyperreal Anatomy Engine / 04 · Procedural genome</small></div>
        <select id="selNiche" title="Niche" aria-label="Ecological niche"></select>
        <select id="selClade" title="Clade" aria-label="Evolutionary clade"></select>
        <select id="selSpecies" title="Species card" aria-label="Reference species"></select>
        <select id="selMix" title="Second parent" aria-label="Mix with"></select>
        <input id="mixRatio" type="range" min="10" max="90" defaultValue="50" title="Share of the second parent (10-90%)" aria-label="Mix ratio" style={{ width: 60, padding: 0, minHeight: 28, border: 0, background: 'none' }} />
        <button id="btnMix" className="primary" title="Cross the current fish with the selected parent">Mix</button>
        <input id="seed" type="text" placeholder="seed" style={{ width: 90 }} title="Seed" aria-label="Generation seed" />
        <button id="btnGenerate">Generate</button>
        <input id="nameInput" type="text" placeholder="Name a creature… e.g. yellowfin tuna" style={{ width: 230, maxWidth: '52vw' }} aria-label="Creature name or description" />
        <button id="btnConvert" className="primary">Convert</button>
      </header>
      <nav className="bar bottom">
        <button data-tab="proc" id="btnProc" className="primary" title="Seeded procedural genome: Random, seed, Mutate, Breed, gallery">Procedural</button>
        <button data-act="generate">New Fish</button>
        <button data-act="discover" title="Invent a coherent species that has never existed">Discover</button>
        <select id="selMutation" title="Which anatomical module to evolve" aria-label="Mutation target" defaultValue="auto">
          <option value="auto">Mutation: guided</option>
          <option value="drift">Adaptive drift</option>
          <option value="donor">Gene flow (from Mix parent)</option>
          <option value="habitat">Adapt to habitat (gradual)</option>
          <option value="innovate">Innovate: new organ</option>
          <option value="speed">Streamlining</option>
          <option value="agility">Body depth</option>
          <option value="finShape">Fin silhouette</option>
          <option value="display">Fin growth</option>
          <option value="tail">Tail propulsion</option>
          <option value="feeding">Head and jaw</option>
          <option value="shelter">Elongation</option>
        </select>
        <button data-act="mutate" id="btnMutate">Mutate</button>
        <button data-act="undo" id="btnUndo" title="Restore the previous genome">Undo</button>
        <button data-act="breed" title="Constrained virtual crossover with the previous fish">Breed</button>
        <button data-act="school" id="btnSchool">School</button>
        <button data-act="mode" id="btnMode">Studio</button>
        <button data-tab="mix" id="btnMixTab">Hybrid Lab</button>
        <button data-tab="evo" id="btnEvoTab">Evolution</button>
        <button data-tab="god" id="btnGod">God Mode</button>
        <button data-tab="inspect">Genome</button>
        <button data-tab="tree">Tree</button>
        <button data-tab="gallery">Gallery</button>
        <button data-tab="text">Text</button>
        <button data-tab="export">Export</button>
        <button data-tab="debug">Debug</button>
        <button data-tab="tests">Tests</button>
        <button data-tab="help">Guide</button>
      </nav>
      <section id="sheet" className="hidden" aria-label="Fish creation tools">
        <div className="sheet-head"><span id="sheetTitle"></span><button id="sheetClose" className="sm" aria-label="Close tools">Close</button></div>
        <div id="sheetBody"></div>
      </section>
      </div>
      <div id="toast" role="status" aria-live="polite"></div>
      <div id="errOverlay" className="hidden"><h3>Something went wrong</h3><pre id="errText"></pre><button id="errClose">Dismiss</button></div>
    </>
  );
}
