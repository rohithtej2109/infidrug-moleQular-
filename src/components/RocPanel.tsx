import { useMemo, useRef, useState } from "react";
import { FileUp, Info, RotateCcw, X } from "lucide-react";
import { MODELS_5 } from "../data/models5";
import { parseNpy, rocCurve } from "../lib/roc";
import type { RocCurve } from "../lib/roc";

const COLORS: Record<string, string> = {
  gb: "#0d6e63", rf: "#3fae9b", qrf: "#7c5cbf", qsvr: "#9b7fd4", vqr: "#c0aef0",
};
const PREFIXES = ["gb", "rf", "qrf", "qsvr", "vqr"];
const W = 540;
const H = 380;
const PAD = { top: 18, right: 18, bottom: 44, left: 48 };

type Loaded = { id: string; curve: RocCurve };

export default function RocPanel() {
  const [labels, setLabels] = useState<Float64Array | null>(null);
  const [curves, setCurves] = useState<Loaded[]>([]);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const nextLabels = labels;
    const nextCurves = [...curves];
    let usedLabels = nextLabels;
    for (const file of Array.from(files)) {
      try {
        const { data } = parseNpy(await file.arrayBuffer());
        const base = file.name.toLowerCase();
        if (base.includes("y_test") || base.includes("ytest")) {
          usedLabels = data;
          continue;
        }
        const prefix = PREFIXES.find((candidate) => base.startsWith(candidate) || base.includes(`_${candidate}_`));
        if (!prefix) { setError(`Skipped ${file.name}: filename must start with gb, rf, qrf, qsvr or vqr.`); continue; }
        if (usedLabels && usedLabels.length !== data.length) {
          setError(`${file.name} has ${data.length} rows but y_test.npy has ${usedLabels.length}.`);
          continue;
        }
        if (!usedLabels) { setError("Load y_test.npy first, then the prediction vectors."); continue; }
        const curve = rocCurve(data, usedLabels);
        if (!curve) { setError(`${file.name} does not contain two classes at the logS ≥ -2.0 threshold.`); continue; }
        const existing = nextCurves.findIndex((item) => item.id === prefix);
        if (existing >= 0) nextCurves[existing] = { id: prefix, curve };
        else nextCurves.push({ id: prefix, curve });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : `Could not read ${file.name}.`);
      }
    }
    setLabels(usedLabels);
    setCurves(nextCurves.sort((a, b) => b.curve.auc - a.curve.auc));
    if (input.current) input.current.value = "";
  };

  const axis = (value: number) => PAD.left + value * (W - PAD.left - PAD.right);
  const axisY = (value: number) => H - PAD.bottom - value * (H - PAD.top - PAD.bottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const sorted = useMemo(() => [...MODELS_5].sort((a, b) => a.family.localeCompare(b.family)), []);

  return <section className="surface plot-surface roc-panel">
    <div className="section-top">
      <div><span className="mini-kicker">ROC ANALYSIS / THRESHOLD logS ≥ -2.0</span>
        <h2>Receiver operating characteristic</h2></div>
      <div className="roc-actions">
        <input ref={input} type="file" accept=".npy" multiple className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)} aria-label="Load prediction vectors" />
        <button className="button button-secondary" onClick={() => input.current?.click()}>
          <FileUp size={15} /> Load .npy vectors
        </button>
        {curves.length > 0 && <button className="button button-quiet" onClick={() => { setCurves([]); setLabels(null); }}>
          <RotateCcw size={15} /> Reset
        </button>}
      </div>
    </div>

    <p className="section-description">
      The notebooks save <code>y_test.npy</code> and one prediction vector per model
      (<code>rf_pred.npy</code>, <code>gb_pred.npy</code>, <code>qrf_pred.npy</code>,
      <code>qsvr_pred.npy</code>, <code>vqr_pred.npy</code>). Load them here and the curves are
      computed in this browser — no values are estimated and nothing is uploaded.
    </p>

    {curves.length === 0
      ? <div className="roc-placeholder">
        <div className="roc-placeholder-copy">
          <strong>No prediction vectors loaded</strong>
          <p>Run the notebooks, then load <code>y_test.npy</code> together with the prediction
            vectors. Each curve is drawn from the exported scores at the same threshold used in the
            notebooks. Because ROC needs every held-out score, it cannot be derived from MAE, RMSE
            or R² alone.</p>
        </div>
        <div className="roc-file-list">
          {sorted.map((model) => <div key={model.id}>
            <i style={{ background: COLORS[model.id] }} />
            <span>{model.name}</span>
            <code>{model.id === "gb" ? "gb_pred.npy" : model.id === "rf" ? "rf_pred.npy" : `${model.id}_pred.npy`}</code>
          </div>)}
          <div className="roc-file-target"><i /><span>Held-out targets</span><code>y_test.npy</code></div>
        </div>
      </div>
      : <div className="roc-body">
        <svg className="roc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ROC curves for the five models">
          {ticks.map((tick) => <g key={tick}>
            <line x1={axis(tick)} x2={axis(tick)} y1={PAD.top} y2={H - PAD.bottom} stroke="#e8efea" />
            <line x1={PAD.left} x2={W - PAD.right} y1={axisY(tick)} y2={axisY(tick)} stroke="#e8efea" />
            <text x={PAD.left - 8} y={axisY(tick) + 3} textAnchor="end" className="roc-tick">{tick}</text>
            <text x={axis(tick)} y={H - PAD.bottom + 16} textAnchor="middle" className="roc-tick">{tick}</text>
          </g>)}
          <line x1={axis(0)} y1={axisY(0)} x2={axis(1)} y2={axisY(1)} stroke="#b8c7bd" strokeDasharray="5 5" />
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#9db1a5" />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="#9db1a5" />
          {curves.map(({ id, curve }) => {
            const path = curve.fpr.map((value, index) =>
              `${index === 0 ? "M" : "L"}${axis(value).toFixed(2)},${axisY(curve.tpr[index]).toFixed(2)}`).join(" ");
            return <g key={id}>
              <path d={path} fill="none" stroke={COLORS[id]} strokeWidth="2.1" strokeLinejoin="round" />
              {curve.fpr.map((value, index) => index % 12 === 0 &&
                <circle key={index} cx={axis(value)} cy={axisY(curve.tpr[index])} r="2" fill={COLORS[id]} />)}
            </g>;
          })}
          <text x={W / 2} y={H - 6} textAnchor="middle" className="roc-axis">False positive rate</text>
          <text transform={`translate(13 ${H / 2}) rotate(-90)`} textAnchor="middle" className="roc-axis">True positive rate</text>
        </svg>
        <div className="roc-legend">
          <div className="roc-legend-head"><span>MODEL</span><span>AUC</span></div>
          {curves.map(({ id, curve }) => {
            const model = MODELS_5.find((entry) => entry.id === id);
            return <div key={id} className="roc-legend-row">
              <i style={{ background: COLORS[id] }} />
              <span>{model?.short}</span>
              <strong>{curve.auc.toFixed(4)}</strong>
            </div>;
          })}
          <p className="roc-legend-note"><Info size={13} /> Random guess AUC = 0.5000.</p>
        </div>
      </div>}

    {error && <div className="roc-error"><X size={15} /><span>{error}</span>
      <button onClick={() => setError("")} aria-label="Dismiss"><X size={13} /></button></div>}
    {labels && <p className="roc-note">{labels.length.toLocaleString()} held-out scores loaded ·
      positives at logS ≥ -2.0: {curves[0]?.curve.positives.toLocaleString() ?? "—"} ·
      negatives: {curves[0]?.curve.negatives.toLocaleString() ?? "—"}</p>}
  </section>;
}
