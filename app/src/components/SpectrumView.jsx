import { useEffect, useRef } from "react";
import { MODES, toneHz, NUM_TONES } from "../lib/modem.js";

// Live frequency spectrum of the microphone, drawn from the Web Audio
// AnalyserNode (an FFT) about 30 times a second. The two SoundDrop tone bands
// are shaded so the user can see a message arrive.
export default function SpectrumView({ getAnalyser, active, height = 180, maxHz = 22000, markers = [] }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0, last = 0, data = null;
    const draw = (ts) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 33) return;
      last = ts;
      const cv = ref.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(cv);
      const col = (k) => css.getPropertyValue(k).trim() || "#888";
      const padB = 18, top = -20, bot = -140;
      const x = (hz) => (hz / maxHz) * w, y = (db) => ((top - db) / (top - bot)) * (h - padB);
      g.clearRect(0, 0, w, h);
      // tone bands
      g.fillStyle = col("--sd-band");
      Object.values(MODES).forEach((m) => {
        const a = x(toneHz(m, 0) - m.step / 2), b = x(toneHz(m, NUM_TONES - 1) + m.step / 2);
        g.fillRect(a, 0, b - a, h - padB);
      });
      // grid + labels
      g.strokeStyle = col("--sd-grid"); g.fillStyle = col("--sd-axis"); g.lineWidth = 1;
      g.font = "11px ui-monospace, Menlo, Consolas, monospace"; g.textBaseline = "bottom";
      for (let hz = 0; hz <= maxHz; hz += 5000) {
        g.beginPath(); g.moveTo(Math.round(x(hz)) + 0.5, 0); g.lineTo(Math.round(x(hz)) + 0.5, h - padB); g.stroke();
        g.textAlign = hz === 0 ? "left" : "center";
        g.fillText(hz === 0 ? "0" : hz / 1000 + " kHz", x(hz) + (hz === 0 ? 2 : 0), h);
      }
      markers.forEach((mk) => {
        g.strokeStyle = col("--sd-accent"); g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(x(mk) + 0.5, 0); g.lineTo(x(mk) + 0.5, h - padB); g.stroke(); g.setLineDash([]);
      });
      const an = active ? getAnalyser() : null;
      if (!an) {
        g.fillStyle = col("--sd-axis"); g.textAlign = "center"; g.textBaseline = "middle"; g.font = "13px system-ui, sans-serif";
        g.fillText("Start listening to see the live spectrum", w / 2, (h - padB) / 2);
        return;
      }
      if (!data || data.length !== an.frequencyBinCount) data = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(data);
      const binHz = an.context.sampleRate / an.fftSize, lastBin = Math.min(data.length - 1, Math.floor(maxHz / binHz));
      g.beginPath();
      for (let i = 1; i <= lastBin; i++) {
        const v = Number.isFinite(data[i]) ? Math.max(bot, Math.min(top, data[i])) : bot;
        const px = x(i * binHz), py = y(v);
        if (i === 1) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.strokeStyle = col("--sd-accent"); g.lineWidth = 1.4; g.stroke();
      g.lineTo(x(lastBin * binHz), h - padB); g.lineTo(x(binHz), h - padB); g.closePath();
      g.fillStyle = col("--sd-fill"); g.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, active, maxHz, markers]);
  return <canvas ref={ref} className="sd-spectrum" style={{ height }} aria-label="Live frequency spectrum of the microphone" role="img" />;
}
