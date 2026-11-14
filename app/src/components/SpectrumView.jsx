import { useEffect, useRef } from "react";
import { MODES, toneHz, NUM_TONES } from "../lib/modem.js";
import { useTheme } from "../hooks/ThemeContext.jsx";

// Live frequency spectrum of the microphone from the Web Audio AnalyserNode
// (an FFT), drawn about 30 times a second. Classic draws a filled line,
// Steampunk an ink trace on graph paper, Isometric a row of 3-D bars.
export default function SpectrumView({ getAnalyser, active, height = 180, maxHz = 22000, markers = [] }) {
  const ref = useRef(null);
  const { theme } = useTheme();
  useEffect(() => {
    let raf = 0, last = 0, data = null;
    const draw = (ts) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 33) return;
      last = ts;
      const cv = ref.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(cv);
      const col = (k) => css.getPropertyValue(k).trim() || "#888";
      const font = css.getPropertyValue("--sd-spec-font").trim() || "11px system-ui, sans-serif";
      const iso = theme === "isometric";
      const padB = 18, top = -20, bot = iso ? -105 : -140;   // iso bars start above the noise floor
      const depth = iso ? 14 : 0;                      // room for the 3-D bar tops
      const x = (hz) => (hz / maxHz) * (w - depth);
      const y = (db) => depth + ((top - db) / (top - bot)) * (h - padB - depth);
      g.clearRect(0, 0, w, h);

      // paper grid for steampunk
      if (theme === "steampunk") {
        g.strokeStyle = col("--sd-grid"); g.lineWidth = 0.5;
        for (let gx = 0; gx < w; gx += 10) { g.beginPath(); g.moveTo(gx + 0.5, 0); g.lineTo(gx + 0.5, h - padB); g.stroke(); }
        for (let gy = 0; gy < h - padB; gy += 10) { g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(w, gy + 0.5); g.stroke(); }
      }
      // the two tone bands
      g.fillStyle = col("--sd-band");
      Object.values(MODES).forEach((m) => {
        const a = x(toneHz(m, 0) - m.step / 2), b = x(toneHz(m, NUM_TONES - 1) + m.step / 2);
        g.fillRect(a, depth, b - a, h - padB - depth);
      });
      // axis labels
      g.fillStyle = col("--sd-axis"); g.font = font; g.textBaseline = "bottom";
      for (let hz = 0; hz <= maxHz; hz += 5000) {
        if (theme !== "steampunk") {
          g.strokeStyle = col("--sd-grid"); g.lineWidth = 1;
          g.beginPath(); g.moveTo(Math.round(x(hz)) + 0.5, depth); g.lineTo(Math.round(x(hz)) + 0.5, h - padB); g.stroke();
        }
        g.textAlign = hz === 0 ? "left" : "center";
        g.fillText(hz === 0 ? "0" : hz / 1000 + " kHz", x(hz) + (hz === 0 ? 2 : 0), h);
      }
      markers.forEach((mk) => {
        g.strokeStyle = col("--sd-accent"); g.lineWidth = 1; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x(mk) + 0.5, depth); g.lineTo(x(mk) + 0.5, h - padB); g.stroke(); g.setLineDash([]);
      });
      const an = active ? getAnalyser() : null;
      if (!an) {
        g.fillStyle = col("--sd-axis"); g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText("Start listening to see the live spectrum", w / 2, (h - padB) / 2);
        return;
      }
      if (!data || data.length !== an.frequencyBinCount) data = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(data);
      const binHz = an.context.sampleRate / an.fftSize, lastBin = Math.min(data.length - 1, Math.floor(maxHz / binHz));
      const val = (i) => (Number.isFinite(data[i]) ? Math.max(bot, Math.min(top, data[i])) : bot);

      if (iso) {
        // group bins into columns and draw each as an isometric prism
        const cols = Math.max(24, Math.floor((w - depth) / 7));
        const cw = (w - depth) / cols, dx = depth * 0.866, dy = depth * 0.5;
        const front = col("--sd-accent"), side = col("--sd-accent-dark"), cap = col("--sd-accent-light");
        for (let c = 0; c < cols; c++) {
          const f0 = (c / cols) * maxHz, f1 = ((c + 1) / cols) * maxHz;
          let v = bot;
          for (let i = Math.max(1, Math.floor(f0 / binHz)); i <= Math.min(lastBin, Math.ceil(f1 / binHz)); i++) v = Math.max(v, val(i));
          const x0 = c * cw + 0.5, bw = cw - 1.5, yTop = y(v), yBase = h - padB;
          if (yBase - yTop < 1) continue;
          g.fillStyle = side;   // right side
          g.beginPath(); g.moveTo(x0 + bw, yTop); g.lineTo(x0 + bw + dx * 0.45, yTop - dy * 0.45); g.lineTo(x0 + bw + dx * 0.45, yBase - dy * 0.45); g.lineTo(x0 + bw, yBase); g.closePath(); g.fill();
          g.fillStyle = cap;    // top
          g.beginPath(); g.moveTo(x0, yTop); g.lineTo(x0 + dx * 0.45, yTop - dy * 0.45); g.lineTo(x0 + bw + dx * 0.45, yTop - dy * 0.45); g.lineTo(x0 + bw, yTop); g.closePath(); g.fill();
          g.fillStyle = front;
          g.fillRect(x0, yTop, bw, yBase - yTop);
        }
        return;
      }
      g.beginPath();
      for (let i = 1; i <= lastBin; i++) {
        const px = x(i * binHz), py = y(val(i));
        if (i === 1) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.strokeStyle = col("--sd-accent"); g.lineWidth = theme === "steampunk" ? 1.6 : 1.4; g.stroke();
      if (theme !== "steampunk") {
        g.lineTo(x(lastBin * binHz), h - padB); g.lineTo(x(binHz), h - padB); g.closePath();
        g.fillStyle = col("--sd-fill"); g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, active, maxHz, markers, theme]);
  return <canvas ref={ref} className="sd-spectrum" style={{ height }} aria-label="Live frequency spectrum of the microphone" role="img" />;
}
