import { useEffect, useMemo, useRef, useState } from "react";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { FORMATS, EMPTY, pack, validate, byteLength } from "../lib/formats.js";
import { MAX_BYTES, SPEEDS } from "../lib/modem.js";
import ModeSettings, { Segmented } from "../components/ModeSettings.jsx";
import Field from "../components/Field.jsx";
import LogPanel from "../components/LogPanel.jsx";

const SAMPLES = ["Hello from SoundDrop!", "Meet at the library at 4 pm", "Lab record due on Monday"];

// time on air: START, calibration sweep (0.51 s) and sync (0.09 s), data, END
function airTime(bytes, speed) {
  const sym = SPEEDS[speed].symbolMs / 1000, marker = Math.max(sym * 3, 0.25);
  return 2 * marker + 0.6 + (bytes + 3) * 2 * sym;
}

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
  const show = (k) => (touched ? errors[k] : undefined);
  const set = (k) => (e) => setValues((all) => ({ ...all, [format]: { ...all[format], [k]: e.target.value } }));

  function onSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (sending) { stopSending(); setStatus("Stopped."); return; }
    if (!valid) { setStatus("Fix the highlighted field first."); return; }
    try {
      const tx = send(packed, { mode, speed, volume });
      setStatus("Sending " + tx.payloadBytes + " bytes in " + (mode === "silent" ? "Silent" : "Audible") + " mode…");
    } catch (err) { setStatus(err.message); }
  }

  return (
    <form className="sd-page sd-send" noValidate onSubmit={onSubmit}>
      <header className="sd-page-head">
        <h1>Send</h1>
        <p className="sd-lead">Start listening on the other device first, then send.</p>
      </header>

      <div className="sd-grid-2">
        <section className="sd-panel">
          <h2 className="sd-h2">What to send</h2>
          <div className="sd-scrollrow">
            <Segmented wrap name="format" options={FORMATS} value={format} onChange={(f) => { setFormat(f); setTouched(false); setStatus(""); }} />
          </div>

          {format === "text" && (
            <>
              <Field as="textarea" id="f-text" label="Message" rows={3} value={v.text} onChange={set("text")} error={show("text")} placeholder="Type a short sentence" />
              <div className="sd-scrollrow sd-samples" aria-label="Example messages">
                {SAMPLES.map((s) => (
                  <button type="button" key={s} className="sd-chip" onClick={() => setValues((all) => ({ ...all, text: { text: s } }))}>{s}</button>
                ))}
              </div>
            </>
          )}
          {format === "link" && (
            <Field id="f-url" label="Web address" type="url" inputMode="url" value={v.url} onChange={set("url")} error={show("url")} placeholder="https://example.com/notes" hint="The receiver can open it with one tap." />
          )}
          {format === "wifi" && (
            <div className="sd-fields-2">
              <Field id="f-ssid" label="Network name" value={v.ssid} onChange={set("ssid")} error={show("ssid")} placeholder="RVU-Lab" />
              <Field as="select" id="f-sec" label="Security" value={v.security} onChange={set("security")}>
                <option value="WPA">WPA / WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">None (open)</option>
              </Field>
              {v.security !== "nopass" && (
                <div className="sd-span-2"><Field id="f-pass" label="Password" value={v.password} onChange={set("password")} error={show("password")} placeholder="8 to 63 characters" autoComplete="off" /></div>
              )}
            </div>
          )}
          {format === "contact" && (
            <div className="sd-fields-2">
              <div className="sd-span-2"><Field id="f-name" label="Name" value={v.name} onChange={set("name")} error={show("name")} placeholder="Bhajanth V" autoComplete="name" /></div>
              <Field id="f-phone" label="Phone" type="tel" inputMode="tel" value={v.phone} onChange={set("phone")} error={show("phone")} placeholder="+91 98450 12345" />
              <Field id="f-email" label="Email (optional)" type="email" value={v.email} onChange={set("email")} error={show("email")} placeholder="name@example.com" />
            </div>
          )}

          <div className="sd-size">
            <div className="sd-size-row">
              <span className={bytes > MAX_BYTES ? "sd-over" : ""}>{bytes} of {MAX_BYTES} bytes</span>
              <span>about {airTime(bytes, speed).toFixed(1)} s</span>
            </div>
            <div className="sd-meter" role="progressbar" aria-label="Message size" aria-valuenow={bytes} aria-valuemin="0" aria-valuemax={MAX_BYTES}>
              <i className={bytes > MAX_BYTES ? "over" : ""} style={{ width: pct + "%" }} />
            </div>
            {touched && errors._size && <div className="sd-error-text">{errors._size}</div>}
          </div>
        </section>

        <div className="sd-stack">
          <section className="sd-panel">
            <h2 className="sd-h2">How to send</h2>
            <ModeSettings mode={mode} speed={speed} volume={volume} onMode={setMode} onSpeed={setSpeed} onVolume={setVolume} />
          </section>

          <div className="sd-actionbar">
            <div className="sd-actionbar-inner">
              <button type="submit" className={"sd-send-btn" + (sending ? " stop" : "")} disabled={!sending && touched && !valid}>
                {sending && <span className="sd-wavebars" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
                {sending ? "Stop sending" : "Send through sound"}
              </button>
              <div className="sd-meter sd-progress" aria-hidden="true"><i style={{ width: (sending ? sending.progress * 100 : 0) + "%" }} /></div>
              <p className="sd-status-text" aria-live="polite">{status || (mode === "silent" ? "Silent mode: keep the phones within 1–2 m." : "Ready.")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="sd-after"><LogPanel page="send" /></div>
    </form>
  );
}
