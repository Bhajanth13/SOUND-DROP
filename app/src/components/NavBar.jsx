import { useState } from "react";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";

const LINKS = [
  { id: "home", label: "Home", href: "#/" },
  { id: "send", label: "Send", href: "#/send" },
  { id: "receive", label: "Receive", href: "#/receive" },
  { id: "lab", label: "Range Test Lab", href: "#/lab" },
  { id: "about", label: "How it works", href: "#/about" }
];

export default function NavBar({ route }) {
  const [open, setOpen] = useState(false);
  const { listening, rxStatus } = useSoundDrop();
  return (
    <nav className="navbar navbar-expand-md sd-nav sticky-top">
      <div className="container sd-container">
        <a className="navbar-brand sd-brand" href="#/" onClick={() => setOpen(false)}>
          <Logo /> SoundDrop
        </a>
        {listening && (
          <a href="#/receive" className={"badge rounded-pill sd-live ms-auto me-2 d-md-none" + (rxStatus === "receiving" ? " busy" : "")}>
            {rxStatus === "receiving" ? "Receiving" : "Listening"}
          </a>
        )}
        <button className="navbar-toggler" type="button" aria-controls="sdNav" aria-expanded={open} aria-label="Open menu" onClick={() => setOpen((o) => !o)}>
          <span className="navbar-toggler-icon"></span>
        </button>
        <div id="sdNav" className={"collapse navbar-collapse" + (open ? " show" : "")}>
          <ul className="navbar-nav ms-auto">
            {LINKS.map((l) => (
              <li className="nav-item" key={l.id}>
                <a className={"nav-link" + (route === l.id ? " active" : "")} aria-current={route === l.id ? "page" : undefined} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
              </li>
            ))}
          </ul>
          {listening && (
            <a href="#/receive" className={"badge rounded-pill sd-live ms-3 d-none d-md-inline-block" + (rxStatus === "receiving" ? " busy" : "")}>
              {rxStatus === "receiving" ? "Receiving" : "Listening"}
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}

export function Logo({ size = 22 }) {
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
