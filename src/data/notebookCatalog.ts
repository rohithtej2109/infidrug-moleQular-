export type NotebookEntry = {
  file: string;
  title: string;
  description: string;
  group: "classical" | "quantum";
};

/** One notebook per retained model, plus shared requirements and README. */
export const NOTEBOOKS: NotebookEntry[] = [
  {
    file: "01_gradient_boosting.ipynb",
    title: "Gradient Boosting Regression",
    description:
      "Sequential trees with SVD reduction, validation tuning, 4-feature and 256-feature benchmarks, inference and ROC.",
    group: "classical",
  },
  {
    file: "05_random_forest.ipynb",
    title: "Random Forest Regression",
    description:
      "Bagged trees with validation tuning, matched 4-feature testing, 256-feature upper bound, inference and ROC.",
    group: "classical",
  },
  {
    file: "02_qrf.ipynb",
    title: "Quantum-Feature Random Forest",
    description:
      "Five fixed 4-qubit circuits produce 20 Pauli-Z features that feed a Random Forest regressor.",
    group: "quantum",
  },
  {
    file: "03_qsvr.ipynb",
    title: "Quantum Support Vector Regression",
    description:
      "Quantum kernel from squared state overlap, fitted with a precomputed-kernel SVR.",
    group: "quantum",
  },
  {
    file: "04_vqr.ipynb",
    title: "Variational Quantum Regression",
    description:
      "16 trainable circuit rotations plus a linear head, optimised with L-BFGS-B on training MSE.",
    group: "quantum",
  },
];

export const NOTEBOOK_SUPPORT_FILES = ["requirements.txt", "README.md"] as const;
