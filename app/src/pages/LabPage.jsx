import { useEffect, useRef, useState } from "react";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import { Segmented } from "../components/ModeSettings.jsx";
import SpectrumView from "../components/SpectrumView.jsx";
import LogPanel from "../components/LogPanel.jsx";

// Frequencies played by the sweep, from clearly audible to beyond hearing.
const SWEEP = [14000, 15000, 16000, 17000, 17500, 18000, 18500, 19000, 19500, 20000, 20500, 21000];
const DUR = 0.8, GAP = 0.35, HEARD = 15, WEAK = 8;

const verdict = (v) => (v === undefined ? ["Waiting", "wait"] : v >= HEARD ? ["Heard", "ok"] : v >= WEAK ? ["Weak", "weak"] : ["Not heard", "no"]);

export default function LabPage() {
  const { playNodes, listening, startListening, stopListening, analyser, log, micError } = useSoundDrop();
  const [role, setRole] = useState("listen");          // which side this device plays (phones show one at a time)
  const [playing, setPlaying] = useState(null);
  const [sweeping, setSweeping] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [best, setBest] = useState({});
  const sweepRef = useRef(null);
  const bestRef = useRef({});

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
    setPlaying(null); setSweeping(false);
  }
  useEffect(() => () => cancelSweep(), []);   // eslint-disable-line react-hooks/exhaustive-deps

  // measure each sweep frequency against its neighbourhood
  useEffect(() => {
    if (!listening) return;
    let raf = 0, data = null, lastPush = 0;
    const avg = {};   // each frequency's reading averaged over ~0.1 s, so noise spikes cancel out
    const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    const tick = (ts) => {
      raf = requestAnimationFrame(tick);
      const an = analyser();
      if (!an) return;
      if (!data || data.length !== an.frequencyBinCount) data = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(data);
      const binHz = an.context.sampleRate / an.fftSize, n = data.length;
      const val = (i) => (Number.isFinite(data[i]) ? Math.max(an.minDecibels, data[i]) : an.minDecibels);
      let changed = false;
      SWEEP.forEach((f) => {
        const c = Math.round(f / binHz);
        if (c + 40 >= n) return;
        let lvl = an.minDecibels;
        for (let i = c - 2; i <= c + 2; i++) lvl = Math.max(lvl, val(i));
        // compare like with like: the loudest of 5 bins here against the loudest
        // of 5 bins in nearby groups (otherwise pure noise reads about 8 dB)
        const around = [];
        for (let g = 8; g <= 38; g += 5) for (const sgn of [-1, 1]) {
          let m = an.minDecibels;
          for (let i = c + sgn * g - 2; i <= c + sgn * g + 2; i++) m = Math.max(m, val(i));
          around.push(m);
        }
        const snr = lvl - median(around);
        avg[f] = avg[f] === undefined ? snr : avg[f] * 0.85 + snr * 0.15;
        if (bestRef.current[f] === undefined || avg[f] > bestRef.current[f]) { bestRef.current[f] = avg[f]; changed = true; }
      });
      if (changed && ts - lastPush > 150) { lastPush = ts; setBest({ ...bestRef.current }); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [listening, analyser]);

  const reset = () => { bestRef.current = {}; setBest({}); log("LAB_RESET"); };
  const logResults = () => log("LAB_RESULTS", SWEEP.map((f) => f + ":" + (best[f] === undefined ? "-" : best[f].toFixed(1))).join(" "));

  const any = SWEEP.some((f) => best[f] >= WEAK);   // background noise alone is not a result
  const heard = SWEEP.filter((f) => best[f] >= HEARD);
  const highest = heard.length ? Math.max(...heard) : null;
  const silentOk = best[17500] >= HEARD && best[19000] >= HEARD;

  return (
    <div className="sd-page sd-lab">
      <header className="sd-page-head">
        <h1>Range Test Lab</h1>
        <p className="sd-lead">Check which high tones your speaker and microphone can use before trying Silent mode.</p>
      </header>

      <div className="sd-role">
        <div className="sd-label">This device</div>
        <Segmented name="role" options={[{ id: "listen", label: "Listens" }, { id: "play", label: "Plays the sweep" }]} value={role} onChange={setRole} />
      </div>

      <div className="sd-grid-2">
        <div className="sd-stack">
          <section className={"sd-panel sd-role-play" + (role === "play" ? " show" : "")}>
            <h2 className="sd-h2">Play the sweep</h2>
            <p className="sd-hint">{SWEEP.length} tones from 14 to 21 kHz, {DUR} s each. Most adults stop hearing them around 17 kHz.</p>
            <div>
              <label htmlFor="lab-vol" className="sd-label sd-label-row"><span>Volume</span><span className="tnum">{Math.round(volume * 100)}%</span></label>
              <input id="lab-vol" type="range" className="sd-range" min="0.1" max="1" step="0.05" value={volume} onChange={(e) => setVolume(+e.target.value)} />
            </div>
            <button type="button" className={"sd-send-btn" + (sweeping ? " stop" : "")} onClick={runSweep}>{sweeping ? "Stop sweep" : "Play sweep"}</button>
            <p className="sd-status-text" aria-live="polite">{playing ? "Playing " + (playing / 1000).toFixed(1) + " kHz" : "Idle"}</p>
          </section>

          <section className={"sd-panel sd-role-listen" + (role === "listen" ? " show" : "")}>
            <h2 className="sd-h2">Listen and measure</h2>
            <p className="sd-hint">Start listening here, then play the sweep on the other device.</p>
            <div className="sd-btnrow">
              <button type="button" className={"sd-send-btn" + (listening ? " stop" : "")} onClick={() => (listening ? stopListening() : startListening())}>{listening ? "Stop listening" : "Start listening"}</button>
            </div>
            <div className="sd-btnrow">
              <button type="button" className="sd-btn-ghost" onClick={reset}>Reset results</button>
              <button type="button" className="sd-btn-ghost" onClick={logResults} disabled={!any}>Add results to log</button>
            </div>
            {micError && <div className="sd-alert">{micError}</div>}
          </section>
        </div>

        <section className={"sd-panel sd-role-listen" + (role === "listen" ? " show" : "")}>
          <h2 className="sd-h2">Results</h2>
          <div className={"sd-verdict " + (!any ? "wait" : silentOk ? "ok" : "weak")}>
            {!any ? (listening ? "Listening. Play the sweep on the other device." : "No results yet. Start listening, then play the sweep on the other device.")
              : silentOk ? "Silent mode should work on this pair" + (highest ? " (heard up to " + (highest / 1000).toFixed(1) + " kHz)." : ".")
              : "Silent mode may be unreliable here. Use Audible mode, move closer or raise the volume."}
          </div>
          <SpectrumView getAnalyser={analyser} active={listening} height={130} markers={SWEEP} />
          <ul className="sd-sweep-list">
            {SWEEP.map((f) => {
              const [txt, cls] = verdict(best[f]);
              return (
                <li key={f} className={playing === f ? "now" : ""}>
                  <span className="tnum">{(f / 1000).toFixed(1)} kHz</span>
                  <span className="tnum sd-muted">{best[f] === undefined ? "—" : best[f].toFixed(0) + " dB"}</span>
                  <span className={"sd-pill " + cls}>{txt}</span>
                </li>
              );
            })}
          </ul>
          <p className="sd-hint">Heard: at least {HEARD} dB above background noise. SoundDrop's Silent mode uses 17.5–19.2 kHz.</p>
        </section>
      </div>
      <div className="sd-after"><LogPanel page="lab" /></div>
    </div>
  );
}
