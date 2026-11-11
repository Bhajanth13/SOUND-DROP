/*
 * SoundDrop modem (prototype v0.2)
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
 * Frame: START | length byte | payload bytes (UTF-8) | CRC-8 | END
 * Each byte is sent as two nibbles, high nibble first.
 *
 * Receiver (v0.3):
 *   - Listening runs on the audio thread (Web Audio AudioWorklet running a
 *     1024-point FFT every 5 ms), so slow phone timers cannot make it miss
 *     short symbols. Browsers without AudioWorklet fall back to the Web Audio
 *     AnalyserNode (also an FFT) polled from the page.
 *   - Echo-aware: the tone currently playing keeps ringing in the room after
 *     the sender moves on. A new symbol only has to stand out from the other
 *     tones and be about as loud as that ringing tone, not beat it outright.
 */
(function (global) {
  "use strict";

  const REPEAT = 16, START = 17, END = 18, NUM_TONES = 19;
  const MAX_BYTES = 120;

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

  // CRC-8 (polynomial 0x07)
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
    const bytes = [payload.length, ...payload, crc8(payload)];
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
    const { tones, payloadBytes } = encode(text);
    const markerSym = Math.max(sym * 3, 0.25);
    const glide = 0.004, fade = 0.03;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sine";
    const t0 = ctx.currentTime + 0.1;
    let t = t0;
    tones.forEach((tone, i) => {
      const f = toneHz(mode, tone);
      if (i === 0) osc.frequency.setValueAtTime(f, t);
      else { osc.frequency.setValueAtTime(toneHz(mode, tones[i - 1]), t - glide); osc.frequency.linearRampToValueAtTime(f, t); }
      t += (tone === START || tone === END) ? markerSym : sym;
    });
    const end = t;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + fade);
    gain.gain.setValueAtTime(vol, end - fade);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(destination);
    osc.start(t0); osc.stop(end + 0.02);
    return {
      startsAt: t0, endsAt: end, duration: end - t0, tones, trace: traceOf(tones), payloadBytes,
      stop() { try { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(0, ctx.currentTime); osc.stop(); } catch (e) {} },
      progress() { return Math.min(1, Math.max(0, (ctx.currentTime - t0) / (end - t0))); }
    };
  }

  // ---------------- symbol detector ----------------
  // Pure function, no browser APIs: it is also serialised into the AudioWorklet.
  // feed(levels, tMs) takes the dB level of all 19 tones for each mode and
  // returns events: start, sym, end, lost, level.
  function makeDetector(cfg) {
    const SNR_MIN = cfg.snrMin, MARGIN_MIN = cfg.marginMin, ECHO_DB = cfg.echoDb;
    const STABLE = cfg.stableFrames, START_MS = cfg.startMs, LOST_MS = cfg.lostMs;
    const START_T = 17, N = 19;
    let state = "idle", mode = null, current = null, cand = null, candCount = 0;
    let startMode = null, startSince = 0, lastValidAt = 0, lastLevelAt = -1e9;

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

    return {
      reset() { state = "idle"; mode = null; current = null; cand = null; candCount = 0; startMode = null; },
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
            if (t - startSince >= START_MS) {
              state = "receiving"; mode = found; current = START_T; cand = null; candCount = 0; lastValidAt = t;
              ev.push({ t: "start", mode: found, at: t });
            }
          } else { startMode = found; startSince = t; }
          return ev;
        }

        const L = levels[mode], floor = median(L);
        const curSnr = L[current] - floor;
        const p = pick(L, current);              // ignore the tone that is still ringing
        const snr = L[p.best] - floor, margin = L[p.best] - L[p.second];
        const ok = snr >= SNR_MIN && margin >= MARGIN_MIN && L[p.best] >= L[current] - ECHO_DB;
        if (t - lastLevelAt > 100) { lastLevelAt = t; ev.push({ t: "level", mode, snr: Math.max(snr, curSnr) }); }
        if (curSnr >= SNR_MIN || snr >= SNR_MIN) lastValidAt = t;
        else if (t - lastValidAt > LOST_MS) { ev.push({ t: "lost" }); this.reset(); return ev; }

        if (!ok) { cand = null; candCount = 0; return ev; }
        if (p.best === cand) candCount++; else { cand = p.best; candCount = 1; }
        if (candCount < STABLE) return ev;
        current = cand; cand = null; candCount = 0;
        ev.push({ t: "sym", tone: current, snr, at: t });
        if (current === 18) { ev.push({ t: "end" }); this.reset(); }
        return ev;
      }
    };
  }

  const DETECTOR_CFG = { snrMin: 12, marginMin: 6, echoDb: -3, stableFrames: 3, startMs: 70, lostMs: 1200 };

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

  // ---------------- receiver ----------------
  // createReceiver(ctx, sourceNode, handlers, {engine: "worklet" | "analyser"})
  // resolves to { start(), stop(), engine }.
  async function createReceiver(ctx, source, handlers, opts) {
    const h = Object.assign({ onState() {}, onSymbol() {}, onMessage() {}, onError() {}, onLevel() {} }, handlers);
    const want = (opts && opts.engine) || "worklet";
    const CFG = Object.assign({}, DETECTOR_CFG, (opts && opts.cfg) || {});
    const modeList = Object.values(MODES);

    // ---- frame assembler (main thread; not timing-critical) ----
    let rxMode = null, nibbles = [], lastNibble = null, trace = [], snrSum = 0, snrN = 0, frameStart = 0;
    function begin(m) { rxMode = m; nibbles = []; lastNibble = null; trace = [START]; snrSum = 0; snrN = 0; frameStart = performance.now(); h.onState("receiving", m); }
    function info() { return { mode: rxMode, nibbles: nibbles.length, ms: performance.now() - frameStart, avgSnr: snrN ? snrSum / snrN : 0, trace: traceOf(trace) }; }
    function fail(msg) { h.onError(msg, info()); rxMode = null; h.onState("idle"); }
    function finish() {
      const inf = info();
      if (nibbles.length % 2 !== 0) return fail("Message was cut off (odd number of symbols).");
      const bytes = [];
      for (let i = 0; i < nibbles.length; i += 2) bytes.push((nibbles[i] << 4) | nibbles[i + 1]);
      if (bytes.length < 3) return fail("Message too short to decode.");
      const len = bytes[0], payload = bytes.slice(1, -1), crc = bytes[bytes.length - 1];
      if (len !== payload.length) return fail("Length check failed: expected " + len + " bytes, got " + payload.length + ".");
      if (crc8(payload) !== crc) return fail("Checksum failed. The message was damaged on the way.");
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(payload)); }
      catch (e) { return fail("Received bytes are not valid text."); }
      h.onMessage(text, Object.assign(inf, { bytes: payload.length }));
      rxMode = null; h.onState("idle");
    }
    function onEvent(e) {
      if (e.t === "level") return h.onLevel(e);
      if (e.t === "start") return begin(e.mode);
      if (!rxMode) return;
      if (e.t === "lost") return fail("Signal lost in the middle of the message.");
      if (e.t === "end") return finish();
      if (e.t === "sym") {
        trace.push(e.tone);
        if (e.tone >= START) return;
        snrSum += e.snr; snrN++;
        let nib;
        if (e.tone === REPEAT) { if (lastNibble === null) return; nib = lastNibble; } else nib = e.tone;
        nibbles.push(nib); lastNibble = nib;
        h.onSymbol(nib, nibbles.length);
        if (nibbles.length > (MAX_BYTES + 2) * 2) fail("Message longer than allowed; stopped.");
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

  global.SoundDrop = { MODES, SPEEDS, MAX_BYTES, NUM_TONES, encode, transmit, createReceiver, toneHz, crc8, traceOf, makeDetector, DETECTOR_CFG };
})(typeof window !== "undefined" ? window : globalThis);
