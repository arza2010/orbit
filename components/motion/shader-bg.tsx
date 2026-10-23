"use client";

import { useEffect, useRef } from "react";

// A full-screen aurora drawn by the GPU. Slow, domain-warped noise, tinted by the time of day and
// brightened toward the pointer. It renders at a fraction of screen resolution (the picture is soft
// anyway), pauses when the tab is hidden, and falls back to the CSS aurora if WebGL is unavailable.

type RGB = [number, number, number];
type Palette = { base: RGB; c1: RGB; c2: RGB; c3: RGB };

const NIGHT: Palette = { base: [0.02, 0.02, 0.045], c1: [0.3, 0.2, 0.65], c2: [0.1, 0.45, 0.58], c3: [0.55, 0.15, 0.42] };
const DAWN: Palette = { base: [0.04, 0.025, 0.05], c1: [0.55, 0.25, 0.5], c2: [0.92, 0.5, 0.36], c3: [0.35, 0.25, 0.7] };
const DAY: Palette = { base: [0.02, 0.03, 0.065], c1: [0.2, 0.35, 0.82], c2: [0.1, 0.62, 0.72], c3: [0.46, 0.3, 0.82] };
const DUSK: Palette = { base: [0.045, 0.02, 0.04], c1: [0.82, 0.3, 0.25], c2: [0.76, 0.2, 0.56], c3: [0.35, 0.2, 0.66] };

// Hour of day (India time) -> palette. Blended smoothly between neighbours.
const KEYS: [number, Palette][] = [
  [0, NIGHT],
  [5, NIGHT],
  [6.5, DAWN],
  [9.5, DAY],
  [16, DAY],
  [18, DUSK],
  [20, NIGHT],
  [24, NIGHT],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function paletteAt(hour: number): Palette {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, p0] = KEYS[i];
    const [h1, p1] = KEYS[i + 1];
    if (hour >= h0 && hour <= h1) {
      const t = (hour - h0) / (h1 - h0);
      return { base: mix3(p0.base, p1.base, t), c1: mix3(p0.c1, p1.c1, t), c2: mix3(p0.c2, p1.c2, t), c3: mix3(p0.c3, p1.c3, t) };
    }
  }
  return NIGHT;
}

const indiaHour = () => {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uPointer;
uniform vec3 uBase, uC1, uC2, uC3;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.02; a *= .5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - .5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime * .055;

  vec2 m = (uPointer - .5) * vec2(uRes.x / uRes.y, 1.);
  // Warp the noise field twice: this is what makes it flow like a liquid rather than drift like clouds.
  vec2 q = vec2(fbm(p * 1.3 + vec2(0., t)), fbm(p * 1.3 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.6 + q * 2. + vec2(1.7, 9.2) + t * 1.2), fbm(p * 1.6 + q * 2. + vec2(8.3, 2.8) - t));
  float f = fbm(p * 1.2 + r * 2.2 + m * .35);

  vec3 col = uBase;
  col = mix(col, uC1, smoothstep(.2, .72, q.x) * .62);
  col = mix(col, uC2, smoothstep(.3, .82, r.y) * .55);
  col = mix(col, uC3, smoothstep(.35, .78, f) * .5 * smoothstep(.0, 1., 1.15 - uv.y));

  // Light that follows the pointer.
  float d = length(p - m);
  col += uC2 * exp(-d * d * 5.5) * .28;

  col *= 1. - .55 * dot(uv - .5, uv - .5) * 2.;           // vignette
  col += (hash(gl_FragCoord.xy + uTime) - .5) / 200.;      // dither: no banding in the dark gradients
  gl_FragColor = vec4(col, 1.);
}`;

export function ShaderBg() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // the CSS aurora stays

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const scale = coarse ? 0.3 : 0.45; // fraction of screen resolution
    const frameMs = coarse ? 1000 / 30 : 1000 / 45;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type) as WebGLShader;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
      console.warn("[shader-bg] shader failed to compile:", gl.getShaderInfoLog(s));
      return null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram() as WebGLProgram;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[shader-bg] program failed to link:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // One triangle that covers the screen.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U("uRes"), uTime = U("uTime"), uPointer = U("uPointer"), uBase = U("uBase"), uC1 = U("uC1"), uC2 = U("uC2"), uC3 = U("uC3");

    const resize = () => {
      canvas.width = Math.max(2, Math.round(window.innerWidth * scale));
      canvas.height = Math.max(2, Math.round(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Pointer, eased so the glow glides instead of snapping.
    const target = { x: 0.5, y: 0.55 };
    const pointer = { x: 0.5, y: 0.55 };
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    // On touch there is no hover, so scrolling nudges the light instead.
    const onScroll = () => {
      target.y = 0.75 - Math.min(1, window.scrollY / 1600) * 0.5;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const palette = paletteAt(indiaHour());
    let want = palette;
    const palTimer = window.setInterval(() => (want = paletteAt(indiaHour())), 60_000);

    let raf = 0;
    let last = 0;
    let running = false;
    const t0 = performance.now();
    let frozenAt = -1;

    const draw = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      if (now - last < frameMs) return;
      last = now;

      pointer.x += (target.x - pointer.x) * 0.06;
      pointer.y += (target.y - pointer.y) * 0.06;
      // Colours ease toward the current time-of-day palette.
      for (const k of ["base", "c1", "c2", "c3"] as const) palette[k] = mix3(palette[k], want[k], 0.02);

      const time = reduce ? (frozenAt = frozenAt < 0 ? (now - t0) / 1000 : frozenAt) : (now - t0) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform3fv(uBase, palette.base);
      gl.uniform3fv(uC1, palette.c1);
      gl.uniform3fv(uC2, palette.c2);
      gl.uniform3fv(uC3, palette.c3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (reduce && frozenAt >= 0) {
        // One still frame is enough for reduced motion.
        running = false;
      }
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
      document.documentElement.removeAttribute("data-gl");
    };
    canvas.addEventListener("webglcontextlost", onLost);

    start();
    document.documentElement.setAttribute("data-gl", "1"); // the CSS aurora steps aside; glass gets cheaper

    return () => {
      stop();
      window.clearInterval(palTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      document.documentElement.removeAttribute("data-gl");
      // Release what this run created. The context itself is left alone: React may start this effect
      // again on the very same canvas (dev mode does so deliberately), and a lost context cannot be revived.
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="shader-bg" />;
}
