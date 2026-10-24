// Notebooks and helpers are inlined at build time so the viewer and downloads
// work even when the app is served as a single self-contained index.html.
const notebooks = import.meta.glob("../../public/notebooks/*.ipynb", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const supportFiles = import.meta.glob(
  "../../public/notebooks/*.{py,txt,md}",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function toName(path: string): string {
  return path.split("/").pop() || path;
}

export const NOTEBOOK_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(notebooks).map(([path, content]) => [toName(path), content]),
);

export const SUPPORT_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(supportFiles).map(([path, content]) => [toName(path), content]),
);

export function readBundledFile(file: string): string | null {
  return NOTEBOOK_SOURCES[file] ?? SUPPORT_SOURCES[file] ?? null;
}

export function parseNotebookCells(file: string): { kind: "code" | "markdown"; source: string }[] {
  const raw = NOTEBOOK_SOURCES[file];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { cells?: { cell_type?: string; source?: string | string[] }[] };
    if (!Array.isArray(parsed.cells)) return [];
    return parsed.cells
      .map((cell) => ({
        kind: (cell.cell_type === "code" ? "code" : "markdown") as "code" | "markdown",
        source: Array.isArray(cell.source) ? cell.source.join("") : cell.source || "",
      }))
      .filter((cell) => cell.source.trim().length > 0);
  } catch {
    return [];
  }
}
