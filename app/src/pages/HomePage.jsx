import { MODES, NUM_TONES, toneHz } from "../lib/modem.js";
import InstallApp from "../components/InstallApp.jsx";

const STEPS = [
  ["Type", "a short message or a contact card."],
  ["Encode", "every 4 bits become one of 16 tones, plus a checksum."],
  ["Play", "the speaker plays the tones."],
  ["Decode", "listening phones run an FFT and show the message."]
];
const khz = (hz) => (hz / 1000).toFixed(1);

export default function HomePage() {
  return (
    <div className="sd-narrow vstack gap-2">
      <section>
        <h1 className="h4 fw-bold mb-1">Share a message with everyone nearby using only sound.</h1>
        <p className="text-body-secondary mb-2">No internet, Wi-Fi, Bluetooth or pairing. Works in airplane mode.</p>
        <div className="d-flex gap-2">
          <a className="btn btn-primary flex-fill" href="#/send">Send a message</a>
          <a className="btn btn-outline-primary flex-fill" href="#/receive">Receive</a>
        </div>
      </section>

      <section>
        <h2 className="h6 mb-1">How it works</h2>
        <ol className="small mb-0 ps-3">
          {STEPS.map(([title, text]) => <li key={title}><strong>{title}:</strong> {text}</li>)}
        </ol>
      </section>

      <div className="row g-2">
        {Object.values(MODES).map((m) => (
          <div className="col-6" key={m.id}>
            <div className="card h-100"><div className="card-body p-2 small">
              <strong>{m.label}</strong> <span className="text-body-secondary">{khz(toneHz(m, 0))}–{khz(toneHz(m, NUM_TONES - 1))} kHz</span>
              <div className="text-body-secondary">{m.id === "audible" ? "A short chirp. Most reliable, across a room." : "Above adult hearing. Best within 1–2 m."}</div>
            </div></div>
          </div>
        ))}
      </div>

      <InstallApp />
      <p className="small text-body-secondary mb-0">CS1309 mini project · Bhajanth V, RV University</p>
    </div>
  );
}
