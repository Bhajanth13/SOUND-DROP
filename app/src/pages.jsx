/*
 * pages.jsx: the three pages of SoundDrop and the small pieces they use.
 *
 *   HomePage     what SoundDrop does, how it works, the two modes, Install card
 *   SendPage     form (text or contact card), mode, volume, Send button
 *   ReceivePage  Listen button, status, received message, inbox
 *
 *   Helpers: Field (form input with error), Choice (toggle buttons),
 *            MessageCard (one received message), InstallApp (Install card)
 *
 * The pages only show things and react to taps. All sound work is done by the
 * engine in SoundDropContext.jsx, reached with useSoundDrop().
 */

import { useEffect, useState } from "react";
import { useSoundDrop } from "./SoundDropContext.jsx";
import { MODES, MAX_BYTES, NUM_TONES, toneHz, airTime, FORMATS, EMPTY, pack, validate, byteLength, summary, formatLabel } from "./modem.js";

// =====================================================================
// Home page
// =====================================================================

const STEPS = [
  ["Type", "a short message or a contact card."],
  ["Encode", "every 4 bits become one of 16 tones, plus a checksum."],
  ["Play", "the speaker plays the tones."],
  ["Decode", "listening phones run an FFT and show the message."]
];
const khz = (hz) => (hz / 1000).toFixed(1);

export function HomePage() {
  return (
    <div className="sd-narrow vstack gap-2">
      <section>
        <h1 className="h4 fw-bold mb-1">Share a message with everyone nearby using only sound.</h1>
        <p className="text-body-secondary mb-2">No internet, Wi-Fi, Bluetooth or pairing. Works in airplane mode.</p>
        <div className="d-flex gap-2">
          <a className="btn btn-primary flex-fill" href="#/send">Send a message</a>
          <a className="btn btn-outline-primary flex-fill" href="#/receive">Receive</a>
        </div>
      </section>

      <section>
        <h2 className="h6 mb-1">How it works</h2>
        <ol className="small mb-0 ps-3">
          {STEPS.map(([title, text]) => <li key={title}><strong>{title}:</strong> {text}</li>)}
        </ol>
      </section>

      {/* one card per mode; the frequency range is computed from the modem's own numbers */}
      <div className="row g-2">
        {Object.values(MODES).map((m) => (
          <div className="col-6" key={m.id}>
            <div className="card h-100"><div className="card-body p-2 small">
              <strong>{m.label}</strong> <span className="text-body-secondary">{khz(toneHz(m, 0))}–{khz(toneHz(m, NUM_TONES - 1))} kHz</span>
              <div className="text-body-secondary">{m.id === "audible" ? "A short chirp. Most reliable, across a room." : "Above adult hearing. Best within 1–2 m."}</div>
            </div></div>
          </div>
        ))}
      </div>

      <InstallApp />
      <p className="small text-body-secondary mb-0">CS1309 mini project · Bhajanth V, RV University</p>
    </div>
  );
}

// Install card. Chrome, Edge and Android give an install prompt (kept in main.jsx);
// on iPhone the user taps Share, then Add to Home Screen.
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function InstallApp() {
  const [canInstall, setCanInstall] = useState(!!window.installPrompt);
  useEffect(() => {                              // the prompt may arrive after the page is drawn
    const onReady = () => setCanInstall(!!window.installPrompt);
    window.addEventListener("install-ready", onReady);
    return () => window.removeEventListener("install-ready", onReady);
  }, []);

  async function install() {
    window.installPrompt.prompt();               // the browser's own install dialog
    await window.installPrompt.userChoice;
    window.installPrompt = null;                 // a prompt can only be used once
    setCanInstall(false);
  }

  const installed = isInstalled();
  return (
    <div className="card border-primary-subtle"><div className="card-body p-2 d-flex align-items-center gap-2 small">
      <div className="flex-grow-1">
        <strong>{installed ? "SoundDrop is installed" : "Install SoundDrop"}</strong>
        <div className="small text-body-secondary">
          {installed ? "It opens from your home screen and works with no internet."
            : canInstall ? "Add it to your home screen. After that it works with no internet."
            : "Browser menu: Install app or Add to Home Screen (iPhone: Share first)."}
        </div>
      </div>
      {canInstall && !installed && <button type="button" className="btn btn-primary btn-sm text-nowrap" onClick={install}>Install app</button>}
    </div></div>
  );
}

// =====================================================================
// Send page
// =====================================================================

// A labelled input (or textarea) with a Bootstrap error message under it.
function Field({ id, label, error, as: Tag = "input", ...props }) {
  return (
    <div>
      <label htmlFor={id} className="form-label small mb-1">{label}</label>
      <Tag id={id} className={"form-control" + (error ? " is-invalid" : "")} aria-invalid={!!error} aria-describedby={id + "-fb"} {...props} />
      {error && <div id={id + "-fb"} className="invalid-feedback">{error}</div>}
    </div>
  );
}

// A row of Bootstrap toggle buttons that works like radio buttons.
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

export function SendPage() {
  const { send, stopSending, sending } = useSoundDrop();
  const [format, setFormat] = useState("text");               // "text" or "contact"
  const [values, setValues] = useState({ ...EMPTY, text: { text: "Hello from SoundDrop!" } });
  const [mode, setMode] = useState("audible");                // "audible" or "silent"
  const [volume, setVolume] = useState(0.7);
  const [tried, setTried] = useState(false);                  // show errors only after the first Send

  // A controlled form: everything below is worked out again on every keystroke.
  const v = values[format];
  const errors = validate(format, v);
  const valid = Object.keys(errors).length === 0;
  const bytes = byteLength(pack(format, v));
  const err = (k) => (tried ? errors[k] : undefined);
  const set = (k) => (e) => setValues({ ...values, [format]: { ...v, [k]: e.target.value } });

  function onSubmit(e) {
    e.preventDefault();                                       // stop the browser reloading the page
    if (sending) return stopSending();                        // the same button stops a message
    setTried(true);
    if (valid) send(pack(format, v), mode, volume);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="sd-narrow vstack gap-2">
      <h1 className="h4 mb-0">Send <small className="fs-6 fw-normal text-body-secondary">Tap Listen on the other phone first.</small></h1>

      <div className="card"><div className="card-body p-3 vstack gap-2">
        <Choice name="format" options={FORMATS} value={format} onChange={(f) => { setFormat(f); setTried(false); }} />

        {format === "text" && <Field as="textarea" id="text" label="Message" rows={2} value={v.text} onChange={set("text")} error={err("text")} />}
        {format === "contact" && (
          <>
            <Field id="name" label="Name" value={v.name} onChange={set("name")} error={err("name")} />
            <div className="row g-2">
              <div className="col-6"><Field id="phone" label="Phone" type="tel" value={v.phone} onChange={set("phone")} error={err("phone")} placeholder="+91 98450 12345" /></div>
              <div className="col-6"><Field id="email" label="Email (optional)" type="email" value={v.email} onChange={set("email")} error={err("email")} /></div>
            </div>
          </>
        )}

        {/* size meter: bytes used of 120, and how long the message will take to play */}
        <div>
          <div className="d-flex justify-content-between small text-body-secondary">
            <span className={bytes > MAX_BYTES ? "text-danger" : ""}>{bytes} of {MAX_BYTES} bytes</span>
            <span>about {airTime(bytes).toFixed(1)} s</span>
          </div>
          <div className="progress" style={{ height: 4 }}>
            <div className={"progress-bar" + (bytes > MAX_BYTES ? " bg-danger" : "")} style={{ width: Math.min(100, (bytes / MAX_BYTES) * 100) + "%" }} />
          </div>
          {err("_size") && <div className="text-danger small mt-1">{errors._size}</div>}
        </div>

        <div>
          <Choice name="mode" options={Object.values(MODES)} value={mode} onChange={setMode} />
          <div className="form-text mt-1">{mode === "silent" ? "17.5–19.2 kHz, above adult hearing. Keep phones within 1–2 m." : "1.5–4 kHz, a short chirp. Most reliable."}</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <label htmlFor="volume" className="small text-nowrap">Volume {Math.round(volume * 100)}%</label>
          <input type="range" className="form-range" id="volume" min="0.1" max="1" step="0.05" value={volume} onChange={(e) => setVolume(+e.target.value)} />
        </div>
      </div></div>

      <button type="submit" className={"btn btn-lg w-100 " + (sending ? "btn-danger" : "btn-primary")}>
        {sending ? "Stop sending" : "Send through sound"}
      </button>
      <div className="progress" style={{ height: 4 }} aria-hidden="true">
        <div className="progress-bar" style={{ width: (sending ? sending.progress * 100 : 0) + "%" }} />
      </div>
      {tried && !valid && <p className="text-danger small mb-0">Fix the highlighted field first.</p>}
    </form>
  );
}

// =====================================================================
// Receive page
// =====================================================================

// Shows one received message according to its format.
function MessageCard({ message: m, info }) {
  return (
    <div>
      <span className="badge text-bg-success mb-1">Received: {formatLabel(m.format)}</span>
      {m.format === "text" && <p className="fs-5 mb-1 text-break">{m.text}</p>}
      {m.format === "contact" && (
        <dl className="row mb-1 small">
          <dt className="col-4">Name</dt><dd className="col-8">{m.name}</dd>
          <dt className="col-4">Phone</dt><dd className="col-8">{m.phone}</dd>
          {m.email && <><dt className="col-4">Email</dt><dd className="col-8 text-break">{m.email}</dd></>}
        </dl>
      )}
      <div className="small text-body-secondary">
        {MODES[info.mode].label} mode, {info.bytes} bytes in {(info.ms / 1000).toFixed(1)} s, signal {Math.round(info.avgSnr)} dB
      </div>
    </div>
  );
}

export function ReceivePage() {
  const { listening, startListening, stopListening, status, rxMode, tones, signal, result, micError, inbox, clearInbox } = useSoundDrop();
  const statusText = !listening ? "Tap Listen to start."
    : status === "receiving" ? "Receiving " + MODES[rxMode].label + " message…"
    : "Listening (Audible and Silent)…";

  return (
    <div className="sd-narrow vstack gap-2">
      <h1 className="h4 mb-0">Receive</h1>

      {/* the big round Listen / Stop button and the live status */}
      <div className="card"><div className="card-body p-3 text-center">
        <button type="button" className={"btn sd-listen " + (listening ? "btn-danger" : "btn-primary")} onClick={listening ? stopListening : startListening}>
          {listening ? "Stop" : "Listen"}
        </button>
        <p className="mt-2 mb-0" aria-live="polite">{statusText}</p>
        {listening && <p className="small text-body-secondary mb-0">{signal > 3 ? "Signal: " + signal + " dB above background noise" : "No tones heard yet"}</p>}
        {micError && <div className="alert alert-danger mt-2 mb-0 small">{micError}</div>}
      </div></div>

      {/* result: nothing yet, receiving, received, or failed */}
      <div className="card" aria-live="polite"><div className="card-body p-3">
        {!result && <p className="text-body-secondary mb-0">No message yet. Press Send on the other phone.</p>}
        {result && result.ok === null && <p className="mb-0">Receiving… {tones} tones so far</p>}
        {result && result.ok === true && <MessageCard message={result.message} info={result.info} />}
        {result && result.ok === false && <p className="text-danger mb-0"><strong>Message not received.</strong> {result.error} Try again, a little closer or louder.</p>}
      </div></div>

      {/* inbox: every message received in this session, newest first; scrolls inside its card */}
      <div className="card"><div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="h6 mb-0">Inbox ({inbox.length})</h2>
          {inbox.length > 0 && <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={clearInbox}>Clear</button>}
        </div>
        {inbox.length === 0 && <p className="text-body-secondary small mt-1 mb-0">Received messages are listed here.</p>}
        <ul className="list-group list-group-flush sd-inbox">
          {inbox.map((m) => (
            <li key={m.id} className="list-group-item px-0 py-1 small d-flex justify-content-between gap-2">
              <span className="text-break">{summary(m.message)}</span>
              <span className="text-body-secondary text-nowrap">{MODES[m.info.mode].label}, {m.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </li>
          ))}
        </ul>
      </div></div>
    </div>
  );
}

