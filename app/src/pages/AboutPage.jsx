import { MODES, SPEEDS, MAX_BYTES, NUM_TONES, toneHz } from "../lib/modem.js";

const k = (hz) => (hz / 1000).toFixed(2).replace(/0$/, "");
const ROWS = [
  ["Modulation", "19-tone MFSK: 16 tones carry 4 bits each, plus REPEAT, START and END tones"],
  ["Audible band", `${k(toneHz(MODES.audible, 0))}–${k(toneHz(MODES.audible, NUM_TONES - 1))} kHz, ${MODES.audible.step} Hz apart`],
  ["Silent band", `${k(toneHz(MODES.silent, 0))}–${k(toneHz(MODES.silent, NUM_TONES - 1))} kHz, ${MODES.silent.step} Hz apart`],
  ["Tone length", `${SPEEDS.normal.symbolMs} ms (Normal) or ${SPEEDS.fast.symbolMs} ms (Fast)`],
  ["Message", `START, 0.6 s calibration sweep, length byte, up to ${MAX_BYTES} bytes of UTF-8 text, CRC-16, END`],
  ["Sender", "Web Audio oscillator that glides between tones, so there are no clicks"],
  ["Receiver", "Microphone into a Web Audio AudioWorklet running a 1,024-point FFT every 5 ms"],
  ["Calibration", "The receiver measures how loud each tone arrives during the sweep and boosts weak ones"],
  ["Repair", "A missed, extra or wrong tone is rebuilt from the timing when exactly one choice passes the CRC-16"],
  ["Offline", "A Service Worker keeps a copy of the app, so it opens without a network"]
];

const TECH = [
  ["HTML, CSS, JavaScript", "Page structure, styling and all the signal processing"],
  ["React", "Pages, reusable components and one shared audio engine"],
  ["Bootstrap 5", "Responsive grid, forms and validation styles"],
  ["Web Audio API", "Makes the tones and analyses the microphone with an FFT"],
  ["MediaDevices", "Microphone access with echo cancellation and noise suppression off"],
  ["Service Worker", "Offline use after the first visit"],
  ["Vite", "Development server and production build"],
  ["GitHub Pages", "Free HTTPS hosting, which phones need for microphone access"]
];

export default function AboutPage() {
  return (
    <div className="sd-page sd-about">
      <header className="sd-page-head">
        <h1>How it works</h1>
        <p className="sd-lead">An acoustic modem in a web page: it sends data the way dial-up modems did, between a speaker and a microphone.</p>
      </header>
      <div className="sd-grid-2">
        <section className="sd-panel">
          <h2 className="sd-h2">Signal design</h2>
          <dl className="sd-spec">{ROWS.map(([a, b]) => (<div key={a}><dt>{a}</dt><dd>{b}</dd></div>))}</dl>
          <p className="sd-hint">A repeated value is sent as the REPEAT tone, so two neighbouring tones always differ. The receiver needs no clock: every change of the strongest tone is a new symbol.</p>
        </section>
        <div className="sd-stack">
          <section className="sd-panel">
            <h2 className="sd-h2">Built with</h2>
            <dl className="sd-spec">{TECH.map(([a, b]) => (<div key={a}><dt>{a}</dt><dd>{b}</dd></div>))}</dl>
          </section>
          <section className="sd-panel">
            <h2 className="sd-h2">Tips for a good transfer</h2>
            <ul className="sd-tips">
              <li>Keep the devices within 1–2 m, speaker facing the microphone.</li>
              <li>Use Audible mode in noisy rooms.</li>
              <li>Check Silent mode with the Range Test Lab first.</li>
              <li>Keep the receiving phone's screen on while it listens.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
