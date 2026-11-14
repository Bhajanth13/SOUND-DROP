import { useEffect, useRef } from "react";
import { MODES, NUM_TONES, toneHz } from "../lib/modem.js";

// Live frequency spectrum of the microphone (0-22 kHz), drawn on a canvas
// about 30 times a second from the AnalyserNode's FFT.
const MAX_HZ = 22000, TOP_DB = -20, BOTTOM_DB = -140;

export default function SpectrumView({ getAnalyser, active }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf, last = 0, data;
    function draw(time) {
      raf = requestAnimationFrame(draw);
      if (time - last < 33) return;
      last = time;
      const canvas = ref.current, w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr; canvas.height = h * dpr;              // sharp on phone screens
      const g = canvas.getContext("2d");
      g.scale(dpr, dpr);
      const css = getComputedStyle(canvas);
      const x = (hz) => (hz / MAX_HZ) * w;
      const y = (db) => ((TOP_DB - Math.max(BOTTOM_DB, Math.min(TOP_DB, db))) / (TOP_DB - BOTTOM_DB)) * (h - 16);

      g.fillStyle = css.getPropertyValue("--sd-band").trim();                // the two tone bands
      for (const m of Object.values(MODES)) g.fillRect(x(toneHz(m, 0)), 0, x(toneHz(m, NUM_TONES - 1)) - x(toneHz(m, 0)), h - 16);
      g.fillStyle = css.color; g.font = "11px system-ui"; g.textAlign = "center";
      for (let hz = 5000; hz < MAX_HZ; hz += 5000) g.fillText(hz / 1000 + " kHz", x(hz), h - 3);

      const an = active && getAnalyser();
      if (!an) { g.fillText("Tap Listen to see the live spectrum", w / 2, h / 2); return; }
      if (!data) data = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(data);                                // dB level of every FFT bin
      const binHz = an.context.sampleRate / an.fftSize;
      g.beginPath();
      for (let i = 1; i * binHz <= MAX_HZ; i++) g.lineTo(x(i * binHz), y(data[i]));
      g.strokeStyle = css.getPropertyValue("--bs-primary").trim(); g.lineWidth = 1.5; g.stroke();
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, active]);
  return <canvas ref={ref} className="sd-spectrum" role="img" aria-label="Live frequency spectrum of the microphone" />;
}
