import { useState } from "react";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { FORMATS, EMPTY, pack, validate, byteLength } from "../lib/formats.js";
import { MODES, MAX_BYTES, airTime } from "../lib/modem.js";
import Field from "../components/Field.jsx";

// A row of Bootstrap toggle buttons that works like radio buttons
function Choice({ name, options, value, onChange }) {
  return (
    <div className="btn-group w-100 flex-wrap" role="group" aria-label={name}>
      {options.map((o) => (
        <span key={o.id} className="d-contents">
          <input type="radio" className="btn-check" name={name} id={name + o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <label className="btn btn-outline-primary" htmlFor={name + o.id}>{o.label}</label>
        </span>
      ))}
    </div>
  );
}

export default function SendPage() {
  const { send, stopSending, sending } = useSoundDrop();
  const [format, setFormat] = useState("text");
  const [values, setValues] = useState({ ...EMPTY, text: { text: "Hello from SoundDrop!" } });
  const [mode, setMode] = useState("audible");
  const [volume, setVolume] = useState(0.7);
  const [tried, setTried] = useState(false);          // show errors only after the first Send

  const v = values[format];
  const errors = validate(format, v);
  const valid = Object.keys(errors).length === 0;
  const bytes = byteLength(pack(format, v));
  const err = (k) => (tried ? errors[k] : undefined);
  const set = (k) => (e) => setValues({ ...values, [format]: { ...v, [k]: e.target.value } });

  function onSubmit(e) {
    e.preventDefault();                                // no page reload
    if (sending) return stopSending();
    setTried(true);
    if (valid) send(pack(format, v), mode, volume);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="sd-narrow">
      <h1 className="h3">Send</h1>
      <p className="text-body-secondary">Tap Listen on the other device first, then send.</p>

      <div className="card mb-3"><div className="card-body vstack gap-3">
        <Choice name="format" options={FORMATS} value={format} onChange={(f) => { setFormat(f); setTried(false); }} />

        {format === "text" && <Field as="textarea" id="text" label="Message" rows={3} value={v.text} onChange={set("text")} error={err("text")} />}
        {format === "contact" && (
          <>
            <Field id="name" label="Name" value={v.name} onChange={set("name")} error={err("name")} />
            <Field id="phone" label="Phone" type="tel" value={v.phone} onChange={set("phone")} error={err("phone")} placeholder="+91 98450 12345" />
            <Field id="email" label="Email (optional)" type="email" value={v.email} onChange={set("email")} error={err("email")} />
          </>
        )}

        <div>
          <div className="d-flex justify-content-between small text-body-secondary">
            <span className={bytes > MAX_BYTES ? "text-danger" : ""}>{bytes} of {MAX_BYTES} bytes</span>
            <span>about {airTime(bytes).toFixed(1)} s</span>
          </div>
          <div className="progress" style={{ height: 6 }}>
            <div className={"progress-bar" + (bytes > MAX_BYTES ? " bg-danger" : "")} style={{ width: Math.min(100, (bytes / MAX_BYTES) * 100) + "%" }} />
          </div>
          {err("_size") && <div className="text-danger small mt-1">{errors._size}</div>}
        </div>
      </div></div>

      <div className="card mb-3"><div className="card-body vstack gap-3">
        <div>
          <div className="form-label">Mode</div>
          <Choice name="mode" options={Object.values(MODES)} value={mode} onChange={setMode} />
          <div className="form-text">{mode === "silent" ? "17.5–19.2 kHz, above what most adults hear. Keep the devices within 1–2 m." : "1.5–4 kHz, a short chirp. Most reliable."}</div>
        </div>
        <div>
          <label htmlFor="volume" className="form-label">Volume: {Math.round(volume * 100)}%</label>
          <input type="range" className="form-range" id="volume" min="0.1" max="1" step="0.05" value={volume} onChange={(e) => setVolume(+e.target.value)} />
        </div>
      </div></div>

      <button type="submit" className={"btn btn-lg w-100 " + (sending ? "btn-danger" : "btn-primary")}>
        {sending ? "Stop sending" : "Send through sound"}
      </button>
      <div className="progress mt-2" style={{ height: 6 }} aria-hidden="true">
        <div className="progress-bar" style={{ width: (sending ? sending.progress * 100 : 0) + "%" }} />
      </div>
      {tried && !valid && <p className="text-danger small mt-2">Fix the highlighted field first.</p>}
    </form>
  );
}
