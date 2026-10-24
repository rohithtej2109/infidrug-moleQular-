import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import type { RDKit } from "../lib/chemistry";
import { circularLayout, moleculeGraph, tokenizeSmiles, traversalOrder } from "../lib/smiles";
import type { MolGraph, SmilesToken } from "../lib/smiles";

const EXAMPLES = ["CC(=O)Oc1ccccc1C(=O)O", "CN1C=NC2=C1C(=O)N(C)C(=O)N2C", "c1ccsc1", "CCO"];
const W = 460;
const H = 340;
const SPEEDS = [
  { label: "Slow", ms: 900 },
  { label: "Normal", ms: 520 },
  { label: "Fast", ms: 240 },
];

type Built = { graph: MolGraph; canonical: string; tokens: SmilesToken[]; order: number[]; bonds: MolGraph["bonds"] };

function captionFor(built: Built, step: number): { stage: string; text: string } {
  if (step <= 0) {
    return { stage: "Graph", text: "RDKit parses the molecule into a graph: every atom becomes a node and every bond an edge. Nothing has been written yet." };
  }
  const revealed = built.canonical.slice(0, revealEnd(built, step));
  const hasRing = /\d/.test(revealed);
  const done = step >= built.order.length;
  if (done) {
    return { stage: "Canonical SMILES", text: "The walk is complete. This exact string is the canonical SMILES RDKit computes for the molecule — the same string stored in the dataset column." };
  }
  if (hasRing) {
    return { stage: "Ring closures", text: "When the walk returns to an atom it has already visited, a digit records the ring-closure bond instead of drawing the atom again." };
  }
  if (step === 1) {
    return { stage: "Start atom", text: "The walk begins at one atom and writes its element symbol. Bracket atoms keep explicit hydrogens and charges inside [ ]." };
  }
  return { stage: "Depth-first walk", text: "The walk moves along bonds, appending each atom symbol. Side branches are wrapped in ( ) and written before returning to the main chain." };
}

function revealEnd(built: Built, step: number): number {
  const atoms = built.tokens.filter((token) => token.kind === "atom");
  if (step <= 0) return 0;
  if (step >= atoms.length) return built.canonical.length;
  return atoms[step - 1].end;
}

export default function SmilesAnimation({ rdkit }: { rdkit: RDKit | null }) {
  const [input, setInput] = useState(EXAMPLES[0]);
  const [built, setBuilt] = useState<Built | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<number | null>(null);

  const build = (smiles: string) => {
    if (!rdkit) { setError("RDKit is still loading."); return; }
    const graph = moleculeGraph(rdkit, smiles);
    if (!graph) { setError("RDKit could not parse this SMILES string."); setBuilt(null); return; }
    let canonical = smiles.trim();
    try {
      const probe = rdkit.get_mol(smiles.trim());
      if (probe) { canonical = probe.get_smiles(); probe.delete(); }
    } catch { canonical = smiles.trim(); }
    const tokens = tokenizeSmiles(canonical);
    setBuilt({ graph, bonds: graph.bonds, canonical, tokens, order: traversalOrder(graph, tokens) });
    setStep(0);
    setPlaying(true);
    setError("");
  };

  useEffect(() => {
    if (rdkit && !built) build(EXAMPLES[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rdkit]);

  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (!playing || !built) return;
    timer.current = window.setInterval(() => {
      setStep((current) => {
        if (current >= built.order.length) { setPlaying(false); return current; }
        return current + 1;
      });
    }, SPEEDS[speed].ms);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, built, speed]);

  const total = built?.order.length ?? 0;
  const revealed = built ? built.canonical.slice(0, revealEnd(built, step)) : "";
  const caption = built ? captionFor(built, step) : { stage: "", text: "" };
  const points = useMemo(() =>
    built ? circularLayout(built.graph.atoms.length, W, H, Math.min(132, 34 + built.graph.atoms.length * 9)) : [],
  [built]);
  const visited = useMemo(() => new Set(built ? built.order.slice(0, step) : []), [built, step]);
  const current = built && step > 0 ? built.order[step - 1] : null;
  const visitedBonds = useMemo(() => new Set(
    (built?.bonds ?? []).filter((bond) => visited.has(bond.from) && visited.has(bond.to))
      .map((bond) => [bond.from, bond.to].sort().join("-")),
  ), [built, visited]);

  return <section className="surface smiles-anim">
    <div className="section-top">
      <div><span className="mini-kicker">STRUCTURE TO STRING</span><h2>How a molecule becomes SMILES</h2></div>
      <div className="smiles-controls">
        {EXAMPLES.map((example) => <button key={example} onClick={() => { setInput(example); build(example); }}
          className={input === example ? "chip active" : "chip"}>{example.length > 14 ? `${example.slice(0, 13)}…` : example}</button>)}
      </div>
    </div>

    <form className="predict-form smiles-form" onSubmit={(event) => { event.preventDefault(); build(input); }}>
      <div className="predict-input-row">
        <input spellCheck={false} value={input} onChange={(event) => setInput(event.target.value)}
          placeholder="Paste any SMILES string" aria-label="SMILES to animate" />
        <button type="submit" className="button button-primary" disabled={!rdkit}>Animate <Play size={15} fill="currentColor" /></button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </form>

    {!built ? <p className="notebook-code-status">{rdkit ? "Enter a SMILES string to start." : "Loading RDKit…"}</p> : <>
      <div className="smiles-stages">
        {["Graph", "Start atom", "Depth-first walk", "Ring closures", "Canonical SMILES"].map((label, index) => {
          const order = ["Graph", "Start atom", "Depth-first walk", "Ring closures", "Canonical SMILES"];
          const active = order.indexOf(caption.stage) >= index;
          return <div key={label} className={`smiles-stage ${active ? "active" : ""}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>{label}
          </div>;
        })}
      </div>

      <div className="smiles-grid">
        <div className="smiles-canvas">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Molecular graph being traversed">
            {built.bonds.map((bond, index) => {
              const from = points[bond.from];
              const to = points[bond.to];
              if (!from || !to) return null;
              const lit = visitedBonds.has([bond.from, bond.to].sort().join("-"));
              return <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={lit ? "#168a78" : "#c9d8cd"} strokeWidth={lit ? 2.4 : 1.4}
                strokeDasharray={bond.order === 2 ? "6 4" : undefined} />;
            })}
            {built.graph.atoms.map((atom, index) => {
              const point = points[index];
              if (!point) return null;
              const isVisited = visited.has(atom.index);
              const isCurrent = current === atom.index;
              return <g key={atom.index} className={`smiles-node ${isCurrent ? "current" : isVisited ? "visited" : ""}`}>
                <circle cx={point.x} cy={point.y} r={isCurrent ? 20 : 17}
                  fill={isCurrent ? "#7c5cbf" : isVisited ? "#168a78" : "#ffffff"}
                  stroke={isCurrent ? "#7c5cbf" : isVisited ? "#168a78" : "#b7c9bc"} strokeWidth="1.6" />
                <text x={point.x} y={point.y + 4} textAnchor="middle"
                  fill={isVisited || isCurrent ? "#ffffff" : "#5d7268"}>{atom.symbol}</text>
              </g>;
            })}
          </svg>
          <div className="smiles-progress"><span style={{ width: `${(step / total) * 100}%` }} /></div>
        </div>

        <div className="smiles-readout">
          <span className="mini-kicker">STRING BEING WRITTEN</span>
          <div className="smiles-string">
            <code>{revealed}</code>
            {step < total && <span className="smiles-caret" />}
          </div>
          <p className="smiles-caption"><strong>{caption.stage}</strong> {caption.text}</p>
          <div className="smiles-tokens">
            {built.tokens.map((token, index) => {
              const shown = token.start < revealed.length;
              return <span key={index}
                className={`smiles-token ${token.kind} ${shown ? "shown" : ""}`}>{token.text}</span>;
            })}
          </div>
          <div className="smiles-player">
            <button onClick={() => { setPlaying(false); setStep(0); }} aria-label="Reset"><RotateCcw size={16} /></button>
            <button onClick={() => { setPlaying(false); setStep((value) => Math.max(0, value - 1)); }} aria-label="Previous step"><SkipBack size={16} /></button>
            <button className="smiles-play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
            </button>
            <button onClick={() => { setPlaying(false); setStep((value) => Math.min(total, value + 1)); }} aria-label="Next step"><SkipForward size={16} /></button>
            <div className="segment smiles-speed">{SPEEDS.map((option, index) =>
              <button key={option.label} className={speed === index ? "selected" : ""}
                onClick={() => setSpeed(index)}>{option.label}</button>)}</div>
          </div>
        </div>
      </div>

      <p className="smiles-note"><strong>What is real here:</strong> the graph, the element symbols and the final
        string are RDKit output for the molecule you entered. <strong>What is illustrative:</strong> the highlighted
        walk is a reconstruction — RDKit does not expose its internal canonical ranking, so the highlighted order
        approximates the writing sequence.</p>
    </>}
  </section>;
}
