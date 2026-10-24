import type { MainModule, Mol } from "@rdkit/rdkit";

export type RDKitModule = MainModule;

export type GraphAtom = { index: number; symbol: string; aromatic: boolean };
export type GraphBond = { from: number; to: number; order: number };
export type MolGraph = { atoms: GraphAtom[]; bonds: GraphBond[] };

export type SmilesToken = {
  text: string;
  kind: "atom" | "bond" | "ring" | "branch";
  start: number;
  end: number;
};

const SYMBOLS: Record<number, string> = {
  1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 11: "Na", 12: "Mg",
  14: "Si", 15: "P", 16: "S", 17: "Cl", 19: "K", 20: "Ca", 26: "Fe",
  30: "Zn", 35: "Br", 53: "I",
};

function symbolFor(z: number | undefined): string {
  return SYMBOLS[z ?? 6] ?? "X";
}

/** Read the real molecular graph (atoms + bonds) out of RDKit's JSON output. */
export function moleculeGraph(rdkit: RDKitModule, smiles: string): MolGraph | null {
  let mol: Mol | null = null;
  try {
    mol = rdkit.get_mol(smiles.trim());
    if (!mol || !mol.is_valid()) return null;
    const parsed = JSON.parse(mol.get_json()) as {
      molecules?: {
        atoms?: { z?: number }[];
        bonds?: { atoms?: number[]; bo?: number }[];
        extensions?: { aromaticAtoms?: number[] }[];
      }[];
    };
    const graph = parsed.molecules?.[0];
    if (!graph?.atoms) return null;
    const aromatic = new Set(graph.extensions?.flatMap((ext) => ext.aromaticAtoms ?? []) ?? []);
    const atoms: GraphAtom[] = graph.atoms.map((atom, index) => ({
      index, symbol: symbolFor(atom.z), aromatic: aromatic.has(index),
    }));
    const bonds: GraphBond[] = (graph.bonds ?? [])
      .filter((bond) => Array.isArray(bond.atoms) && bond.atoms.length === 2)
      .map((bond) => ({ from: bond.atoms![0], to: bond.atoms![1], order: bond.bo ?? 1 }));
    return { atoms, bonds };
  } catch {
    return null;
  } finally {
    mol?.delete();
  }
}

const TWO_LETTER = new Set(["Cl", "Br"]);
const SINGLE = new Set(["B", "C", "N", "O", "P", "S", "F", "I", "b", "c", "n", "o", "p", "s"]);
const BOND_CHARS = new Set(["=", "#", "/", "\\", "-", "+", ":"]);

/** Split a SMILES string into atoms, bonds, ring closures and branch marks. */
export function tokenizeSmiles(smiles: string): SmilesToken[] {
  const tokens: SmilesToken[] = [];
  let i = 0;
  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === "[") {
      const close = smiles.indexOf("]", i);
      const end = close === -1 ? smiles.length : close + 1;
      tokens.push({ text: smiles.slice(i, end), kind: "atom", start: i, end });
      i = end;
      continue;
    }
    const pair = smiles.slice(i, i + 2);
    if (TWO_LETTER.has(pair)) {
      tokens.push({ text: pair, kind: "atom", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (SINGLE.has(ch)) {
      tokens.push({ text: ch, kind: "atom", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const two = /^\d{2}/.test(smiles.slice(i + 1)) && ch === "%";
      const text = two ? smiles.slice(i, i + 3) : ch;
      tokens.push({ text, kind: "ring", start: i, end: i + text.length });
      i += text.length;
      continue;
    }
    if (ch === "%" && /^\d{2}/.test(smiles.slice(i + 1))) {
      tokens.push({ text: smiles.slice(i, i + 3), kind: "ring", start: i, end: i + 3 });
      i += 3;
      continue;
    }
    if (BOND_CHARS.has(ch)) {
      tokens.push({ text: ch, kind: "bond", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ text: ch, kind: "branch", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    i += 1;
  }
  return tokens;
}

/**
 * Walk the molecular graph in the same order the atoms appear in the SMILES
 * string. RDKit does not expose its canonical ranking, so this is a greedy
 * symbol-matched walk used only to illustrate which atom is being written.
 */
export function traversalOrder(graph: MolGraph, tokens: SmilesToken[]): number[] {
  const atomTokens = tokens.filter((token) => token.kind === "atom");
  const neighbours = new Map<number, number[]>();
  for (const bond of graph.bonds) {
    neighbours.set(bond.from, [...(neighbours.get(bond.from) ?? []), bond.to]);
    neighbours.set(bond.to, [...(neighbours.get(bond.to) ?? []), bond.from]);
  }
  const used = new Set<number>();
  const order: number[] = [];

  const pick = (symbol: string, from: number | null): number | null => {
    // SMILES writes aromatic atoms in lower case; the graph stores element
    // symbols in upper case, so match without case.
    const wanted = symbol.toLowerCase();
    const candidates = graph.atoms.filter((atom) => atom.symbol.toLowerCase() === wanted && !used.has(atom.index));
    if (!candidates.length) return null;
    if (from !== null) {
      const linked = neighbours.get(from) ?? [];
      const adjacent = candidates.find((atom) => linked.includes(atom.index));
      if (adjacent) return adjacent.index;
    }
    return candidates[0].index;
  };

  for (const token of atomTokens) {
    const symbol = token.text.replace(/[[\]H@+-]/g, "") || "C";
    const previous = order.length ? order[order.length - 1] : null;
    const chosen = pick(symbol, previous);
    if (chosen === null) break;
    used.add(chosen);
    order.push(chosen);
  }
  return order;
}

/** Positions for a tidy circular layout of the graph. */
export function circularLayout(count: number, width: number, height: number, radius: number) {
  return Array.from({ length: count }, (_, index) => {
    if (count === 1) return { x: width / 2, y: height / 2 };
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius };
  });
}
