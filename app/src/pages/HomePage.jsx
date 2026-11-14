import { MODES, NUM_TONES, toneHz } from "../lib/modem.js";
import InstallApp from "../components/InstallApp.jsx";

const STEPS = [
  ["Type", "a message, a link or a contact card."],
  ["Encode", "every 4 bits become one of 16 tones, with a start tone, a checksum and an end tone."],
  ["Play", "the speaker plays the tones. In Silent mode they are above 17.5 kHz."],
  ["Decode", "every listening device runs an FFT on its microphone, checks the checksum and shows the message."]
];
const khz = (hz) => (hz / 1000).toFixed(1);

export default function HomePage() {
  return (
    <>
      <section className="py-3 py-md-5">
        <h1 className="display-6 fw-bold">Share a message with everyone nearby using only sound.</h1>
        <p className="lead text-body-secondary">No internet, Wi-Fi, Bluetooth or pairing. Works in airplane mode.</p>
        <div className="d-flex flex-wrap gap-2">
          <a className="btn btn-primary btn-lg" href="#/send">Send a message</a>
          <a className="btn btn-outline-primary btn-lg" href="#/receive">Receive</a>
        </div>
      </section>

      <h2 className="h5 mt-4">How it works</h2>
      <ol className="list-group list-group-numbered mb-4">
        {STEPS.map(([title, text]) => (
          <li key={title} className="list-group-item"><strong>{title}:</strong> {text}</li>
        ))}
      </ol>

      <h2 className="h5">Two modes</h2>
      <div className="row g-3 mb-4">
        {Object.values(MODES).map((m) => (
          <div className="col-md-6" key={m.id}>
            <div className="card h-100"><div className="card-body">
              <h3 className="h6 card-title">{m.label}: {khz(toneHz(m, 0))}–{khz(toneHz(m, NUM_TONES - 1))} kHz</h3>
              <p className="card-text text-body-secondary mb-0">
                {m.id === "audible" ? "A short chirp everyone hears. Most reliable; works across a classroom." : "Above what most adults can hear, so the message seems to travel silently. Best within 1–2 m."}
              </p>
            </div></div>
          </div>
        ))}
      </div>

      <InstallApp />
    </>
  );
}
