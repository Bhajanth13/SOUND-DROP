import { Fragment } from "react";
import { MODES, SPEEDS, toneHz, NUM_TONES } from "../lib/modem.js";

// Reusable group of radio buttons; a segmented control or a row of chips.
export function Segmented({ name, options, value, onChange, wrap = false }) {
  return (
    <div className={wrap ? "sd-chips" : "sd-seg"} role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <Fragment key={o.id}>
          <input type="radio" className="sd-radio" name={name} id={name + "-" + o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <label className={wrap ? "sd-chip" : "sd-seg-btn"} htmlFor={name + "-" + o.id}>
            {o.label}{o.sub && <small>{o.sub}</small>}
          </label>
        </Fragment>
      ))}
    </div>
  );
}

const khz = (hz) => (hz / 1000).toFixed(1).replace(/\.0$/, "");

export default function ModeSettings({ mode, speed, volume, onMode, onSpeed, onVolume }) {
  const modeOpts = Object.values(MODES).map((m) => ({ ...m, sub: khz(toneHz(m, 0)) + "–" + khz(toneHz(m, NUM_TONES - 1)) + " kHz" }));
  const speedOpts = Object.values(SPEEDS).map((s) => ({ ...s, sub: s.symbolMs + " ms per tone" }));
  return (
    <div className="sd-settings">
      <div>
        <div className="sd-label">Mode</div>
        <Segmented name="mode" options={modeOpts} value={mode} onChange={onMode} />
        <p className="sd-hint">{mode === "silent" ? "Above what most adults hear. Best within 1–2 m." : "A short chirp. Most reliable, works across a room."}</p>
      </div>
      <div>
        <div className="sd-label">Speed</div>
        <Segmented name="speed" options={speedOpts} value={speed} onChange={onSpeed} />
      </div>
      <div>
        <label htmlFor="volume" className="sd-label sd-label-row"><span>Volume</span><span className="tnum">{Math.round(volume * 100)}%</span></label>
        <input type="range" className="sd-range" id="volume" min="0.1" max="1" step="0.05" value={volume} onChange={(e) => onVolume(+e.target.value)} />
      </div>
    </div>
  );
}
