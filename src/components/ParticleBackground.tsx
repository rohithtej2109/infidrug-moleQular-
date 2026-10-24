import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize particles
    const count = 100;
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * (w || 1200),
      y: Math.random() * (h || 800),
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2.2 + 0.8,
      opacity: Math.random() * 0.45 + 0.15,
      hue: Math.random() < 0.35 ? 270 : 170 + Math.random() * 20,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.01 + Math.random() * 0.02,
    }));

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const onMouseLeave = () => {
      mouseRef.current = { ...mouseRef.current, active: false };
    };
    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("mouseleave", onMouseLeave);

    const animate = () => {
      timeRef.current++;
      ctx.clearRect(0, 0, w, h);
      const particles = particlesRef.current;
      const mouse = mouseRef.current;
      const repelRadius = 150;
      const repelForce = 5;

      // Update particles
      for (const p of particles) {
        p.pulse += p.pulseSpeed;

        // Mouse repulsion (antigravity)
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < repelRadius && dist > 1) {
            const force = ((repelRadius - dist) / repelRadius) * repelForce;
            const angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * force * 0.3;
            p.vy += Math.sin(angle) * force * 0.3;
          }
        }

        // Damping
        p.vx *= 0.965;
        p.vy *= 0.965;

        // Random drift
        p.vx += (Math.random() - 0.5) * 0.06;
        p.vy += (Math.random() - 0.5) * 0.06;

        // Gentle attraction to center (keeps particles from all drifting off)
        p.vx += (w / 2 - p.x) * 0.00003;
        p.vy += (h / 2 - p.y) * 0.00003;

        p.x += p.vx;
        p.y += p.vy;

        // Soft boundary wrap
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;
      }

      // Draw connection lines
      const lineDist = 130;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < lineDist) {
            const alpha = (1 - d / lineDist) * 0.12;
            const isTeal = particles[i].hue < 200;
            ctx.strokeStyle = isTeal
              ? `rgba(8,121,111,${alpha})`
              : `rgba(116,99,165,${alpha * 0.7})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        const pulseScale = 1 + Math.sin(p.pulse) * 0.15;
        const r = p.radius * pulseScale;
        const isTeal = p.hue < 200;

        // Outer glow
        ctx.globalAlpha = p.opacity * 0.35;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.5);
        glow.addColorStop(0, isTeal ? "rgba(8,200,170,0.25)" : "rgba(140,110,210,0.2)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.globalAlpha = p.opacity;
        const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        core.addColorStop(0, isTeal ? "rgba(36,165,148,0.9)" : "rgba(147,132,184,0.85)");
        core.addColorStop(1, isTeal ? "rgba(8,121,111,0.4)" : "rgba(116,99,165,0.35)");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        // White highlight
        ctx.globalAlpha = p.opacity * 0.4;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(p.x - r * 0.2, p.y - r * 0.2, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw mouse ring when active
      if (mouse.active) {
        ctx.globalAlpha = 0.04;
        ctx.strokeStyle = "#08796f";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, repelRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.025;
        const mouseGlow = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, repelRadius * 0.6);
        mouseGlow.addColorStop(0, "rgba(8,200,170,0.08)");
        mouseGlow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = mouseGlow;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, repelRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}
