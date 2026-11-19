/*
 * modem.js: everything that turns a message into sound and back.
 * It has no React in it, so it can be tested on its own.
 *
 *  Part 1  Settings: the 19 tones, timing, the two modes, the two speeds
 *  Part 2  Error checking and repair: CRC-16 and Reed-Solomon
 *  Part 3  Sender:   encode() bytes -> tone numbers, transmit() plays them
 *  Part 4  Detector: decides which tone is playing (state machine)
 *  Part 5  AudioWorklet: FFT on the browser's audio thread, feeds the detector
 *  Part 6  Receiver: decodeFrame() tones -> bytes, createReceiver() wires it up
 *  Part 7  Message formats: text or contact card, validation, pack / unpack, vCard
 *  Part 8  Password lock: AES-GCM encryption with the browser's Web Crypto
 *
 * How the sound carries data (19-tone MFSK, one tone per symbol, 100 ms or 50 ms):
 *   tones 0..15 -> one 4-bit value (a "nibble") each, so one byte = 2 tones
 *   tone 16     -> REPEAT: "the same nibble again"
 *   tone 17     -> START marker
 *   tone 18     -> END marker
 * Two neighbouring tones are never the same (a repeated nibble is sent as
 * REPEAT), so the receiver needs no clock: every change of tone is a new symbol.
 * For the same reason the receiver does not need to know the speed.
 *
 * One message (a "frame"):
 *   START | calibration sweep | sync START | length | payload | CRC-16 | 8 repair bytes | END
 */

// =====================================================================
// Part 1  Settings
// =====================================================================

const REPEAT = 16, START = 17, END = 18, NUM_TONES = 19;
const MAX_BYTES = 120;  // payload limit (the length byte must fit in one byte)
const NSYM = 8;          // Reed-Solomon repair bytes: up to 4 wrong bytes can be fixed
const MARKER_S = 0.3;    // START and END last 300 ms
const CAL_S = 0.03;      // each tone of the calibration sweep lasts 30 ms
const SYNC_S = 0.09;     // the sync START after the sweep lasts 90 ms

const MODES = {
  audible: { id: "audible", label: "Audible", base: 1500, step: 141 },
  silent: { id: "silent", label: "Silent", base: 17500, step: 94 }
};

// How long one data tone lasts. Fast halves the time; best at close range.
const SPEEDS = {
  normal: { id: "normal", label: "Normal", symbol: 0.1 },
  fast: { id: "fast", label: "Fast", symbol: 0.05 }
};

const toneHz = (mode, i) => mode.base + i * mode.step;

// =====================================================================
// Part 2  Error checking and repair
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

// Reed-Solomon error correction over GF(256), the code used on CDs and QR codes.
// NSYM extra "repair" bytes are worked out from the message. The receiver uses
// them to find and fix up to NSYM / 2 wrong bytes (a misheard tone spoils one byte).
// Arithmetic is in GF(256): adding is XOR, multiplying uses log tables.
const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x; GF_LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;           // the field's polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0);
const gfDiv = (a, b) => (a ? GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255] : 0);
const gfPow = (a, n) => GF_EXP[(((GF_LOG[a] * n) % 255) + 255) % 255];
const gfInv = (a) => GF_EXP[255 - GF_LOG[a]];

// Polynomials are arrays of coefficients, highest power first.
const polyScale = (p, x) => p.map((c) => gfMul(c, x));
function polyAdd(p, q) {
  const r = new Array(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i++) r[i + r.length - p.length] = p[i];
  for (let i = 0; i < q.length; i++) r[i + r.length - q.length] ^= q[i];
  return r;
}
function polyMul(p, q) {
  const r = new Array(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j++) for (let i = 0; i < p.length; i++) r[i + j] ^= gfMul(p[i], q[j]);
  return r;
}
function polyEval(p, x) {                          // Horner's rule
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

// Sender: append NSYM repair bytes (the remainder of dividing by the generator).
function rsEncode(msg, nsym) {
  let gen = [1];
  for (let i = 0; i < nsym; i++) gen = polyMul(gen, [1, GF_EXP[i]]);
  const out = msg.concat(new Array(nsym).fill(0));
  for (let i = 0; i < msg.length; i++) {
    const c = out[i];
    if (c) for (let j = 1; j < gen.length; j++) out[i + j] ^= gfMul(gen[j], c);
  }
  return msg.concat(out.slice(msg.length));
}

// Receiver: returns { data, fixed } with the message part repaired, or null
// when there are too many errors. Steps: syndromes (all zero = no error),
// Berlekamp-Massey finds the error locator, a Chien search finds the error
// positions, the Forney formula finds the error values.
function rsDecode(msg, nsym) {
  const n = msg.length;
  const synd = [0];
  for (let i = 0; i < nsym; i++) synd.push(polyEval(msg, GF_EXP[i]));
  if (synd.every((s) => s === 0)) return { data: msg.slice(0, n - nsym), fixed: 0 };

  // Berlekamp-Massey: the shortest polynomial that explains the syndromes
  let errLoc = [1], oldLoc = [1];
  for (let i = 0; i < nsym; i++) {
    const k = i + 1;
    let delta = synd[k];
    for (let j = 1; j < errLoc.length; j++) delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[k - j]);
    oldLoc = oldLoc.concat([0]);
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, gfInv(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length && errLoc[0] === 0) errLoc.shift();
  const errs = errLoc.length - 1;
  if (errs * 2 > nsym) return null;                // too many errors to fix

  // Chien search: try every position
  const rev = errLoc.slice().reverse(), pos = [];
  for (let i = 0; i < n; i++) if (polyEval(rev, gfPow(2, i)) === 0) pos.push(n - 1 - i);
  if (pos.length !== errs) return null;

  // Forney: the size of each error
  const coefPos = pos.map((p) => n - 1 - p);
  let loc = [1];
  for (const c of coefPos) loc = polyMul(loc, polyAdd([1], [gfPow(2, c), 0]));
  const prod = polyMul(synd.slice().reverse(), loc);
  const ev = prod.slice(prod.length - loc.length);   // error evaluator = (S * locator) mod x^(errors + 1)
  const X = coefPos.map((c) => gfPow(2, c));
  const out = msg.slice();
  for (let i = 0; i < X.length; i++) {
    const xiInv = gfInv(X[i]);
    let denom = 1;
    for (let j = 0; j < X.length; j++) if (j !== i) denom = gfMul(denom, 1 ^ gfMul(xiInv, X[j]));
    if (denom === 0) return null;
    const y = gfMul(X[i], polyEval(ev, xiInv));
    out[pos[i]] ^= gfDiv(y, denom);
  }
  for (let i = 0; i < nsym; i++) if (polyEval(out, GF_EXP[i]) !== 0) return null;   // check the repair
  return { data: out.slice(0, n - nsym), fixed: errs };
}

// =====================================================================
// Part 3  Sender
// =====================================================================

// bytes (or text) -> list of tone numbers, including START and END.
// Bytes sent: [length, ...payload, CRC high, CRC low, ...8 Reed-Solomon bytes].
function encode(data) {
  const payload = Array.from(typeof data === "string" ? new TextEncoder().encode(data) : data);   // UTF-8: any language works
  if (payload.length === 0) throw new Error("Type a message first.");
  if (payload.length > MAX_BYTES) throw new Error("Message is too long: " + payload.length + " bytes, the limit is " + MAX_BYTES + ".");
  const crc = crc16(payload);
  const bytes = rsEncode([payload.length, ...payload, crc >> 8, crc & 255], NSYM);
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

// Seconds a message of this many bytes takes to play (shown on the Send page): two markers
// + 17 sweep tones + sync + 2 tones per byte (payload, length, 2 CRC bytes, 8 repair bytes)
const airTime = (bytes, speed = "normal") =>
  2 * MARKER_S + 17 * CAL_S + SYNC_S + (bytes + 3 + NSYM) * 2 * SPEEDS[speed].symbol;

// Plays the message (text or bytes) through the speaker (destination).
// The whole message is scheduled in advance on the audio clock, so a busy
// phone cannot make the tones uneven. One oscillator glides between tones,
// so there are no clicks (a click would be audible even in Silent mode).
// Returns { duration, stop(), progress() }.
function transmit(ctx, destination, data, { mode, volume, speed = "normal" }) {
  const tones = encode(data), symbol = SPEEDS[speed].symbol;
  const steps = [[START, MARKER_S]];
  for (let k = 0; k <= 16; k++) steps.push([k, CAL_S]);          // calibration sweep
  steps.push([START, SYNC_S]);                                     // sync: data follows
  for (const t of tones.slice(1)) steps.push([t, t === END ? MARKER_S : symbol]);

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

// One attempt: tones -> bytes -> Reed-Solomon repair (at most maxFix bytes)
// -> length and CRC-16 checks. Returns { data, bytes, fixed } or null.
function tryDecode(tones, maxFix) {
  const nibs = [];
  for (const t of tones) {
    if (t === REPEAT) { if (!nibs.length) return null; nibs.push(nibs[nibs.length - 1]); }   // REPEAT = previous value
    else nibs.push(t);
  }
  if (nibs.length % 2 !== 0 || nibs.length < (4 + NSYM) * 2) return null;
  const raw = [];
  for (let i = 0; i < nibs.length; i += 2) raw.push((nibs[i] << 4) | nibs[i + 1]);    // two nibbles -> one byte
  const rs = rsDecode(raw, NSYM);                                                      // repair
  if (!rs || rs.fixed > maxFix) return null;
  const bytes = rs.data, payload = bytes.slice(1, -2);
  if (bytes[0] !== payload.length) return null;                                        // length byte
  if (crc16(payload) !== ((bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1])) return null;   // CRC-16
  return { data: new Uint8Array(payload), bytes: payload.length, fixed: rs.fixed };
}

// tones (without START/END) -> { data: payload bytes, bytes, fixed }, or null.
// 1. Reed-Solomon repairs up to 4 misheard bytes, then the length byte and the
//    CRC-16 must match.
// 2. Resync: a short noise can add an extra tone, or two tones can merge into
//    one. Then every later byte is shifted and step 1 fails. So the decoder
//    tries removing one or two tones, or putting back one or two (as a
//    placeholder that Reed-Solomon then corrects). A candidate is accepted only
//    if it needs at most 2 repaired bytes and the CRC-16 matches, so a wrong
//    message is practically never accepted.
// A message that still fails is never guessed: it is rejected and sent again.
function decodeFrame(tones) {
  const r = tryDecode(tones, NSYM / 2);
  if (r) return r;
  const n = tones.length, ok = (t, edits) => { const d = tryDecode(t, 2); return d ? { ...d, fixed: d.fixed + edits } : null; };
  const drop = (t, i) => t.slice(0, i).concat(t.slice(i + 1));
  const add = (t, i) => t.slice(0, i).concat([0], t.slice(i));      // 0 = placeholder value
  for (const edits of [1, 2]) {                                      // one change first, then two
    if ((n + edits) % 2 !== 0 && (n - edits) % 2 !== 0) continue;
    for (let i = 0; i <= n; i++) {
      if (edits === 1) {
        const a = i < n && ok(drop(tones, i), 1); if (a) return a;   // an extra tone was heard
        const b = ok(add(tones, i), 1); if (b) return b;             // a tone was missed
      } else {
        for (let j = i; j <= n; j++) {
          const a = j + 1 < n && ok(drop(drop(tones, j + 1), i), 2); if (a) return a;
          const b = ok(add(add(tones, j), i), 2); if (b) return b;
        }
      }
    }
  }
  return null;
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
    if (r) handlers.onMessage(r.data, { ...info, bytes: r.bytes, fixed: r.fixed });
    else handlers.onError(ok ? "The message was too damaged to repair." : "Signal lost in the middle of the message.");
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
      if (tones.length > (MAX_BYTES + 3 + NSYM) * 2) finish(false);
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
// people cannot type by accident.
//   T:<text>                      a text message
//   C:<name>\u001f<phone>\u001f<email>   a contact card

const SEP = "\u001f";

// The formats offered on the Send page
const FORMATS = [
  { id: "text", code: "T", label: "Text", hint: "A short sentence or note" },
  { id: "contact", code: "C", label: "Contact card", hint: "Name, phone and email" }
];

// Empty form values for each format
const EMPTY = {
  text: { text: "" },
  contact: { name: "", phone: "", email: "" }
};

// Size in UTF-8 bytes (what the 120-byte limit counts)
const byteLength = (s) => new TextEncoder().encode(s).length;

// form values -> packed string
function pack(format, v) {
  switch (format) {
    case "text": return "T:" + v.text.trim();
    case "contact": return "C:" + [v.name.trim(), v.phone.trim(), v.email.trim()].join(SEP);
    default: throw new Error("Unknown format");
  }
}

// Bytes the message will take on air; a password lock adds LOCK_OVERHEAD bytes.
const sentBytes = (format, v, password) => byteLength(pack(format, v)) + (password ? LOCK_OVERHEAD : 0);

// Returns { field: "message" } for every field that is wrong; empty when valid.
// password is optional: empty means the message is sent unlocked.
function validate(format, v, password = "") {
  const e = {};
  if (password && password.length < 4) e.password = "Use 4 or more characters.";
  if (format === "text") {
    if (!v.text.trim()) e.text = "Type a message to send.";
  }
  if (format === "contact") {
    const nm = v.name.trim();
    if (nm.length < 2) e.name = "Enter at least 2 letters.";
    if (!/^\+?[0-9][0-9 ]{6,14}$/.test(v.phone.trim())) e.phone = "Enter 7 to 15 digits.";
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "Enter a valid email or leave it empty.";
  }
  if (!Object.keys(e).length) {
    const n = sentBytes(format, v, password);
    if (n > MAX_BYTES) e._size = "This message is " + n + " bytes" + (password ? " with the lock" : "") + ". Shorten it to " + MAX_BYTES + " bytes or less.";
  }
  return e;
}

// Unpack a received text. Anything without a known prefix is shown as text.
function unpack(raw) {
  const code = raw.slice(0, 2), body = raw.slice(2);
  if (code === "T:") return { format: "text", text: body };
  if (code === "C:") {
    const [name = "", phone = "", email = ""] = body.split(SEP);
    return { format: "contact", name, phone, email };
  }
  return { format: "text", text: raw };
}

// One line for the inbox
function summary(m) {
  if (m.format === "contact") return "Contact: " + m.name;
  return m.text;
}

// "text" -> "Text", "contact" -> "Contact card"
const formatLabel = (id) => (FORMATS.find((f) => f.id === id) || FORMATS[0]).label;

// A contact card as a vCard file, which phones open in their Contacts app.
function toVCard(m) {
  const esc = (s) => s.replace(/[\\,;]/g, (c) => "\\" + c);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + esc(m.name), "N:" + esc(m.name) + ";;;;", "TEL;TYPE=CELL:" + m.phone.replace(/\s/g, "")];
  if (m.email) lines.push("EMAIL:" + m.email);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

// Plain text for the Copy and Share buttons
const asText = (m) => (m.format === "contact" ? [m.name, m.phone, m.email].filter(Boolean).join(", ") : m.text);

// =====================================================================
// Part 8  Password lock
// =====================================================================

// A locked message is encrypted with AES-GCM using the browser's Web Crypto.
// The key is made from the password with PBKDF2 (100,000 rounds of SHA-256),
// so guessing passwords is slow. AES-GCM also adds a 16-byte tag: a wrong
// password or a changed byte makes decryption fail instead of giving rubbish.
// Bytes sent: [0x00, 8-byte salt, 12-byte IV, encrypted text + 16-byte tag].
// Text never starts with byte 0x00, so the receiver can tell the two apart.
const LOCK_MARK = 0x00, SALT_LEN = 8, IV_LEN = 12, TAG_LEN = 16;
const LOCK_OVERHEAD = 1 + SALT_LEN + IV_LEN + TAG_LEN;   // 37 bytes

async function makeKey(password, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// packed text + password -> bytes to send
async function lock(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await makeKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  return Uint8Array.from([LOCK_MARK, ...salt, ...iv, ...ct]);
}

// received bytes + password -> packed text, or null if the password is wrong
async function unlock(bytes, password) {
  const salt = bytes.slice(1, 1 + SALT_LEN), iv = bytes.slice(1 + SALT_LEN, 1 + SALT_LEN + IV_LEN);
  try {
    const key = await makeKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes.slice(1 + SALT_LEN + IV_LEN));
    return new TextDecoder("utf-8", { fatal: true }).decode(pt);
  } catch (e) { return null; }
}

const isLocked = (bytes) => bytes.length > LOCK_OVERHEAD && bytes[0] === LOCK_MARK;

// received bytes -> packed text, or null if they are not valid UTF-8 text
function readText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) { return null; }
}

export {
  MODES, SPEEDS, MAX_BYTES, NUM_TONES, toneHz, airTime, transmit, createReceiver,          // sound
  FORMATS, EMPTY, pack, validate, sentBytes, unpack, summary, formatLabel, toVCard, asText, // message formats
  LOCK_OVERHEAD, lock, unlock, isLocked, readText                                          // password lock
};
