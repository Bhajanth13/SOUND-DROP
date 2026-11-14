import { useSoundDrop } from "../hooks/SoundDropContext.jsx";
import ThemePicker from "./ThemePicker.jsx";

export const LINKS = [
  { id: "home", label: "Home", href: "#/" },
  { id: "send", label: "Send", href: "#/send" },
  { id: "receive", label: "Receive", href: "#/receive" },
  { id: "lab", label: "Range Test Lab", short: "Lab", href: "#/lab" },
  { id: "about", label: "How it works", href: "#/about" }
];

// Top bar. On phones it only holds the name, the listening badge and the design
// picker; page links move to the bottom tab bar.
export default function NavBar({ route }) {
  const { listening, rxStatus } = useSoundDrop();
  return (
    <header className="sd-top">
      <div className="sd-top-inner sd-container">
        <a className="sd-brand" href="#/"><Logo /> <span>SoundDrop</span></a>
        <nav className="sd-toplinks" aria-label="Pages">
          {LINKS.map((l) => (
            <a key={l.id} href={l.href} className={"sd-toplink" + (route === l.id ? " active" : "")} aria-current={route === l.id ? "page" : undefined}>{l.label}</a>
          ))}
        </nav>
        <div className="sd-top-right">
          {listening && (
            <a href="#/receive" className={"sd-live" + (rxStatus === "receiving" ? " busy" : "")}>
              {rxStatus === "receiving" ? "Receiving" : "Listening"}
            </a>
          )}
          <ThemePicker />
        </div>
      </div>
    </header>
  );
}

export function Logo({ size = 24 }) {
  // a drop with sound bars inside: the app icon
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className="sd-logo">
      <path d="M256 40 C 256 40 104 210 104 316 a152 152 0 0 0 304 0 C 408 210 256 40 256 40 Z" fill="currentColor" />
      <g fill="var(--sd-surface, #fff)">
        <rect x="180" y="296" width="30" height="56" rx="15" /><rect x="226" y="246" width="30" height="156" rx="15" />
        <rect x="272" y="274" width="30" height="100" rx="15" /><rect x="318" y="302" width="30" height="44" rx="15" />
      </g>
    </svg>
  );
}
