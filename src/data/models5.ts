export type Family = "classical" | "quantum";

export type ModelDef = {
  id: string;
  name: string;
  short: string;
  family: Family;
  tag: string;
  description: string;
  architecture: string;
  detail: string;
  notebook: string;
  hybrid?: string;
};

/** Exactly five models: two classical, three quantum/hybrid. */
export const MODELS_5: ModelDef[] = [
  {
    id: "gb",
    name: "Gradient Boosting Regression",
    short: "GB",
    family: "classical",
    tag: "Classical 01",
    description: "Builds decision trees sequentially, with each stage attempting to correct previous prediction errors.",
    architecture: "GradientBoostingRegressor, 3 candidates tuned on validation RMSE",
    detail:
      "Three candidate configurations (100–200 estimators, learning rate 0.03–0.05, depth 2–3) are fitted on the four matched features. The candidate with the lowest validation RMSE is selected, then evaluated once on the untouched test rows. A separate 256-feature benchmark in the same notebook reports the full-vocabulary classical ceiling.",
    notebook: "01_gradient_boosting.ipynb",
  },
  {
    id: "rf",
    name: "Random Forest Regression",
    short: "RF",
    family: "classical",
    tag: "Classical 02",
    description: "Combines multiple decision trees to predict molecular solubility.",
    architecture: "RandomForestRegressor, 3 candidates tuned on validation RMSE",
    detail:
      "Bagged regression trees (200–400 estimators, min_samples_leaf 1–2, optional max_depth 12) are compared on validation RMSE. The winner is tested once on held-out rows, and the notebook repeats the fit on all 256 vocabulary features as an upper-bound reference.",
    notebook: "05_random_forest.ipynb",
  },
  {
    id: "qrf",
    name: "Quantum-Feature Random Forest",
    short: "QRF",
    family: "quantum",
    tag: "Quantum 01",
    description:
      "A 4-qubit simulator turns each molecule into 20 measured quantum features (5 fixed random circuits × 4 Pauli-Z expectations), which then feed a standard Random Forest regressor.",
    architecture: "Non-trainable quantum feature map → RandomForestRegressor",
    detail:
      "Each of the five fixed random circuits applies one encoding layer, a random RY rotation per qubit and a CNOT chain, then measures ⟨Z⟩ on all four qubits. The 20 resulting numbers are concatenated and passed to a RandomForestRegressor whose min_samples_leaf is tuned on validation RMSE. The forest, its training and its readout are classical — only the feature extraction is quantum.",
    notebook: "02_qrf.ipynb",
    hybrid:
      "Hybrid model: quantum circuit supplies features; the ensemble, training and prediction are entirely classical. Not a fully quantum random forest.",
  },
  {
    id: "qsvr",
    name: "Quantum Support Vector Regression",
    short: "QSVR",
    family: "quantum",
    tag: "Quantum 02",
    description: "Uses quantum feature mapping and a quantum kernel with support-vector regression.",
    architecture: "Quantum kernel |⟨ψ(xi)|ψ(xj)⟩|² → SVR(kernel='precomputed')",
    detail:
      "Every molecule is encoded into a 4-qubit state. The kernel entry between two molecules is the squared overlap of their states, computed exactly from the statevector. Six C / epsilon combinations are compared on validation RMSE before the winner predicts the test rows.",
    notebook: "03_qsvr.ipynb",
  },
  {
    id: "vqr",
    name: "Variational Quantum Regression",
    short: "VQR",
    family: "quantum",
    tag: "Quantum 03",
    description: "Uses a parameterized quantum circuit whose trainable parameters are optimized for regression.",
    architecture: "16 variational rotations + linear head, L-BFGS-B",
    detail:
      "A two-layer circuit encodes the four features in the first layer, then applies 16 trainable RY/RZ rotations with CNOT entanglers. ⟨Z₀⟩ is scaled by a slope and intercept initialised from a least-squares fit. All 18 parameters are optimised by minimising training MSE with L-BFGS-B (max 160 iterations), and the loss curve is plotted.",
    notebook: "04_vqr.ipynb",
  },
];

export type ResultRow = {
  id: string;
  valRmse: number;
  mae: number;
  rmse: number;
  r2: number;
};

/** Matched benchmark: the same four features for all five models. */
export const MATCHED_RESULTS: ResultRow[] = [
  { id: "qrf", valRmse: 1.091, mae: 0.8405, rmse: 1.0943, r2: 0.7432 },
  { id: "rf", valRmse: 1.132, mae: 0.843, rmse: 1.0987, r2: 0.7411 },
  { id: "qsvr", valRmse: 1.1371, mae: 0.9745, rmse: 1.2855, r2: 0.6456 },
  { id: "gb", valRmse: 1.1633, mae: 0.8545, rmse: 1.1111, r2: 0.7352 },
  { id: "vqr", valRmse: 1.5324, mae: 1.2455, rmse: 1.5808, r2: 0.4641 },
];

/**
 * Full 256-entry SMILES vocabulary, classical only. Uses more input
 * information than the matched benchmark, so it is reported separately.
 */
export const FULL_FEATURE_RESULTS: ResultRow[] = [
  { id: "gb", valRmse: 0.7871, mae: 0.6191, rmse: 0.8274, r2: 0.8532 },
  { id: "rf", valRmse: 0.8244, mae: 0.6245, rmse: 0.8588, r2: 0.8418 },
];

export const EXPERIMENT = {
  datasetFile: "delaney.csv",
  rows: 1144,
  train: 681,
  val: 233,
  test: 230,
  outerSeed: 42,
  innerSeed: 43,
  varianceExplained: 76.24,
  svdComponents: 4,
  vocabulary: 256,
  target: "measured log-solubility (mol/L)",
  split: "GroupShuffleSplit by SMILES — identical molecules never cross splits",
  pipeline: [
    "SMILES character n-gram counts → 256-entry vocabulary",
    "TruncatedSVD → 4 components (76.24% of training variance)",
    "StandardScaler fitted on training rows only",
    "arctan angle map for quantum encoding",
  ],
  featureNote:
    "This is a text-feature experiment, not an RDKit experiment. The pre-existing ESOL prediction column is excluded from model inputs.",
  selectionRule:
    "Models and hyperparameters are chosen by validation RMSE. Test rows are held out from every selection step.",
};

export const WINNERS = {
  quantum: MATCHED_RESULTS.filter((r) => MODELS_5.find((m) => m.id === r.id)?.family === "quantum")
    .reduce((best, r) => (r.valRmse < best.valRmse ? r : best)),
  classical: MATCHED_RESULTS.filter((r) => MODELS_5.find((m) => m.id === r.id)?.family === "classical")
    .reduce((best, r) => (r.valRmse < best.valRmse ? r : best)),
};

export function modelById(id: string): ModelDef {
  const model = MODELS_5.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown model ${id}`);
  return model;
}

export function resultFor(id: string): ResultRow | undefined {
  return MATCHED_RESULTS.find((r) => r.id === id);
}
