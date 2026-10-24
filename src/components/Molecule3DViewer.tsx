import { useEffect, useRef, useState } from "react";
import type { RDKit } from "../lib/chemistry";
import { RotateCw, ZoomIn, ZoomOut, Maximize2, Pause, Play, Layers } from "lucide-react";

interface Atom3D {
  x: number;
  y: number;
  z: number;
  element: string;
  color: string;
  radius: number;
}

interface Bond3D {
  from: number;
  to: number;
  order: number;
}

const ELEMENT_COLORS: Record<string, string> = {
  C: "#2a5a55", N: "#3460b8", O: "#c24852", S: "#d4a229",
  F: "#29823d", Cl: "#329949", Br: "#b36336", P: "#8e61c4",
  I: "#70529e", H: "#95b5b0", Si: "#99867a", B: "#d97706",
};

const ELEMENT_RADII: Record<string, number> = {
  C: 0.77, N: 0.75, O: 0.73, S: 1.02, F: 0.72,
  Cl: 0.99, Br: 1.14, P: 1.10, I: 1.33, H: 0.37, Si: 1.17, B: 0.85,
};

function parseMolBlock(molblock: string): { atoms: Atom3D[]; bonds: Bond3D[] } {
  const lines = molblock.split("\n");
  if (lines.length < 5) return { atoms: [], bonds: [] };

  const countsLine = lines[3];
  const atomCount = parseInt(countsLine.substring(0, 3).trim()) || 0;
  const bondCount = parseInt(countsLine.substring(3, 6).trim()) || 0;

  const atoms: Atom3D[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    if (!line) continue;
    const x = parseFloat(line.substring(0, 10).trim()) || 0;
    const y = parseFloat(line.substring(10, 20).trim()) || 0;
    const z0 = parseFloat(line.substring(20, 30).trim()) || 0;
    const element = line.substring(31, 34).trim();
    // Add procedural Z variation for 3D depth (since RDKit 2D molblock is planar)
    const zProcedural = z0 !== 0
      ? z0
      : Math.sin(i * 1.35) * 0.75 + Math.cos(i * 0.8 + x * 0.25) * 0.55;
    atoms.push({
      x, y, z: zProcedural,
      element,
      color: ELEMENT_COLORS[element] || "#5c726e",
      radius: (ELEMENT_RADII[element] || 0.7) * 0.55,
    });
  }

  const bonds: Bond3D[] = [];
  for (let i = 0; i < bondCount; i++) {
    const line = lines[4 + atomCount + i];
    if (!line) continue;
    const from = (parseInt(line.substring(0, 3).trim()) || 1) - 1;
    const to = (parseInt(line.substring(3, 6).trim()) || 1) - 1;
    const order = parseInt(line.substring(6, 9).trim()) || 1;
    if (from >= 0 && from < atomCount && to >= 0 && to < atomCount) {
      bonds.push({ from, to, order });
    }
  }

  return { atoms, bonds };
}

function lighten(hex: string, amt: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amt);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amt);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amt);
  return `rgb(${r},${g},${b})`;
}

function darken(hex: string, amt: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
  return `rgb(${r},${g},${b})`;
}

export type RenderMode = "ball-stick" | "spacefill" | "wireframe";

interface Molecule3DViewerProps {
  rdkit: RDKit | null;
  smiles: string;
  height?: number | string;
  showControls?: boolean;
}

export default function Molecule3DViewer({
  rdkit,
  smiles,
  height = 380,
  showControls = true,
}: Molecule3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const rotRef = useRef({ rx: 0.28, ry: 0.1, auto: true });
  const zoomRef = useRef(1);
  const modeRef = useRef<RenderMode>("ball-stick");
  const dragRef = useRef({ dragging: false, lx: 0, ly: 0 });
  const molRef = useRef<{ atoms: Atom3D[]; bonds: Bond3D[] } | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();

  const [mode, setMode] = useState<RenderMode>("ball-stick");
  const [isRotating, setIsRotating] = useState(true);
  const [stats, setStats] = useState({ atoms: 0, bonds: 0, elements: [] as string[] });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    rotRef.current.auto = isRotating;
  }, [isRotating]);

  // Parse molecule when SMILES or RDKit changes
  useEffect(() => {
    if (!rdkit || !smiles?.trim()) {
      molRef.current = null;
      setStats({ atoms: 0, bonds: 0, elements: [] });
      return;
    }
    try {
      const mol = rdkit.get_mol(smiles.trim());
      if (!mol) {
        molRef.current = null;
        setStats({ atoms: 0, bonds: 0, elements: [] });
        return;
      }
      try {
        const molblock = mol.get_molblock();
        const parsed = parseMolBlock(molblock);
        if (parsed.atoms.length > 0) {
          molRef.current = parsed;
          const uniqueElements = Array.from(new Set(parsed.atoms.map((a) => a.element)));
          setStats({
            atoms: parsed.atoms.length,
            bonds: parsed.bonds.length,
            elements: uniqueElements,
          });
        } else {
          molRef.current = null;
          setStats({ atoms: 0, bonds: 0, elements: [] });
        }
      } finally {
        mol.delete();
      }
    } catch {
      molRef.current = null;
      setStats({ atoms: 0, bonds: 0, elements: [] });
    }
  }, [rdkit, smiles]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let cw = 0;
    let ch = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cw = rect.width;
      ch = rect.height;
      canvas.width = cw * devicePixelRatio;
      canvas.height = ch * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Mouse interaction
    const onDown = (e: MouseEvent) => {
      dragRef.current = { dragging: true, lx: e.clientX, ly: e.clientY };
      rotRef.current.auto = false;
      setIsRotating(false);
      clearTimeout(resumeTimer.current);
    };
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      rotRef.current.ry += (e.clientX - dragRef.current.lx) * 0.012;
      rotRef.current.rx += (e.clientY - dragRef.current.ly) * 0.012;
      rotRef.current.rx = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotRef.current.rx));
      dragRef.current.lx = e.clientX;
      dragRef.current.ly = e.clientY;
    };
    const onUp = () => {
      if (dragRef.current.dragging) {
        dragRef.current.dragging = false;
        clearTimeout(resumeTimer.current);
        resumeTimer.current = setTimeout(() => {
          rotRef.current.auto = true;
          setIsRotating(true);
        }, 3200);
      }
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    // Wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      zoomRef.current = Math.max(0.4, Math.min(2.8, zoomRef.current * factor));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Touch support
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = { dragging: true, lx: t.clientX, ly: t.clientY };
        rotRef.current.auto = false;
        setIsRotating(false);
        clearTimeout(resumeTimer.current);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current.dragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      rotRef.current.ry += (t.clientX - dragRef.current.lx) * 0.012;
      rotRef.current.rx += (t.clientY - dragRef.current.ly) * 0.012;
      rotRef.current.rx = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotRef.current.rx));
      dragRef.current.lx = t.clientX;
      dragRef.current.ly = t.clientY;
    };
    const onTouchEnd = () => {
      dragRef.current.dragging = false;
      clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        rotRef.current.auto = true;
        setIsRotating(true);
      }, 3200);
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    let time = 0;

    const project = (x: number, y: number, z: number, rx: number, ry: number) => {
      // Y-axis rotation
      const x1 = x * Math.cos(ry) - z * Math.sin(ry);
      const z1 = x * Math.sin(ry) + z * Math.cos(ry);
      // X-axis rotation
      const y1 = y * Math.cos(rx) - z1 * Math.sin(rx);
      const z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
      // Perspective projection
      const fov = 7;
      const scale = fov / (fov + z2);
      return { sx: x1 * scale, sy: y1 * scale, z: z2, s: scale };
    };

    const animate = () => {
      time++;
      ctx.clearRect(0, 0, cw, ch);
      const data = molRef.current;
      const currentMode = modeRef.current;

      // Ambient orbital rings
      drawAmbientRings(ctx, cw, ch, time);

      if (!data || data.atoms.length === 0) {
        drawPlaceholder(ctx, cw, ch, time);
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      if (rotRef.current.auto) {
        rotRef.current.ry += 0.007;
      }

      const { rx, ry } = rotRef.current;
      const cx = cw / 2;
      const cy = ch / 2;

      // Center molecule
      const avgX = data.atoms.reduce((s, a) => s + a.x, 0) / data.atoms.length;
      const avgY = data.atoms.reduce((s, a) => s + a.y, 0) / data.atoms.length;
      const avgZ = data.atoms.reduce((s, a) => s + a.z, 0) / data.atoms.length;

      // Auto-scale to comfortably fill canvas regardless of molecule dimensions
      let maxDist = 1;
      for (const a of data.atoms) {
        const dx = a.x - avgX;
        const dy = a.y - avgY;
        const dz = a.z - avgZ;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxDist) maxDist = d;
      }
      const baseScale = (Math.min(cw, ch) * 0.38) / Math.max(maxDist, 1.4);
      const viewScale = baseScale * zoomRef.current;

      // Project all atoms
      const projected = data.atoms.map((a) => {
        const p = project(a.x - avgX, a.y - avgY, a.z - avgZ, rx, ry);
        return { ...a, sx: cx + p.sx * viewScale, sy: cy + p.sy * viewScale, z: p.z, ps: p.s };
      });

      // Z-sort indices (back to front)
      const zOrder = projected.map((_, i) => i).sort((a, b) => projected[b].z - projected[a].z);

      // Draw bonds (if not spacefill or wireframe)
      if (currentMode !== "spacefill") {
        for (const bond of data.bonds) {
          const a = projected[bond.from];
          const b = projected[bond.to];
          if (!a || !b) continue;
          const avgS = (a.ps + b.ps) / 2;
          const depth = (a.z + b.z) / 2;
          const depthAlpha = Math.max(0.2, Math.min(0.85, 0.5 + depth * 0.08));

          const bondWidth = currentMode === "wireframe"
            ? Math.max(1, 1.5 * avgS)
            : Math.max(2, 4.5 * avgS * Math.min(bond.order, 2.5));

          ctx.lineWidth = bondWidth;

          // Gradient along the bond between atom colors
          const bondGrad = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
          bondGrad.addColorStop(0, a.color);
          bondGrad.addColorStop(1, b.color);

          ctx.globalAlpha = depthAlpha * 0.8;
          ctx.strokeStyle = bondGrad;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();

          // Double bond offset line if order >= 2
          if (bond.order >= 2 && currentMode === "ball-stick") {
            const dx = b.sx - a.sx;
            const dy = b.sy - a.sy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = (-dy / len) * 3.5;
            const ny = (dx / len) * 3.5;

            ctx.globalAlpha = depthAlpha * 0.5;
            ctx.lineWidth = Math.max(1, bondWidth * 0.4);
            ctx.beginPath();
            ctx.moveTo(a.sx + nx, a.sy + ny);
            ctx.lineTo(b.sx + nx, b.sy + ny);
            ctx.stroke();
          }
        }
      }

      // Draw atoms (painter's algorithm)
      for (const i of zOrder) {
        const a = projected[i];
        const radiusMultiplier = currentMode === "spacefill" ? 1.6 : currentMode === "wireframe" ? 0.35 : 0.72;
        const r = a.radius * viewScale * a.ps * radiusMultiplier;
        if (r < 0.5) continue;

        // Outer glow
        ctx.globalAlpha = 0.28;
        const glow = ctx.createRadialGradient(a.sx, a.sy, 0, a.sx, a.sy, r * 3.2);
        glow.addColorStop(0, a.color + "35");
        glow.addColorStop(1, a.color + "00");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(a.sx, a.sy, r * 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Main sphere with 3D gradient
        ctx.globalAlpha = 1;
        const sphere = ctx.createRadialGradient(
          a.sx - r * 0.3, a.sy - r * 0.35, r * 0.05,
          a.sx, a.sy, r
        );
        sphere.addColorStop(0, lighten(a.color, 85));
        sphere.addColorStop(0.35, lighten(a.color, 30));
        sphere.addColorStop(0.7, a.color);
        sphere.addColorStop(1, darken(a.color, 45));
        ctx.fillStyle = sphere;
        ctx.beginPath();
        ctx.arc(a.sx, a.sy, r, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight
        ctx.globalAlpha = 0.35 + a.ps * 0.12;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(a.sx - r * 0.28, a.sy - r * 0.28, r * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Subtle rim light
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = lighten(a.color, 120);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(a.sx, a.sy, r - 0.5, 0, Math.PI * 2);
        ctx.stroke();

        // Element label for heteroatoms in ball-stick mode
        if (currentMode === "ball-stick" && a.element !== "C" && a.element !== "H" && r > 6) {
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${Math.max(9, Math.round(r * 0.85))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(a.element, a.sx, a.sy + 0.5);
        }
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearTimeout(resumeTimer.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [rdkit, smiles]);

  const handleReset = () => {
    rotRef.current = { rx: 0.28, ry: 0.1, auto: true };
    zoomRef.current = 1;
    setIsRotating(true);
  };

  const handleZoom = (inOut: "in" | "out") => {
    const factor = inOut === "in" ? 1.2 : 0.83;
    zoomRef.current = Math.max(0.4, Math.min(2.8, zoomRef.current * factor));
  };

  return (
    <div className="mol3d-wrap" style={{ height: typeof height === "number" ? `${height}px` : height }}>
      <canvas ref={canvasRef} className="mol3d-canvas" />

      {/* Top Overlay Stats */}
      <div className="mol3d-top-bar">
        <div className="mol3d-badge-group">
          <span className="mol3d-badge">3D CONFORMATION</span>
          {stats.atoms > 0 && (
            <span className="mol3d-sub-badge">
              {stats.atoms} atoms · {stats.bonds} bonds
            </span>
          )}
        </div>

        {/* Legend */}
        {stats.elements.length > 0 && (
          <div className="mol3d-legend">
            {stats.elements.map((el) => (
              <span key={el} className="mol3d-legend-item">
                <span
                  className="mol3d-legend-dot"
                  style={{ backgroundColor: ELEMENT_COLORS[el] || "#5c726e" }}
                />
                {el}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      {showControls && (
        <div className="mol3d-controls-bar">
          <div className="mol3d-modes">
            <button
              type="button"
              className={`mol3d-btn ${mode === "ball-stick" ? "active" : ""}`}
              onClick={() => setMode("ball-stick")}
              title="Ball & Stick Mode"
            >
              Ball & Stick
            </button>
            <button
              type="button"
              className={`mol3d-btn ${mode === "spacefill" ? "active" : ""}`}
              onClick={() => setMode("spacefill")}
              title="CPK Spacefill Spheres"
            >
              Spacefill
            </button>
            <button
              type="button"
              className={`mol3d-btn ${mode === "wireframe" ? "active" : ""}`}
              onClick={() => setMode("wireframe")}
              title="Wireframe Mesh"
            >
              Wireframe
            </button>
          </div>

          <div className="mol3d-actions">
            <button
              type="button"
              className={`mol3d-icon-btn ${isRotating ? "active" : ""}`}
              onClick={() => setIsRotating(!isRotating)}
              title={isRotating ? "Pause Auto-Rotation" : "Play Auto-Rotation"}
            >
              {isRotating ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              type="button"
              className="mol3d-icon-btn"
              onClick={() => handleZoom("in")}
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              className="mol3d-icon-btn"
              onClick={() => handleZoom("out")}
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              className="mol3d-icon-btn"
              onClick={handleReset}
              title="Reset View"
            >
              <RotateCw size={14} />
            </button>
          </div>

          <div className="mol3d-hint">Drag to rotate · Scroll to zoom</div>
        </div>
      )}
    </div>
  );
}

/** Ambient orbital rings */
function drawAmbientRings(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number
) {
  const cx = w / 2;
  const cy = h / 2;
  const baseR = Math.min(w, h) * 0.32;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const angle = t * 0.0025 + (i * Math.PI * 2) / 3;
    const r = baseR + i * 22;
    ctx.globalAlpha = 0.04 - i * 0.009;
    ctx.strokeStyle = i === 1 ? "#8d7cb5" : "#08978a";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.28, angle, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Shimmer when no molecule is loaded */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number
) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const angle = (t * 0.01) + (i * Math.PI) / 3;
    const r = 45 + Math.sin(t * 0.015 + i) * 15;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const dotR = 3.5 + Math.sin(t * 0.03 + i * 1.5) * 1.5;

    ctx.globalAlpha = 0.18 + Math.sin(t * 0.02 + i) * 0.08;
    const g = ctx.createRadialGradient(x, y, 0, x, y, dotR * 3);
    g.addColorStop(0, i % 2 === 0 ? "rgba(8,160,145,0.4)" : "rgba(130,110,185,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, dotR * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.4;
    ctx.fillStyle = i % 2 === 0 ? "#08796f" : "#7463a5";
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fill();

    // Connect adjacent
    const nextAngle = (t * 0.01) + ((i + 1) * Math.PI) / 3;
    const nr = 45 + Math.sin(t * 0.015 + i + 1) * 15;
    const nx = cx + Math.cos(nextAngle) * nr;
    const ny = cy + Math.sin(nextAngle) * nr;
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#08796f";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  }
  ctx.restore();
}
