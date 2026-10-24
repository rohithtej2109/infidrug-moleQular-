# infidrug-moleQular-

> **infidrug moleQular fusion** — Molecular Solubility Studio & Quantum ML Prediction Engine

A state-of-the-art interactive cheminformatics and quantum machine learning web application for molecular structure inspection, 3D conformation modeling, physicochemical descriptor calculation, and aqueous solubility (logS) prediction.

---

## ✨ Features

- **Interactive 3D Molecular Studio**:
  - Real-time 3D ball-and-stick spatial mesh viewer with CPK coloring and multiple color schemes.
  - Interactive mouse rotation, zoom, auto-rotation, and projection toggles.
  - Real-time Delaney ESOL aqueous solubility estimation and classification badges.

- **2D Skeletal Structure Depiction**:
  - In-browser RDKit WebAssembly rendering.
  - Canonical SMILES parsing, SVG generation, and validation.

- **Physicochemical Descriptors**:
  - Molecular Weight (MW), LogP, Topological Polar Surface Area (TPSA), Rotatable Bonds, H-Bond Donors (HBD), and H-Bond Acceptors (HBA).

- **Quantum ML & Classical Models Comparison**:
  - Benchmarked architectures: Gradient Boosting, Quantum Random Forest (QRF), Quantum Support Vector Regressor (QSVR), Variational Quantum Regressor (VQR), and Random Forest.
  - Interactive ROC curves, metric comparisons, and prediction confidence intervals.

- **Interactive Jupyter Notebooks**:
  - Complete Python source notebooks included in `public/notebooks/` with downloadable zip archive.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `pnpm`

### Installation

```bash
git clone https://github.com/rohithtej2109/infidrug-moleQular-.git
cd infidrug-moleQular-
npm install
```

### Development Server

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

---

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Cheminformatics**: RDKit WebAssembly (`@rdkit/rdkit`)
- **Icons & Styling**: Lucide React, Custom CSS Design System with Canvas Particle Animation
- **ML & Data**: Quantum & Classical Notebook pipelines (PennyLane, Qiskit, Scikit-Learn)