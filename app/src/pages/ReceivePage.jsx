import { useState } from "react";
import { useTheme } from "../hooks/ThemeContext.jsx";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { MODES } from "../lib/modem.js";
import MessageCard from "../components/MessageCard.jsx";
import InboxTable from "../components/InboxTable.jsx";
import SpectrumView from "../components/SpectrumView.jsx";
import SignalReadout from "../components/SignalReadout.jsx";
import LogPanel from "../components/LogPanel.jsx";

const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

export default function ReceivePage() {
  const { listening, startListening, stopListening, rxStatus, rxMode, symbols, signal, lastResult, inbox, clearInbox, micError, sampleRate, analyser } = useSoundDrop();
  const [specOpen, setSpecOpen] = useState(wide);
  const { theme } = useTheme();
  const level = listening && signal != null ? Math.max(0, Math.min(1, (signal - 6) / 40)) : 0;   // 0..1 for the glow

  const state = !listening ? "off" : rxStatus === "receiving" ? "receiving" : "idle";
  const statusText = state === "off" ? "Tap to start listening"
    : state === "receiving" ? (rxMode ? "Receiving " + MODES[rxMode].label + " message…" : "Receiving…")
    : "Listening for a message";

  return (
    <div className="sd-page sd-receive">
      <header className="sd-page-head">
        <h1>Receive</h1>
        <p className="sd-lead">Audible and Silent messages are both picked up automatically.</p>
      </header>

      <div className="sd-grid-2">
        <div className="sd-stack">
          <section className="sd-panel sd-listen-panel">
            <button type="button" style={{ "--lvl": level }} className={"sd-listen " + state} onClick={() => (listening ? stopListening() : startListening())} aria-pressed={listening}>
              <span className="sd-listen-rings" aria-hidden="true"><i /><i /><i /></span>
              <span className="sd-listen-glow" aria-hidden="true" />
              <span className="sd-listen-label">{listening ? "Stop" : "Listen"}</span>
            </button>
            <p className="sd-listen-status" aria-live="polite">{statusText}</p>
            {micError && <div className="sd-alert">{micError}</div>}
          </section>

          <section className={"sd-panel sd-result" + (lastResult && lastResult.ok === true ? " ok" : lastResult && lastResult.ok === false ? " failed" : "")} aria-live="polite">
            {!lastResult && (<><div className="sd-result-title">No message yet</div><p className="sd-result-sub">Press Send on the other device. Keep this screen on while you wait.</p></>)}
            {lastResult && lastResult.ok === null && (
              <>
                <div className="sd-result-title">Receiving…</div>
                {theme === "motion"
                  ? <div className="sd-tonedots" aria-label={symbols + " tones so far"}>{Array.from({ length: Math.min(symbols, 260) }, (_, i) => <i key={i} />)}</div>
                  : <p className="sd-result-sub tnum">{symbols} tones so far</p>}
              </>
            )}
            {lastResult && lastResult.ok === true && <div className="sd-reveal" key={lastResult.info.ms}><MessageCard message={lastResult.message} info={lastResult.info} /></div>}
            {lastResult && lastResult.ok === false && (<><div className="sd-result-title sd-bad">Message not received</div><p className="sd-result-sub">{lastResult.error} Ask the sender to try again, a little closer or louder.</p></>)}
          </section>

          <SignalReadout signal={listening ? signal : null} symbols={symbols} rate={sampleRate && listening ? Math.round(sampleRate / 1000) + " kHz" : null} />
        </div>

        <div className="sd-stack">
          <details className="sd-panel sd-details" open={specOpen} onToggle={(e) => setSpecOpen(e.currentTarget.open)}>
            <summary><span className="sd-h2">Live spectrum</span></summary>
            <SpectrumView getAnalyser={analyser} active={listening && specOpen} height={200} />
            <p className="sd-hint">Shaded bands are the Audible (1.5–4 kHz) and Silent (17.5–19.2 kHz) ranges. A message shows up as a peak hopping inside a band.</p>
          </details>
          <InboxTable items={inbox} onClear={clearInbox} />
        </div>
      </div>
      <div className="sd-after"><LogPanel page="receive" /></div>
    </div>
  );
}
