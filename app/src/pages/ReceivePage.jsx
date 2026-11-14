import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { MODES } from "../lib/modem.js";
import MessageCard from "../components/MessageCard.jsx";
import InboxTable from "../components/InboxTable.jsx";
import SpectrumView from "../components/SpectrumView.jsx";
import LogPanel from "../components/LogPanel.jsx";

export default function ReceivePage() {
  const { listening, startListening, stopListening, rxStatus, rxMode, symbols, signal, lastResult, inbox, clearInbox, micError, sampleRate, analyser } = useSoundDrop();

  const statusText = !listening ? "Not listening"
    : rxStatus === "receiving" ? "Receiving in " + MODES[rxMode].label + " mode…"
    : "Listening. Waiting for a message.";

  return (
    <div className="sd-page">
      <header className="sd-page-head">
        <h1>Receive</h1>
        <p className="lead">Your microphone listens for SoundDrop tones. Audible and Silent mode are both detected automatically.</p>
      </header>

      <div className="row g-4">
        <div className="col-lg-6">
          <section className="card sd-card h-100">
            <div className="card-body vstack gap-3">
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <button className={"btn btn-lg " + (listening ? "btn-outline-secondary" : "btn-primary")} onClick={() => (listening ? stopListening() : startListening())}>
                  {listening ? "Stop listening" : "Start listening"}
                </button>
                <div className="sd-status" data-s={listening ? rxStatus : "off"}><span className="sd-dot"></span>{statusText}</div>
              </div>
              {micError && <div className="alert alert-danger mb-0">{micError}</div>}

              <div className={"sd-hero" + (lastResult && lastResult.ok === true ? " ok" : lastResult && lastResult.ok === false ? " failed" : "")} aria-live="polite">
                {!lastResult && (
                  <>
                    <div className="sd-hero-title">No message yet</div>
                    <div className="small text-body-secondary">Start listening here, then press Send on the other device. Keep the screen on while you wait.</div>
                  </>
                )}
                {lastResult && lastResult.ok === null && (
                  <>
                    <div className="sd-hero-title">Receiving…</div>
                    <div className="small text-body-secondary tnum">{symbols} symbols so far</div>
                  </>
                )}
                {lastResult && lastResult.ok === true && <MessageCard message={lastResult.message} info={lastResult.info} />}
                {lastResult && lastResult.ok === false && (
                  <>
                    <div className="sd-hero-title text-danger">Message not received</div>
                    <div className="small">{lastResult.error} Ask the sender to try again, a little closer or louder.</div>
                  </>
                )}
              </div>

              <div className="row g-2 text-center">
                <Stat label="Signal" value={signal != null ? signal + " dB" : "—"} />
                <Stat label="Symbols" value={symbols} />
                <Stat label="Mic rate" value={sampleRate && listening ? Math.round(sampleRate / 1000) + " kHz" : "—"} />
              </div>
            </div>
          </section>
        </div>

        <div className="col-lg-6">
          <section className="card sd-card h-100">
            <div className="card-body vstack gap-2">
              <h2 className="sd-h2">Live spectrum</h2>
              <SpectrumView getAnalyser={analyser} active={listening} height={220} />
              <p className="small text-body-secondary mb-0">Shaded bands are SoundDrop's two tone ranges: Audible (1.5–4 kHz) and Silent (17.5–19.2 kHz). A message shows up as a sharp peak hopping inside a band.</p>
            </div>
          </section>
        </div>

        <div className="col-12"><InboxTable items={inbox} onClear={clearInbox} /></div>
        <div className="col-12"><LogPanel page="receive" /></div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="col-4">
      <div className="sd-stat">
        <div className="sd-stat-k">{label}</div>
        <div className="sd-stat-v tnum">{value}</div>
      </div>
    </div>
  );
}
