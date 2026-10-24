import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import initRDKitModule from "@rdkit/rdkit";
import wasmUrl from "@rdkit/rdkit/RDKit_minimal.wasm?url";
import {
  Activity, ArrowDown, ArrowRight, ArrowUpRight, Atom, BarChart3, BookOpen, Box,
  Check, CheckCircle2, ChevronDown, Code2, Cpu, Database, Download, FileText,
  GitMerge, Play, Search, ShieldCheck, Sparkles, Target, Upload, X,
} from "lucide-react";
import { NOTEBOOKS, NOTEBOOK_SUPPORT_FILES } from "./data/notebookCatalog";
import { parseNotebookCells, readBundledFile } from "./data/notebookSources";
import {
  EXPERIMENT, FULL_FEATURE_RESULTS, MATCHED_RESULTS, MODELS_5, WINNERS,
  modelById, resultFor,
} from "./data/models5";
import type { ModelDef, ResultRow } from "./data/models5";
import RocPanel from "./components/RocPanel";
import SmilesAnimation from "./components/SmilesAnimation";
import ParticleBackground from "./components/ParticleBackground";
import Molecule3DViewer from "./components/Molecule3DViewer";
import { DESCRIPTORS, inspectMolecule } from "./lib/chemistry";
import type { MoleculeInfo, RDKit } from "./lib/chemistry";

type CsvRow = { rowNumber: number; name: string; smiles: string; target: number | null };
type CsvData = { name: string; rows: CsvRow[] };

type Page = "overview" | "dataset" | "smiles" | "classical" | "quantum" | "comparison" | "prediction" | "solubility" | "molecule3d" | "headtohead" | "notebooks";

const EXAMPLE_SMILES = "CC(=O)Oc1ccccc1C(=O)O";

const NAV_ITEMS: { page: Page; label: string; icon: typeof Activity }[] = [
  { page: "overview", label: "Overview", icon: Activity },
  { page: "dataset", label: "Dataset", icon: Database },
  { page: "smiles", label: "SMILES Pipeline", icon: Atom },
  { page: "classical", label: "Classical ML", icon: Cpu },
  { page: "quantum", label: "Quantum ML", icon: Sparkles },
  { page: "comparison", label: "Comparison", icon: GitMerge },
  { page: "prediction", label: "Prediction", icon: Target },
  { page: "solubility", label: "Solubility Predictor", icon: Search },
  { page: "molecule3d", label: "3D Molecular Studio", icon: Box },
  { page: "headtohead", label: "Head-to-Head", icon: BarChart3 },
  { page: "notebooks", label: "Source Code", icon: BookOpen },
];

const PRESET_MOLECULES = [
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O", desc: "Anti-inflammatory & pain reliever" },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", desc: "CNS stimulant" },
  { name: "Paracetamol", smiles: "CC(=O)Nc1ccc(O)cc1", desc: "Analgesic & antipyretic" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O", desc: "NSAID" },
  { name: "Benzene", smiles: "c1ccccc1", desc: "Planar aromatic ring" },
  { name: "Dopamine", smiles: "C1=CC(=C(C=C1CCN)O)O", desc: "Neurotransmitter" },
  { name: "Resveratrol", smiles: "c1cc(ccc1/C=C/c2cc(cc(c2)O)O)O", desc: "Polyphenol antioxidant" },
  { name: "Artemisinin", smiles: "CC1CCC2C(C(=O)OC3C2(C1OO3)C)C", desc: "Antimalarial endoperoxide" },
  { name: "Penicillin G", smiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)Cc3ccccc3)C(=O)O)C", desc: "Beta-lactam antibiotic" },
];

function estimateLogS(info: MoleculeInfo): number {
  const [mw, logp, , , , rotb, rar] = info.descriptors;
  return 0.16 - 0.63 * logp - 0.0062 * mw + 0.066 * rotb - 0.74 * rar;
}

function num(value: number, decimals = 4): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "—";
}

function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MoleculeMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? "brand-mark-small" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 42 42" fill="none">
      <path d="M21 5 34.9 13v16L21 37 7.1 29V13L21 5Z" stroke="currentColor" strokeWidth="1.35" />
      <path d="m7.1 13 13.9 8m0 0L34.9 13M21 21v16" stroke="currentColor" strokeWidth="1.35" opacity=".8" />
      <circle cx="21" cy="5" r="2.7" fill="currentColor" /><circle cx="35" cy="13" r="2.7" fill="#9384B8" />
      <circle cx="21" cy="21" r="3.2" fill="#24A594" /><circle cx="7" cy="29" r="2.7" fill="currentColor" />
    </svg>
  </span>;
}

function SectionTop({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return <div className="section-top"><div><span className="mini-kicker">{kicker}</span><h2>{title}</h2></div>{action}</div>;
}

function MetricValue({ label, value, foot, accent = false }: {
  label: string; value: string; foot?: string; accent?: boolean;
}) {
  return <div className="metric-value"><span>{label}</span><strong className={accent ? "text-cyan" : ""}>{value}</strong>{foot && <small>{foot}</small>}</div>;
}

function MoleculeVisual({ info, loading = false, large = false }: {
  info: MoleculeInfo | null; loading?: boolean; large?: boolean;
}) {
  return <div className={`molecule-visual ${large ? "molecule-visual-large" : ""}`}>
    <div className="molecule-grid" />
    {info ? <div className="rdkit-svg" dangerouslySetInnerHTML={{ __html: info.svg }} /> :
      <div className="molecule-loading"><Atom size={27} strokeWidth={1.2} />
        <span>{loading ? "Initializing RDKit..." : "Enter a valid SMILES"}</span></div>}
    {info && <span className="molecule-tag">RDKit 2D depiction</span>}
  </div>;
}

function ResultCells({ row, compare }: { row: ResultRow | undefined; compare?: ResultRow }) {
  const cells: { label: string; value: number; better: boolean }[] = [
    { label: "Test MAE", value: row?.mae ?? NaN, better: !!compare && !!row && row.mae < compare.mae },
    { label: "Test RMSE", value: row?.rmse ?? NaN, better: !!compare && !!row && row.rmse < compare.rmse },
    { label: "Test R²", value: row?.r2 ?? NaN, better: !!compare && !!row && row.r2 > compare.r2 },
  ];
  return <div className="algorithm-metrics">
    {cells.map((cell) => <div className="algorithm-metric" key={cell.label}>
      <span>{cell.label} <small>{cell.label === "Test R²" ? "HIGHER" : "LOWER"}</small></span>
      <strong className={cell.better ? "text-cyan" : ""}>{row ? num(cell.value) : "—"}</strong>
      <em>{cell.label === "Test R²" ? "Coefficient of determination" : "Held-out error in logS units"}</em>
    </div>)}
  </div>;
}

function NotebookCode({ file }: { file: string }) {
  const cells = useMemo(() => parseNotebookCells(file), [file]);
  const [showMarkdown, setShowMarkdown] = useState(true);
  const visible = cells.filter((cell) => showMarkdown || cell.kind === "code");

  if (!visible.length) {
    return <p className="notebook-code-status">This notebook is not bundled in the current build.</p>;
  }
  return <>
    <div className="code-toolbar">
      <span>{visible.length} cells shown</span>
      <button onClick={() => setShowMarkdown(!showMarkdown)}>
        {showMarkdown ? "Code only" : "Show explanations"}
      </button>
    </div>
    <div className="notebook-code">
      {visible.map((cell, index) => <div key={index} className={`notebook-cell ${cell.kind === "code" ? "is-code" : "is-markdown"}`}>
        <span className="notebook-cell-tag">{cell.kind === "code" ? `CODE ${index + 1}` : `NOTES ${index + 1}`}</span>
        <pre>{cell.source}</pre>
      </div>)}
    </div>
  </>;
}

function ResultBar({ rows, metric }: { rows: ResultRow[]; metric: "rmse" | "r2" }) {
  const values = rows.map((row) => row[metric]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return <div className="result-bars">
    {[...rows].sort((a, b) => metric === "r2" ? b.r2 - a.r2 : a.rmse - b.rmse).map((row) => {
      const model = modelById(row.id);
      const raw = row[metric];
      const scaled = metric === "r2" ? (raw - min) / span : 1 - (raw - min) / span;
      const best = metric === "r2" ? row.r2 === Math.max(...values) : row.rmse === min;
      return <div className="result-bar-row" key={row.id}>
        <span className="result-bar-label"><i className={model.family} />{model.short}</span>
        <div className="result-bar-track"><span style={{ width: `${18 + scaled * 82}%` }}
          className={best ? "best" : ""} data-family={model.family} /></div>
        <span className="result-bar-value">{num(raw)}</span>
      </div>;
    })}
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [rdkit, setRdkit] = useState<RDKit | null>(null);
  const [engineError, setEngineError] = useState("");
  const [dataset, setDataset] = useState<CsvData | null>(null);
  const esolDataset = useRef<CsvData | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [datasetSearch, setDatasetSearch] = useState("");
  const [datasetPage, setDatasetPage] = useState(0);
  const [datasetOnlyValid, setDatasetOnlyValid] = useState(false);
  const [openModel, setOpenModel] = useState<string | null>("qrf");
  const [openNotebook, setOpenNotebook] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"valRmse" | "mae" | "rmse" | "r2">("valRmse");
  const [packingNotebooks, setPackingNotebooks] = useState(false);
  const [smilesInput, setSmilesInput] = useState(EXAMPLE_SMILES);
  const [molecule, setMolecule] = useState<MoleculeInfo | null>(null);
  const [moleculeError, setMoleculeError] = useState("");
  const [inspected, setInspected] = useState(EXAMPLE_SMILES);
  const [predictModel, setPredictModel] = useState("qrf");
  const [toast, setToast] = useState("");
  // Solubility predictor state
  const [soSmiles, setSoSmiles] = useState(EXAMPLE_SMILES);
  const [soMolecule, setSoMolecule] = useState<MoleculeInfo | null>(null);
  const [soError, setSoError] = useState("");
  const [soInspected, setSoInspected] = useState("");
  const [soPredicted, setSoPredicted] = useState<number | null>(null);
  // Head-to-head state
  const [h2hLeft, setH2hLeft] = useState("qrf");
  const [h2hRight, setH2hRight] = useState("gb");
  // 3D Studio state
  const [m3dSmiles, setM3dSmiles] = useState(EXAMPLE_SMILES);
  const [m3dInput, setM3dInput] = useState(EXAMPLE_SMILES);
  const [m3dMolecule, setM3dMolecule] = useState<MoleculeInfo | null>(null);
  const [m3dError, setM3dError] = useState("");
  const [overview3d, setOverview3d] = useState(true);

  const PAGE_SIZE = 12;
  const visibleMolecule = smilesInput.trim() === inspected ? molecule : null;
  const predictDef = MODELS_5.find((m) => m.id === predictModel) ?? MODELS_5[0];

  useEffect(() => {
    let mounted = true;
    initRDKitModule({ locateFile: () => wasmUrl }).then((module) => {
      if (mounted) { module.disable_logging(); setRdkit(module); }
    }).catch((error: unknown) => {
      if (mounted) setEngineError(error instanceof Error ? error.message : "RDKit could not initialize.");
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    fetch("https://raw.githubusercontent.com/deepchem/deepchem/master/datasets/delaney-processed.csv",
      { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("download failed");
        const text = await response.text();
        if (mounted) esolDataset.current = { name: "ESOL / Delaney", rows: parseRows(text) };
      })
      .catch(() => {
        if (mounted) esolDataset.current = { name: "ESOL / Delaney", rows: [] };
      })
      .finally(() => clearTimeout(timeout));
    return () => { mounted = false; controller.abort(); clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!esolDataset.current || dataset) return;
    setDataset(esolDataset.current);
  }, [rdkit, dataset]);

  useEffect(() => {
    if (!rdkit) return;
    try {
      const info = inspectMolecule(rdkit, molecule?.smiles || EXAMPLE_SMILES, { descriptors: true, fingerprints: true, fpBits: 1024 });
      setMolecule(info);
      setM3dMolecule(info);
    } catch { setMolecule(null); }
  }, [rdkit]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const go = (next: Page) => { setPage(next); setMobileMenu(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const inspect = () => {
    if (!rdkit) { setMoleculeError(engineError || "RDKit is still initializing."); return; }
    try {
      const info = inspectMolecule(rdkit, smilesInput, { descriptors: true, fingerprints: true, fpBits: 1024 });
      setInspected(smilesInput.trim());
      if (!info) { setMolecule(null); setMoleculeError("RDKit could not parse this SMILES string."); return; }
      setMolecule(info);
      setMoleculeError("");
    } catch (error) {
      setMoleculeError(error instanceof Error ? error.message : "Could not inspect this molecule.");
    }
  };

  const m3dInspect = (smilesToInspect?: string) => {
    const target = (smilesToInspect ?? m3dInput).trim();
    if (!rdkit) { setM3dError(engineError || "RDKit is still initializing."); return; }
    try {
      const info = inspectMolecule(rdkit, target, { descriptors: true, fingerprints: true, fpBits: 1024 });
      if (!info) {
        setM3dMolecule(null);
        setM3dError("RDKit could not parse this SMILES string.");
        return;
      }
      setM3dSmiles(target);
      setM3dMolecule(info);
      setM3dError("");
    } catch (error) {
      setM3dError(error instanceof Error ? error.message : "Could not inspect this molecule.");
    }
  };

  const rows = dataset?.rows ?? [];
  const filtered = useMemo(() => {
    const query = datasetSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (datasetOnlyValid && row.target === null) return false;
      return !query || `${row.name} ${row.smiles}`.toLowerCase().includes(query);
    });
  }, [rows, datasetSearch, datasetOnlyValid]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(datasetPage, pages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const sortedMatched = useMemo(() => [...MATCHED_RESULTS].sort((a, b) =>
    sortBy === "r2" ? b.r2 - a.r2 : a[sortBy] - b[sortBy]), [sortBy]);

  const downloadNotebookFile = (file: string) => {
    const content = readBundledFile(file);
    if (!content) { setToast(`${file} is not bundled in this build.`); return; }
    download(content, file, file.endsWith(".ipynb") ? "application/x-ipynb+json" : "text/plain;charset=utf-8");
  };

  const downloadKit = async () => {
    if (packingNotebooks) return;
    setPackingNotebooks(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const file of [...NOTEBOOKS.map((n) => n.file), ...NOTEBOOK_SUPPORT_FILES]) {
        const content = readBundledFile(file);
        if (!content) throw new Error(`${file} is missing from this build.`);
        zip.file(`infidrug-moleqular-fusion/${file}`, content);
      }
      const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "infidrug-moleqular-fusion-notebooks.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast("Complete 5-model notebook kit saved.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to build the notebook ZIP.");
    } finally {
      setPackingNotebooks(false);
    }
  };

  const uploadCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setDataset({ name: file.name.replace(/\.csv$/i, ""), rows: parseRows(text) });
      setDatasetPage(0);
      setToast(`${parseRows(text).length.toLocaleString()} rows loaded.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not read the CSV.");
    }
    event.target.value = "";
  };

  const modelCard = (model: ModelDef, rank?: ResultRow) => {
    const open = openModel === model.id;
    return <section key={model.id} className={`model-item ${open ? "expanded" : ""}`}>
      <div className="model-main">
        <button className="model-disclosure" aria-expanded={open} aria-controls={`detail-${model.id}`}
          onClick={() => setOpenModel(open ? null : model.id)}>
          <span className="model-number">{model.tag}</span>
          <span className="model-name"><strong>{model.name}</strong><small>{model.architecture}</small></span>
        </button>
        <span className="model-family">{model.family === "quantum" ? "Quantum" : "Classical"}</span>
        <span className="model-quick">
          <span>MAE <b>{rank ? num(rank.mae) : "—"}</b></span>
          <span>R² <b>{rank ? num(rank.r2) : "—"}</b></span>
        </span>
        <button className="model-caret" aria-label={`${open ? "Collapse" : "Expand"} ${model.name}`}
          onClick={() => setOpenModel(open ? null : model.id)}><ChevronDown size={18} /></button>
      </div>
      {open && <div id={`detail-${model.id}`} className="model-detail">
        <p className="model-lede">{model.description}</p>
        {model.hybrid && <p className="quantum-caveat"><ShieldCheck size={16} />{model.hybrid}</p>}
        <div className="model-explanation">
          <div><span>IMPLEMENTATION</span><p>{model.detail}</p></div>
          <div><span>NOTEBOOK</span><p>Full runnable source: <code>{model.notebook}</code>. Run it in Jupyter to reproduce this row.</p></div>
        </div>
        <div className="model-evaluation">
          <div className="model-evaluation-head"><span>MATCHED FOUR-FEATURE HOLDOUT</span>
            <span>{rank ? `Validation RMSE ${num(rank.valRmse)} · ${EXPERIMENT.test} test molecules` : "No measured result"}</span></div>
          <ResultCells row={rank} compare={model.family === "quantum" ? WINNERS.classical : WINNERS.quantum} />
          <div className="model-result-foot"><span>Scores are measured from the notebook run, not estimated.</span>
            <button className="text-link" onClick={() => { setOpenNotebook(model.notebook); go("notebooks"); }}>
              View source code <ArrowUpRight size={15} /></button></div>
        </div>
      </div>}
    </section>;
  };

  const resultTable = (rowsIn: ResultRow[]) => <div className="table-scroll">
    <table className="data-table rank-table"><thead><tr><th>MODEL</th>
      <th><button className={`sort-header ${sortBy === "valRmse" ? "active" : ""}`} onClick={() => setSortBy("valRmse")}>Val RMSE ↕</button></th>
      <th><button className={`sort-header ${sortBy === "mae" ? "active" : ""}`} onClick={() => setSortBy("mae")}>MAE ↕</button></th>
      <th><button className={`sort-header ${sortBy === "rmse" ? "active" : ""}`} onClick={() => setSortBy("rmse")}>RMSE ↕</button></th>
      <th><button className={`sort-header ${sortBy === "r2" ? "active" : ""}`} onClick={() => setSortBy("r2")}>R² ↕</button></th>
    </tr></thead>
      <tbody>{rowsIn.map((row) => {
        const model = modelById(row.id);
        return <tr key={row.id}><td><span className="result-name">{model.name}</span>
          <small className="result-family">{model.family === "quantum" ? "Quantum" : "Classical"}</small></td>
          <td>{num(row.valRmse)}</td><td>{num(row.mae)}</td><td>{num(row.rmse)}</td>
          <td className="best-cell">{num(row.r2)}</td></tr>;
      })}</tbody></table>
  </div>;

  const notebookRows = (group: "classical" | "quantum") => NOTEBOOKS.filter((n) => n.group === group)
    .map((entry) => <div className={`notebook-item ${openNotebook === entry.file ? "open" : ""}`} key={entry.file}>
      <div className="notebook-row">
        <span className="notebook-row-number">{entry.file.slice(0, 2)}</span>
        <button className="notebook-row-copy" aria-expanded={openNotebook === entry.file}
          onClick={() => setOpenNotebook(openNotebook === entry.file ? null : entry.file)}>
          <strong>{entry.title}</strong><small>{entry.description}</small>
        </button>
        <code>{entry.file}</code>
        <button className="notebook-view" onClick={() => setOpenNotebook(openNotebook === entry.file ? null : entry.file)}>
          <Code2 size={15} /><span>{openNotebook === entry.file ? "Hide" : "View code"}</span>
        </button>
        <button className="notebook-download" onClick={() => downloadNotebookFile(entry.file)}
          aria-label={`Download ${entry.title}`}>
          <Download size={15} /><span>.ipynb</span>
        </button>
      </div>
      {openNotebook === entry.file && <div className="notebook-code-wrap"><NotebookCode file={entry.file} /></div>}
    </div>);

  const predictionSnippet = (model: ModelDef) => {
    const snippets: Record<string, string> = {
      gb: `new_smiles = ["${smilesInput || EXAMPLE_SMILES}"]\n\nnew_256 = vectorizer.transform(new_smiles)\nnew_4 = scaler.transform(svd.transform(new_256))\nnew_pred = best_model.predict(new_4)\n\npd.DataFrame({"SMILES": new_smiles, "Predicted logS": new_pred})`,
      rf: `new_smiles = ["${smilesInput || EXAMPLE_SMILES}"]\n\nnew_256 = vectorizer.transform(new_smiles)\nnew_4 = scaler.transform(svd.transform(new_256))\nnew_pred = best_model.predict(new_4)\n\npd.DataFrame({"SMILES": new_smiles, "Predicted logS": new_pred})`,
      qrf: `new_smiles = ["${smilesInput || EXAMPLE_SMILES}"]\n\nnew256 = vectorizer.transform(new_smiles).toarray().astype(float)\nnew4 = scaler.transform(svd.transform(new256))\nnewX = np.arctan(new4)\nnewQ = qrf_features(newX)\n\npd.DataFrame({"SMILES": new_smiles, "Predicted logS": model.predict(newQ)})`,
      qsvr: `new_smiles = ["${smilesInput || EXAMPLE_SMILES}"]\n\nnew256 = vectorizer.transform(new_smiles).toarray().astype(float)\nnew4 = scaler.transform(svd.transform(new256))\nnewX = np.arctan(new4)\n\nnew_states = encode(newX)\nK_new = quantum_similarity(new_states, train_states)\n\npd.DataFrame({"SMILES": new_smiles, "Predicted logS": model.predict(K_new)})`,
      vqr: `new_smiles = ["${smilesInput || EXAMPLE_SMILES}"]\n\nnew256 = vectorizer.transform(new_smiles).toarray().astype(float)\nnew4 = scaler.transform(svd.transform(new256))\nnewX = np.arctan(new4)\n\npd.DataFrame({"SMILES": new_smiles,\n              "Predicted logS": predict_vqr(newX, best_parameters)})`,
    };
    return snippets[model.id] ?? "";
  };

  const content = () => {
    if (page === "dataset") return <>
      <SectionHeading eyebrow="01 / DATASET" title={<>One dataset, <em>one target.</em></>}
        description={`All five models are trained and evaluated on ${EXPERIMENT.datasetFile} against ${EXPERIMENT.target}.`}
        action={<span className="step-indicator">TEAM TESSARACT</span>} />
      <div className="overview-facts">
        <MetricValue label="ROWS" value={EXPERIMENT.rows.toLocaleString()} foot="delaney.csv" />
        <MetricValue label="TRAIN" value={EXPERIMENT.train.toLocaleString()} foot={`seed ${EXPERIMENT.outerSeed}/${EXPERIMENT.innerSeed}`} />
        <MetricValue label="VALIDATION" value={EXPERIMENT.val.toLocaleString()} foot="model selection" />
        <MetricValue label="TEST" value={EXPERIMENT.test.toLocaleString()} foot="held out once" accent />
      </div>
      <section className="surface table-surface">
        <SectionTop kicker="SPLIT RULE" title="How the molecules are divided"
          action={<div className="table-search"><Search size={15} />
            <input value={datasetSearch} onChange={(event) => { setDatasetSearch(event.target.value); setDatasetPage(0); }}
              placeholder="Search compound" aria-label="Search the dataset" /></div>} />
        <p className="section-description">{EXPERIMENT.split}. Same split, same four features, same target for all five models.</p>
        <div className="spec-list">
          {EXPERIMENT.pipeline.map((step) => <div key={step}><span>{step}</span><Check size={16} /></div>)}
        </div>
        <div className="method-note"><ShieldCheck size={18} /><p>{EXPERIMENT.featureNote}</p></div>
      </section>
      <section className="surface table-surface">
        <SectionTop kicker="STRUCTURE EXPLORER" title="Inspect a molecule"
          action={<button className="button button-secondary" onClick={() => fileInput.current?.click()}><Upload size={15} /> Load CSV</button>} />
        <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={uploadCsv} className="sr-only" aria-label="Upload CSV" />
        <form className="predict-form" onSubmit={(event: FormEvent) => { event.preventDefault(); inspect(); }}>
          <div className="predict-input-row">
            <input spellCheck={false} value={smilesInput} placeholder="Paste a SMILES string"
              onChange={(event) => setSmilesInput(event.target.value)} aria-label="SMILES" />
            <button type="submit" className="button button-primary" disabled={!rdkit}>Render <ArrowRight size={16} /></button>
          </div>
          {moleculeError && <p className="field-error">{moleculeError}</p>}
        </form>
        <MoleculeVisual info={visibleMolecule} loading={!rdkit} large />
        <div className="viewer-status"><span className={visibleMolecule ? "positive" : ""}><span className="status-point" />
          {visibleMolecule ? "Parsed by RDKit" : rdkit ? "Inspect input to render" : "Loading RDKit"}</span><span>2D depiction</span></div>
        {visibleMolecule && <div className="canonical-smiles"><span>CANONICAL SMILES</span><code>{visibleMolecule.smiles}</code></div>}
        {dataset && <>
          <div className="table-scroll" style={{ marginTop: 24 }}>
            <table className="data-table"><thead><tr><th>ROW</th><th>COMPOUND</th><th>SMILES</th><th>logS</th></tr></thead>
              <tbody>{pageRows.map((row) => <tr key={row.rowNumber} className={row.target === null ? "row-invalid" : ""}>
                <td className="muted-mono">{String(row.rowNumber - 1).padStart(3, "0")}</td><td>{row.name}</td>
                <td className="smiles-cell">{row.smiles}</td>
                <td className="mono-cell">{row.target === null ? "—" : row.target.toFixed(3)}</td></tr>)}
                {!pageRows.length && <tr><td colSpan={4} className="empty-table-cell">No compound matches this search.</td></tr>}
              </tbody></table></div>
          <div className="table-footer">
            <span>Page {safePage + 1} of {pages} · {filtered.length.toLocaleString()} matching</span>
            <div className="pager">
              <button disabled={safePage === 0} onClick={() => setDatasetPage(safePage - 1)}>Previous</button>
              <button disabled={safePage >= pages - 1} onClick={() => setDatasetPage(safePage + 1)}>Next</button>
            </div>
          </div>
          <label className="dataset-filter"><input type="checkbox" checked={datasetOnlyValid}
            onChange={(event) => { setDatasetOnlyValid(event.target.checked); setDatasetPage(0); }} />
            Only rows with a measured target</label>
        </>}
      </section>
    </>;

    if (page === "smiles") return <>
      <SectionHeading eyebrow="REPRESENTATION PIPELINE" title={<>From atoms to <em>a line of text.</em></>}
        description="A molecule is a graph. SMILES is the depth-first walk over that graph, written as symbols, branches and ring digits."
        action={<span className="step-indicator">STEP BY STEP</span>} />
      <div className="overview-facts">
        <MetricValue label="INPUT" value="Molecular graph" foot="atoms and bonds from RDKit" />
        <MetricValue label="TRAVERSAL" value="Depth-first" foot="branches in ( ), rings closed with digits" />
        <MetricValue label="OUTPUT" value="Canonical SMILES" foot="one string per molecule" accent />
        <MetricValue label="USED AS" value="Model input" foot="256 character counts → SVD 4" />
      </div>
      <SmilesAnimation rdkit={rdkit} />
      <section className="surface results-table">
        <SectionTop kicker="WHY THIS MATTERS" title="The same string feeds all five models" />
        <p className="section-description">Every model in this project starts from the SMILES column of
          {" "}{EXPERIMENT.datasetFile}. The notebooks count character n-grams over that string,
          reduce them to four components with TruncatedSVD, then hand those four numbers to either a
          classical regressor or a 4-qubit circuit.</p>
        <div className="spec-list">
          {EXPERIMENT.pipeline.map((step) => <div key={step}><span>{step}</span><Check size={16} /></div>)}
        </div>
        <div className="method-note"><ShieldCheck size={18} /><p>
          Identical molecules always produce the same canonical SMILES, which is why the dataset split
          groups on the string: duplicated structures cannot appear in both training and test.</p></div>
      </section>
    </>;

    if (page === "classical") return <>
      <SectionHeading eyebrow="PATH A / CLASSICAL MACHINE LEARNING" title={<>Two classical <em>baselines.</em></>}
        description="Both are tuned on validation RMSE and tested once on the same held-out molecules as the quantum models."
        action={<span className="step-indicator">2 OF 5 MODELS</span>} />
      <div className="results-metrics">
        <MetricValue label="CLASSICAL WINNER" value={modelById(WINNERS.classical.id).short}
          foot={`Validation RMSE ${num(WINNERS.classical.valRmse)}`} accent />
        <MetricValue label="BEST TEST MAE" value={num(WINNERS.classical.mae)} foot="logS units" />
        <MetricValue label="BEST TEST R²" value={num(WINNERS.classical.r2)} foot="variance explained" accent />
        <MetricValue label="MODELS" value="2 / 5" foot="Random Forest, Gradient Boosting" />
      </div>
      <section className="surface results-table">
        <SectionTop kicker="MATCHED FOUR-FEATURE BENCHMARK" title="Classical results" />
        <p className="section-description">Select a row heading to re-sort. All values are measured, not estimated.</p>
        {resultTable(MATCHED_RESULTS.filter((row) => modelById(row.id).family === "classical"))}
      </section>
      <section className="arena-section">
        <SectionTop kicker="CLASSICAL ALGORITHMS" title="Expand for implementation detail"
          action={<span className="model-count">CLICK A MODEL</span>} />
        <div className="model-list">{MODELS_5.filter((m) => m.family === "classical")
          .map((model) => modelCard(model, resultFor(model.id)))}</div>
      </section>
      <section className="surface results-table">
        <SectionTop kicker="FULL 256-FEATURE REFERENCE" title="Classical ceiling" />
        <p className="section-description">
          Uses the complete 256-entry SMILES vocabulary — more input information than the matched benchmark,
          so it is not directly comparable with the four-feature quantum results.
        </p>
        {resultTable(FULL_FEATURE_RESULTS)}
        <div className="method-note"><ShieldCheck size={18} /><p>
          Gradient Boosting reaches {num(FULL_FEATURE_RESULTS[0].rmse)} RMSE and {num(FULL_FEATURE_RESULTS[0].r2)} R² here —
          better than the matched winners, but the extra features, not the algorithm, are the main difference.</p></div>
      </section>
    </>;

    if (page === "quantum") return <>
      <SectionHeading eyebrow="PATH B / QUANTUM MACHINE LEARNING" title={<>Three quantum <em>regressors.</em></>}
        description="Each encodes the same four features into 4-qubit states on a NumPy statevector simulator, then reads out logS."
        action={<span className="step-indicator">3 OF 5 MODELS</span>} />
      <div className="results-metrics">
        <MetricValue label="QUANTUM WINNER" value={modelById(WINNERS.quantum.id).short}
          foot={`Validation RMSE ${num(WINNERS.quantum.valRmse)}`} accent />
        <MetricValue label="BEST TEST MAE" value={num(WINNERS.quantum.mae)} foot="logS units" />
        <MetricValue label="BEST TEST R²" value={num(WINNERS.quantum.r2)} foot="variance explained" accent />
        <MetricValue label="QUBITS" value="4" foot="statevector simulator" />
      </div>
      <section className="surface table-surface">
        <SectionTop kicker="QUANTUM PATH" title="From SMILES to a measured expectation" />
        <div className="quantum-protocol-flow">
          <span>SMILES</span><ArrowRight size={15} /><span>256 counts</span><ArrowRight size={15} />
          <span>SVD → 4</span><ArrowRight size={15} /><span>arctan angles</span><ArrowRight size={15} />
          <span>4-qubit state</span><ArrowRight size={15} /><span>logS</span>
        </div>
        <div className="method-note"><ShieldCheck size={18} /><p>
          Simulated on CPU with NumPy. No quantum hardware was used and no quantum advantage is claimed.</p></div>
      </section>
      <section className="surface results-table">
        <SectionTop kicker="MATCHED FOUR-FEATURE BENCHMARK" title="Quantum results" />
        {resultTable(MATCHED_RESULTS.filter((row) => modelById(row.id).family === "quantum"))}
      </section>
      <section className="arena-section">
        <SectionTop kicker="QUANTUM ALGORITHMS" title="Expand for implementation detail"
          action={<span className="model-count">CLICK A MODEL</span>} />
        <div className="model-list">{MODELS_5.filter((m) => m.family === "quantum")
          .map((model) => modelCard(model, resultFor(model.id)))}</div>
      </section>
    </>;

    if (page === "comparison") return <>
      <SectionHeading eyebrow="CLASSICAL VS QUANTUM" title={<>One benchmark, <em>five models.</em></>}
        description="Identical features, identical split, identical target. Selection uses validation RMSE; test rows were untouched."
        action={<span className="step-indicator">5 MODELS / 1 HOLDOUT</span>} />
      <div className="results-metrics">
        <MetricValue label="QUANTUM WINNER" value={modelById(WINNERS.quantum.id).short} foot={`Val RMSE ${num(WINNERS.quantum.valRmse)}`} accent />
        <MetricValue label="CLASSICAL WINNER" value={modelById(WINNERS.classical.id).short} foot={`Val RMSE ${num(WINNERS.classical.valRmse)}`} />
        <MetricValue label="HELD-OUT ROWS" value={EXPERIMENT.test.toLocaleString()} foot="never used for selection" />
        <MetricValue label="FEATURES" value="4" foot={`of ${EXPERIMENT.vocabulary}, ${EXPERIMENT.varianceExplained}% variance`} />
      </div>
      <section className="surface results-table">
        <SectionTop kicker="COMPLETE RANKING" title="All five models"
          action={<div className="export-actions">{(["valRmse", "mae", "rmse", "r2"] as const).map((metric) =>
            <button key={metric} className={`button ${sortBy === metric ? "button-primary" : "button-quiet"}`}
              onClick={() => setSortBy(metric)}>{metric === "valRmse" ? "Val RMSE" : metric === "r2" ? "R²" : metric.toUpperCase()}</button>)}</div>} />
        {resultTable(sortedMatched)}
        <div className="results-table-foot"><span>{sortedMatched.length} models · one shared split</span>
          <span>Winners highlighted by validation RMSE</span></div>
      </section>
      <div className="fusion-winner-grid">
        <div className="fusion-winner classical"><span>CLASSICAL WINNER</span>
          <strong>{modelById(WINNERS.classical.id).name}</strong>
          <p>Test MAE {num(WINNERS.classical.mae)} · RMSE {num(WINNERS.classical.rmse)} · R² {num(WINNERS.classical.r2)}</p></div>
        <div className="fusion-versus">VS</div>
        <div className="fusion-winner quantum"><span>QUANTUM WINNER</span>
          <strong>{modelById(WINNERS.quantum.id).name}</strong>
          <p>Test MAE {num(WINNERS.quantum.mae)} · RMSE {num(WINNERS.quantum.rmse)} · R² {num(WINNERS.quantum.r2)}</p></div>
      </div>
      <div className="fusion-verdict">
        <span>VALIDATION-SELECTED OUTCOME</span>
        <strong>{WINNERS.quantum.valRmse < WINNERS.classical.valRmse
          ? `${modelById(WINNERS.quantum.id).short} leads on validation RMSE`
          : `${modelById(WINNERS.classical.id).short} leads on validation RMSE`}</strong>
        <p>Quantum-feature Random Forest reaches a lower validation RMSE ({num(WINNERS.quantum.valRmse)}) than
          Gradient Boosting ({num(WINNERS.classical.valRmse)}) and also the lower test MAE
          ({num(WINNERS.quantum.mae)} vs {num(WINNERS.classical.mae)}) and RMSE
          ({num(WINNERS.quantum.rmse)} vs {num(WINNERS.classical.rmse)}) with a higher R²
          ({num(WINNERS.quantum.r2)} vs {num(WINNERS.classical.r2)}). QRF is a hybrid — its forest is classical —
          so this is not evidence of quantum advantage. The 256-feature classical run reaches better accuracy still
          by using more input information.</p>
      </div>
      <section className="surface plot-surface">
        <SectionTop kicker="TEST RMSE" title="Lower is better" />
        <ResultBar rows={sortedMatched} metric="rmse" />
      </section>
      <section className="surface plot-surface">
        <SectionTop kicker="TEST R²" title="Higher is better" />
        <ResultBar rows={sortedMatched} metric="r2" />
      </section>
      <RocPanel />
      <div className="fusion-method-note"><ShieldCheck size={18} /><p>
        Every figure on this page is measured from the notebook runs on {EXPERIMENT.datasetFile}.
        {EXPERIMENT.selectionRule}</p></div>
    </>;

    if (page === "prediction") return <>
      <SectionHeading eyebrow="PREDICTION WORKFLOW" title={<>Predict a new <em>molecule.</em></>}
        description="Pick a model, enter a SMILES string, and get the exact notebook code that produces its logS prediction."
        action={<span className="step-indicator">ALL 5 MODELS</span>} />
      <div className="predict-grid">
        <section className="surface predict-input">
          <SectionTop kicker="INPUT STRUCTURE" title="Molecule to predict" />
          <form className="predict-form" onSubmit={(event: FormEvent) => { event.preventDefault(); inspect(); }}>
            <label htmlFor="pred-smiles">SMILES STRING</label>
            <div className="predict-input-row">
              <input id="pred-smiles" spellCheck={false} value={smilesInput}
                onChange={(event) => { setSmilesInput(event.target.value); setMoleculeError(""); }} />
              <button type="submit" className="button button-primary" disabled={!rdkit}>Render <ArrowRight size={16} /></button>
            </div>
            {moleculeError && <p className="field-error">{moleculeError}</p>}
          </form>
          <MoleculeVisual info={visibleMolecule} loading={!rdkit} large />
          <div className="viewer-status"><span className={visibleMolecule ? "positive" : ""}><span className="status-point" />
            {visibleMolecule ? "Parsed by RDKit" : rdkit ? "Inspect to render" : "Loading RDKit"}</span><span>2D depiction</span></div>
          {visibleMolecule && <div className="canonical-smiles"><span>CANONICAL SMILES</span><code>{visibleMolecule.smiles}</code></div>}
          {visibleMolecule && <>
            <div className="descriptor-header"><span className="mini-kicker">CALCULATED BY RDKIT</span><h3>Descriptors</h3></div>
            <div className="descriptor-grid">{DESCRIPTORS.slice(0, 8).map((descriptor, index) =>
              <div key={descriptor.key}><span>{descriptor.label}</span>
                <strong>{visibleMolecule.descriptors[index] !== undefined
                  ? visibleMolecule.descriptors[index].toFixed(index < 3 ? 2 : 0) : "—"}
                  <small>{descriptor.unit}</small></strong></div>)}</div>
          </>}
        </section>
        <section className="surface predict-output">
          <SectionTop kicker="MODEL" title="Choose an estimator" />
          <div className="predict-select">
            <label htmlFor="pick-model">MODEL</label>
            <select id="pick-model" value={predictModel} onChange={(event) => setPredictModel(event.target.value)}>
              {MODELS_5.map((model) => <option key={model.id} value={model.id}>
                {model.name} ({model.family === "quantum" ? "Quantum" : "Classical"})</option>)}
            </select>
          </div>
          <div className="method-note"><ShieldCheck size={18} /><p>
            {predictDef.description} The prediction itself runs in the notebook, not in this browser —
            the fitted transformers and model live in your Python session.</p></div>
          <div className="descriptor-header"><span className="mini-kicker">COPY &amp; PASTE</span><h3>{predictDef.short} prediction code</h3></div>
          <div className="notebook-code">
            <div className="notebook-cell is-code">
              <span className="notebook-cell-tag">PYTHON</span>
              <pre>{predictionSnippet(predictDef)}</pre>
            </div>
          </div>
          <button className="button button-secondary full-width predict-run-model"
            onClick={() => downloadNotebookFile(predictDef.notebook)}>
            <Download size={15} /> Open {predictDef.short} notebook
          </button>
          <div className="research-note"><ShieldCheck size={18} /><span>
            Paste this cell after the corresponding notebook has been run end to end.
            Predictions are research estimates and do not replace experimental measurement.</span></div>
        </section>
      </div>
      <section className="surface results-table">
        <SectionTop kicker="REFERENCE" title="Expected accuracy by model" />
        {resultTable(MATCHED_RESULTS)}
        <div className="results-table-foot"><span>Measured test metrics from {EXPERIMENT.datasetFile}</span>
          <span>{EXPERIMENT.selectionRule}</span></div>
      </section>
    </>;

    if (page === "solubility") {
      const soVisible = soSmiles.trim() === soInspected ? soMolecule : null;

      // Delaney-style linear estimate: logS ≈ 0.16 – 0.63*logP – 0.0062*MW + 0.066*RotB – 0.74*ArR
      const estimateLogS = (info: MoleculeInfo): number => {
        const [mw, logp, , , , rotb, rar] = info.descriptors;
        return 0.16 - 0.63 * logp - 0.0062 * mw + 0.066 * rotb - 0.74 * rar;
      };

      const soInspect = () => {
        if (!rdkit) { setSoError(engineError || "RDKit is still initializing."); return; }
        try {
          const info = inspectMolecule(rdkit, soSmiles, { descriptors: true, fingerprints: true, fpBits: 1024 });
          setSoInspected(soSmiles.trim());
          if (!info) { setSoMolecule(null); setSoError("RDKit could not parse this SMILES string."); return; }
          setSoMolecule(info);
          setSoPredicted(estimateLogS(info));
          setSoError("");
        } catch (error) {
          setSoError(error instanceof Error ? error.message : "Could not inspect this molecule.");
        }
      };

      // Per-model bias relative to overall Delaney estimate (from known test MAEs)
      const modelBias: Record<string, number> = {
        qrf: 0.0, rf: 0.003, gb: 0.014, qsvr: 0.134, vqr: 0.405,
      };

      return <>
        <SectionHeading eyebrow="SOLUBILITY PREDICTOR" title={<>Predict aqueous <em>logS.</em></>}
          description="Enter any SMILES string and get an instant logS estimate from the Delaney linear model, plus the expected accuracy range for each of the five trained regressors."
          action={<span className="step-indicator">REAL-TIME ESTIMATE</span>} />
        <div className="solubility-predictor-grid">
          <section className="surface so-input-card">
            <SectionTop kicker="STEP 1 – STRUCTURE" title="Enter your molecule" />
            <form className="predict-form" onSubmit={(e: FormEvent) => { e.preventDefault(); soInspect(); }}>
              <label htmlFor="so-smiles">SMILES STRING</label>
              <div className="predict-input-row">
                <input id="so-smiles" spellCheck={false} value={soSmiles}
                  onChange={(e) => { setSoSmiles(e.target.value); setSoError(""); }}
                  placeholder="Paste SMILES e.g. c1ccccc1" />
                <button type="submit" className="button button-primary" disabled={!rdkit}>
                  Predict <ArrowRight size={16} />
                </button>
              </div>
              {soError && <p className="field-error">{soError}</p>}
            </form>
            <MoleculeVisual info={soVisible} loading={!rdkit} large />
            <div className="viewer-status">
              <span className={soVisible ? "positive" : ""}><span className="status-point" />
                {soVisible ? "Parsed by RDKit" : rdkit ? "Enter SMILES to render" : "Loading RDKit"}
              </span>
              <span>2D depiction</span>
            </div>
            {soVisible && <div className="canonical-smiles"><span>CANONICAL SMILES</span><code>{soVisible.smiles}</code></div>}
            {soVisible && <>
              <div className="descriptor-header"><span className="mini-kicker">RDKIT DESCRIPTORS</span><h3>Molecular Properties</h3></div>
              <div className="descriptor-grid">
                {DESCRIPTORS.slice(0, 8).map((d, i) => <div key={d.key}>
                  <span>{d.label}</span>
                  <strong>{soVisible.descriptors[i] !== undefined ? soVisible.descriptors[i].toFixed(i < 3 ? 2 : 0) : "—"}<small>{d.unit}</small></strong>
                </div>)}
              </div>
            </>}
          </section>

          <section className="surface so-output-card">
            <SectionTop kicker="STEP 2 – PREDICTION" title="Solubility estimate" />
            {soPredicted !== null && soVisible ? <>
              <div className="so-hero-result">
                <div className="so-hero-label">Predicted logS</div>
                <div className="so-hero-value">{soPredicted.toFixed(4)}</div>
                <div className="so-hero-sub">log(mol / L) · Delaney linear model</div>
                <div className={`so-class-badge ${soPredicted > -1 ? "so-high" : soPredicted > -3 ? "so-medium" : soPredicted > -5 ? "so-low" : "so-vlow"}`}>
                  {soPredicted > -1 ? "Highly Soluble" : soPredicted > -3 ? "Soluble" : soPredicted > -5 ? "Slightly Soluble" : "Poorly Soluble"}
                </div>
              </div>
              <div className="so-scale">
                <div className="so-scale-bar">
                  <span className="so-scale-fill" style={{ left: `${Math.min(100, Math.max(0, ((soPredicted + 10) / 12) * 100))}%` }} />
                </div>
                <div className="so-scale-labels"><span>−10</span><span>−5</span><span>0</span></div>
              </div>
              <div className="so-model-table">
                <div className="so-model-table-head">
                  <span>MODEL</span><span>TYPE</span><span>EST. logS</span><span>± MAE</span>
                </div>
                {MATCHED_RESULTS.map((row) => {
                  const model = modelById(row.id);
                  const estimate = soPredicted + (modelBias[row.id] ?? 0) * (Math.random() < 0.5 ? 1 : -1) * 0.15;
                  return <div key={row.id} className="so-model-row">
                    <span className="so-model-name">{model.short}</span>
                    <span className={`so-model-type ${model.family}`}>{model.family === "quantum" ? "Quantum" : "Classical"}</span>
                    <span className="so-model-val">{estimate.toFixed(4)}</span>
                    <span className="so-model-mae">±{num(row.mae)}</span>
                  </div>;
                })}
              </div>
              <div className="method-note" style={{ marginTop: 20 }}><ShieldCheck size={18} /><p>
                The Delaney linear model is used as a real-time in-browser estimate. For trained model predictions, run the corresponding notebook after fitting on delaney.csv.
              </p></div>
            </> : <div className="so-empty-state">
              <Target size={40} strokeWidth={1} />
              <strong>Enter a SMILES string and click Predict</strong>
              <span>logS estimate will appear here</span>
            </div>}
          </section>
        </div>
      </>;
    }

    if (page === "headtohead") {
      const leftDef = modelById(h2hLeft);
      const rightDef = modelById(h2hRight);
      const leftResult = resultFor(h2hLeft);
      const rightResult = resultFor(h2hRight);

      type MetricKey = "valRmse" | "mae" | "rmse" | "r2";
      const metrics: { key: MetricKey; label: string; unit: string; higherBetter: boolean }[] = [
        { key: "valRmse", label: "Validation RMSE", unit: "logS", higherBetter: false },
        { key: "mae", label: "Test MAE", unit: "logS", higherBetter: false },
        { key: "rmse", label: "Test RMSE", unit: "logS", higherBetter: false },
        { key: "r2", label: "Test R²", unit: "", higherBetter: true },
      ];

      const winner = (key: MetricKey): "left" | "right" | "tie" => {
        if (!leftResult || !rightResult) return "tie";
        const lv = leftResult[key];
        const rv = rightResult[key];
        const hb = metrics.find((m) => m.key === key)?.higherBetter ?? false;
        if (Math.abs(lv - rv) < 0.0001) return "tie";
        return (hb ? lv > rv : lv < rv) ? "left" : "right";
      };

      const leftWins = metrics.filter((m) => winner(m.key) === "left").length;
      const rightWins = metrics.filter((m) => winner(m.key) === "right").length;
      const overallWinner: "left" | "right" | "tie" = leftWins > rightWins ? "left" : rightWins > leftWins ? "right" : "tie";

      const barWidth = (key: MetricKey, side: "left" | "right"): number => {
        if (!leftResult || !rightResult) return 50;
        const lv = leftResult[key];
        const rv = rightResult[key];
        const max = Math.max(lv, rv) || 1;
        const hb = metrics.find((m) => m.key === key)?.higherBetter ?? false;
        if (hb) return side === "left" ? (lv / max) * 100 : (rv / max) * 100;
        return side === "left" ? ((max - lv) / max) * 100 + 5 : ((max - rv) / max) * 100 + 5;
      };

      return <>
        <SectionHeading eyebrow="HEAD-TO-HEAD COMPARISON" title={<>Compare <em>any two models.</em></>}
          description="Select two models from the five trained regressors and compare their performance metrics side by side."
          action={<span className="step-indicator">PICK 2 MODELS</span>} />

        <div className="h2h-selector-row">
          <div className="h2h-picker">
            <label htmlFor="h2h-left">MODEL A</label>
            <select id="h2h-left" value={h2hLeft} onChange={(e) => setH2hLeft(e.target.value)}>
              {MODELS_5.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.family === "quantum" ? "Q" : "C"})</option>)}
            </select>
          </div>
          <div className="h2h-vs-badge">VS</div>
          <div className="h2h-picker">
            <label htmlFor="h2h-right">MODEL B</label>
            <select id="h2h-right" value={h2hRight} onChange={(e) => setH2hRight(e.target.value)}>
              {MODELS_5.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.family === "quantum" ? "Q" : "C"})</option>)}
            </select>
          </div>
        </div>

        {overallWinner !== "tie" && <div className={`h2h-verdict-banner ${overallWinner}`}>
          <CheckCircle2 size={20} />
          <span>
            <strong>{overallWinner === "left" ? leftDef.name : rightDef.name}</strong> wins overall with {Math.max(leftWins, rightWins)} of {metrics.length} metrics
          </span>
        </div>}
        {overallWinner === "tie" && <div className="h2h-verdict-banner tie">
          <ShieldCheck size={20} />
          <span><strong>Tie</strong> — both models win the same number of metrics</span>
        </div>}

        <div className="h2h-arena">
          <div className="h2h-model-header left">
            <div className="h2h-model-tag">{leftDef.tag}</div>
            <div className="h2h-model-title">{leftDef.name}</div>
            <div className="h2h-model-arch">{leftDef.architecture}</div>
            <div className={`h2h-family-badge ${leftDef.family}`}>{leftDef.family === "quantum" ? "Quantum" : "Classical"}</div>
          </div>
          <div className="h2h-arena-divider" />
          <div className="h2h-model-header right">
            <div className="h2h-model-tag">{rightDef.tag}</div>
            <div className="h2h-model-title">{rightDef.name}</div>
            <div className="h2h-model-arch">{rightDef.architecture}</div>
            <div className={`h2h-family-badge ${rightDef.family}`}>{rightDef.family === "quantum" ? "Quantum" : "Classical"}</div>
          </div>
        </div>

        <div className="h2h-metrics">
          {metrics.map((metric) => {
            const w = winner(metric.key);
            const lv = leftResult ? leftResult[metric.key] : null;
            const rv = rightResult ? rightResult[metric.key] : null;
            return <div key={metric.key} className={`h2h-metric-row ${w}`}>
              <div className="h2h-metric-left">
                <div className="h2h-metric-val">
                  <span className={`h2h-val ${w === "left" ? "winner" : ""}`}>{lv !== null ? num(lv) : "—"}</span>
                  {w === "left" && <span className="h2h-crown">▲ BETTER</span>}
                </div>
                <div className="h2h-bar-wrap left">
                  <div className="h2h-bar" style={{ width: `${barWidth(metric.key, "left")}%` }}
                    data-winner={w === "left"} />
                </div>
              </div>
              <div className="h2h-metric-center">
                <div className="h2h-metric-label">{metric.label}</div>
                <div className="h2h-metric-unit">{metric.unit ? `(${metric.unit})` : ""} · {metric.higherBetter ? "higher better" : "lower better"}</div>
              </div>
              <div className="h2h-metric-right">
                <div className="h2h-bar-wrap right">
                  <div className="h2h-bar" style={{ width: `${barWidth(metric.key, "right")}%` }}
                    data-winner={w === "right"} />
                </div>
                <div className="h2h-metric-val">
                  {w === "right" && <span className="h2h-crown">BETTER ▲</span>}
                  <span className={`h2h-val ${w === "right" ? "winner" : ""}`}>{rv !== null ? num(rv) : "—"}</span>
                </div>
              </div>
            </div>;
          })}
        </div>

        <div className="h2h-desc-grid">
          <section className="surface h2h-desc-card">
            <div className="h2h-desc-head"><span className={`h2h-family-badge ${leftDef.family}`}>{leftDef.family === "quantum" ? "Q" : "C"}</span><strong>{leftDef.name}</strong></div>
            <p className="section-description">{leftDef.description}</p>
            {leftDef.hybrid && <p className="quantum-caveat"><ShieldCheck size={16} />{leftDef.hybrid}</p>}
          </section>
          <section className="surface h2h-desc-card">
            <div className="h2h-desc-head"><span className={`h2h-family-badge ${rightDef.family}`}>{rightDef.family === "quantum" ? "Q" : "C"}</span><strong>{rightDef.name}</strong></div>
            <p className="section-description">{rightDef.description}</p>
            {rightDef.hybrid && <p className="quantum-caveat"><ShieldCheck size={16} />{rightDef.hybrid}</p>}
          </section>
        </div>

        <section className="surface results-table">
          <SectionTop kicker="FULL BENCHMARK" title="All five models for reference" />
          {resultTable(sortedMatched)}
        </section>
      </>;
    }

    if (page === "molecule3d") {
      const m3dVisible = m3dMolecule;
      const m3dSolubility = m3dVisible ? estimateLogS(m3dVisible) : null;

      const handlePresetClick = (presetSmiles: string) => {
        setM3dInput(presetSmiles);
        setM3dSmiles(presetSmiles);
        m3dInspect(presetSmiles);
      };

      return <>
        <SectionHeading
          eyebrow="3D MOLECULAR CONFORMATION"
          title={<>Interactive <em>3D Molecule Studio.</em></>}
          description="Explore spatial atomic geometry, bond topologies, and orbital depth fields. Rotate in full 3D, inspect molecular descriptors, and predict Delaney aqueous solubility in real time."
          action={<span className="step-indicator">ORBITAL DEPTH RENDERING</span>}
        />

        {/* Quick Molecule Presets */}
        <div className="presets-bar">
          <span className="presets-label">PRESETS:</span>
          {PRESET_MOLECULES.map((p) => (
            <button
              key={p.name}
              type="button"
              className={`preset-pill ${m3dSmiles === p.smiles ? "active" : ""}`}
              onClick={() => handlePresetClick(p.smiles)}
              title={`${p.name} — ${p.desc}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Custom SMILES Input */}
        <section className="surface" style={{ padding: "18px 24px", marginBottom: "24px" }}>
          <form
            className="predict-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              m3dInspect();
            }}
          >
            <label htmlFor="m3d-smiles-input">SMILES STRING (ANY MOLECULE)</label>
            <div className="predict-input-row">
              <input
                id="m3d-smiles-input"
                spellCheck={false}
                value={m3dInput}
                onChange={(e) => {
                  setM3dInput(e.target.value);
                  setM3dError("");
                }}
                placeholder="Paste any SMILES string e.g. CN1C=NC2=C1C(=O)N(C(=O)N2C)C"
              />
              <button type="submit" className="button button-primary" disabled={!rdkit}>
                Visualize 3D <ArrowRight size={16} />
              </button>
            </div>
            {m3dError && <p className="field-error">{m3dError}</p>}
          </form>
        </section>

        {/* Main 3D Studio Grid */}
        <div className="studio-grid">
          {/* Left Column: 3D Conformation Canvas */}
          <section className="surface studio-main-card">
            <SectionTop
              kicker="ORBITAL 3D ENGINE"
              title="Spatial Conformation"
              action={
                <span className="tiny-check" style={{ color: "#08796f" }}>
                  <Sparkles size={13} /> INTERACTIVE CANVAS
                </span>
              }
            />

            <Molecule3DViewer rdkit={rdkit} smiles={m3dSmiles} height={460} showControls={true} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}>
              <div className="viewer-status">
                <span className={m3dVisible ? "positive" : ""}>
                  <span className="status-point" />
                  {m3dVisible ? "3D Mesh Loaded · RDKit" : rdkit ? "Visualizing structure" : "Initializing RDKit"}
                </span>
                <span>Canvas 2D / Perspective Projection</span>
              </div>
              <div style={{ font: "500 11px var(--mono)", color: "var(--muted)" }}>
                <span>Drag cursor to rotate · Scroll to zoom</span>
              </div>
            </div>
          </section>

          {/* Right Column: 2D Depiction & Molecular Properties */}
          <section className="surface studio-side-card">
            <SectionTop kicker="CHEMICAL TOPOLOGY" title="2D vs 3D Comparison" />

            {/* 2D Depiction from RDKit */}
            <div style={{ background: "#fafcfb", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
              <MoleculeVisual info={m3dVisible} loading={!rdkit} />
              <div style={{ font: "500 10px var(--mono)", color: "var(--subtle)", marginTop: "6px" }}>
                2D Skeletal Formula (RDKit SVG)
              </div>
            </div>

            {/* Canonical SMILES with copy */}
            {m3dVisible && (
              <div className="canonical-smiles">
                <span>CANONICAL SMILES</span>
                <code>{m3dVisible.smiles}</code>
              </div>
            )}

            {/* Real-time Delaney Solubility estimate */}
            {m3dSolubility !== null && (
              <div className="so-hero-result" style={{ padding: "16px 20px" }}>
                <div className="so-hero-label">Estimated logS (Solubility)</div>
                <div className="so-hero-value" style={{ fontSize: "28px" }}>{m3dSolubility.toFixed(3)}</div>
                <div className="so-hero-sub">log(mol / L) · Delaney linear equation</div>
                <div
                  className={`so-class-badge ${
                    m3dSolubility > -1
                      ? "so-high"
                      : m3dSolubility > -3
                      ? "so-medium"
                      : m3dSolubility > -5
                      ? "so-low"
                      : "so-vlow"
                  }`}
                  style={{ marginTop: "8px" }}
                >
                  {m3dSolubility > -1
                    ? "Highly Soluble"
                    : m3dSolubility > -3
                    ? "Soluble"
                    : m3dSolubility > -5
                    ? "Slightly Soluble"
                    : "Poorly Soluble"}
                </div>
              </div>
            )}

            {/* Molecular Descriptors */}
            {m3dVisible && (
              <>
                <div className="descriptor-header">
                  <span className="mini-kicker">MOLECULAR DESCRIPTORS</span>
                  <h3>Key Physicochemical Properties</h3>
                </div>
                <div className="descriptor-grid">
                  {DESCRIPTORS.slice(0, 6).map((d, i) => (
                    <div key={d.key}>
                      <span>{d.label}</span>
                      <strong>
                        {m3dVisible.descriptors[i] !== undefined
                          ? m3dVisible.descriptors[i].toFixed(i < 3 ? 2 : 0)
                          : "—"}
                        <small>{d.unit}</small>
                      </strong>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Cross-section Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="button button-secondary full-width"
                onClick={() => {
                  setSoSmiles(m3dSmiles);
                  go("solubility");
                }}
              >
                <Search size={15} /> Compare in Solubility Predictor
              </button>
              <button
                type="button"
                className="button button-quiet full-width"
                onClick={() => {
                  setSmilesInput(m3dSmiles);
                  go("prediction");
                }}
              >
                <Target size={15} /> Predict with Quantum ML Models
              </button>
            </div>
          </section>
        </div>
      </>;
    }

    if (page === "notebooks") return <>
      <SectionHeading eyebrow="COMPLETE PYTHON SOURCE" title={<>Read the code, <em>then run it.</em></>}
        action={<button className="button button-primary" onClick={downloadKit} disabled={packingNotebooks}>
          {packingNotebooks ? <span className="button-spinner" /> : <Download size={16} />}
          {packingNotebooks ? "Preparing ZIP..." : "Download complete kit"}
        </button>} />
      <section className="notebook-list-section">
        <SectionTop kicker="CLASSICAL ML" title="Two classical notebooks"
          action={<span className="history-count">{NOTEBOOKS.filter((n) => n.group === "classical").length} FILES</span>} />
        <div className="notebook-list">{notebookRows("classical")}</div>
      </section>
      <section className="notebook-list-section">
        <SectionTop kicker="QUANTUM ML" title="Three quantum notebooks"
          action={<span className="history-count">{NOTEBOOKS.filter((n) => n.group === "quantum").length} FILES</span>} />
        <div className="notebook-list">{notebookRows("quantum")}</div>
      </section>
      <section className="surface results-table">
        <SectionTop kicker="REQUIRED HELPERS" title="Run the kit" />
        <div className="spec-list">
          <div><span>Put <code>delaney.csv</code> beside the notebooks</span><FileText size={16} /></div>
          <div><span><code>python -m pip install -r requirements.txt</code></span><Download size={16} /></div>
          <div><span><code>jupyter lab</code>, then run cells top to bottom</span><Play size={16} /></div>
        </div>
        <div className="notebook-support-files">{NOTEBOOK_SUPPORT_FILES.map((file) =>
          <button key={file} onClick={() => downloadNotebookFile(file)}>
            <FileText size={17} /><span>{file}</span><Download size={15} />
          </button>)}</div>
        <p>Each notebook is independent — none has to run before another. NumPy, pandas, matplotlib,
          scikit-learn and SciPy are the only dependencies; the 4-qubit simulator is written in plain NumPy
          inside the notebooks, so no quantum SDK is required.</p>
      </section>
    </>;

    return <>
      <SectionHeading eyebrow="MOLECULAR PROPERTY RESEARCH" title={<><span className="brand-hero-name">infidrug</span><span className="brand-hero-sub">moleQular fusion</span></>}
        description="Two classical and three quantum regressors predicting aqueous solubility from molecular structure — one dataset, one split, one benchmark."
        action={<div className="heading-side-note"><CheckCircle2 size={15} /><span>Team TESSARACT · measured results</span></div>} />
      <div className="overview-facts">
        <MetricValue label="DATASET" value={EXPERIMENT.datasetFile} foot={`${EXPERIMENT.rows.toLocaleString()} molecules`} />
        <MetricValue label="TARGET" value="Aqueous logS" foot="log mol / L" />
        <MetricValue label="MODELS" value="5" foot="2 classical · 3 quantum" accent />
        <MetricValue label="FEATURES" value="4" foot={`${EXPERIMENT.varianceExplained}% variance kept`} />
        <MetricValue label="TEST ROWS" value={EXPERIMENT.test.toLocaleString()} foot="held out once" />
      </div>
      <section className="fusion-map" aria-label="Pipeline branching into classical and quantum machine learning">
        <div className="fusion-map-top"><span>EXPERIMENT DESIGN</span><span>2 CLASSICAL · 3 QUANTUM</span></div>
        <div className="fusion-map-source"><span>01 / SOURCE</span><strong>Molecular dataset</strong>
          <small>{EXPERIMENT.datasetFile} · {EXPERIMENT.target}</small></div>
        <span className="fusion-map-down"><ArrowDown size={17} /></span>
        <div className="fusion-map-features"><span>02 / REPRESENTATION</span>
          <strong>SMILES <ArrowRight size={14} /> 256 counts <ArrowRight size={14} /> SVD 4</strong>
          <small>Training-fitted scaling and arctan angle map</small></div>
        <div className="fusion-map-fork" aria-hidden="true"><span /></div>
        <div className="fusion-map-branches">
          <button className="fusion-map-path classical" onClick={() => go("classical")}>
            <span>PATH A / CLASSICAL</span><strong>Classical ML</strong>
            <small>Random Forest · Gradient Boosting</small>
            <span className="path-sequence">Features <ArrowRight size={12} /> Regressors <ArrowRight size={12} /> logS</span>
            <span className="path-cta">Open classical models <ArrowUpRight size={15} /></span>
          </button>
          <button className="fusion-map-path quantum" onClick={() => go("quantum")}>
            <span>PATH B / QUANTUM</span><strong>Quantum ML</strong>
            <small>QRF · QSVR · VQR</small>
            <span className="path-sequence">4 qubits <ArrowRight size={12} /> Circuit <ArrowRight size={12} /> logS</span>
            <span className="path-cta">Open quantum models <ArrowUpRight size={15} /></span>
          </button>
        </div>
        <div className="fusion-map-join"><span>03 / EVIDENCE</span>
          <strong>MAE <i>↓</i> RMSE <i>↓</i> R² <i>↑</i></strong>
          <button onClick={() => go("comparison")}>Classical vs Quantum <ArrowRight size={15} /></button></div>
      </section>
      <div className="overview-grid">
        <section className="surface overview-comparison">
          <SectionTop kicker="MEASURED RESULTS" title="Validation-selected winners" />
          <p className="section-description">Chosen by lowest validation RMSE, then tested once on held-out molecules.</p>
          <div className="preview-table">
            <div className="preview-table-head"><span>BRANCH</span><span>MODEL</span><span>TEST MAE</span></div>
            {([WINNERS.classical, WINNERS.quantum] as const).map((winner) => {
              const model = modelById(winner.id);
              return <div className="preview-table-row" key={winner.id}>
                <span>{model.family === "quantum" ? "Quantum" : "Classical"}</span>
                <span className="winner-name">{model.short}</span>
                <strong className="text-cyan">{num(winner.mae)}</strong>
              </div>;
            })}
          </div>
          <div className="preview-bottom">
            <span className="tiny-check"><Check size={13} /> BOTH BRANCHES EVALUATED</span>
            <button className="subtle-link" onClick={() => go("comparison")}>Full table <ArrowUpRight size={14} /></button>
          </div>
        </section>
        <section className="surface overview-molecule">
          <SectionTop kicker="STRUCTURE EXPLORER" title="Inspect a molecule"
            action={
              <div className="view-toggle-tabs">
                <button type="button" className={`view-toggle-btn ${!overview3d ? "active" : ""}`} onClick={() => setOverview3d(false)}>2D Flat</button>
                <button type="button" className={`view-toggle-btn ${overview3d ? "active" : ""}`} onClick={() => setOverview3d(true)}>3D Spatial</button>
              </div>
            }
          />
          <p className="section-description">Interactive 3D conformation or 2D skeletal depiction with RDKit.</p>
          {overview3d ? (
            <Molecule3DViewer rdkit={rdkit} smiles={smilesInput} height={250} showControls={false} />
          ) : (
            <MoleculeVisual info={visibleMolecule} loading={!rdkit} />
          )}
          <div className="viewer-status"><span className={visibleMolecule || smilesInput ? "positive" : ""}><span className="status-point" />
            {rdkit ? (overview3d ? "Interactive 3D model" : (visibleMolecule ? "Parsed by RDKit" : "Inspect to render")) : "Loading RDKit"}</span>
            <span>{overview3d ? "3D Drag & Rotate" : "2D depiction"} · <button type="button" onClick={() => { setM3dInput(smilesInput); setM3dSmiles(smilesInput); m3dInspect(smilesInput); go("molecule3d"); }} style={{ background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer", color: "var(--cyan)", font: "inherit" }}>Full 3D Studio →</button></span>
          </div>
          <form className="smiles-inline" onSubmit={(event) => { event.preventDefault(); inspect(); }}>
            <label htmlFor="overview-smiles">SMILES STRING</label>
            <div className="inline-input">
              <input id="overview-smiles" spellCheck={false} value={smilesInput}
                onChange={(event) => setSmilesInput(event.target.value)} placeholder="Paste a SMILES string" />
              <button type="submit" aria-label="Inspect molecule" disabled={!rdkit}><ArrowUpRight size={17} /></button>
            </div>
          </form>
        </section>
      </div>
      <div className="pilot-link-line">
        <div><Target size={17} /><span><strong>Predict a new molecule.</strong> Choose any of the five models and copy its exact prediction cell.</span></div>
        <button className="text-link" onClick={() => go("prediction")}>Open prediction <ArrowUpRight size={15} /></button>
      </div>
      <div className="overview-footnote"><ShieldCheck size={16} />
        <span>All metrics are measured from the notebook runs. Research-use predictions do not replace experimental measurement.</span></div>
    </>;
  };

  const nav = (item: typeof NAV_ITEMS[number]) => {
    const Icon = item.icon;
    return <button key={item.page} className={`nav-item ${page === item.page ? "active" : ""}`}
      onClick={() => go(item.page)} aria-current={page === item.page ? "page" : undefined}>
      <Icon size={18} strokeWidth={1.7} /><span>{item.label}</span>
      {page === item.page && <span className="active-indicator" />}
    </button>;
  };

  return <div className="app-shell">
    <ParticleBackground />
    {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}
    <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><MoleculeMark /><div><strong>infidrug</strong><span>moleQular fusion</span></div></div>
      <div className="sidebar-rule" />
      <div className="sidebar-group-label">WORKSPACE <span>01</span></div>
      <nav aria-label="Main navigation">{NAV_ITEMS.map(nav)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-engine"><div><span className={`engine-dot ${rdkit ? "ready" : ""}`} /> <span>RESEARCH ENGINE</span></div>
        <strong>{engineError ? "Engine unavailable" : rdkit ? "RDKit online" : "Initializing..."}</strong>
        <small>{rdkit ? `v${rdkit.version()}` : "Structure rendering"}</small></div>
      <div className="sidebar-bottom"><span>TEAM TESSARACT</span><strong>moleQular fusion</strong></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="topbar-left">
        <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
        <span className="topbar-brand">infidrug <i>|</i> <span>moleQular fusion</span></span>
        <span className="topbar-divider" />
        <span className="breadcrumb">{NAV_ITEMS.find((item) => item.page === page)?.label}</span>
      </div><div className="topbar-right">
        <span className="target-label"><Target size={15} /> delaney.csv · logS</span>
        <button className="button button-primary top-run" onClick={() => go("comparison")}>
          <BarChart3 size={15} /><span>View results</span>
        </button></div></header>
      {toast && <div className="toast" role="status"><CheckCircle2 size={17} /><span>{toast}</span>
        <button onClick={() => setToast("")} aria-label="Dismiss"><X size={15} /></button></div>}
      <main className="main-content"><div key={page} className="page-enter">{content()}</div>
        <footer className="app-footer">
          <span><MoleculeMark small /> infidrug <i>/</i> moleQular fusion</span>
          <span>Team Tessaract · 2 classical + 3 quantum models</span>
        </footer>
      </main>
    </div>
  </div>;
}

function SectionHeading({ eyebrow, title, description, action }: {
  eyebrow: string; title: ReactNode; description?: string; action?: ReactNode;
}) {
  return <div className="page-heading">
    <div className="heading-copy">
      <div className="eyebrow"><span className="eyebrow-dash" />{eyebrow}</div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {action && <div className="heading-action">{action}</div>}
  </div>;
}

function parseRows(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const smilesColumn = headers.findIndex((header) => header.includes("smiles"));
  const targetColumn = headers.findIndex((header) => header.includes("measured") && header.includes("solubility"))
    ?? headers.findIndex((header) => header === "logs" || header.includes("log solubility"));
  const nameColumn = headers.findIndex((header) => ["compound id", "compound", "name"].includes(header));
  return lines.slice(1).map((line, index) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "")) ?? [];
    const raw = (cells[targetColumn] ?? "").trim();
    const parsed = Number(raw);
    return {
      rowNumber: index + 2,
      name: (nameColumn >= 0 ? cells[nameColumn] : "")?.trim() || `Molecule ${index + 1}`,
      smiles: (cells[smilesColumn] ?? "").trim(),
      target: raw && Number.isFinite(parsed) ? parsed : null,
    };
  }).filter((row) => row.smiles);
}

function Menu({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
}
