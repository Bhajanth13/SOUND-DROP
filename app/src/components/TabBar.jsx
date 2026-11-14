import { useSoundDrop } from "../hooks/SoundDropContext.jsx";

const TABS = [
  { id: "home", label: "Home", href: "#/", icon: <path d="M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z" /> },
  { id: "send", label: "Send", href: "#/send", icon: <path d="M4 12h9M13 7l6 5-6 5" /> },
  { id: "receive", label: "Receive", href: "#/receive", icon: <><path d="M12 4v10" /><path d="M7 10l5 5 5-5" /><path d="M5 19h14" /></> },
  { id: "lab", label: "Lab", href: "#/lab", icon: <><path d="M4 18c2-8 4-8 6 0s4 8 6-2 2-6 4-4" /></> }
];

// Bottom navigation for phones: thumb-reachable, always visible.
export default function TabBar({ route }) {
  const { listening, rxStatus } = useSoundDrop();
  return (
    <nav className="sd-tabbar" aria-label="Pages">
      {TABS.map((t) => (
        <a key={t.id} href={t.href} className={"sd-tab" + (route === t.id ? " active" : "")} aria-current={route === t.id ? "page" : undefined}>
          <span className="sd-tab-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
            {t.id === "receive" && listening && <span className={"sd-tab-dot" + (rxStatus === "receiving" ? " busy" : "")} />}
          </span>
          <span className="sd-tab-label">{t.label}</span>
        </a>
      ))}
    </nav>
  );
}
