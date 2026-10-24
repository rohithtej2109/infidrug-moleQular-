/**
 * Minimal .npy reader plus ROC/AUC computation.
 *
 * Nothing is uploaded anywhere: files are read with FileReader in the browser
 * and the curve is computed from the exported prediction vectors.
 */

export type NpyArray = { data: Float64Array; shape: number[] };

const DESCR: Record<string, { bytes: number; signed: boolean; float: boolean }> = {
  "<f8": { bytes: 8, signed: true, float: true },
  "<f4": { bytes: 4, signed: true, float: true },
  "<i8": { bytes: 8, signed: true, float: false },
  "<i4": { bytes: 4, signed: true, float: false },
  "<i2": { bytes: 2, signed: true, float: false },
  "<u4": { bytes: 4, signed: false, float: false },
  "<u2": { bytes: 2, signed: false, float: false },
  "|b1": { bytes: 1, signed: false, float: false },
};

export function parseNpy(buffer: ArrayBuffer): NpyArray {
  const bytes = new Uint8Array(buffer);
  const magic = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  if (magic.some((value, index) => bytes[index] !== value)) {
    throw new Error("Not a NumPy .npy file.");
  }
  const major = bytes[6];
  let offset = 8;
  let headerLength: number;
  if (major <= 1) {
    headerLength = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
  } else {
    headerLength = bytes[offset] | (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    offset += 4;
  }
  const header = new TextDecoder("latin1").decode(bytes.subarray(offset, offset + headerLength));

  const descrMatch = /'descr':\s*'([^']+)'/.exec(header);
  const shapeMatch = /'shape':\s*\(([^)]*)\)/.exec(header);
  if (!descrMatch || !shapeMatch) throw new Error("Unrecognised .npy header.");
  const spec = DESCR[descrMatch[1]];
  if (!spec) throw new Error(`Unsupported dtype ${descrMatch[1]}. Save predictions with np.save (float or int).`);

  const shape = shapeMatch[1].split(",").map((part) => Number(part.trim())).filter((value) => Number.isFinite(value) && value > 0);
  const count = shape.reduce((product, value) => product * value, 1);
  const view = new DataView(buffer, offset + headerLength);
  const little = descrMatch[1].startsWith("<") || descrMatch[1].startsWith("|");
  const data = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const at = index * spec.bytes;
    if (spec.float) {
      data[index] = spec.bytes === 8 ? view.getFloat64(at, little) : view.getFloat32(at, little);
    } else if (spec.signed) {
      if (spec.bytes === 8) data[index] = Number(view.getBigInt64(at, little));
      else if (spec.bytes === 4) data[index] = view.getInt32(at, little);
      else data[index] = view.getInt16(at, little);
    } else {
      data[index] = spec.bytes === 4 ? view.getUint32(at, little) : view.getUint16(at, little);
    }
  }
  return { data, shape };
}

export type RocCurve = { fpr: number[]; tpr: number[]; auc: number; positives: number; negatives: number };

/**
 * Empirical ROC curve for score vectors. Matches the notebooks, which treat
 * measured logS >= -2.0 as the positive class.
 */
export function rocCurve(scores: ArrayLike<number>, labels: ArrayLike<number>, threshold = -2): RocCurve | null {
  const points = Array.from({ length: scores.length }, (_, index) => ({
    score: Number(scores[index]),
    positive: Number(labels[index]) >= threshold ? 1 : 0,
  }));
  if (points.length < 2) return null;
  const positives = points.reduce((total, point) => total + point.positive, 0);
  const negatives = points.length - positives;
  if (!positives || !negatives) return null;

  points.sort((a, b) => b.score - a.score);
  const fpr: number[] = [0];
  const tpr: number[] = [0];
  let truePositives = 0;
  let falsePositives = 0;
  for (let index = 0; index < points.length; index += 1) {
    truePositives += points[index].positive;
    falsePositives += 1 - points[index].positive;
    const last = index === points.length - 1 || points[index + 1].score !== points[index].score;
    if (last) {
      fpr.push(falsePositives / negatives);
      tpr.push(truePositives / positives);
    }
  }
  let auc = 0;
  for (let index = 1; index < fpr.length; index += 1) {
    auc += (fpr[index] - fpr[index - 1]) * ((tpr[index] + tpr[index - 1]) / 2);
  }
  return { fpr, tpr, auc, positives, negatives };
}
