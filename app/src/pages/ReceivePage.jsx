import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { MODES } from "../lib/modem.js";
import { summary } from "../lib/formats.js";
import MessageCard from "../components/MessageCard.jsx";

export default function ReceivePage() {
  const { listening, startListening, stopListening, status, rxMode, tones, signal, result, micError, inbox, clearInbox } = useSoundDrop();
  const statusText = !listening ? "Tap Listen to start."
    : status === "receiving" ? "Receiving " + MODES[rxMode].label + " message…"
    : "Listening (Audible and Silent)…";

  return (
    <div className="sd-narrow vstack gap-2">
      <h1 className="h4 mb-0">Receive</h1>

      <div className="card"><div className="card-body p-3 text-center">
        <button type="button" className={"btn sd-listen " + (listening ? "btn-danger" : "btn-primary")} onClick={listening ? stopListening : startListening}>
          {listening ? "Stop" : "Listen"}
        </button>
        <p className="mt-2 mb-0" aria-live="polite">{statusText}</p>
        {listening && <p className="small text-body-secondary mb-0">{signal > 3 ? "Signal: " + signal + " dB above background noise" : "No tones heard yet"}</p>}
        {micError && <div className="alert alert-danger mt-2 mb-0 small">{micError}</div>}
      </div></div>

      <div className="card" aria-live="polite"><div className="card-body p-3">
        {!result && <p className="text-body-secondary mb-0">No message yet. Press Send on the other phone.</p>}
        {result && result.ok === null && <p className="mb-0">Receiving… {tones} tones so far</p>}
        {result && result.ok === true && <MessageCard message={result.message} info={result.info} />}
        {result && result.ok === false && <p className="text-danger mb-0"><strong>Message not received.</strong> {result.error} Try again, a little closer or louder.</p>}
      </div></div>

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
