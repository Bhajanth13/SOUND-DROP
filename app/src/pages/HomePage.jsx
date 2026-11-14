import { MODES, toneHz, NUM_TONES } from "../lib/modem.js";

const STEPS = [
  { title: "Compose", text: "Type a message or fill in a link, Wi-Fi details or a contact card. The form checks it before anything is sent." },
  { title: "Encode", text: "The message becomes bits. Every 4 bits pick one of 16 tones, with a start tone, a checksum and an end tone around them." },
  { title: "Transmit", text: "Your speaker plays the tones, a few dozen per second. In Silent mode they sit above 17,500 Hz, where most people hear nothing." },
  { title: "Listen and decode", text: "Every nearby device that is listening runs an FFT on its microphone, recognises the tones and checks the checksum before showing the message." }
];

export default function HomePage() {
  return (
    <div className="sd-page">
      <section className="sd-hero-home">
        <div className="row g-4 align-items-center">
          <div className="col-lg-7">
            <p className="sd-eyebrow">Data over sound</p>
            <h1 className="display-5 sd-display">Share a message with everyone in the room using only sound.</h1>
            <p className="lead">SoundDrop turns short text, links, Wi-Fi details and contact cards into a quick burst of tones. Phones and laptops nearby hear it and turn it back into text. No internet, Wi-Fi, Bluetooth or pairing.</p>
            <div className="d-flex gap-2 flex-wrap mt-3">
              <a className="btn btn-primary btn-lg" href="#/send">Send a message</a>
              <a className="btn btn-outline-primary btn-lg" href="#/receive">Receive</a>
            </div>
          </div>
          <div className="col-lg-5">
            <ToneDiagram />
          </div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="sd-section">How a message travels</h2>
        <div className="row g-3">
          {STEPS.map((s, i) => (
            <div className="col-sm-6 col-lg-3" key={s.title}>
              <div className="card sd-card h-100">
                <div className="card-body">
                  <div className="sd-step">{i + 1}</div>
                  <h3 className="h6 mt-2">{s.title}</h3>
                  <p className="small mb-0 text-body-secondary">{s.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="sd-section">Two modes</h2>
        <div className="row g-3">
          {Object.values(MODES).map((m) => (
            <div className="col-md-6" key={m.id}>
              <div className="card sd-card h-100">
                <div className="card-body">
                  <h3 className="h5">{m.label} mode</h3>
                  <p className="tnum mb-2">{toneHz(m, 0).toLocaleString("en-IN")}–{toneHz(m, NUM_TONES - 1).toLocaleString("en-IN")} Hz · {NUM_TONES} tones, {m.step} Hz apart</p>
                  <p className="small text-body-secondary mb-0">
                    {m.id === "audible"
                      ? "A clear chirp everyone can hear. The most reliable choice, and it works across a classroom."
                      : "Above the range most adults can hear, so the message seems to travel silently. Works best within 1–2 metres; check your devices in the Range Test Lab."}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <div className="card sd-card sd-callout">
          <div className="card-body d-flex flex-wrap gap-3 align-items-center justify-content-between">
            <div>
              <h2 className="h5 mb-1">Try it offline</h2>
              <p className="small mb-0 text-body-secondary">Open SoundDrop once while online on both devices. After that it works with airplane mode on.</p>
            </div>
            <a className="btn btn-outline-primary" href="#/lab">Open the Range Test Lab</a>
          </div>
        </div>
      </section>
    </div>
  );
}

// A small picture of a message as tones: frequency (up) against time (right).
function ToneDiagram() {
  const tones = [17, 0, 2, 4, 8, 6, 9, 14, 11, 18];   // real output of encode("Hi")
  const w = 320, h = 200, pad = 26, cw = (w - pad - 8) / tones.length;
  const y = (t) => h - pad - (t / 18) * (h - pad - 28);
  return (
    <figure className="card sd-card mb-0">
      <svg viewBox={`0 0 ${w} ${h}`} className="sd-diagram" role="img" aria-label="Diagram of a message as a sequence of tones over time">
        <line x1={pad} y1={h - pad} x2={w - 4} y2={h - pad} className="sd-axis" />
        <line x1={pad} y1={8} x2={pad} y2={h - pad} className="sd-axis" />
        <text x={pad} y={h - 8} className="sd-axis-label">time →</text>
        <text x={4} y={14} className="sd-axis-label">Hz</text>
        {tones.map((t, i) => (
          <rect key={i} x={pad + 4 + i * cw} y={y(t) - 4} width={cw - 3} height={8} rx={2} className={t >= 17 ? "sd-tone-mark" : "sd-tone"} />
        ))}
        <text x={pad + 6} y={y(17) - 9} className="sd-axis-label">start</text>
        <text x={pad + 4 + (tones.length - 1) * cw} y={y(18) - 9} className="sd-axis-label">end</text>
      </svg>
      <figcaption className="small text-body-secondary px-3 pb-3">The text "Hi" as SoundDrop tones: a start tone, the length, one tone per 4 bits, a checksum and an end tone.</figcaption>
    </figure>
  );
}
