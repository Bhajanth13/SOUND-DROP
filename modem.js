/*
 * SoundDrop modem (prototype v0.1)
 *
 * Scheme: 19-tone MFSK, one tone per symbol.
 *   tones 0..15  -> one 4-bit nibble each
 *   tone 16      -> REPEAT (the previous nibble again)
 *   tone 17      -> START marker
 *   tone 18      -> END marker
 *
 * Two neighbouring symbols are never the same tone (a repeated nibble is sent
 * as REPEAT), so the receiver needs no clock: every change of the dominant
 * tone is a new symbol. That makes decoding robust to timer jitter on phones.
 *
 * Frame: START | length byte | payload bytes (UTF-8) | CRC-8 | END
 * Each byte is sent as two nibbles, high nibble first.
 */
(function (global) {
  "use strict";

  const NUM_DATA = 16, REPEAT = 16, START = 17, END = 18, NUM_TONES = 19;
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
    const markerSym = Math.max(sym * 3, 0.25);   // longer START/END for detection
    const glide = 0.004, fade = 0.03;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sine";
    const t0 = ctx.currentTime + 0.1;
    let t = t0;
    const schedule = [];
    tones.forEach((tone, i) => {
      const f = toneHz(mode, tone);
      if (i === 0) osc.frequency.setValueAtTime(f, t);
      else { osc.frequency.setValueAtTime(toneHz(mode, tones[i - 1]), t - glide); osc.frequency.linearRampToValueAtTime(f, t); }
      schedule.push({ at: t, tone });
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
      startsAt: t0, endsAt: end, duration: end - t0, tones, payloadBytes,
      stop() { try { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setValueAtTime(0, ctx.currentTime); osc.stop(); } catch (e) {} },
      progress() { return Math.min(1, Math.max(0, (ctx.currentTime - t0) / (end - t0))); },
      onended: (fn) => { osc.onended = fn; }
    };
  }

  // ---------------- receiver ----------------
  // Polls an AnalyserNode every ~8 ms, finds the dominant tone in each mode's
  // tone set and runs a small state machine.
  function createReceiver(ctx, analyser, handlers) {
    const h = Object.assign({ onState() {}, onSymbol() {}, onMessage() {}, onError() {}, onLevel() {} }, handlers);
    const data = new Float32Array(analyser.frequencyBinCount);
    const binHz = () => ctx.sampleRate / analyser.fftSize;
    const SNR_MIN = 12, MARGIN_MIN = 6, STABLE_POLLS = 3, START_POLLS = 10, LOST_MS = 1200;

    let state = "idle", mode = null, current = null, cand = null, candCount = 0;
    let nibbles = [], lastNibble = null, lastValidAt = 0, frameStart = 0, snrSum = 0, snrN = 0;
    let startCand = { mode: null, count: 0 };
    let timer = null;

    function measure(m) {
      const bh = binHz(), n = data.length;
      const lv = [];
      for (let i = 0; i < NUM_TONES; i++) {
        const c = Math.round(toneHz(m, i) / bh);
        let v = -200;
        for (let k = c - 1; k <= c + 1; k++) if (k > 0 && k < n && Number.isFinite(data[k])) v = Math.max(v, data[k]);
        lv.push(v);
      }
      // noise floor: median of bins just outside the tone band
      const lo = Math.round((toneHz(m, 0) - 4 * m.step) / bh), hi = Math.round((toneHz(m, NUM_TONES - 1) + 4 * m.step) / bh);
      const noise = [];
      const loB = Math.round((toneHz(m, 0) - m.step) / bh), hiB = Math.round((toneHz(m, NUM_TONES - 1) + m.step) / bh);
      for (let k = Math.max(1, lo); k <= Math.min(n - 1, hi); k++) if ((k < loB || k > hiB) && Number.isFinite(data[k])) noise.push(data[k]);
      noise.sort((a, b) => a - b);
      const floor = noise.length ? noise[Math.floor(noise.length / 2)] : -140;
      let best = 0, second = 1;
      if (lv[1] > lv[0]) { best = 1; second = 0; }
      for (let i = 2; i < NUM_TONES; i++) {
        if (lv[i] > lv[best]) { second = best; best = i; } else if (lv[i] > lv[second]) second = i;
      }
      const snr = lv[best] - floor, margin = lv[best] - lv[second];
      return { tone: best, snr, margin, ok: snr >= SNR_MIN && margin >= MARGIN_MIN };
    }

    function reset(newState) {
      state = newState || "idle"; mode = null; current = null; cand = null; candCount = 0;
      nibbles = []; lastNibble = null; snrSum = 0; snrN = 0; startCand = { mode: null, count: 0 };
      h.onState(state);
    }

    function finish() {
      const ms = performance.now() - frameStart;
      const avgSnr = snrN ? snrSum / snrN : 0;
      const info = { mode: mode.id, nibbles: nibbles.length, ms, avgSnr };
      if (nibbles.length % 2 !== 0) { h.onError("Message was cut off (odd number of symbols).", info); return reset(); }
      const bytes = [];
      for (let i = 0; i < nibbles.length; i += 2) bytes.push((nibbles[i] << 4) | nibbles[i + 1]);
      if (bytes.length < 3) { h.onError("Message too short to decode.", info); return reset(); }
      const len = bytes[0], payload = bytes.slice(1, -1), crc = bytes[bytes.length - 1];
      if (len !== payload.length) { h.onError("Length check failed: expected " + len + " bytes, got " + payload.length + ".", info); return reset(); }
      if (crc8(payload) !== crc) { h.onError("Checksum failed. The message was damaged on the way.", info); return reset(); }
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(payload)); }
      catch (e) { h.onError("Received bytes are not valid text.", info); return reset(); }
      h.onMessage(text, Object.assign(info, { bytes: payload.length }));
      reset();
    }

    function poll() {
      analyser.getFloatFrequencyData(data);
      const now = performance.now();
      if (state === "idle") {
        let found = null, lvl = null;
        for (const m of Object.values(MODES)) {
          const r = measure(m);
          if (!lvl || r.snr > lvl.snr) lvl = Object.assign({ mode: m.id }, r);
          if (r.ok && r.tone === START) found = m;
        }
        h.onLevel(lvl);
        if (found && startCand.mode === found.id) startCand.count++;
        else startCand = { mode: found ? found.id : null, count: found ? 1 : 0 };
        if (found && startCand.count >= START_POLLS) {
          state = "receiving"; mode = found; current = START; frameStart = now; lastValidAt = now;
          h.onState(state, mode.id);
        }
        return;
      }
      const r = measure(mode);
      h.onLevel(Object.assign({ mode: mode.id }, r));
      if (!r.ok) {
        if (now - lastValidAt > LOST_MS) {
          h.onError("Signal lost in the middle of the message.", { mode: mode.id, nibbles: nibbles.length, ms: now - frameStart, avgSnr: snrN ? snrSum / snrN : 0 });
          reset();
        }
        cand = null; candCount = 0;
        return;
      }
      lastValidAt = now;
      if (r.tone === current) { cand = null; candCount = 0; return; }
      if (r.tone === cand) candCount++; else { cand = r.tone; candCount = 1; }
      if (candCount < STABLE_POLLS) return;
      // accept new symbol
      current = r.tone; cand = null; candCount = 0;
      snrSum += r.snr; snrN++;
      if (current === END) return finish();
      if (current === START) return;
      let nib;
      if (current === REPEAT) { if (lastNibble === null) return; nib = lastNibble; }
      else nib = current;
      nibbles.push(nib); lastNibble = nib;
      h.onSymbol(nib, nibbles.length, r);
      if (nibbles.length > (MAX_BYTES + 2) * 2) { h.onError("Message longer than allowed; stopped.", { mode: mode.id }); reset(); }
    }

    return {
      start() { if (!timer) { reset(); timer = setInterval(poll, 8); } },
      stop() { if (timer) clearInterval(timer); timer = null; state = "off"; h.onState("off"); },
      get state() { return state; }
    };
  }

  global.SoundDrop = { MODES, SPEEDS, MAX_BYTES, encode, transmit, createReceiver, toneHz, crc8, NUM_TONES };
})(typeof window !== "undefined" ? window : globalThis);
