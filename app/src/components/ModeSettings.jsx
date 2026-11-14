import { Fragment } from "react";
import { MODES, SPEEDS, toneHz, NUM_TONES } from "../lib/modem.js";

// Reusable group of radio buttons styled as a Bootstrap button group.
export function Segmented({ name, options, value, onChange, wrap = false }) {
  return (
    <div className={wrap ? "d-flex flex-wrap gap-2" : "btn-group w-100"} role="group" aria-label={name}>
      {options.map((o) => (
        <Fragment key={o.id}>
          <input type="radio" className="btn-check" name={name} id={name + "-" + o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <label className={"btn btn-outline-primary" + (wrap ? " rounded-pill btn-sm px-3" : "")} htmlFor={name + "-" + o.id}>{o.label}</label>
        </Fragment>
      ))}
    </div>
  );
}

export default function ModeSettings({ mode, speed, volume, onMode, onSpeed, onVolume }) {
  const m = MODES[mode];
  const range = toneHz(m, 0).toLocaleString("en-IN") + "–" + toneHz(m, NUM_TONES - 1).toLocaleString("en-IN") + " Hz";
  return (
    <div className="vstack gap-3">
      <div>
        <div className="form-label">Mode</div>
        <Segmented name="mode" options={Object.values(MODES)} value={mode} onChange={onMode} />
        <div className="form-text">
          {mode === "silent"
            ? "Silent: tones at " + range + ", above what most people hear. Keep devices within 1–2 m."
            : "Audible: tones at " + range + ". Most reliable; works across a room."}
        </div>
      </div>
      <div>
        <div className="form-label">Speed</div>
        <Segmented name="speed" options={Object.values(SPEEDS).map((s) => ({ ...s, label: s.label + " · " + s.symbolMs + " ms" }))} value={speed} onChange={onSpeed} />
      </div>
      <div>
        <label htmlFor="volume" className="form-label d-flex justify-content-between">
          <span>Volume</span><span className="text-body-secondary tnum">{Math.round(volume * 100)}%</span>
        </label>
        <input type="range" className="form-range" id="volume" min="0.1" max="1" step="0.05" value={volume} onChange={(e) => onVolume(+e.target.value)} />
      </div>
    </div>
  );
}
