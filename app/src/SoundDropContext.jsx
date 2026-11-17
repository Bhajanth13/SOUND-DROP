/*
 * SoundDropContext.jsx: the audio engine, shared by every page.
 *
 * It owns one AudioContext (the browser's sound system) and offers the pages:
 *   send(text, mode, volume)  play a message through the speaker
 *   startListening()          open the microphone and start the receiver
 *   stopListening()           close the microphone
 * plus the state the pages show: sending progress, listening, status, tone
 * count, signal level, the last result and the inbox.
 *
 * It is a React Context placed above all pages, so listening keeps running
 * while the user moves between pages. Pages reach it with useSoundDrop().
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { MODES, transmit, createReceiver, unpack } from "./modem.js";

const Ctx = createContext(null);
export const useSoundDrop = () => useContext(Ctx);

// Developer test: ?loopback sends the sound straight into the receiver of the
// same page instead of the speaker, so the modem can be tested without a microphone.
const LOOPBACK = new URLSearchParams(window.location.search).has("loopback");

export function SoundDropProvider({ children }) {
  // useRef: objects that must survive re-renders but should not cause one
  const ctxRef = useRef(null), loopRef = useRef(null);
  const micRef = useRef(null), rxRef = useRef(null), txRef = useRef(null);

  // useState: what the pages show; changing it redraws them
  const [sending, setSending] = useState(null);          // { progress } while sending
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("off");           // off | idle | receiving
  const [rxMode, setRxMode] = useState(null);
  const [tones, setTones] = useState(0);
  const [signal, setSignal] = useState(null);            // dB above the noise floor
  const [result, setResult] = useState(null);            // { ok, message | error, info }
  const [inbox, setInbox] = useState([]);
  const [micError, setMicError] = useState("");

  // One AudioContext for the whole app. Browsers only start audio after a tap.
  const audio = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);
  const loop = () => loopRef.current || (loopRef.current = audio().createGain());

  // ----- sending -----
  // transmit() schedules the whole message at once; the timer only moves the progress bar.
  const send = useCallback((text, mode, volume) => {
    const c = audio();
    if (txRef.current) txRef.current.stop();
    const tx = transmit(c, LOOPBACK ? loop() : c.destination, text, { mode: MODES[mode], volume });
    txRef.current = tx;
    setSending({ progress: 0 });
    const timer = setInterval(() => {                     // only moves the progress bar
      const p = tx.progress();
      if (txRef.current !== tx || p >= 1) { clearInterval(timer); if (txRef.current === tx) { txRef.current = null; setSending(null); } return; }
      setSending({ progress: p });
    }, 100);
  }, [audio]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stopSending = useCallback(() => {
    if (txRef.current) txRef.current.stop();
    txRef.current = null;
    setSending(null);
  }, []);

  // ----- receiving -----
  // Opens the microphone, then createReceiver() runs the FFT detector on it and
  // calls back here with the status, tone count, signal and finished message.
  const startListening = useCallback(async () => {
    const c = audio();
    setMicError("");
    let source;
    if (LOOPBACK) source = loop();
    else {
      try {
        // voice-call filters off: they would remove steady tones as "noise"
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        micRef.current = stream;
        source = c.createMediaStreamSource(stream);
      } catch (e) {
        setMicError("Microphone access was blocked. Allow the microphone for this site, then tap Listen again.");
        return;
      }
    }
    const rx = await createReceiver(c, source, {
      onState(s, m) {
        setStatus(s);
        if (s === "receiving") { setRxMode(m); setTones(0); setResult({ ok: null }); }
      },
      onSymbol: setTones,
      onLevel: (snr) => setSignal(Math.round(snr)),
      onMessage(text, info) {
        const item = { id: Date.now(), at: new Date(), message: unpack(text), info };
        setResult({ ok: true, message: item.message, info });
        setInbox((list) => [item, ...list]);
      },
      onError: (error) => setResult({ ok: false, error })
    });
    rx.start();
    rxRef.current = rx;
    setListening(true);
  }, [audio]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = useCallback(() => {
    if (rxRef.current) rxRef.current.stop();
    if (micRef.current) micRef.current.getTracks().forEach((t) => t.stop());   // turns the microphone off
    rxRef.current = null; micRef.current = null;
    setListening(false); setStatus("off"); setSignal(null);
  }, []);

  // useMemo keeps the same object between renders unless something changed,
  // so pages are not redrawn for nothing.
  const value = useMemo(() => ({
    send, stopSending, sending,
    startListening, stopListening, listening, status, rxMode, tones, signal, result, micError,
    inbox, clearInbox: () => setInbox([])
  }), [send, stopSending, sending, startListening, stopListening, listening, status, rxMode, tones, signal, result, micError, inbox]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
