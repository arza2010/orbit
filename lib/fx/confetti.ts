// A tiny confetti burst on a throwaway canvas. No library. Skipped for reduced motion.

type Opts = { count?: number; colors?: string[]; spread?: number; power?: number };

const DEFAULT_COLORS = ["#8b6cff", "#35e0ff", "#ff5c9d", "#b8ff6a", "#ffb454", "#ffffff"];

/** Fires from a screen point (e.g. the button you just pressed). */
export function burst(x: number, y: number, { count = 70, colors = DEFAULT_COLORS, spread = 0.9, power = 11 }: Opts = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "9999" });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread * 2;
    const v = power * (0.45 + Math.random() * 0.75);
    return {
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 4 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.45,
      c: colors[Math.floor(Math.random() * colors.length)],
    };
  });

  const start = performance.now();
  const frame = (now: number) => {
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of parts) {
      p.vy += 0.34; // gravity
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1.4);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 1.5) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Fires from the centre of an element. */
export function burstFrom(el: Element | null, opts?: Opts) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}
