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
  // three sound arcs dropping into a dot
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="sd-logo">
      <circle cx="12" cy="17" r="2.6" fill="currentColor" />
      <path d="M7.5 12.5a6.4 6.4 0 0 1 9 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.6 9.4a10.4 10.4 0 0 1 14.8 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <path d="M1.8 6.3a14.4 14.4 0 0 1 20.4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".4" />
    </svg>
  );
}
