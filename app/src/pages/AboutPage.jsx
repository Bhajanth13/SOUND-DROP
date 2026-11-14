import { MODES, SPEEDS, MAX_BYTES, NUM_TONES, toneHz } from "../lib/modem.js";

const ROWS = [
  ["Modulation", "19-tone MFSK (multiple frequency-shift keying): 16 tones carry 4 bits each, plus REPEAT, START and END tones"],
  ["Audible band", `${toneHz(MODES.audible, 0).toLocaleString("en-IN")} – ${toneHz(MODES.audible, NUM_TONES - 1).toLocaleString("en-IN")} Hz, ${MODES.audible.step} Hz apart`],
  ["Silent band", `${toneHz(MODES.silent, 0).toLocaleString("en-IN")} – ${toneHz(MODES.silent, NUM_TONES - 1).toLocaleString("en-IN")} Hz, ${MODES.silent.step} Hz apart`],
  ["Symbol length", `${SPEEDS.normal.symbolMs} ms (Normal) or ${SPEEDS.fast.symbolMs} ms (Fast)`],
  ["Frame", `START · length byte · UTF-8 payload (up to ${MAX_BYTES} bytes) · CRC-8 checksum · END`],
  ["Sender", "Web Audio API: one oscillator that glides between tones, so there are no clicks"],
  ["Receiver", "Microphone (MediaDevices) into a Web Audio AudioWorklet that runs a 1,024-point FFT every 5 ms"],
  ["Echo handling", "The tone still ringing in the room is ignored; a new tone must stand out from the others and beat the ringing tone by 3 dB"],
  ["Offline", "A Service Worker keeps a copy of the app, so it opens without a network"]
];

const TECH = [
  ["HTML, CSS, JavaScript", "Page structure, styling and all the signal processing"],
  ["React", "Pages and reusable components; one shared audio engine for the whole app"],
  ["Bootstrap 5", "Responsive grid, forms, buttons, tables and validation styles"],
  ["Web Audio API", "Generates the tones and analyses the microphone with an FFT"],
  ["MediaDevices", "Microphone access, with echo cancellation and noise suppression turned off"],
  ["Service Worker", "Offline use after the first visit"],
  ["Vite", "Development server and production build"],
  ["GitHub Pages", "Free HTTPS hosting, which phones require for microphone access"]
];

export default function AboutPage() {
  return (
    <div className="sd-page">
      <header className="sd-page-head">
        <h1>How it works</h1>
        <p className="lead">SoundDrop is an acoustic modem in a web page: it sends data the way a dial-up modem did, but between a speaker and a microphone, with no network at all.</p>
      </header>

      <div className="row g-4">
        <div className="col-lg-7">
          <section className="card sd-card">
            <div className="card-body">
              <h2 className="sd-h2 mb-3">Signal design</h2>
              <dl className="sd-spec mb-0">
                {ROWS.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
              </dl>
            </div>
          </section>

          <section className="card sd-card mt-4">
            <div className="card-body">
              <h2 className="sd-h2 mb-3">Why the receiver needs no clock</h2>
              <p className="mb-2">A repeated value is sent as the REPEAT tone, so two neighbouring symbols are never the same tone. The receiver simply waits for the strongest tone to change: every change is a new symbol. The sender's speed does not need to be known in advance.</p>
              <p className="mb-0">At the end, the receiver checks the length byte and the CRC-8 checksum. A message damaged by noise is rejected instead of being shown wrong.</p>
            </div>
          </section>
        </div>

        <div className="col-lg-5">
          <section className="card sd-card">
            <div className="card-body">
              <h2 className="sd-h2 mb-3">Built with</h2>
              <ul className="list-group list-group-flush">
                {TECH.map(([k, v]) => (
                  <li className="list-group-item px-0" key={k}><div className="fw-semibold">{k}</div><div className="small text-body-secondary">{v}</div></li>
                ))}
              </ul>
            </div>
          </section>

          <section className="card sd-card mt-4">
            <div className="card-body">
              <h2 className="sd-h2 mb-2">Tips for a good transfer</h2>
              <ul className="small mb-0 ps-3">
                <li>Keep the devices within 1–2 m, speaker facing the microphone.</li>
                <li>Use Audible mode in noisy rooms; it is the most reliable.</li>
                <li>Check Silent mode on your devices with the Range Test Lab first.</li>
                <li>Keep the receiving phone's screen on while it listens.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
