/*
 * modem.js: the sound engine. Everything that turns a message into sound and back.
 * It does not touch the page, so it can be tested on its own; app.js uses it.
 *
 *  Part 1  Settings: the 19 tones, timing, the two modes
 *  Part 2  CRC-16 checksum
 *  Part 3  Sender:   encode() text -> tone numbers, transmit() plays them
 *  Part 4  Detector: decides which tone is playing (state machine)
 *  Part 5  AudioWorklet: FFT on the browser's audio thread, feeds the detector
 *  Part 6  Receiver: decodeFrame() tones -> text, createReceiver() wires it up
 *  Part 7  Message formats: text or contact card, pack / unpack
 *
 * How the sound carries data (19-tone MFSK, one tone per symbol, 100 ms each):
 *   tones 0..15 -> one 4-bit value (a "nibble") each, so one byte = 2 tones
 *   tone 16     -> REPEAT: "the same nibble again"
 *   tone 17     -> START marker
 *   tone 18     -> END marker
 * Two neighbouring tones are never the same (a repeated nibble is sent as
 * REPEAT), so the receiver needs no clock: every change of tone is a new symbol.
 *
 * One message (a "frame"):
 *   START | calibration sweep | sync START | length | payload (UTF-8) | CRC-16 | END
 */

// =====================================================================
// Part 1  Settings
// =====================================================================

const REPEAT = 16, START = 17, END = 18, NUM_TONES = 19;
const MAX_BYTES = 120;
const SYMBOL_S = 0.1;    // one data tone lasts 100 ms
const MARKER_S = 0.3;    // START and END last 300 ms
const CAL_S = 0.03;      // each tone of the calibration sweep lasts 30 ms
const SYNC_S = 0.09;     // the sync START after the sweep lasts 90 ms

const MODES = {
  audible: { id: "audible", label: "Audible", base: 1500, step: 141 },
  silent: { id: "silent", label: "Silent", base: 17500, step: 94 }
};

const toneHz = (mode, i) => mode.base + i * mode.step;

// =====================================================================
// Part 2  CRC-16 checksum
// =====================================================================

// CRC-16-CCITT (polynomial 0x1021, start value 0xFFFF). Binary long division
// where "subtract" is XOR; the 16-bit remainder is sent after the message.
// The receiver recomputes it: a damaged message gives a different remainder.
function crc16(bytes) {
  let c = 0xffff;
  for (const b of bytes) {
    c ^= b << 8;                                   // bring the next byte into the top 8 bits
    for (let k = 0; k < 8; k++)                    // one bit at a time
      c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;   // top bit 1: shift and XOR the polynomial
  }
  return c;
}

// =====================================================================
// Part 3  Sender
// =====================================================================

// text -> list of tone numbers, including START and END.
// Bytes sent: [length, ...UTF-8 payload, CRC high byte, CRC low byte].
function encode(text) {
  const payload = Array.from(new TextEncoder().encode(text));    // UTF-8: any language works
  if (payload.length === 0) throw new Error("Type a message first.");
  if (payload.length > MAX_BYTES) throw new Error("Message is too long: " + payload.length + " bytes, the limit is " + MAX_BYTES + ".");
  const crc = crc16(payload);
  const bytes = [payload.length, ...payload, crc >> 8, crc & 255];
  const tones = [START];
  let lastTone = START, lastNibble = -1;
  for (const b of bytes) {
    for (const n of [b >> 4, b & 15]) {           // high nibble first
      const t = n === lastNibble && lastTone !== REPEAT ? REPEAT : n;   // never the same tone twice in a row
      tones.push(t);
      lastTone = t; lastNibble = n;
    }
  }
  tones.push(END);
  return tones;
}

// Seconds a message of this many bytes takes to play (shown on the Send page):
// two markers + 17 sweep tones + sync + 2 tones per byte (payload + length + 2 CRC bytes)
const airTime = (bytes) => 2 * MARKER_S + 17 * CAL_S + SYNC_S + (bytes + 3) * 2 * SYMBOL_S;

// Plays the message through the speaker (destination).
// The whole message is scheduled in advance on the audio clock, so a busy
// phone cannot make the tones uneven. One oscillator glides between tones,
// so there are no clicks (a click would be audible even in Silent mode).
// Returns { duration, stop(), progress() }.
function transmit(ctx, destination, text, { mode, volume }) {
  const tones = encode(text);
  const steps = [[START, MARKER_S]];
  for (let k = 0; k <= 16; k++) steps.push([k, CAL_S]);          // calibration sweep
  steps.push([START, SYNC_S]);                                     // sync: data follows
  for (const t of tones.slice(1)) steps.push([t, t === END ? MARKER_S : SYMBOL_S]);

  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = "sine";
  const t0 = ctx.currentTime + 0.1;                                 // start 100 ms from now
  let t = t0;
  steps.forEach(([tone, dur], i) => {
    const f = toneHz(mode, tone);
    if (i === 0) osc.frequency.setValueAtTime(f, t);
    else {
      osc.frequency.setValueAtTime(toneHz(mode, steps[i - 1][0]), t - 0.004);
      osc.frequency.linearRampToValueAtTime(f, t);                 // 4 ms glide to the new tone
    }
    t += dur;
  });
  gain.gain.setValueAtTime(0, t0);                                  // 30 ms fade in and out
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.03);
  gain.gain.setValueAtTime(volume, t - 0.03);
  gain.gain.linearRampToValueAtTime(0, t);
  osc.connect(gain).connect(destination);
  osc.start(t0);
  osc.stop(t + 0.02);
  return {
    duration: t - t0,
    stop() { try { osc.stop(); } catch (e) {} },
    progress: () => Math.min(1, Math.max(0, (ctx.currentTime - t0) / (t - t0)))
  };
}

// =====================================================================
// Part 4  Detector
// =====================================================================

// Decides which tone is playing. feed(levels, ms) gets the level in dB of all
// 19 tones of each mode, about 200 times a second, and returns events:
// level, lock, start, sym, end, lost. It uses no browser APIs, because its
// source code is copied into the AudioWorklet below.
//
// States: idle -> (START held) -> calib -> (sync START) -> receiving -> (END) -> idle
// During calib it measures how loud each tone arrives; while receiving, weak
// tones are boosted by that amount (equalisation).
function makeDetector(cfg) {
  const N = 19, START_T = 17, END_T = 18;
  let state = "idle", mode = null, current = null, cand = null, candCount = 0;
  let startMode = null, startSince = 0, lastValidAt = 0, lastLevelAt = -1e9, lockAt = 0;
  let gain = null, boost = new Array(N).fill(0);

  // noise floor = the median of the 19 levels (most tones are silent at any moment)
  const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  function pick(L, exclude) {                 // loudest and second-loudest tone
    let best = -1, second = -1;
    for (let i = 0; i < N; i++) {
      if (i === exclude) continue;
      if (best < 0 || L[i] > L[best]) { second = best; best = i; }
      else if (second < 0 || L[i] > L[second]) second = i;
    }
    return { best, second };
  }
  function lock(id, t) {                      // START heard: lock onto this mode and calibrate
    state = "calib"; mode = id; lockAt = t; current = START_T; cand = null; candCount = 0; lastValidAt = t;
    gain = new Array(N).fill(-200); boost = new Array(N).fill(0);
  }
  function reset() {                          // back to idle, waiting for the next message
  state = "idle"; mode = null; current = null; cand = null; candCount = 0; startMode = null; boost = new Array(N).fill(0); }

  // Called about 200 times a second with the dB level of every tone in both bands.
  function feed(levels, t) {
    const ev = [];                            // events for the page: level, lock, start, sym, end, lost
    if (state === "idle") {                   // look for a START tone in either band
      let found = null, top = null;
      for (const id in levels) {
        const L = levels[id], floor = median(L), p = pick(L, -1);
        const snr = L[p.best] - floor, margin = L[p.best] - L[p.second];
        if (!top || snr > top.snr) top = { mode: id, snr };
        if (p.best === START_T && snr >= cfg.snrMin && margin >= cfg.marginMin) found = id;
      }
      if (t - lastLevelAt > 100) { lastLevelAt = t; ev.push({ t: "level", snr: top.snr }); }
      if (found && found === startMode) {
        if (t - startSince >= cfg.startMs) { lock(found, t); ev.push({ t: "lock", mode: found }); }
      } else { startMode = found; startSince = t; }
      return ev;
    }

    const L = levels[mode], floor = median(L);
    if (t - lastLevelAt > 100) { lastLevelAt = t; ev.push({ t: "level", snr: L[pick(L, -1).best] - floor }); }

    if (state === "calib") {                  // record the loudest level of each tone
      for (let i = 0; i < N; i++) if (L[i] - floor >= 6) gain[i] = Math.max(gain[i], L[i]);
      const p = pick(L, -1);
      const sync = t - lockAt >= cfg.syncAfterMs && p.best === START_T && L[p.best] - floor >= cfg.snrMin && L[p.best] - L[p.second] >= cfg.marginMin;
      candCount = sync ? candCount + 1 : 0;
      if (candCount >= cfg.stableFrames) {
        let top = -200;                       // boost each tone up to the loudest one, at most eqMaxDb
        for (let i = 0; i <= 16; i++) top = Math.max(top, gain[i]);
        for (let i = 0; i <= 16; i++) boost[i] = gain[i] > -199 ? Math.min(cfg.eqMaxDb, top - gain[i]) : 0;
        boost[START_T] = 0; boost[END_T] = boost[16];
        state = "receiving"; current = START_T; cand = null; candCount = 0; lastValidAt = t;
        ev.push({ t: "start", mode });
      } else if (t - lockAt > cfg.calibMaxMs) { ev.push({ t: "lost" }); reset(); }
      return ev;
    }

    // receiving: compare boosted levels, ignoring the tone that is still ringing (echo)
    const E = L.map((v, i) => v + boost[i]);
    const p = pick(E, current);
    const snr = L[p.best] - floor, margin = E[p.best] - E[p.second];
    const needSnr = Math.max(cfg.eqSnrMin, cfg.snrMin - boost[p.best]);
    const ok = snr >= needSnr && margin >= cfg.marginMin && E[p.best] >= E[current] + cfg.echoDb;
    if (L[current] - floor >= cfg.eqSnrMin || snr >= cfg.eqSnrMin) lastValidAt = t;
    else if (t - lastValidAt > cfg.lostMs) { ev.push({ t: "lost" }); reset(); return ev; }

    if (!ok) { cand = null; candCount = 0; return ev; }
    if (p.best === cand) candCount++; else { cand = p.best; candCount = 1; }
    if (candCount < cfg.stableFrames) return ev;   // the same tone must win 3 frames in a row
    current = cand; cand = null; candCount = 0;
    if (current === START_T) { lock(mode, t); ev.push({ t: "lost" }, { t: "lock", mode }); return ev; }  // a new message began
    if (current === END_T) { ev.push({ t: "end" }); reset(); return ev; }
    ev.push({ t: "sym", tone: current, snr });
    return ev;
  }
  return { feed, reset };
}

// All thresholds in one place
const DETECTOR_CFG = {
  snrMin: 12,        // dB the winning tone must be above the noise floor
  marginMin: 6,      // dB it must beat the second-loudest tone by
  echoDb: 3,         // dB it must beat the tone that is still ringing by
  stableFrames: 3,   // FFT frames in a row it must win (15 ms)
  startMs: 70,       // how long START must be heard before locking on
  lostMs: 1200,      // silence that ends a message
  eqMaxDb: 15,       // largest boost for a weak tone
  eqSnrMin: 7,       // lowest SNR accepted for a boosted tone
  syncAfterMs: 450,  // the sync START comes after the 510 ms sweep
  calibMaxMs: 2000
};

// =====================================================================
// Part 5  AudioWorklet (FFT)
// =====================================================================

// AudioWorklet: runs on the browser's audio thread, so a busy page cannot make
// it miss tones. Every 5 ms it runs a Hann-windowed 1024-point FFT on the
// latest samples, reads the level of each tone and feeds the detector.
// A worklet must be loaded from its own script, so its source is written here as
// a string; makeDetector.toString() copies the detector above into it.
const WORKLET_SRC = `
  const makeDetector = ${makeDetector.toString()};
  class SoundDropDetector extends AudioWorkletProcessor {
    constructor(options) {
      super();
      const p = options.processorOptions, N = 1024;
      this.N = N; this.hop = Math.round(sampleRate * 0.005);
      this.buf = new Float32Array(N); this.re = new Float32Array(N); this.im = new Float32Array(N);
      this.pos = 0; this.filled = 0; this.since = 0;
      this.win = new Float32Array(N);           // Hann window: removes false energy from cutting the sound into pieces
      for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
      const bits = Math.log2(N);
      this.rev = new Uint16Array(N);            // bit-reversed order for the FFT
      for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); this.rev[i] = r; }
      // twiddle factors: the rotations the FFT multiplies by
      this.cos = new Float32Array(N / 2); this.sin = new Float32Array(N / 2);
      for (let i = 0; i < N / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / N); this.sin[i] = -Math.sin(2 * Math.PI * i / N); }
      const binHz = sampleRate / N;
      // bins per tone: Audible tones are 3 bins apart (read 3), Silent tones 2 apart (read 1)
      this.modes = p.modes.map((m) => ({ id: m.id, r: Math.max(0, Math.floor((m.step / binHz - 1) / 2)), bins: m.freqs.map((f) => Math.round(f / binHz)) }));
      this.det = makeDetector(p.cfg);
    }
    fft() {                                    // radix-2 FFT, in place
      const N = this.N, re = this.re, im = this.im;
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1, step = N / size;
        for (let start = 0; start < N; start += size) {
          for (let k = 0; k < half; k++) {
            const wr = this.cos[k * step], wi = this.sin[k * step], a = start + k, b = a + half;
            const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          }
        }
      }
    }
    analyze() {                                // window -> FFT -> level of each tone in dB
      const N = this.N, re = this.re, im = this.im;
      for (let i = 0, j = this.pos; i < N; i++, j = (j + 1) % N) { re[this.rev[i]] = this.buf[j] * this.win[i]; im[this.rev[i]] = 0; }
      this.fft();
      const levels = {};
      for (const m of this.modes) {
        levels[m.id] = m.bins.map((c) => {
          let v = 0;
          for (let k = c - m.r; k <= c + m.r; k++) v = Math.max(v, re[k] * re[k] + im[k] * im[k]);
          return 10 * Math.log10(v + 1e-20);
        });
      }
      for (const e of this.det.feed(levels, currentFrame / sampleRate * 1000)) this.port.postMessage(e);
    }
    process(inputs) {                          // called by the browser with every 128 microphone samples
      const ch = inputs[0] && inputs[0][0];
      if (ch) {
        for (let i = 0; i < ch.length; i++) {
          this.buf[this.pos] = ch[i]; this.pos = (this.pos + 1) % this.N;   // ring buffer of the last 1024 samples
          if (this.filled < this.N) this.filled++;
          if (++this.since >= this.hop && this.filled === this.N) { this.since = 0; this.analyze(); }
        }
      }
      return true;
    }
  }
  registerProcessor("sounddrop-detector", SoundDropDetector);
`;

// =====================================================================
// Part 6  Receiver
// =====================================================================

// tones (without START/END) -> text, or null if any check fails.
// Three checks: the length byte, the CRC-16, and valid UTF-8 text.
// A damaged message is never guessed: it is rejected and sent again.
function decodeFrame(tones) {
  const nibs = [];
  for (const t of tones) {
    if (t === REPEAT) { if (!nibs.length) return null; nibs.push(nibs[nibs.length - 1]); }   // REPEAT = previous value
    else nibs.push(t);
  }
  if (nibs.length % 2 !== 0 || nibs.length < 8) return null;
  const bytes = [];
  for (let i = 0; i < nibs.length; i += 2) bytes.push((nibs[i] << 4) | nibs[i + 1]);   // two nibbles -> one byte
  const payload = bytes.slice(1, -2);
  if (bytes[0] !== payload.length) return null;                                          // length byte
  if (crc16(payload) !== ((bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1])) return null;   // CRC-16
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(payload)), bytes: payload.length }; }
  catch (e) { return null; }                                                              // not valid UTF-8
}

// Connects the microphone (source) to the detector worklet and turns its
// events into messages for the page (handlers.onState, onSymbol, onLevel,
// onMessage, onError). Resolves to { start(), stop() }.
async function createReceiver(ctx, source, handlers) {
  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  let rxMode = null, tones = [], snrSum = 0, startedAt = 0;
  function finish(ok) {                       // the message ended: decode it and report the result
    const info = { mode: rxMode, ms: performance.now() - startedAt, avgSnr: tones.length ? snrSum / tones.length : 0 };
    const r = ok ? decodeFrame(tones) : null;
    if (r) handlers.onMessage(r.text, { ...info, bytes: r.bytes });
    else handlers.onError(ok ? "Checksum failed: the message was damaged on the way." : "Signal lost in the middle of the message.");
    rxMode = null;
    handlers.onState("idle");
  }
  function onEvent(e) {                       // one event from the detector in the worklet
    if (e.t === "level") return handlers.onLevel(e.snr);
    if (e.t === "lock") return handlers.onState("receiving", e.mode);
    if (e.t === "start") { rxMode = e.mode; tones = []; snrSum = 0; startedAt = performance.now(); return; }
    if (!rxMode) { if (e.t === "lost") handlers.onState("idle"); return; }
    if (e.t === "sym") {
      tones.push(e.tone); snrSum += e.snr;
      handlers.onSymbol(tones.length);
      if (tones.length > (MAX_BYTES + 3) * 2) finish(false);
    }
    if (e.t === "end") finish(true);
    if (e.t === "lost") finish(false);
  }

  let node = null, mute = null;
  return {
    start() {
      node = new AudioWorkletNode(ctx, "sounddrop-detector", {
        processorOptions: {
          cfg: DETECTOR_CFG,
          modes: Object.values(MODES).map((m) => ({ id: m.id, step: m.step, freqs: Array.from({ length: NUM_TONES }, (_, i) => toneHz(m, i)) }))
        }
      });
      node.port.onmessage = (ev) => onEvent(ev.data);
      mute = ctx.createGain(); mute.gain.value = 0;     // keeps the worklet running without making sound
      source.connect(node).connect(mute).connect(ctx.destination);
      handlers.onState("idle");
    },
    stop() {
      try { source.disconnect(node); node.disconnect(); mute.disconnect(); } catch (e) {}
      rxMode = null;
    }
  };
}

// =====================================================================
// Part 7  Message formats
// =====================================================================

// Before a message becomes sound it is packed into one string: a type letter,
// ":" and the fields joined by the ASCII unit separator (0x1F), a character
// people cannot type by accident. The form checks themselves are done by the
// browser (HTML5 required, minlength, pattern, type="email").
//   T:<text>                             a text message
//   C:<name>\u001f<phone>\u001f<email>    a contact card
const SEP = "\u001f";

// Size in UTF-8 bytes (what the 120-byte limit counts)
const byteLength = (s) => new TextEncoder().encode(s).length;

// form values -> packed string
function pack(format, v) {
  if (format === "contact") return "C:" + [v.name.trim(), v.phone.trim(), v.email.trim()].join(SEP);
  return "T:" + v.text.trim();
}

// received string -> { format, text } or { format, name, phone, email }
function unpack(raw) {
  const code = raw.slice(0, 2), body = raw.slice(2);
  if (code === "C:") {
    const [name = "", phone = "", email = ""] = body.split(SEP);
    return { format: "contact", name, phone, email };
  }
  return { format: "text", text: code === "T:" ? body : raw };
}

export { MODES, MAX_BYTES, NUM_TONES, toneHz, airTime, transmit, createReceiver, byteLength, pack, unpack };
