# INFIDRUG MOLEQULAR FUSION — 5-Model Notebook Kit

Team TESSARACT. Molecular solubility (logS) prediction on `delaney.csv`.

Exactly five models are included — two classical and three quantum/hybrid:

| # | Notebook | Model | Family |
|---|----------|-------|--------|
| 1 | `01_gradient_boosting.ipynb` | Gradient Boosting Regression | Classical |
| 2 | `02_qrf.ipynb` | Quantum-Feature Random Forest | Quantum |
| 3 | `03_qsvr.ipynb` | Quantum Support Vector Regression | Quantum |
| 4 | `04_vqr.ipynb` | Variational Quantum Regression | Quantum |
| 5 | `05_random_forest.ipynb` | Random Forest Regression | Classical |

## Setup

1. Put `delaney.csv` in the same folder as the notebooks. It must contain a
   SMILES column and a measured-solubility column.
2. `python -m pip install -r requirements.txt`
3. `jupyter lab`, select the Python 3 kernel, run cells top to bottom.

Each notebook is independent — no notebook has to run before another one.

## Shared pipeline

All five models use the **same four features**, so their metrics are directly
comparable:

1. `CountVectorizer` over SMILES characters → up to 256 features
2. `TruncatedSVD(n_components=4)` → four components (~76.24% of training variance)
3. `StandardScaler` fitted on training rows only
4. `np.arctan` angle map for quantum encoding

Split: `GroupShuffleSplit` by SMILES so identical molecules cannot cross
splits — outer 80/20 (seed 42), inner 75/25 of the development set (seed 43).
That yields 681 train / 233 validation / 230 test rows.

Model selection uses **validation RMSE only**. Test rows are never used to
choose a model or its hyperparameters.

## Notes on the quantum models

- **QRF** is a *quantum-feature* random forest: a fixed, non-trainable
  4-qubit simulator produces 20 measured features (5 circuits × 4 Pauli-Z
  expectations) which feed a standard `RandomForestRegressor`. The forest
  itself is classical — this is a hybrid, not a fully quantum forest.
- **QSVR** builds a quantum kernel from squared state overlap
  `|<psi(xi)|psi(xj)>|²` and fits `SVR(kernel="precomputed")`.
- **VQR** optimises 16 circuit rotation parameters plus a 2-parameter linear
  head with `scipy.optimize.minimize(method="L-BFGS-B")`.

All three run on the notebook's own NumPy 4-qubit statevector simulator —
no quantum hardware is used and no speedup or advantage is claimed.

## Results reported by this run

| Family | Model | Val RMSE | Test MAE | Test RMSE | Test R² |
|---|---|---|---|---|---|
| Quantum | QRF | 1.0910 | 0.8405 | 1.0943 | 0.7432 |
| Quantum | QSVR | 1.1371 | 0.9745 | 1.2855 | 0.6456 |
| Quantum | VQR | 1.5324 | 1.2455 | 1.5808 | 0.4641 |
| Classical | Random Forest | 1.1320 | 0.8430 | 1.0987 | 0.7411 |
| Classical | Gradient Boosting | 1.1633 | 0.8545 | 1.1111 | 0.7352 |

Validation-selected winners: **QRF** (quantum, val RMSE 1.0910) and
**Gradient Boosting** (classical, val RMSE 1.1633).

A separate **256-feature classical benchmark** in notebooks 01 and 05 gives a
higher ceiling — Gradient Boosting 0.8274 RMSE / 0.8532 R², Random Forest
0.8588 RMSE / 0.8418 R² — but it uses more input information, so it is not
directly comparable with the matched four-feature quantum results.
