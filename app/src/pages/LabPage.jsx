import { useEffect, useRef, useState } from "react";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import SpectrumView from "../components/SpectrumView.jsx";
import LogPanel from "../components/LogPanel.jsx";

// Frequencies played by the sweep, from clearly audible to beyond hearing.
const SWEEP = [14000, 15000, 16000, 17000, 17500, 18000, 18500, 19000, 19500, 20000, 20500, 21000];
const DUR = 0.8, GAP = 0.35, HEARD = 15, WEAK = 8;

const verdict = (v) => (v === undefined ? ["Waiting", "secondary"] : v >= HEARD ? ["Heard", "success"] : v >= WEAK ? ["Weak", "warning"] : ["Not heard", "danger"]);

export default function LabPage() {
  const { playNodes, listening, startListening, stopListening, analyser, log, micError } = useSoundDrop();
  const [playing, setPlaying] = useState(null);       // frequency now playing
  const [sweeping, setSweeping] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [best, setBest] = useState({});
  const sweepRef = useRef(null);
  const bestRef = useRef({});

  // ---- sender side: play every sweep frequency in turn ----
  function runSweep() {
    if (sweepRef.current) return cancelSweep();
    sweepRef.current = playNodes((c, out) => {
      let t = c.currentTime + 0.3;
      const nodes = [], plan = [];
      SWEEP.forEach((f) => {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(volume, t + 0.03);
        g.gain.setValueAtTime(volume, t + DUR - 0.03);
        g.gain.linearRampToValueAtTime(0, t + DUR);
        o.connect(g).connect(out); o.start(t); o.stop(t + DUR + 0.02);
        nodes.push(o); plan.push({ f, at: t }); t += DUR + GAP;
      });
      const end = t;
      log("SWEEP_START", "vol " + volume);
      setSweeping(true);
      const timer = setInterval(() => {
        const now = c.currentTime;
        if (now >= end) { log("SWEEP_DONE"); cancelSweep(true); return; }
        const cur = [...plan].reverse().find((p) => now >= p.at);
        setPlaying(cur ? cur.f : null);
      }, 100);
      return { nodes, timer };
    });
  }
  function cancelSweep(done) {
    const s = sweepRef.current;
    if (!s) return;
    if (!done) log("SWEEP_CANCELLED");
    s.nodes.forEach((o) => { try { o.stop(); } catch (e) {} });
    clearInterval(s.timer);
    sweepRef.current = null;
    setPlaying(null);
    setSweeping(false);
  }
  useEffect(() => () => cancelSweep(), []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- receiver side: measure each frequency against its neighbourhood ----
  useEffect(() => {
    if (!listening) return;
    let raf = 0, data = null, lastPush = 0;
    const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    const tick = (ts) => {
      raf = requestAnimationFrame(tick);
      const an = analyser();
      if (!an) return;
      if (!data || data.length !== an.frequencyBinCount) data = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(data);
      const binHz = an.context.sampleRate / an.fftSize, n = data.length;
      const val = (i) => (Number.isFinite(data[i]) ? Math.max(an.minDecibels, data[i]) : an.minDecibels);   // never below the analyser floor
      let changed = false;
      SWEEP.forEach((f) => {
        const c = Math.round(f / binHz);
        if (c + 40 >= n) return;
        let lvl = an.minDecibels;
        for (let i = c - 2; i <= c + 2; i++) lvl = Math.max(lvl, val(i));
        const around = [];
        for (let i = c - 40; i <= c + 40; i++) if (Math.abs(i - c) > 5) around.push(val(i));
        const snr = lvl - median(around);
        if (bestRef.current[f] === undefined || snr > bestRef.current[f]) { bestRef.current[f] = snr; changed = true; }
      });
      if (changed && ts - lastPush > 150) { lastPush = ts; setBest({ ...bestRef.current }); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [listening, analyser]);

  function reset() {
    bestRef.current = {}; setBest({});
    log("LAB_RESET");
  }
  function logResults() {
    log("LAB_RESULTS", SWEEP.map((f) => f + ":" + (best[f] === undefined ? "-" : best[f].toFixed(1))).join(" "));
  }

  const heard = SWEEP.filter((f) => best[f] >= HEARD);
  const highest = heard.length ? Math.max(...heard) : null;
  const silentOk = best[17500] >= HEARD && best[19000] >= HEARD;

  return (
    <div className="sd-page">
      <header className="sd-page-head">
        <h1>Range Test Lab</h1>
        <p className="lead">Find out which high frequencies your speaker and microphone can actually use, so you know whether Silent mode will work on this pair of devices.</p>
      </header>

      <div className="row g-4">
        <div className="col-lg-5">
          <section className="card sd-card">
            <div className="card-body vstack gap-3">
              <h2 className="sd-h2">On the sending device</h2>
              <p className="small mb-0">Plays {SWEEP.length} tones from 14,000 Hz to 21,000 Hz, {DUR} s each. Most adults stop hearing them around 17,000 Hz.</p>
              <div>
                <label htmlFor="lab-vol" className="form-label d-flex justify-content-between"><span>Volume</span><span className="tnum text-body-secondary">{Math.round(volume * 100)}%</span></label>
                <input id="lab-vol" type="range" className="form-range" min="0.1" max="1" step="0.05" value={volume} onChange={(e) => setVolume(+e.target.value)} />
              </div>
              <button className={"btn " + (sweeping ? "btn-outline-danger" : "btn-primary")} onClick={runSweep}>
                {sweeping ? "Stop sweep" : "Play sweep"}
              </button>
              <p className="small text-body-secondary mb-0" aria-live="polite">{playing ? "Playing " + playing.toLocaleString("en-IN") + " Hz" : "Idle"}</p>
            </div>
          </section>

          <section className="card sd-card mt-4">
            <div className="card-body vstack gap-3">
              <h2 className="sd-h2">On the receiving device</h2>
              <p className="small mb-0">Start listening here first, then play the sweep on the other device. Each row keeps the strongest signal it has heard.</p>
              <div className="d-flex gap-2 flex-wrap">
                <button className={"btn " + (listening ? "btn-outline-secondary" : "btn-primary")} onClick={() => (listening ? stopListening() : startListening())}>{listening ? "Stop listening" : "Start listening"}</button>
                <button className="btn btn-outline-secondary" onClick={reset}>Reset results</button>
                <button className="btn btn-outline-secondary" onClick={logResults} disabled={!Object.keys(best).length}>Add results to log</button>
              </div>
              {micError && <div className="alert alert-danger mb-0">{micError}</div>}
            </div>
          </section>
        </div>

        <div className="col-lg-7">
          <section className="card sd-card">
            <div className="card-body vstack gap-3">
              <h2 className="sd-h2">Results</h2>
              <div className={"alert mb-0 " + (!Object.keys(best).length ? "alert-secondary" : silentOk ? "alert-success" : "alert-warning")}>
                {!Object.keys(best).length ? "No results yet. Listen here and play the sweep on the other device."
                  : silentOk ? "Silent mode should work: 17,500 Hz and 19,000 Hz were both heard clearly" + (highest ? ", up to " + highest.toLocaleString("en-IN") + " Hz." : ".")
                  : "Silent mode may be unreliable on this pair. Use Audible mode, move closer or raise the volume, then test again."}
              </div>
              <SpectrumView getAnalyser={analyser} active={listening} height={150} maxHz={22000} markers={SWEEP} />
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0 sd-table">
                  <thead><tr><th>Frequency</th><th className="text-end">Best signal</th><th>Result</th></tr></thead>
                  <tbody>
                    {SWEEP.map((f) => {
                      const [txt, tone] = verdict(best[f]);
                      return (
                        <tr key={f} className={playing === f ? "table-active" : ""}>
                          <td className="tnum">{f.toLocaleString("en-IN")} Hz</td>
                          <td className="text-end tnum">{best[f] === undefined ? "—" : best[f].toFixed(1) + " dB"}</td>
                          <td><span className={"badge text-bg-" + tone}>{txt}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="small text-body-secondary mb-0">Heard: at least {HEARD} dB above the background noise. Weak: {WEAK}–{HEARD} dB. SoundDrop's Silent mode uses 17,500–19,192 Hz.</p>
            </div>
          </section>
        </div>
        <div className="col-12"><LogPanel page="lab" /></div>
      </div>
    </div>
  );
}
