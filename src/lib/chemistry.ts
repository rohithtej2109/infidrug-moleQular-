import type { MainModule, Mol } from "@rdkit/rdkit";


export type RDKit = MainModule;

export const DESCRIPTORS = [
  { key: "amw", label: "Mol. weight", short: "MW", unit: "g/mol" },
  { key: "CrippenClogP", label: "LogP", short: "LogP", unit: "" },
  { key: "tpsa", label: "TPSA", short: "TPSA", unit: "A²" },
  { key: "NumHBD", label: "H-bond donors", short: "HBD", unit: "" },
  { key: "NumHBA", label: "H-bond acceptors", short: "HBA", unit: "" },
  { key: "NumRotatableBonds", label: "Rotatable bonds", short: "RotB", unit: "" },
  { key: "NumAromaticRings", label: "Aromatic rings", short: "ArR", unit: "" },
  { key: "NumRings", label: "Total rings", short: "Rings", unit: "" },
  { key: "FractionCSP3", label: "Fraction Csp3", short: "Csp3", unit: "" },
  { key: "NumHeteroatoms", label: "Heteroatoms", short: "Het", unit: "" },
  { key: "NumAmideBonds", label: "Amide bonds", short: "Amide", unit: "" },
  { key: "labuteASA", label: "Surface area", short: "ASA", unit: "A²" },
  { key: "CrippenMR", label: "Molar refractivity", short: "MR", unit: "" },
  { key: "NumHeavyAtoms", label: "Heavy atoms", short: "Heavy", unit: "" },
] as const;

export type MoleculeInfo = { smiles: string; svg: string; descriptors: number[]; fingerprint: Uint8Array; vector: Float32Array };
export type FeatureSettings = { descriptors: boolean; fingerprints: boolean; fpBits: 1024 | 2048 };

const DESCRIPTOR_KEYS = DESCRIPTORS.map((d) => d.key);

function descriptorValues(mol: Mol): number[] {
  const values = JSON.parse(mol.get_descriptors()) as Record<string, number>;
  return DESCRIPTOR_KEYS.map((key) => {
    const value = Number(values[key]);
    return Number.isFinite(value) ? value : 0;
  });
}

function getFingerprint(mol: Mol, bits: number): Uint8Array {
  let text = mol.get_morgan_fp(JSON.stringify({ radius: 2, nBits: bits }));
  if (text.length !== bits) {
    for (const key of ["fpSize", "fplen", "len"]) {
      const candidate = mol.get_morgan_fp(JSON.stringify({ radius: 2, [key]: bits }));
      if (candidate.length === bits) { text = candidate; break; }
    }
  }
  if (text.length !== bits || /[^01]/.test(text)) throw new Error(`RDKit returned no ${bits}-bit Morgan fingerprint.`);
  const output = new Uint8Array(bits);
  for (let i = 0; i < bits; i++) output[i] = text.charCodeAt(i) === 49 ? 1 : 0;
  return output;
}

export function inspectMolecule(rdkit: RDKit, smiles: string, settings: FeatureSettings): MoleculeInfo | null {
  const mol = rdkit.get_mol(smiles.trim());
  if (!mol) return null;
  try {
    if (!mol.is_valid()) return null;
    const descriptors = descriptorValues(mol);
    const fingerprint = getFingerprint(mol, settings.fpBits);
    const vector = new Float32Array((settings.descriptors ? descriptors.length : 0) +
      (settings.fingerprints ? settings.fpBits : 0));
    let offset = 0;
    if (settings.descriptors) {
      vector.set(descriptors);
      offset = descriptors.length;
    }
    if (settings.fingerprints) vector.set(fingerprint, offset);
    const svg = mol.get_svg_with_highlights(JSON.stringify({
      width: 600, height: 330, clearBackground: false, bondLineWidth: 1.8,
      atomColourPalette: {
        6: [0.15, 0.27, 0.29], 7: [0.2, 0.37, 0.72], 8: [0.76, 0.28, 0.32],
        9: [0.16, 0.51, 0.33], 15: [0.51, 0.34, 0.7], 16: [0.65, 0.46, 0.13],
        17: [0.16, 0.51, 0.33], 35: [0.62, 0.36, 0.2], 53: [0.44, 0.32, 0.61],
      },
    }));
    return { smiles: mol.get_smiles(), svg, descriptors, fingerprint, vector };
  } finally {
    mol.delete();
  }
}

export function tanimoto(first: Uint8Array, second: Uint8Array): number {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < first.length; i++) {
    if (first[i] || second[i]) union++;
    if (first[i] && second[i]) intersection++;
  }
  return union ? intersection / union : 0;
}