import { MODES, toneHz, NUM_TONES } from "../lib/modem.js";
import HeroArt from "../components/HeroArt.jsx";

const STEPS = [
  { title: "Compose", text: "Type a message, a link, Wi-Fi details or a contact card." },
  { title: "Encode", text: "Every 4 bits become one of 16 tones, wrapped in a start tone, a checksum and an end tone." },
  { title: "Play", text: "Your speaker plays the tones. In Silent mode they sit above 17.5 kHz." },
  { title: "Decode", text: "Every listening device runs an FFT on its microphone, checks the checksum and shows the message." }
];

const khz = (hz) => (hz / 1000).toFixed(1).replace(/\.0$/, "");

export default function HomePage() {
  return (
    <div className="sd-page sd-home">
      <section className="sd-hero">
        <div className="sd-hero-text">
          <h1 className="sd-display">Share a message with everyone in the room using only sound.</h1>
          <p className="sd-lead">Text, links, Wi-Fi details and contact cards travel as a quick burst of tones. No internet, Wi-Fi, Bluetooth or pairing.</p>
          <div className="sd-hero-actions">
            <a className="sd-send-btn" href="#/send">Send a message</a>
            <a className="sd-btn-ghost big" href="#/receive">Receive</a>
          </div>
        </div>
        <div className="sd-hero-art"><HeroArt /></div>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">How a message travels</h2>
        <ol className="sd-steps">
          {STEPS.map((s) => (
            <li key={s.title}><strong>{s.title}</strong><span>{s.text}</span></li>
          ))}
        </ol>
      </section>

      <section className="sd-section">
        <h2 className="sd-section-title">Two modes</h2>
        <div className="sd-modes">
          {Object.values(MODES).map((m) => (
            <div className="sd-panel sd-mode" key={m.id}>
              <h3>{m.label}</h3>
              <p className="sd-mode-range tnum">{khz(toneHz(m, 0))}–{khz(toneHz(m, NUM_TONES - 1))} kHz</p>
              <p className="sd-hint">
                {m.id === "audible"
                  ? "A short chirp everyone can hear. The most reliable choice; works across a classroom."
                  : "Above what most adults hear, so the message seems to travel silently. Best within 1–2 m."}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="sd-section sd-more">
        <a className="sd-panel sd-linkcard" href="#/lab"><strong>Range Test Lab</strong><span>Check if Silent mode works on your devices</span></a>
        <a className="sd-panel sd-linkcard" href="#/about"><strong>How it works</strong><span>The signal design and the technology used</span></a>
      </section>

      <p className="sd-offline">Open SoundDrop once while online on both devices. After that it works with airplane mode on.</p>
    </div>
  );
}
