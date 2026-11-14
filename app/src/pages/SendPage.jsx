import { useEffect, useMemo, useRef, useState } from "react";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { FORMATS, EMPTY, pack, validate, byteLength } from "../lib/formats.js";
import { MAX_BYTES, SPEEDS } from "../lib/modem.js";
import ModeSettings, { Segmented } from "../components/ModeSettings.jsx";
import Field from "../components/Field.jsx";
import LogPanel from "../components/LogPanel.jsx";

const SAMPLES = ["Hello from SoundDrop!", "Meet at the library at 4 pm", "Lab record due on Monday"];

export default function SendPage() {
  const { send, stopSending, sending } = useSoundDrop();
  const [format, setFormat] = useState("text");
  const [values, setValues] = useState({ ...EMPTY, text: { text: "Hello from SoundDrop!" } });
  const [touched, setTouched] = useState(false);
  const [mode, setMode] = useState("audible");
  const [speed, setSpeed] = useState("normal");
  const [volume, setVolume] = useState(0.7);
  const [status, setStatus] = useState("");
  const wasSending = useRef(false);
  useEffect(() => {
    if (sending) wasSending.current = true;
    else if (wasSending.current) {
      wasSending.current = false;
      setStatus((st) => (st.startsWith("Sending") ? "Sent. Check the receiving device." : st));
    }
  }, [sending]);

  const v = values[format];
  const errors = useMemo(() => validate(format, v), [format, v]);
  const valid = Object.keys(errors).length === 0;
  const packed = useMemo(() => { try { return pack(format, v); } catch (e) { return ""; } }, [format, v]);
  const bytes = byteLength(packed);
  const pct = Math.min(100, (bytes / MAX_BYTES) * 100);
  const seconds = ((bytes + 2) * 2 * SPEEDS[speed].symbolMs + 2 * Math.max(SPEEDS[speed].symbolMs * 3, 250)) / 1000;
  const show = (k) => (touched ? errors[k] : undefined);

  const set = (k) => (e) => setValues((all) => ({ ...all, [format]: { ...all[format], [k]: e.target.value } }));

  function onSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (sending) { stopSending(); setStatus("Stopped."); return; }
    if (!valid) { setStatus(""); return; }
    try {
      const tx = send(packed, { mode, speed, volume });
      setStatus("Sending " + tx.payloadBytes + " bytes in " + (mode === "silent" ? "Silent" : "Audible") + " mode. Keep this page open until it finishes.");
    } catch (err) { setStatus(err.message); }
  }

  return (
    <div className="sd-page">
      <header className="sd-page-head">
        <h1>Send</h1>
        <p className="lead">Choose what to share, then play it through your speaker. Start listening on the other device first.</p>
      </header>

      <form className="row g-4" noValidate onSubmit={onSubmit}>
        <div className="col-lg-7">
          <section className="card sd-card">
            <div className="card-body vstack gap-3">
              <h2 className="sd-h2">1. Message</h2>
              <Segmented wrap name="format" options={FORMATS} value={format} onChange={(f) => { setFormat(f); setTouched(false); }} />
              <p className="form-text mt-0">{FORMATS.find((f) => f.id === format).hint}</p>

              {format === "text" && (
                <>
                  <Field as="textarea" id="f-text" label="Message" rows={3} value={v.text} onChange={set("text")} error={show("text")} placeholder="Type a short sentence" />
                  <div className="d-flex flex-wrap gap-2">
                    {SAMPLES.map((s) => (
                      <button type="button" key={s} className="btn btn-sm btn-outline-secondary" onClick={() => setValues((all) => ({ ...all, text: { text: s } }))}>{s}</button>
                    ))}
                  </div>
                </>
              )}
              {format === "link" && (
                <Field id="f-url" label="Web address" type="url" inputMode="url" value={v.url} onChange={set("url")} error={show("url")} placeholder="https://example.com/notes" hint="The receiver can open it with one tap." />
              )}
              {format === "wifi" && (
                <div className="row g-3">
                  <div className="col-sm-6"><Field id="f-ssid" label="Network name (SSID)" value={v.ssid} onChange={set("ssid")} error={show("ssid")} placeholder="RVU-Lab" /></div>
                  <div className="col-sm-6">
                    <Field as="select" id="f-sec" label="Security" value={v.security} onChange={set("security")}>
                      <option value="WPA">WPA / WPA2</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">None (open network)</option>
                    </Field>
                  </div>
                  {v.security !== "nopass" && (
                    <div className="col-12"><Field id="f-pass" label="Password" value={v.password} onChange={set("password")} error={show("password")} placeholder="8 to 63 characters" autoComplete="off" /></div>
                  )}
                </div>
              )}
              {format === "contact" && (
                <div className="row g-3">
                  <div className="col-12"><Field id="f-name" label="Name" value={v.name} onChange={set("name")} error={show("name")} placeholder="Bhajanth V" autoComplete="name" /></div>
                  <div className="col-sm-6"><Field id="f-phone" label="Phone" type="tel" inputMode="tel" value={v.phone} onChange={set("phone")} error={show("phone")} placeholder="+91 98450 12345" /></div>
                  <div className="col-sm-6"><Field id="f-email" label="Email (optional)" type="email" value={v.email} onChange={set("email")} error={show("email")} placeholder="name@example.com" /></div>
                </div>
              )}

              <div>
                <div className="d-flex justify-content-between small tnum">
                  <span className={bytes > MAX_BYTES ? "text-danger fw-semibold" : "text-body-secondary"}>{bytes} / {MAX_BYTES} bytes</span>
                  <span className="text-body-secondary">About {seconds.toFixed(1)} s to send</span>
                </div>
                <div className="progress sd-thin mt-1" role="progressbar" aria-label="Message size" aria-valuenow={bytes} aria-valuemin="0" aria-valuemax={MAX_BYTES}>
                  <div className={"progress-bar" + (bytes > MAX_BYTES ? " bg-danger" : "")} style={{ width: pct + "%" }}></div>
                </div>
                {touched && errors._size && <div className="text-danger small mt-1">{errors._size}</div>}
              </div>
            </div>
          </section>
        </div>

        <div className="col-lg-5">
          <section className="card sd-card">
            <div className="card-body vstack gap-3">
              <h2 className="sd-h2">2. Sound settings</h2>
              <ModeSettings mode={mode} speed={speed} volume={volume} onMode={setMode} onSpeed={setSpeed} onVolume={setVolume} />
            </div>
          </section>

          <section className="card sd-card mt-4">
            <div className="card-body vstack gap-3">
              <h2 className="sd-h2">3. Send</h2>
              <button type="submit" className={"btn btn-lg " + (sending ? "btn-outline-danger" : "btn-primary")} disabled={!sending && touched && !valid}>
                {sending ? "Stop sending" : "Send through sound"}
              </button>
              <div className="progress" role="progressbar" aria-label="Sending progress" aria-valuenow={Math.round((sending ? sending.progress : 0) * 100)} aria-valuemin="0" aria-valuemax="100">
                <div className="progress-bar" style={{ width: (sending ? sending.progress * 100 : 0) + "%" }}></div>
              </div>
              <p className="small mb-0" aria-live="polite">{status || "Ready. Start listening on the other device first."}</p>
            </div>
          </section>
        </div>
      </form>

      <div className="mt-4"><LogPanel page="send" /></div>
    </div>
  );
}
