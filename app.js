(() => {
  "use strict";
  const SD = window.SoundDrop;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const LOOPBACK = params.has("loopback");      // test mode: sender feeds the receiver directly
  const MUTE = params.has("mute");              // test mode: do not play through speakers

  // ---------- shared audio ----------
  let ctx = null, loopIn = null;
  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // ---------- log ----------
  const T0 = performance.now(), STARTED = new Date();
  let logLines = [];
  const ts = () => ((performance.now() - T0) / 1000).toFixed(2);
  function log(kind, ...f) {
    if (logLines.length > 20000) return;
    logLines.push([ts(), kind, ...f].join("\t"));
    $("logCount").textContent = logLines.length.toLocaleString();
  }
  function buildLog() {
    return [
      "SOUNDDROP PROTOTYPE LOG v0.1",
      "role_last: " + role,
      "session_started: " + STARTED.toISOString(),
      "exported: " + new Date().toISOString(),
      "user_agent: " + navigator.userAgent,
      "audio_sample_rate: " + (ctx ? ctx.sampleRate : "not started"),
      "mic_settings: " + (micSettings ? JSON.stringify(micSettings) : "n/a"),
      "loopback_test: " + LOOPBACK,
      "modes: " + Object.values(SD.MODES).map((m) => m.id + " " + SD.toneHz(m, 0) + "-" + SD.toneHz(m, SD.NUM_TONES - 1) + " Hz").join("; "),
      "",
      "time_s\tevent\tdetails",
      ...logLines
    ].join("\n");
  }
  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  $("saveLog").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buildLog()], { type: "text/plain" }));
    a.download = "sounddrop-" + role + "-" + stamp() + ".txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $("logMsg").textContent = "Saved " + a.download + ". If nothing downloaded, use Copy log.";
  };
  $("copyLog").onclick = () => navigator.clipboard.writeText(buildLog())
    .then(() => { $("logMsg").textContent = "Log copied. Paste it into a .txt file or straight into the chat."; })
    .catch(() => { $("logMsg").textContent = "Copy was blocked by the browser. Use Save log instead."; });
  $("clearLog").onclick = () => { logLines = []; $("logCount").textContent = "0"; $("logMsg").textContent = "Log cleared."; };

  // ---------- tabs ----------
  let role = "send";
  function show(which) {
    role = which;
    $("tabSend").setAttribute("aria-selected", which === "send");
    $("tabRecv").setAttribute("aria-selected", which === "receive");
    $("sendView").hidden = which !== "send";
    $("recvView").hidden = which !== "receive";
  }
  $("tabSend").onclick = () => show("send");
  $("tabRecv").onclick = () => show("receive");

  // ---------- sender ----------
  const SAMPLES = ["Hello from SoundDrop!", "Meet at the library at 4 pm", "WiFi: RVU-Lab / pass: sound123", "https://github.com/Bhajanth13", "aaaa bbbb 1111"];
  SAMPLES.forEach((s) => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = s.length > 22 ? s.slice(0, 21) + "…" : s; b.title = s;
    b.onclick = () => { $("msg").value = s; updateMeta(); };
    $("samples").appendChild(b);
  });

  let mode = SD.MODES.audible, speed = SD.SPEEDS.normal;
  function chipGroup(el, items, get, set) {
    Object.values(items).forEach((it) => {
      const b = document.createElement("button");
      b.className = "chip"; b.textContent = it.label; b.dataset.id = it.id;
      b.onclick = () => { set(it); mark(); updateMeta(); };
      el.appendChild(b);
    });
    const mark = () => [...el.children].forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === get().id));
    mark();
  }
  chipGroup($("modes"), SD.MODES, () => mode, (m) => (mode = m));
  chipGroup($("speeds"), SD.SPEEDS, () => speed, (s) => (speed = s));

  function updateMeta() {
    const text = $("msg").value;
    const n = new TextEncoder().encode(text).length;
    const over = n > SD.MAX_BYTES;
    $("bytes").textContent = n + " / " + SD.MAX_BYTES + " bytes";
    $("bytes").className = over ? "over" : "";
    const symbols = (n + 2) * 2, marker = Math.max(speed.symbolMs * 3, 250) * 2;
    $("eta").textContent = n ? "About " + ((symbols * speed.symbolMs + marker) / 1000).toFixed(1) + " s" : "About 0 s";
    $("modeNote").textContent = mode.id === "silent"
      ? "Silent: tones at " + SD.toneHz(mode, 0).toLocaleString() + "–" + SD.toneHz(mode, SD.NUM_TONES - 1).toLocaleString() + " Hz, above what most people hear. Keep devices within 1–2 m."
      : "Audible: tones at " + SD.toneHz(mode, 0).toLocaleString() + "–" + SD.toneHz(mode, SD.NUM_TONES - 1).toLocaleString() + " Hz. Most reliable; works across a room.";
    $("sendBtn").disabled = over || !n;
  }
  $("msg").oninput = updateMeta;
  updateMeta();

  let tx = null, txTimer = null;
  function stopSending(reason) {
    if (tx) tx.stop();
    tx = null; clearInterval(txTimer);
    $("sendBtn").textContent = "Send through sound";
    $("prog").style.width = "0";
    if (reason) $("sendState").textContent = reason;
  }
  $("sendBtn").onclick = () => {
    $("sendErr").hidden = true;
    if (tx) { log("SEND_CANCEL"); return stopSending("Stopped."); }
    const c = audio();
    const out = c.createGain();
    if (!MUTE) out.connect(c.destination);
    if (LOOPBACK) out.connect(getLoopIn());
    const text = $("msg").value;
    try {
      tx = SD.transmit(c, out, text, { mode, speed, volume: +$("vol").value });
    } catch (e) {
      $("sendErr").textContent = e.message; $("sendErr").hidden = false; return;
    }
    log("SEND_START", mode.id, speed.id, "vol " + $("vol").value, tx.payloadBytes + " bytes", tx.tones.length + " tones", tx.duration.toFixed(2) + " s", JSON.stringify(text));
    $("sendBtn").textContent = "Stop";
    $("sendState").textContent = "Sending " + tx.payloadBytes + " bytes in " + mode.label + " mode…";
    const thisTx = tx;
    txTimer = setInterval(() => {
      if (!tx) return;
      $("prog").style.width = (tx.progress() * 100).toFixed(1) + "%";
      if (tx.progress() >= 1) { log("SEND_DONE"); stopSending("Sent. Check the receiving device."); }
    }, 50);
    void thisTx;
  };

  // ---------- receiver ----------
  let analyser = null, stream = null, rx = null, wake = null, micSettings = null, inboxCount = 0;
  function getLoopIn() {
    const c = audio();
    if (!loopIn) loopIn = c.createGain();
    return loopIn;
  }
  function setStatus(s, text) { $("status").dataset.s = s; $("statusText").textContent = text; }

  async function startListening() {
    $("micErr").hidden = true;
    const c = audio();
    analyser = c.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0; analyser.minDecibels = -150; analyser.maxDecibels = -10;
    if (LOOPBACK) {
      getLoopIn().connect(analyser);
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        $("micErr").textContent = "This browser blocks the microphone here. Open the page from its https address (GitHub Pages), not as a local file.";
        $("micErr").hidden = false; return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        log("MIC_ERROR", (e && e.name) || "error");
        $("micErr").textContent = "Microphone access was refused. Allow the microphone for this site in your browser settings, then tap Start listening again.";
        $("micErr").hidden = false; return;
      }
      try { micSettings = stream.getAudioTracks()[0].getSettings(); } catch (e) { micSettings = null; }
      c.createMediaStreamSource(stream).connect(analyser);
    }
    $("lvRate").textContent = Math.round(c.sampleRate / 1000) + " kHz";
    try { wake = await navigator.wakeLock.request("screen"); } catch (e) { wake = null; }
    let lastLevel = 0;
    rx = SD.createReceiver(c, analyser, {
      onState(s, m) {
        if (s === "idle") { setStatus("idle", "Listening… waiting for a message"); $("lvSym").textContent = "0"; }
        if (s === "receiving") {
          setStatus("receiving", "Receiving (" + SD.MODES[m].label + " mode)…");
          $("hero").className = "hero"; $("heroMsg").textContent = "Receiving…"; $("heroSub").textContent = "";
          log("RX_START", m);
        }
      },
      onSymbol(nib, count, r) { $("lvSym").textContent = count; },
      onLevel(l) {
        const now = performance.now();
        if (now - lastLevel < 120) return; lastLevel = now;
        $("lvSnr").textContent = l && l.snr > -50 ? l.snr.toFixed(0) + " dB" : "—";
      },
      onMessage(text, info) {
        log("RX_OK", info.mode, info.bytes + " bytes", info.nibbles + " symbols", (info.ms / 1000).toFixed(2) + " s", "snr " + info.avgSnr.toFixed(1), JSON.stringify(text));
        $("hero").className = "hero fresh"; $("heroMsg").textContent = text;
        $("heroSub").textContent = SD.MODES[info.mode].label + " mode · " + info.bytes + " bytes · " + (info.ms / 1000).toFixed(1) + " s · signal " + info.avgSnr.toFixed(0) + " dB";
        addInbox(text, info);
        if (navigator.vibrate) try { navigator.vibrate(80); } catch (e) {}
      },
      onError(msg, info) {
        log("RX_FAIL", info && info.mode, msg, info && info.nibbles != null ? info.nibbles + " symbols" : "", info && info.avgSnr != null ? "snr " + info.avgSnr.toFixed(1) : "");
        $("hero").className = "hero failed"; $("heroMsg").textContent = "Message not received";
        $("heroSub").textContent = msg + " Ask the sender to try again, a little closer or louder.";
      }
    });
    rx.start();
    log("LISTEN_START", "rate " + c.sampleRate, LOOPBACK ? "loopback" : JSON.stringify(micSettings || {}));
    $("listenBtn").textContent = "Stop listening";
  }
  function stopListening() {
    if (rx) rx.stop(); rx = null;
    if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null;
    if (analyser) try { analyser.disconnect(); } catch (e) {}
    analyser = null;
    if (wake) { wake.release().catch(() => {}); wake = null; }
    setStatus("off", "Not listening"); $("listenBtn").textContent = "Start listening";
    log("LISTEN_STOP");
  }
  $("listenBtn").onclick = () => (rx ? stopListening() : startListening());

  function addInbox(text, info) {
    const tb = $("inbox");
    if (!inboxCount) tb.innerHTML = "";
    inboxCount++;
    const tr = document.createElement("tr");
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const cells = [
      [p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()), "n"],
      [text, "m"],
      [SD.MODES[info.mode].label, ""],
      [String(info.bytes), "n"],
      [(info.ms / 1000).toFixed(1) + " s", "n"],
      [info.avgSnr.toFixed(0) + " dB", "n"]
    ];
    cells.forEach(([v, cls]) => { const td = document.createElement("td"); td.textContent = v; if (cls) td.className = cls; tr.appendChild(td); });
    tb.prepend(tr);
  }

  // expose a tiny hook for automated tests
  window.__sd = { show, startListening, getLoopIn, audio, log: () => logLines.slice(), setMode: (id) => { mode = SD.MODES[id]; }, setSpeed: (id) => { speed = SD.SPEEDS[id]; } };
  if (LOOPBACK) log("LOOPBACK_MODE");
})();
