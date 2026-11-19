/*
 * pages.jsx: the three pages of SoundDrop and the small pieces they use.
 *
 *   HomePage     what SoundDrop does, how it works, the two modes, Install card
 *   SendPage     form (text or contact card), mode, speed, password, volume, Send button
 *   ReceivePage  Listen button, status, received message, saved inbox
 *
 *   Helpers: ToneStrip (a message drawn as its real tones), Field (form input
 *            with error), Choice (toggle buttons), MessageCard (one received
 *            message + Copy / Save contact / Share), LockedCard (password box
 *            for a locked message), InstallApp (Install card)
 *
 * The pages only show things and react to taps. All sound work is done by the
 * engine in SoundDropContext.jsx, reached with useSoundDrop().
 */

import { useEffect, useState } from "react";
import { useSoundDrop } from "./SoundDropContext.jsx";
import { MODES, SPEEDS, MAX_BYTES, NUM_TONES, toneHz, airTime, toneSequence, FORMATS, EMPTY, pack, validate, sentBytes, summary, formatLabel, toVCard, asText } from "./modem.js";

// =====================================================================
// ToneStrip: a message drawn as the tones it will be played as
// =====================================================================

// One thin bar per tone, as tall as the tone's number (0 to 15); START and END
// are full height in amber. With progress (0 to 1) the bars already played are
// blue and the rest grey, so the strip doubles as the sending progress bar.
function ToneStrip({ tones, progress = null, label }) {
  const n = Math.max(tones.length, 1);
  return (
    <svg className="sd-strip" viewBox={`0 0 ${n * 3} 20`} preserveAspectRatio="none" role="img" aria-label={label}>
      {tones.map((t, i) => {
        const mark = t >= 17, h = mark ? 20 : 3 + (Math.min(t, 16) / 16) * 15;
        const cls = mark ? "mark" : progress === null || i / n < progress ? "on" : "off";
        return <rect key={i} x={i * 3} y={20 - h} width="2" height={h} className={cls} />;
      })}
    </svg>
  );
}

// The tones for a form's content. A locked message is encrypted bytes, which
// look random, so its strip is drawn from random-looking bytes of the same length.
function previewTones(text, lockedBytes) {
  try {
    if (!lockedBytes) return toneSequence(text);
    let s = lockedBytes * 7919;
    return toneSequence(Uint8Array.from({ length: lockedBytes }, () => (s = (s * 1103515245 + 12345) >>> 0) >>> 24));
  } catch (e) { return []; }                        // empty or too long: no strip
}

// =====================================================================
// Home page
// =====================================================================

const STEPS = [
  ["Type", "a message or a contact card."],
  ["Encode", "every 4 bits become one of 16 tones."],
  ["Play", "them through the speaker."],
  ["Decode", "with an FFT on the other phone."]
];
const khz = (hz) => (hz / 1000).toFixed(1);
const HI = toneSequence("T:Hi");                    // the hero picture: "Hi" as it is really sent

export function HomePage() {
  return (
    <div className="sd-wide sd-home row g-3 g-lg-5 align-items-start align-items-lg-center">
      <section className="col-lg-6 vstack gap-2 align-self-lg-center">
        <h1 className="sd-title mb-0">Share a message with everyone nearby, using only sound.</h1>
        <p className="text-body-secondary mb-0 sd-lead">No internet, Wi-Fi, Bluetooth or pairing. Works offline, with an optional password.</p>
        <figure className="sd-figure mb-0">
          <ToneStrip tones={HI} label="The message Hi drawn as its tones" />
          <figcaption className="sd-mono">“Hi” as SoundDrop plays it: {HI.length} tones</figcaption>
        </figure>
        <div className="d-flex gap-2">
          <a className="btn btn-primary flex-fill" href="#/send">Send a message</a>
          <a className="btn btn-outline-primary flex-fill" href="#/receive">Receive</a>
        </div>
      </section>

      <section className="col-lg-6 vstack gap-2 align-self-lg-center">
        <ol className="sd-steps mb-0">
          {STEPS.map(([title, text]) => <li key={title}><span><strong>{title}</strong> {text}</span></li>)}
        </ol>

        {/* one card per mode; the frequency range is computed from the modem's own numbers */}
        <div className="row g-2">
          {Object.values(MODES).map((m) => (
            <div className="col-6" key={m.id}>
              <div className="card h-100"><div className="card-body p-2 small">
                <strong>{m.label}</strong> <span className="sd-mono text-primary">{khz(toneHz(m, 0))}–{khz(toneHz(m, NUM_TONES - 1))} kHz</span>
                <div className="text-body-secondary">{m.id === "audible" ? "Most reliable." : "Above adult hearing."}</div>
              </div></div>
            </div>
          ))}
        </div>

        <InstallApp />
        <p className="small text-body-secondary mb-0">CS1309 mini project, Bhajanth V, RV University</p>
      </section>
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
    <div className="btn-group w-100" role="group" aria-label={name}>
      {options.map((o) => (
        <span key={o.id} className="d-contents">
          <input type="radio" className="btn-check" name={name} id={name + o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <label className="btn btn-outline-primary px-2" htmlFor={name + o.id}>{o.label}</label>
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
  const [speed, setSpeed] = useState("normal");               // "normal" or "fast"
  const [password, setPassword] = useState("");               // empty = not locked
  const [volume, setVolume] = useState(0.7);
  const [tried, setTried] = useState(false);                  // show errors only after the first Send

  // A controlled form: everything below is worked out again on every keystroke.
  const v = values[format];
  const errors = validate(format, v, password);
  const valid = Object.keys(errors).length === 0;
  const bytes = sentBytes(format, v, password);               // includes the lock's extra bytes
  const tones = previewTones(pack(format, v), password ? bytes : 0);
  const err = (k) => (tried ? errors[k] : undefined);
  const set = (k) => (e) => setValues({ ...values, [format]: { ...v, [k]: e.target.value } });

  function onSubmit(e) {
    e.preventDefault();                                       // stop the browser reloading the page
    if (sending) return stopSending();                        // the same button stops a message
    setTried(true);
    if (valid) send(pack(format, v), { mode, speed, volume, password });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="sd-narrow vstack gap-2">
      <h1 className="sd-page-title mb-0">Send <small className="fs-6 fw-normal text-body-secondary">Tap Listen on the other phone first.</small></h1>

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

        {/* size meter: the message drawn as its tones; while sending, the played part turns blue */}
        <div>
          <div className="d-flex justify-content-between sd-mono">
            <span className={bytes > MAX_BYTES ? "text-danger" : ""}>{bytes} of {MAX_BYTES} bytes{password ? ", locked" : ""}</span>
            <span>about {airTime(bytes, speed).toFixed(1)} s</span>
          </div>
          <ToneStrip tones={tones} progress={sending ? sending.progress : null} label={"The message as " + tones.length + " tones"} />
          {err("_size") && <div className="text-danger small mt-1">{errors._size}</div>}
        </div>

        {/* mode (which tones) and speed (how long each tone lasts) side by side */}
        <div>
          <div className="row g-2">
            <div className="col-6"><Choice name="mode" options={Object.values(MODES)} value={mode} onChange={setMode} /></div>
            <div className="col-6"><Choice name="speed" options={Object.values(SPEEDS)} value={speed} onChange={setSpeed} /></div>
          </div>
          <div className="form-text mt-1">
            {mode === "silent" ? "17.5–19.2 kHz, above adult hearing, within 1–2 m." : "1.5–4 kHz, a short chirp, most reliable."}
            {speed === "fast" ? " Fast: twice the speed, keep phones close." : ""}
          </div>
        </div>

        {/* optional password lock, and the volume */}
        <div className="row g-2 align-items-start">
          <div className="col-6">
            <input type="password" id="password" className={"form-control form-control-sm" + (err("password") ? " is-invalid" : "")}
              placeholder="Lock password" aria-label="Password to lock the message (optional)" autoComplete="off"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            {err("password") && <div className="invalid-feedback">{errors.password}</div>}
          </div>
          <div className="col-6 d-flex align-items-center gap-2">
            <label htmlFor="volume" className="small text-nowrap">Vol {Math.round(volume * 100)}%</label>
            <input type="range" className="form-range" id="volume" min="0.1" max="1" step="0.05" value={volume} onChange={(e) => setVolume(+e.target.value)} />
          </div>
        </div>
      </div></div>

      <button type="submit" className={"btn btn-lg w-100 " + (sending ? "btn-danger" : "btn-primary")}>
        {sending ? "Stop sending" : password ? "Send locked message" : "Send through sound"}
      </button>
      {tried && !valid && <p className="text-danger small mb-0">Fix the highlighted field first.</p>}
    </form>
  );
}

// =====================================================================
// Receive page
// =====================================================================

// One line about how the message arrived
function infoLine(info) {
  let s = MODES[info.mode].label + " mode, " + info.bytes + " bytes in " + (info.ms / 1000).toFixed(1) + " s, signal " + Math.round(info.avgSnr) + " dB";
  if (info.fixed) s += ", " + info.fixed + (info.fixed === 1 ? " byte" : " bytes") + " repaired";
  return s;
}

// Shows one received message according to its format, with buttons to use it.
function MessageCard({ item }) {
  const m = item.message;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(asText(m)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch (e) { /* clipboard blocked: the text can still be selected by hand */ }
  }
  function saveContact() {                     // a .vcf file opens in the phone's Contacts app
    const url = URL.createObjectURL(new Blob([toVCard(m)], { type: "text/vcard" }));
    const a = document.createElement("a");
    a.href = url; a.download = (m.name.replace(/[^\w ]+/g, "").trim() || "contact") + ".vcf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const share = () => navigator.share({ title: "SoundDrop", text: asText(m) }).catch(() => {});

  return (
    <div>
      <span className="badge text-bg-success mb-1">Received: {formatLabel(m.format)}</span>
      {item.info.locked && <span className="badge text-bg-secondary mb-1 ms-1">Unlocked</span>}
      {m.format === "text" && <p className="fs-5 mb-1 text-break">{m.text}</p>}
      {m.format === "contact" && (
        <dl className="row mb-1 small">
          <dt className="col-4">Name</dt><dd className="col-8 mb-0">{m.name}</dd>
          <dt className="col-4">Phone</dt><dd className="col-8 mb-0">{m.phone}</dd>
          {m.email && <><dt className="col-4">Email</dt><dd className="col-8 mb-0 text-break">{m.email}</dd></>}
        </dl>
      )}
      <div className="small text-body-secondary">{infoLine(item.info)}</div>
      <div className="d-flex gap-2 mt-1">
        <button type="button" className="btn btn-sm btn-outline-primary py-0" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        {m.format === "contact" && <button type="button" className="btn btn-sm btn-outline-primary py-0" onClick={saveContact}>Save contact</button>}
        {navigator.share && <button type="button" className="btn btn-sm btn-outline-primary py-0" onClick={share}>Share</button>}
      </div>
    </div>
  );
}

// A locked message: the receiver types the sender's password to open it.
function LockedCard({ item }) {
  const { openLocked } = useSoundDrop();
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    const ok = await openLocked(item.id, password);
    setBusy(false); setWrong(!ok);
  }
  return (
    <form onSubmit={onSubmit}>
      <span className="badge text-bg-warning mb-1">Locked message</span>
      <p className="small mb-1">Enter the sender’s password to open it.</p>
      <div className="input-group input-group-sm">
        <input type="password" className={"form-control" + (wrong ? " is-invalid" : "")} aria-label="Password" autoComplete="off"
          value={password} onChange={(e) => { setPassword(e.target.value); setWrong(false); }} />
        <button type="submit" className="btn btn-primary" disabled={!password || busy}>{busy ? "Opening…" : "Open"}</button>
      </div>
      {wrong && <div className="text-danger small mt-1">Wrong password. Try again.</div>}
      <div className="small text-body-secondary mt-1">{infoLine(item.info)}</div>
    </form>
  );
}

export function ReceivePage() {
  const { listening, startListening, stopListening, status, rxMode, tones, signal, result, micError, inbox, show, clearInbox } = useSoundDrop();
  const shown = result && result.ok === true ? inbox.find((it) => it.id === result.id) : null;
  const statusText = !listening ? "Tap Listen to start."
    : status === "receiving" ? "Receiving " + MODES[rxMode].label + " message…"
    : "Listening (Audible and Silent)…";

  return (
    <div className="sd-wide row g-2 g-lg-4 align-items-start">
      <div className="col-lg-5 vstack gap-2">
      <h1 className="sd-page-title mb-0">Receive</h1>

      {/* the big round Listen / Stop button with rings while listening, and the live status */}
      <div className="card"><div className="card-body p-3 text-center">
        <div className={"sd-listen-wrap" + (listening ? " is-on" : "") + (status === "receiving" ? " is-rx" : "")}>
          <button type="button" className={"btn sd-listen " + (listening ? "sd-listen-on" : "btn-primary")} onClick={listening ? stopListening : startListening}>
            {listening ? "Stop" : "Listen"}
          </button>
        </div>
        <p className="mt-2 mb-0 fw-semibold" aria-live="polite">{statusText}</p>
        {listening && (
          <div className="sd-signal">
            <span className="sd-mono">{signal > 3 ? "Signal " + signal + " dB above background noise" : "No tones heard yet"}</span>
            <div className="sd-meter"><div style={{ width: Math.min(100, Math.max(0, signal || 0) * 1.25) + "%" }} /></div>
          </div>
        )}
        {micError && <div className="alert alert-danger mt-2 mb-0 small">{micError}</div>}
      </div></div>
      </div>

      <div className="col-lg-7 vstack gap-2 sd-rx-side">
      {/* result: nothing yet, receiving, received, or failed */}
      <div className="card" aria-live="polite"><div className="card-body p-3">
        {(!result || (result.ok === true && !shown)) && <p className="text-body-secondary mb-0">No message yet. Press Send on the other phone.</p>}
        {result && result.ok === null && <p className="mb-0 sd-receiving">Receiving… <span className="sd-mono">{tones} tones so far</span></p>}
        {shown && (shown.locked ? <LockedCard key={shown.id} item={shown} /> : <MessageCard key={shown.id} item={shown} />)}
        {result && result.ok === false && <p className="text-danger mb-0"><strong>Message not received.</strong> {result.error} Try again, a little closer or louder.</p>}
      </div></div>

      {/* inbox: saved on this device, newest first; tap one to show it above; scrolls inside its card */}
      <div className="card"><div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="h6 mb-0">Inbox ({inbox.length})</h2>
          {inbox.length > 0 && <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={clearInbox}>Clear</button>}
        </div>
        {inbox.length === 0 && <p className="text-body-secondary small mt-1 mb-0">Received messages are saved here.</p>}
        <div className="list-group list-group-flush sd-inbox">
          {inbox.map((it) => (
            <button type="button" key={it.id} onClick={() => show(it.id)}
              className={"list-group-item list-group-item-action px-0 py-1 small d-flex justify-content-between gap-2" + (shown && shown.id === it.id ? " active-item" : "")}>
              <span className="text-break text-start">{it.locked ? "Locked message" : summary(it.message)}</span>
              <span className="text-body-secondary text-nowrap">{MODES[it.info.mode].label}, {new Date(it.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </button>
          ))}
        </div>
      </div></div>
      </div>
    </div>
  );
}

