import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { MODES } from "../lib/modem.js";
import { summary, formatLabel } from "../lib/formats.js";
import MessageCard from "../components/MessageCard.jsx";
import SpectrumView from "../components/SpectrumView.jsx";

export default function ReceivePage() {
  const { listening, startListening, stopListening, status, rxMode, tones, signal, result, micError, inbox, clearInbox, analyser } = useSoundDrop();
  const statusText = !listening ? "Tap Listen to start."
    : status === "receiving" ? "Receiving " + MODES[rxMode].label + " message…"
    : "Listening for a message (Audible and Silent).";

  return (
    <div className="sd-narrow">
      <h1 className="h3">Receive</h1>

      <div className="card mb-3"><div className="card-body text-center">
        <button type="button" className={"btn btn-lg sd-listen " + (listening ? "btn-danger" : "btn-primary")} onClick={listening ? stopListening : startListening}>
          {listening ? "Stop" : "Listen"}
        </button>
        <p className="mt-3 mb-0" aria-live="polite">{statusText}</p>
        {listening && <p className="small text-body-secondary mb-0">{signal > 3 ? "Signal: " + signal + " dB above background noise" : "No tones heard yet"}</p>}
        {micError && <div className="alert alert-danger mt-3 mb-0">{micError}</div>}
      </div></div>

      <div className="card mb-3" aria-live="polite"><div className="card-body">
        {!result && <p className="text-body-secondary mb-0">No message yet. Press Send on the other device.</p>}
        {result && result.ok === null && <p className="mb-0">Receiving… {tones} tones so far</p>}
        {result && result.ok === true && <MessageCard message={result.message} info={result.info} />}
        {result && result.ok === false && <p className="text-danger mb-0"><strong>Message not received.</strong> {result.error} Ask the sender to try again, a little closer or louder.</p>}
      </div></div>

      <div className="card mb-3"><div className="card-body">
        <h2 className="h6">Live spectrum</h2>
        <SpectrumView getAnalyser={analyser} active={listening} />
        <div className="form-text">Shaded: the Audible (1.5–4 kHz) and Silent (17.5–19.2 kHz) bands. A message shows as a peak hopping inside a band.</div>
      </div></div>

      <div className="card"><div className="card-body">
        <div className="d-flex justify-content-between align-items-center">
          <h2 className="h6 mb-0">Inbox ({inbox.length})</h2>
          {inbox.length > 0 && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearInbox}>Clear</button>}
        </div>
        {inbox.length === 0 && <p className="text-body-secondary small mt-2 mb-0">Received messages are listed here.</p>}
        <ul className="list-group list-group-flush mt-2">
          {inbox.map((m) => (
            <li key={m.id} className="list-group-item px-0">
              <div className="d-flex justify-content-between small text-body-secondary">
                <span>{formatLabel(m.message.format)} · {MODES[m.info.mode].label}</span>
                <span>{m.at.toLocaleTimeString()}</span>
              </div>
              <div className="text-break">{summary(m.message)}</div>
            </li>
          ))}
        </ul>
      </div></div>
    </div>
  );
}
