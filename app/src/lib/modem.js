/*
 * SoundDrop modem (v1.0, ES module)
 *
 * Scheme: 19-tone MFSK, one tone per symbol.
 *   tones 0..15  -> one 4-bit nibble each
 *   tone 16      -> REPEAT (the previous nibble again)
 *   tone 17      -> START marker
 *   tone 18      -> END marker
 *
 * Two neighbouring symbols are never the same tone (a repeated nibble is sent
 * as REPEAT), so the receiver needs no clock: every change of the dominant
 * tone is a new symbol.
 *
 * Frame: START | length byte | payload bytes (UTF-8) | CRC-16 (2 bytes) | END
 * Each byte is sent as two nibbles, high nibble first.
 *
 * Receiver:
 *   - Listening runs on the audio thread (Web Audio AudioWorklet running a
 *     1024-point FFT every 5 ms), so slow phone timers cannot make it miss
 *     short symbols. Browsers without AudioWorklet fall back to the Web Audio
 *     AnalyserNode (also an FFT) polled from the page.
 *   - Echo-aware: the tone currently playing keeps ringing in the room after
 *     the sender moves on. A new symbol only has to stand out from the other
 *     tones and be about as loud as that ringing tone, not beat it outright.
 */

  const REPEAT = 16, START = 17, END = 18, NUM_TONES = 19;
  const MAX_BYTES = 120;
  const CAL_MS = 30, SYNC_MS = 90;   // calibration sweep step and sync tone length

  const MODES = {
    audible: { id: "audible", label: "Audible", base: 1500, step: 141 },
    silent:  { id: "silent",  label: "Silent",  base: 17500, step: 94 }
  };
  const SPEEDS = {
    normal: { id: "normal", label: "Normal", symbolMs: 100 },
    fast:   { id: "fast",   label: "Fast",   symbolMs: 60 }
  };

  const toneHz = (mode, i) => mode.base + i * mode.step;
  const TRACE_CHARS = "0123456789abcdefRSE";
  const traceOf = (tones) => tones.map((t) => TRACE_CHARS[t]).join("");

  // CRC-16-CCITT (polynomial 0x1021, start 0xFFFF): 1 in 65,536 chance that a
  // damaged message still passes, which makes repairing missed tones safe.
  function crc16(bytes) {
    let c = 0xffff;
    for (const b of bytes) {
      c ^= b << 8;
      for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c;
  }

  // CRC-8 (polynomial 0x07), kept for reference and the old prototype
  function crc8(bytes) {
    let c = 0;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    }
    return c;
  }

  // text -> list of tone indices (including START/END)
  function encode(text) {
    const payload = Array.from(new TextEncoder().encode(text));
    if (payload.length === 0) throw new Error("Type a message first.");
    if (payload.length > MAX_BYTES) throw new Error("Message is too long: " + payload.length + " bytes, the limit is " + MAX_BYTES + ".");
    const crc = crc16(payload);
    const bytes = [payload.length, ...payload, crc >> 8, crc & 255];
    const tones = [START];
    let lastTone = START, lastNibble = -1;
    for (const b of bytes) {
      for (const n of [b >> 4, b & 15]) {
        let t = n;
        if (n === lastNibble && lastTone !== REPEAT) t = REPEAT;
        tones.push(t);
        lastTone = t; lastNibble = n;
      }
    }
    tones.push(END);
    return { tones, payloadBytes: payload.length };
  }

  // ---------------- transmitter ----------------
  // Phase-continuous FSK: one oscillator glides between tones, so there are no
  // clicks. That matters in Silent mode, where a click would be audible.
  function transmit(ctx, destination, text, opts) {
    const mode = opts.mode, sym = opts.speed.symbolMs / 1000, vol = opts.volume;
    const copies = Math.max(1, Math.min(3, opts.repeat || 1));   // send the frame 1 to 3 times
    const { tones, payloadBytes } = encode(text);
    const markerSym = Math.max(sym * 3, 0.25);
    const glide = 0.004, fade = 0.03, gap = 0.35;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sine";
    const t0 = ctx.currentTime + 0.1;
    let t = t0;
    gain.gain.setValueAtTime(0, t0);
    for (let c = 0; c < copies; c++) {
      const start = t;
      // START, calibration sweep (tones 0-16, 30 ms each), sync START, data, END
      const seq = [[START, markerSym]];
      for (let k = 0; k <= 16; k++) seq.push([k, CAL_MS / 1000]);
      seq.push([START, SYNC_MS / 1000]);
      for (let i = 1; i < tones.length; i++) seq.push([tones[i], tones[i] === END ? markerSym : sym]);
      seq.forEach(([tone, dur], i) => {
        const f = toneHz(mode, tone);
        if (i === 0) osc.frequency.setValueAtTime(f, t);
        else { osc.frequency.setValueAtTime(toneHz(mode, seq[i - 1][0]), t - glide); osc.frequency.linearRampToValueAtTime(f, t); }
        t += dur;
      });
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + fade);
      gain.gain.setValueAtTime(vol, t - fade);
      gain.gain.linearRampToValueAtTime(0, t);
      if (c < copies - 1) t += gap;          // short silence between copies
    }
    const end = t;
    osc.connect(gain).connect(destination);
    osc.start(t0); osc.stop(end + 0.02);
    return {
      startsAt: t0, endsAt: end, duration: end - t0, tones, copies, trace: traceOf(tones), payloadBytes,
      stop() { try { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(0, ctx.currentTime); osc.stop(); } catch (e) {} },
      progress() { return Math.min(1, Math.max(0, (ctx.currentTime - t0) / (end - t0))); }
    };
  }

  // ---------------- symbol detector ----------------
  // Pure function, no browser APIs: it is also serialised into the AudioWorklet.
  // feed(levels, tMs) takes the dB level of all 19 tones for each mode and
  // returns events: start, sym, end, lost, level.
  //
  // States: idle -> (START tone held) -> calib -> (second START after the
  // calibration sweep) -> receiving. During calib the detector records how loud
  // each tone arrives; while receiving, weak tones are boosted by that amount
  // (equalisation), so a speaker that is quiet at some frequencies still works.
  function makeDetector(cfg) {
    const SNR_MIN = cfg.snrMin, MARGIN_MIN = cfg.marginMin, ECHO_DB = cfg.echoDb;
    const STABLE = cfg.stableFrames, START_MS = cfg.startMs, LOST_MS = cfg.lostMs;
    const EQ_MAX = cfg.eqMaxDb, EQ_SNR = cfg.eqSnrMin, SYNC_AFTER = cfg.syncAfterMs, CALIB_MAX = cfg.calibMaxMs;
    const START_T = 17, END_T = 18, N = 19;
    let state = "idle", mode = null, current = null, cand = null, candCount = 0;
    let startMode = null, startSince = 0, lastValidAt = 0, lastLevelAt = -1e9, lockAt = 0;
    let gain = null, boost = new Array(N).fill(0);

    function median(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }
    function pick(L, exclude) {
      let best = -1, second = -1;
      for (let i = 0; i < N; i++) {
        if (i === exclude) continue;
        if (best < 0 || L[i] > L[best]) { second = best; best = i; }
        else if (second < 0 || L[i] > L[second]) second = i;
      }
      return { best, second };
    }
    function lock(id, t) {
      state = "calib"; mode = id; lockAt = t; current = START_T; cand = null; candCount = 0; lastValidAt = t;
      gain = new Array(N).fill(-200); boost = new Array(N).fill(0);
    }
    function finishCalib() {
      // boost each data tone up to the level of the strongest one (capped)
      let top = -200;
      for (let i = 0; i <= 16; i++) top = Math.max(top, gain[i]);
      for (let i = 0; i <= 16; i++) boost[i] = gain[i] > -199 ? Math.max(0, Math.min(EQ_MAX, top - gain[i])) : 0;
      boost[START_T] = 0; boost[END_T] = boost[16];
    }

    return {
      reset() { state = "idle"; mode = null; current = null; cand = null; candCount = 0; startMode = null; boost = new Array(N).fill(0); },
      feed(levels, t) {
        const ev = [];
        if (state === "idle") {
          let found = null, bestLevel = null;
          for (const id in levels) {
            const L = levels[id], floor = median(L), p = pick(L, -1);
            const snr = L[p.best] - floor, margin = L[p.best] - L[p.second];
            if (!bestLevel || snr > bestLevel.snr) bestLevel = { mode: id, snr };
            if (p.best === START_T && snr >= SNR_MIN && margin >= MARGIN_MIN) found = id;
          }
          if (t - lastLevelAt > 100) { lastLevelAt = t; ev.push({ t: "level", mode: bestLevel.mode, snr: bestLevel.snr }); }
          if (found && found === startMode) {
            if (t - startSince >= START_MS) { lock(found, t); ev.push({ t: "lock", mode: found, at: t }); }
          } else { startMode = found; startSince = t; }
          return ev;
        }

        const L = levels[mode], floor = median(L);
        if (t - lastLevelAt > 100) { lastLevelAt = t; const p0 = pick(L, -1); ev.push({ t: "level", mode, snr: L[p0.best] - floor }); }

        if (state === "calib") {
          for (let i = 0; i < N; i++) if (L[i] - floor >= 6) gain[i] = Math.max(gain[i], L[i]);
          const p = pick(L, -1);
          const isSync = t - lockAt >= SYNC_AFTER && p.best === START_T && L[p.best] - floor >= SNR_MIN && L[p.best] - L[p.second] >= MARGIN_MIN;
          if (isSync) candCount++; else candCount = 0;
          if (candCount >= STABLE) {
            finishCalib(); state = "receiving"; current = START_T; cand = null; candCount = 0; lastValidAt = t;
            ev.push({ t: "start", mode, at: t, boost: boost.slice() });
          } else if (t - lockAt > CALIB_MAX) { ev.push({ t: "lost" }); this.reset(); }
          return ev;
        }

        // receiving: compare equalised levels; the noise check uses the raw level
        const E = L.map((v, i) => v + boost[i]);
        const curSnr = L[current] - floor;
        const p = pick(E, current);              // ignore the tone that is still ringing
        const rawSnr = L[p.best] - floor, margin = E[p.best] - E[p.second];
        const needSnr = boost[p.best] > 0 ? Math.max(EQ_SNR, SNR_MIN - boost[p.best]) : SNR_MIN;
        const ok = rawSnr >= needSnr && margin >= MARGIN_MIN && E[p.best] >= E[current] - ECHO_DB;
        if (curSnr >= EQ_SNR || rawSnr >= EQ_SNR) lastValidAt = t;
        else if (t - lastValidAt > LOST_MS) { ev.push({ t: "lost" }); this.reset(); return ev; }

        if (!ok) { cand = null; candCount = 0; return ev; }
        if (p.best === cand) candCount++; else { cand = p.best; candCount = 1; }
        if (candCount < STABLE) return ev;
        current = cand; cand = null; candCount = 0;
        if (current === START_T) { ev.push({ t: "lost" }); lock(mode, t); ev.push({ t: "lock", mode, at: t }); return ev; }  // a new message began
        ev.push({ t: "sym", tone: current, snr: rawSnr, at: t });
        if (current === END_T) { ev.push({ t: "end" }); this.reset(); }
        return ev;
      }
    };
  }

  const DETECTOR_CFG = { snrMin: 12, marginMin: 6, echoDb: -3, stableFrames: 3, startMs: 70, lostMs: 1200,
                         eqMaxDb: 15, eqSnrMin: 7, syncAfterMs: 450, calibMaxMs: 2000 };

  // AudioWorklet processor source: a Hann-windowed 1024-point FFT (radix-2,
  // in place) every 5 ms on the audio thread; each tone's level is read from
  // its nearest FFT bins, the same way the AnalyserNode fallback does it.
  const WORKLET_SRC = `
    const makeDetector = ${makeDetector.toString()};
    class SoundDropDetector extends AudioWorkletProcessor {
      constructor(o) {
        super();
        const p = o.processorOptions, N = p.N;
        this.N = N; this.hop = p.hop;
        this.buf = new Float32Array(N); this.re = new Float32Array(N); this.im = new Float32Array(N);
        this.pos = 0; this.filled = 0; this.since = 0;
        this.win = new Float32Array(N);
        for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
        // bit-reversal table and twiddle factors
        const bits = Math.log2(N);
        this.rev = new Uint16Array(N);
        for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); this.rev[i] = r; }
        this.cos = new Float32Array(N / 2); this.sin = new Float32Array(N / 2);
        for (let i = 0; i < N / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / N); this.sin[i] = -Math.sin(2 * Math.PI * i / N); }
        const binHz = sampleRate / N;
        // read only the bins that belong to each tone: tones 2 bins apart get 1 bin, 3+ apart get 3
        this.modes = p.modes.map(m => ({ id: m.id, r: Math.max(0, Math.floor((m.step / binHz - 1) / 2)), bins: m.freqs.map(f => Math.round(f / binHz)) }));
        this.det = makeDetector(p.cfg);
        this.port.onmessage = (e) => { if (e.data === "reset") this.det.reset(); };
      }
      fft() {
        const N = this.N, re = this.re, im = this.im, cs = this.cos, sn = this.sin;
        for (let size = 2; size <= N; size <<= 1) {
          const half = size >> 1, step = N / size;
          for (let start = 0; start < N; start += size) {
            for (let k = 0; k < half; k++) {
              const wr = cs[k * step], wi = sn[k * step], a = start + k, b = a + half;
              const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
              re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
            }
          }
        }
      }
      analyze() {
        const N = this.N, re = this.re, im = this.im, buf = this.buf, win = this.win, rev = this.rev;
        for (let i = 0, j = this.pos; i < N; i++, j = (j + 1) % N) { re[rev[i]] = buf[j] * win[i]; im[rev[i]] = 0; }
        this.fft();
        const levels = {};
        for (const m of this.modes) {
          const L = new Array(m.bins.length);
          for (let k = 0; k < m.bins.length; k++) {
            let v = 0;
            for (let c = m.bins[k] - m.r; c <= m.bins[k] + m.r; c++) { const pw = re[c] * re[c] + im[c] * im[c]; if (pw > v) v = pw; }
            L[k] = 10 * Math.log10(v + 1e-20);
          }
          levels[m.id] = L;
        }
        const ev = this.det.feed(levels, currentFrame / sampleRate * 1000);
        for (const e of ev) this.port.postMessage(e);
      }
      process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch) {
          for (let i = 0; i < ch.length; i++) {
            this.buf[this.pos] = ch[i]; this.pos = (this.pos + 1) % this.N;
            if (this.filled < this.N) this.filled++;
            if (++this.since >= this.hop && this.filled === this.N) { this.since = 0; this.analyze(); }
          }
        }
        return true;
      }
    }
    registerProcessor("sounddrop-detector", SoundDropDetector);
  `;

  // ---------------- frame decoder with repair ----------------
  // syms: [{tone, at}] data and REPEAT tones in arrival order (at = ms); endAt: time
  // the END tone arrived, or null if it never did. Every tone lasts the same time T,
  // so a gap of about 2T between two accepted tones means one tone was missed there,
  // and two tones less than T/2 apart mean an echo was taken for a tone. Those spots
  // become "unknown" and every possible value is tried; the message is accepted only
  // if exactly one choice passes the length byte, the CRC-16 and the UTF-8 check.
  const MAX_UNKNOWN = 2;
  function checkBytes(nibs) {
    if (nibs.length % 2 !== 0 || nibs.length < 8) return null;
    const bytes = [];
    for (let i = 0; i < nibs.length; i += 2) bytes.push((nibs[i] << 4) | nibs[i + 1]);
    const len = bytes[0], payload = bytes.slice(1, -2);
    if (len !== payload.length) return null;
    if (crc16(payload) !== ((bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1])) return null;
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(payload)), bytes: payload.length }; }
    catch (e) { return null; }
  }
  function resolve(tokens) {           // tokens: 0..15, REPEAT, or a guessed value
    const out = []; let last = null;
    for (const t of tokens) {
      if (t === REPEAT) { if (last === null) return null; out.push(last); }
      else { out.push(t); last = t; }
    }
    return out;
  }
  function solve(tokens) {
    const unknown = [];
    tokens.forEach((t, i) => { if (t === null) unknown.push(i); });
    if (unknown.length === 0) { const n = resolve(tokens); return n ? checkBytes(n) : null; }
    if (unknown.length > MAX_UNKNOWN) return null;
    const found = new Map();
    const total = Math.pow(16, unknown.length);
    for (let c = 0; c < total; c++) {
      const tk = tokens.slice();
      let v = c;
      for (const i of unknown) { tk[i] = v % 16; v = Math.floor(v / 16); }
      const n = resolve(tk); if (!n) continue;
      const r = checkBytes(n); if (r) found.set(r.text, r);
      if (found.size > 1) return null;   // ambiguous: refuse rather than guess
    }
    return found.size === 1 ? [...found.values()][0] : null;
  }
  function decodeFrame(syms, endAt) {
    const plain = solve(syms.map((s) => s.tone));
    if (plain) return Object.assign(plain, { repaired: 0 });
    // timing-based repair
    const times = syms.map((s) => s.at).concat(endAt != null ? [endAt] : []);
    const gaps = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    if (gaps.length >= 6) {
      const T = gaps.slice().sort((a, b) => a - b)[gaps.length >> 1];
      const tokens = [];
      let repaired = 0;
      for (let i = 0; i < syms.length; i++) {
        const g = i + 1 < times.length ? times[i + 1] - times[i] : T;
        if (g < 0.5 * T && i + 1 < syms.length) {           // echo counted as a tone: two in one slot
          tokens.push(null); repaired++; i++;
          const g2 = i + 1 < times.length ? times[i + 1] - times[i - 1] : T;
          const k2 = Math.round(g2 / T);
          for (let m = 1; m < k2 && m <= MAX_UNKNOWN; m++) { tokens.push(null); repaired++; }
          continue;
        }
        tokens.push(syms[i].tone);
        const k = Math.round(g / T);
        for (let m = 1; m < k && m <= MAX_UNKNOWN; m++) { tokens.push(null); repaired++; }
      }
      const r = solve(tokens);
      if (r) return Object.assign(r, { repaired });
    }
    // last resorts, each accepted only when exactly one choice passes all checks:
    // one tone missing somewhere, or one tone heard as a different tone
    const base = syms.map((s) => s.tone);
    const tries = [];
    for (let pos = 0; pos <= base.length; pos++) { const tk = base.slice(); tk.splice(pos, 0, null); tries.push(tk); }
    for (let pos = 0; pos < base.length; pos++) { const tk = base.slice(); tk[pos] = null; tries.push(tk); }
    const found = new Map();
    for (const tk of tries) {
      const r = solve(tk);
      if (r) found.set(r.text, r);
      if (found.size > 1) return null;
    }
    return found.size === 1 ? Object.assign([...found.values()][0], { repaired: 1 }) : null;
  }

  // ---------------- receiver ----------------
  // createReceiver(ctx, sourceNode, handlers, {engine: "worklet" | "analyser"})
  // resolves to { start(), stop(), engine }.
  async function createReceiver(ctx, source, handlers, opts) {
    const h = Object.assign({ onState() {}, onSymbol() {}, onMessage() {}, onError() {}, onLevel() {} }, handlers);
    const want = (opts && opts.engine) || "worklet";
    const CFG = Object.assign({}, DETECTOR_CFG, (opts && opts.cfg) || {});
    const modeList = Object.values(MODES);

    // ---- frame assembler (main thread; not timing-critical) ----
    let rxMode = null, syms = [], lastNibble = null, trace = [], snrSum = 0, snrN = 0, frameStart = 0, nibCount = 0;
    function begin(m) { rxMode = m; syms = []; lastNibble = null; nibCount = 0; trace = [START]; snrSum = 0; snrN = 0; frameStart = performance.now(); h.onState("receiving", m); }
    function info() { return { mode: rxMode, nibbles: syms.length, ms: performance.now() - frameStart, avgSnr: snrN ? snrSum / snrN : 0, trace: traceOf(trace) }; }
    function done() { rxMode = null; h.onState("idle"); }
    function finish(endAt, lost) {
      const inf = info();
      const r = decodeFrame(syms, endAt);
      if (r) { h.onMessage(r.text, Object.assign(inf, { bytes: r.bytes, repaired: r.repaired })); return done(); }
      h.onError(lost ? "Signal lost in the middle of the message." : "Checksum failed. The message was damaged on the way.", inf);
      done();
    }
    function onEvent(e) {
      if (e.t === "level") return h.onLevel(e);
      if (e.t === "lock") { if (!rxMode) h.onState("receiving", e.mode); return; }   // calibrating
      if (e.t === "start") return begin(e.mode);
      if (e.t === "lost" && !rxMode) { h.onState("idle"); return; }
      if (!rxMode) return;
      if (e.t === "lost") return finish(null, true);
      if (e.t === "end") return finish(syms.endAt != null ? syms.endAt : null, false);
      if (e.t === "sym") {
        trace.push(e.tone);
        if (e.tone === END) { syms.endAt = e.at; return; }
        if (e.tone === START) return;
        snrSum += e.snr; snrN++;
        syms.push({ tone: e.tone, at: e.at });
        nibCount++;
        h.onSymbol(e.tone, nibCount);
        if (syms.length > (MAX_BYTES + 3) * 2 + 4) { h.onError("Message longer than allowed; stopped.", info()); done(); }
      }
    }

    // ---- engine 1: AudioWorklet ----
    if (want === "worklet" && ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      try {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const N = (opts && opts.fftN) || 1024, hop = Math.round(ctx.sampleRate * 0.005);
        let node = null, sink = null;
        return {
          engine: "worklet",
          start() {
            node = new AudioWorkletNode(ctx, "sounddrop-detector", {
              numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
              processorOptions: { N, hop, cfg: CFG, modes: modeList.map((m) => ({ id: m.id, step: m.step, freqs: Array.from({ length: NUM_TONES }, (_, i) => toneHz(m, i)) })) }
            });
            node.port.onmessage = (ev) => onEvent(ev.data);
            sink = ctx.createGain(); sink.gain.value = 0;      // keeps the node running, outputs silence
            source.connect(node); node.connect(sink).connect(ctx.destination);
            h.onState("idle");
          },
          stop() {
            try { source.disconnect(node); } catch (e) {}
            try { node.disconnect(); sink.disconnect(); } catch (e) {}
            node = null; rxMode = null; h.onState("off");
          }
        };
      } catch (e) { /* fall through to the analyser engine */ }
    }

    // ---- engine 2: AnalyserNode polled from the page ----
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0; analyser.minDecibels = -150; analyser.maxDecibels = -10;
    const data = new Float32Array(analyser.frequencyBinCount);
    const det = makeDetector(CFG);
    let timer = null;
    function poll() {
      analyser.getFloatFrequencyData(data);
      const bh = ctx.sampleRate / analyser.fftSize, n = data.length, levels = {};
      for (const m of modeList) {
        const L = [];
        for (let i = 0; i < NUM_TONES; i++) {
          const c = Math.round(toneHz(m, i) / bh), r = Math.max(0, Math.floor((m.step / bh - 1) / 2)); let v = -200;
          for (let k = c - r; k <= c + r; k++) if (k > 0 && k < n && Number.isFinite(data[k])) v = Math.max(v, data[k]);
          L.push(v);
        }
        levels[m.id] = L;
      }
      det.feed(levels, performance.now()).forEach(onEvent);
    }
    return {
      engine: "analyser",
      start() { source.connect(analyser); det.reset(); timer = setInterval(poll, 8); h.onState("idle"); },
      stop() { clearInterval(timer); timer = null; try { source.disconnect(analyser); } catch (e) {} rxMode = null; h.onState("off"); }
    };
  }

export { MODES, SPEEDS, MAX_BYTES, NUM_TONES, REPEAT, START, END, encode, transmit, createReceiver, decodeFrame, toneHz, crc8, crc16, traceOf, makeDetector, DETECTOR_CFG };
