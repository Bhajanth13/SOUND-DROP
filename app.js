/*
 * app.js: connects the page (index.html) to the sound engine (modem.js).
 *
 * HTML and CSS already do the pages, the format and mode switching and the
 * form checks. This file only does what they cannot:
 *   1. Send:    keep the size meter up to date, play the message, show progress
 *   2. Receive: open the microphone, show the status, the message and the inbox
 *   3. Offline: register the Service Worker (sw.js)
 */
import { MODES, MAX_BYTES, airTime, transmit, createReceiver, byteLength, pack, unpack } from "./modem.js";

const $ = (id) => document.getElementById(id);
const LOOPBACK = new URLSearchParams(location.search).has("loopback");   // test mode: sound goes straight to the receiver

// One AudioContext (the browser's sound system) for the whole app; it starts after a tap.
let ctx = null, loopNode = null;
function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
const loop = () => loopNode || (loopNode = audio().createGain());

// =====================================================================
// 1. Send
// =====================================================================
const form = $("send-form");
const format = () => form.format.value;                      // "text" or "contact"
const values = () => ({ text: $("text").value, name: $("name").value, phone: $("phone").value, email: $("email").value });
const message = () => pack(format(), values());

// Size meter: bytes used of 120 and the time the message will take.
function updateSize() {
  const bytes = byteLength(message()), over = bytes > MAX_BYTES;
  $("size-text").textContent = bytes + " of " + MAX_BYTES + " bytes";
  $("size-time").textContent = "about " + airTime(bytes).toFixed(1) + " s";
  $("size-bar").style.width = Math.min(100, (bytes / MAX_BYTES) * 100) + "%";
  $("size-bar").classList.toggle("bg-danger", over);
  $("size-error").hidden = !over;
  $("size-error").textContent = "This message is " + bytes + " bytes. Shorten it to " + MAX_BYTES + " bytes or less.";
  $("text").setCustomValidity($("text").value.trim() ? "" : "empty");   // spaces only is not a message
  return !over;
}

form.addEventListener("input", updateSize);
form.addEventListener("change", (e) => {
  if (e.target.name === "format") {                          // only the visible fields are checked
    form.querySelector(".only-text").disabled = format() !== "text";
    form.querySelector(".only-contact").disabled = format() !== "contact";
    form.classList.remove("was-validated");
  }
  updateSize();
});
$("volume").addEventListener("input", () => { $("volume-out").value = Math.round($("volume").value * 100); });

// Sending: transmit() schedules the whole message at once; the timer only moves the progress bar.
let tx = null, timer = null;
function showSending(on, progress = 0) {
  $("send-btn").textContent = on ? "Stop sending" : "Send through sound";
  $("send-btn").classList.toggle("btn-danger", on);
  $("send-btn").classList.toggle("btn-primary", !on);
  $("send-bar").style.width = progress * 100 + "%";
}
function stopSending() {
  if (tx) tx.stop();
  tx = null; clearInterval(timer); showSending(false);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();                                        // stop the browser reloading the page
  if (tx) return stopSending();                              // the same button stops a message
  form.classList.add("was-validated");                       // Bootstrap now shows the errors
  const sizeOk = updateSize();
  if (!form.checkValidity() || !sizeOk) return;
  const c = audio();
  tx = transmit(c, LOOPBACK ? loop() : c.destination, message(), { mode: MODES[form.mode.value], volume: +$("volume").value });
  showSending(true);
  timer = setInterval(() => (tx.progress() >= 1 ? stopSending() : showSending(true, tx.progress())), 100);
});

// =====================================================================
// 2. Receive
// =====================================================================
let rx = null, mic = null, rxMode = null;
let inbox = [];

const infoLine = (i) => MODES[i.mode].label + " mode, " + i.bytes + " bytes in " + (i.ms / 1000).toFixed(1) + " s, signal " + Math.round(i.avgSnr) + " dB";

function setStatus(state) {
  $("status").textContent = !rx ? "Tap Listen to start."
    : state === "receiving" ? "Receiving " + MODES[rxMode].label + " message…"
    : "Listening (Audible and Silent)…";
}

// The result card: copy the template for the message type and fill in the text.
function showMessage(m, info) {
  const card = $(m.format === "contact" ? "tpl-contact" : "tpl-text").content.cloneNode(true);
  const field = (f) => card.querySelector('[data-f="' + f + '"]');
  if (m.format === "contact") {
    field("name").textContent = m.name;
    field("phone").textContent = m.phone;
    field("email").textContent = m.email;
    field("email").hidden = field("email-label").hidden = !m.email;
  } else field("text").textContent = m.text;
  field("info").textContent = infoLine(info);
  $("result").replaceChildren(card);
}

function showInbox() {
  $("inbox-count").textContent = inbox.length;
  $("inbox-empty").hidden = inbox.length > 0;
  $("clear-btn").hidden = inbox.length === 0;
  $("inbox").replaceChildren(...inbox.map(({ m, info, at }) => {
    const li = document.createElement("li");
    li.className = "list-group-item px-0 py-1 small d-flex justify-content-between gap-2";
    li.innerHTML = '<span class="text-break"></span><span class="text-body-secondary text-nowrap"></span>';
    li.children[0].textContent = m.format === "contact" ? "Contact: " + m.name : m.text;
    li.children[1].textContent = MODES[info.mode].label + ", " + at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return li;
  }));
}
$("clear-btn").addEventListener("click", () => { inbox = []; showInbox(); });

// Opens the microphone, then createReceiver() runs the FFT detector on it.
async function startListening() {
  const c = audio();
  $("mic-error").hidden = true;
  let source;
  if (LOOPBACK) source = loop();
  else {
    try {   // voice-call filters off: they would remove steady tones as "noise"
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      source = c.createMediaStreamSource(mic);
    } catch (e) { $("mic-error").hidden = false; return; }
  }
  rx = await createReceiver(c, source, {
    onState(state, mode) {
      if (state === "receiving") {
        rxMode = mode;
        $("result").innerHTML = '<p class="mb-0">Receiving… <span id="tone-count">0</span> tones so far</p>';
      }
      setStatus(state);
    },
    onSymbol: (n) => { if ($("tone-count")) $("tone-count").textContent = n; },
    onLevel(snr) {
      $("signal").hidden = false;
      $("signal").textContent = snr > 3 ? "Signal: " + Math.round(snr) + " dB above background noise" : "No tones heard yet";
    },
    onMessage(text, info) {
      const m = unpack(text);
      showMessage(m, info);
      inbox.unshift({ m, info, at: new Date() });
      showInbox();
    },
    onError(error) {
      $("result").innerHTML = '<p class="text-danger mb-0"><strong>Message not received.</strong> ' + error + " Try again, a little closer or louder.</p>";
    }
  });
  rx.start();
  document.body.classList.add("listening");                  // green dot in the navbar
  $("listen-btn").textContent = "Stop";
  $("listen-btn").classList.replace("btn-primary", "btn-danger");
  setStatus("idle");
}

function stopListening() {
  rx.stop();
  if (mic) mic.getTracks().forEach((t) => t.stop());        // turns the microphone off
  rx = mic = null;
  document.body.classList.remove("listening");
  $("listen-btn").textContent = "Listen";
  $("listen-btn").classList.replace("btn-danger", "btn-primary");
  $("signal").hidden = true;
  setStatus("off");
}
$("listen-btn").addEventListener("click", () => (rx ? stopListening() : startListening()));

// =====================================================================
// 3. Start
// =====================================================================
updateSize();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");   // saves the app for offline use
