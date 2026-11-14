// App-wide audio engine: one AudioContext, the transmitter, the receiver,
// the inbox and the test log. Listening keeps running while the user moves
// between pages, so the navbar can show it and the Lab can reuse the mic.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MODES, SPEEDS, transmit, createReceiver, toneHz, NUM_TONES } from "../lib/modem.js";
import { unpack } from "../lib/formats.js";

const Ctx = createContext(null);
export const useSoundDrop = () => useContext(Ctx);

// Developer test switches (query string): ?loopback&mute&reverb=0.5&wet=2&noise=0.003&engine=analyser
const params = new URLSearchParams(window.location.search);
export const TEST = {
  loopback: params.has("loopback"),
  mute: params.has("mute"),
  reverb: parseFloat(params.get("reverb") || "0"),
  wet: parseFloat(params.get("wet") || "1"),
  engine: params.get("engine") || "worklet",
  fftN: params.has("fftN") ? +params.get("fftN") : null,
  noise: parseFloat(params.get("noise") || "0")
};

export function SoundDropProvider({ children }) {
  const ctxRef = useRef(null);
  const loopInRef = useRef(null), loopOutRef = useRef(null);
  const micRef = useRef({ stream: null, source: null, settings: null });
  const rxRef = useRef(null), txRef = useRef(null), txTimer = useRef(null);
  const analyserRef = useRef(null);
  const t0 = useRef(performance.now());
  const startedAt = useRef(new Date());

  const [listening, setListening] = useState(false);
  const [rxStatus, setRxStatus] = useState("off");          // off | idle | receiving
  const [rxMode, setRxMode] = useState(null);
  const [symbols, setSymbols] = useState(0);
  const [signal, setSignal] = useState(null);
  const [lastResult, setLastResult] = useState(null);       // { ok, message?, error?, info }
  const [inbox, setInbox] = useState([]);
  const [micError, setMicError] = useState("");
  const [sending, setSending] = useState(null);             // { progress, bytes, mode, duration }
  const [sampleRate, setSampleRate] = useState(null);
  const [engine, setEngine] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const logRef = useRef([]);

  const log = useCallback((kind, ...f) => {
    if (logRef.current.length > 20000) return;
    const line = [((performance.now() - t0.current) / 1000).toFixed(2), kind, ...f].join("\t");
    logRef.current = [...logRef.current, line];
    setLogLines(logRef.current);
  }, []);

  const audio = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      setSampleRate(ctxRef.current.sampleRate);
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // ----- loopback test path (sender feeds the receiver inside one page) -----
  const getLoopIn = useCallback(() => {
    const c = audio();
    if (!loopInRef.current) loopInRef.current = c.createGain();
    return loopInRef.current;
  }, [audio]);
  const getLoopOut = useCallback(() => {
    if (loopOutRef.current) return loopOutRef.current;
    const c = audio(), out = c.createGain();
    getLoopIn().connect(out);
    if (TEST.reverb > 0) {
      const len = Math.floor(c.sampleRate * TEST.reverb * 1.5), ir = c.createBuffer(1, len, c.sampleRate), d = ir.getChannelData(0);
      const delay = Math.floor(c.sampleRate * 0.004);
      for (let i = delay; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(10, -3 * (i - delay) / (c.sampleRate * TEST.reverb));
      const conv = c.createConvolver(); conv.normalize = true; conv.buffer = ir;
      const wet = c.createGain(); wet.gain.value = TEST.wet;
      getLoopIn().connect(conv).connect(wet).connect(out);
    }
    if (TEST.noise > 0) {   // simulated background noise of a room
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * TEST.noise;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(out); src.start();
    }
    loopOutRef.current = out;
    return out;
  }, [audio, getLoopIn]);

  // ----- sending -----
  const stopSending = useCallback(() => {
    if (txRef.current) txRef.current.stop();
    txRef.current = null;
    clearInterval(txTimer.current);
    setSending(null);
  }, []);

  const send = useCallback((text, { mode, speed, volume }) => {
    const c = audio();
    stopSending();
    const out = c.createGain();
    if (!TEST.mute) out.connect(c.destination);
    if (TEST.loopback) out.connect(getLoopIn());
    const tx = transmit(c, out, text, { mode: MODES[mode], speed: SPEEDS[speed], volume });
    txRef.current = tx;
    log("SEND_START", mode, speed, "vol " + volume, tx.payloadBytes + " bytes", tx.tones.length + " tones", tx.duration.toFixed(2) + " s", JSON.stringify(text));
    log("SEND_TRACE", tx.trace);
    setSending({ progress: 0, bytes: tx.payloadBytes, mode, duration: tx.duration });
    txTimer.current = setInterval(() => {
      if (txRef.current !== tx) return;
      const p = tx.progress();
      setSending((s) => (s ? { ...s, progress: p } : s));
      if (p >= 1) { log("SEND_DONE"); clearInterval(txTimer.current); txRef.current = null; setTimeout(() => setSending(null), 600); }
    }, 50);
    return tx;
  }, [audio, getLoopIn, log, stopSending]);

  const playNodes = useCallback((build) => {
    // used by the Range Test Lab to play its sweep through the same output
    const c = audio(), out = c.createGain();
    if (!TEST.mute) out.connect(c.destination);
    if (TEST.loopback) out.connect(getLoopIn());
    return build(c, out);
  }, [audio, getLoopIn]);

  // ----- receiving -----
  const stopListening = useCallback(() => {
    if (rxRef.current) rxRef.current.stop();
    rxRef.current = null;
    const m = micRef.current;
    if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
    if (m.source) try { m.source.disconnect(); } catch (e) {}
    micRef.current = { stream: null, source: null, settings: m.settings };
    if (analyserRef.current) try { analyserRef.current.disconnect(); } catch (e) {}
    analyserRef.current = null;
    setListening(false); setRxStatus("off"); setRxMode(null); setSignal(null);
    log("LISTEN_STOP");
  }, [log]);

  const startListening = useCallback(async () => {
    if (rxRef.current) return true;
    setMicError("");
    const c = audio();
    let source;
    if (TEST.loopback) source = getLoopOut();
    else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicError("This browser blocks the microphone here. Open SoundDrop from its https address, not as a local file.");
        return false;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        let settings = null;
        try { settings = stream.getAudioTracks()[0].getSettings(); } catch (e) {}
        micRef.current = { stream, source: c.createMediaStreamSource(stream), settings };
        source = micRef.current.source;
      } catch (e) {
        log("MIC_ERROR", (e && e.name) || "error");
        setMicError("Microphone access was refused. Allow the microphone for this site in your browser settings, then tap Start listening again.");
        return false;
      }
    }
    // analyser for the live spectrum and the Range Test Lab (display only)
    const an = c.createAnalyser();
    an.fftSize = 8192; an.smoothingTimeConstant = 0.3; an.minDecibels = -140; an.maxDecibels = -10;
    source.connect(an);
    analyserRef.current = an;

    let lastLevel = 0;
    const rx = await createReceiver(c, source, {
      onState(s, m) {
        setRxStatus(s);
        if (s === "receiving") { setRxMode(m); setSymbols(0); setLastResult({ ok: null, info: { mode: m } }); log("RX_START", m); }
        if (s === "idle") setRxMode(null);
      },
      onSymbol(nib, count) { setSymbols(count); },
      onLevel(l) {
        const now = performance.now();
        if (now - lastLevel < 150) return;
        lastLevel = now;
        setSignal(l && l.snr > -50 ? Math.round(l.snr) : null);
      },
      onMessage(text, info) {
        log("RX_OK", info.mode, info.bytes + " bytes", info.nibbles + " symbols", (info.ms / 1000).toFixed(2) + " s", "snr " + info.avgSnr.toFixed(1), JSON.stringify(text));
        const message = unpack(text);
        const item = { id: Date.now() + Math.random(), at: new Date(), raw: text, message, info };
        setLastResult({ ok: true, message, info });
        setInbox((list) => [item, ...list]);
      },
      onError(msg, info) {
        log("RX_FAIL", info && info.mode, msg, info && info.nibbles != null ? info.nibbles + " symbols" : "", info && info.avgSnr != null ? "snr " + info.avgSnr.toFixed(1) : "");
        if (info && info.trace) log("RX_TRACE", info.trace);
        setLastResult({ ok: false, error: msg, info });
      }
    }, { engine: TEST.engine, fftN: TEST.fftN });
    rx.start();
    rxRef.current = rx;
    setEngine(rx.engine);
    setListening(true);
    log("LISTEN_START", "rate " + c.sampleRate, "engine " + rx.engine, TEST.loopback ? "loopback" : JSON.stringify(micRef.current.settings || {}));
    return true;
  }, [audio, getLoopOut, log]);

  useEffect(() => () => { stopSending(); if (rxRef.current) rxRef.current.stop(); }, [stopSending]);

  // hook for automated loopback tests only
  useEffect(() => {
    if (TEST.loopback) window.__sd = { log: () => logRef.current.slice(), startListening };
  }, [startListening]);

  const buildLog = useCallback((role) => [
    "SOUNDDROP LOG v1.0",
    "page: " + role,
    "session_started: " + startedAt.current.toISOString(),
    "exported: " + new Date().toISOString(),
    "user_agent: " + navigator.userAgent,
    "audio_sample_rate: " + (ctxRef.current ? ctxRef.current.sampleRate : "not started"),
    "receiver_engine: " + (engine || "not started"),
    "mic_settings: " + (micRef.current.settings ? JSON.stringify(micRef.current.settings) : "n/a"),
    "loopback_test: " + TEST.loopback,
    "modes: " + Object.values(MODES).map((m) => m.id + " " + toneHz(m, 0) + "-" + toneHz(m, NUM_TONES - 1) + " Hz").join("; "),
    "",
    "time_s\tevent\tdetails",
    ...logRef.current
  ].join("\n"), [engine]);

  const clearLog = useCallback(() => { logRef.current = []; setLogLines([]); }, []);
  const clearInbox = useCallback(() => setInbox([]), []);

  const value = useMemo(() => ({
    audio, send, stopSending, sending, playNodes, log, logLines, buildLog, clearLog,
    startListening, stopListening, listening, rxStatus, rxMode, symbols, signal, lastResult, inbox, clearInbox,
    micError, sampleRate, engine, analyser: () => analyserRef.current
  }), [audio, send, stopSending, sending, playNodes, log, logLines, buildLog, clearLog, startListening, stopListening, listening, rxStatus, rxMode, symbols, signal, lastResult, inbox, clearInbox, micError, sampleRate, engine]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
