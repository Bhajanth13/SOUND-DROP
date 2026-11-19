/*
 * SoundDropContext.jsx: the audio engine, shared by every page.
 *
 * It owns one AudioContext (the browser's sound system) and offers the pages:
 *   send(text, options)       play a message through the speaker
 *                             options: mode, speed, volume, password (optional lock)
 *   startListening()          open the microphone and start the receiver
 *   stopListening()           close the microphone
 *   show(id)                  show an inbox message in the result card
 *   openLocked(id, password)  unlock a locked message
 * plus the state the pages show: sending progress, listening, status, tone
 * count, signal level, the last result and the inbox.
 *
 * The inbox is saved in the browser (localStorage), so it is still there after
 * the app is closed. It is a React Context placed above all pages, so
 * listening keeps running while the user moves between pages.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MODES, transmit, createReceiver, unpack, lock, unlock, isLocked, readText } from "./modem.js";

const Ctx = createContext(null);
export const useSoundDrop = () => useContext(Ctx);

// Developer test: ?loopback sends the sound straight into the receiver of the
// same page instead of the speaker, so the modem can be tested without a microphone.
const LOOPBACK = new URLSearchParams(window.location.search).has("loopback");

// ----- saved inbox -----
// Each item: { id, at (date text), info, message } or, still locked,
// { id, at, info, locked (the encrypted bytes as base64 text) }.
const STORE = "sounddrop-inbox", KEEP = 50;
function loadInbox() {
  try { const list = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(list) ? list : []; }
  catch (e) { return []; }                               // private window or blocked storage
}
function saveInbox(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, KEEP))); } catch (e) { /* storage full or blocked */ }
}
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function SoundDropProvider({ children }) {
  // useRef: objects that must survive re-renders but should not cause one
  const ctxRef = useRef(null), loopRef = useRef(null);
  const micRef = useRef(null), rxRef = useRef(null), txRef = useRef(null);
  const passRef = useRef("");                            // last password that opened a message (this session only)
  const inboxRef = useRef([]);

  // useState: what the pages show; changing it redraws them
  const [sending, setSending] = useState(null);          // { progress } while sending
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("off");           // off | idle | receiving
  const [rxMode, setRxMode] = useState(null);
  const [tones, setTones] = useState(0);
  const [signal, setSignal] = useState(null);            // dB above the noise floor
  const [result, setResult] = useState(null);            // { ok: null } receiving, { ok: true, id }, { ok: false, error }
  const [inbox, setInbox] = useState(loadInbox);
  const [micError, setMicError] = useState("");

  useEffect(() => { inboxRef.current = inbox; saveInbox(inbox); }, [inbox]);   // save on every change

  // One AudioContext for the whole app. Browsers only start audio after a tap.
  const audio = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);
  const loop = () => loopRef.current || (loopRef.current = audio().createGain());

  // ----- sending -----
  // With a password the text is encrypted first. transmit() schedules the whole
  // message at once; the timer only moves the progress bar.
  const send = useCallback(async (text, { mode, speed, volume, password }) => {
    const c = audio();                                   // before any await, so the tap still counts
    if (txRef.current) txRef.current.stop();
    const data = password ? await lock(text, password) : text;
    const tx = transmit(c, LOOPBACK ? loop() : c.destination, data, { mode: MODES[mode], volume, speed });
    txRef.current = tx;
    setSending({ progress: 0 });
    const timer = setInterval(() => {
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
  // A received message is bytes. Locked ones are opened with the last password
  // that worked; otherwise they wait in the inbox until the user types it.
  async function received(data, info) {
    const base = { id: Date.now(), at: new Date().toISOString() };
    let item;
    if (isLocked(data)) {
      const text = passRef.current ? await unlock(data, passRef.current) : null;
      item = text ? { ...base, info: { ...info, locked: true }, message: unpack(text) }
        : { ...base, info: { ...info, locked: true }, locked: toB64(data) };
    } else {
      const text = readText(data);
      if (text === null) return setResult({ ok: false, error: "The message was not readable text." });
      item = { ...base, info, message: unpack(text) };
    }
    setInbox((list) => [item, ...list]);
    setResult({ ok: true, id: item.id });
  }

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
      onMessage: received,
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

  // ----- inbox -----
  const show = useCallback((id) => setResult({ ok: true, id }), []);

  // Tries the password on this message and on every other locked one.
  // Resolves to true if this message opened.
  const openLocked = useCallback(async (id, password) => {
    const opened = {};
    for (const item of inboxRef.current) {
      if (!item.locked) continue;
      const text = await unlock(fromB64(item.locked), password);
      if (text !== null) opened[item.id] = unpack(text);
    }
    if (!opened[id]) return false;
    passRef.current = password;
    setInbox((list) => list.map((it) => (opened[it.id] ? { id: it.id, at: it.at, info: it.info, message: opened[it.id] } : it)));
    return true;
  }, []);

  const clearInbox = useCallback(() => { setInbox([]); setResult(null); }, []);

  // useMemo keeps the same object between renders unless something changed,
  // so pages are not redrawn for nothing.
  const value = useMemo(() => ({
    send, stopSending, sending,
    startListening, stopListening, listening, status, rxMode, tones, signal, result, micError,
    inbox, show, openLocked, clearInbox
  }), [send, stopSending, sending, startListening, stopListening, listening, status, rxMode, tones, signal, result, micError, inbox, show, openLocked, clearInbox]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
