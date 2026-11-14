import { useEffect, useRef, useState } from "react";
import { THEMES, useTheme } from "../hooks/ThemeContext.jsx";

// Small button in the top bar that opens a list of the three designs.
export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const current = THEMES.find((t) => t.id === theme);
  return (
    <div className="sd-themepick" ref={ref}>
      <button type="button" className="sd-themepick-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Swatch id={theme} />
        <span className="sd-themepick-label">{current.label}</span>
      </button>
      {open && (
        <div className="sd-themepick-menu" role="menu" aria-label="Design">
          <div className="sd-themepick-title">Design</div>
          {THEMES.map((t) => (
            <button key={t.id} role="menuitemradio" aria-checked={theme === t.id} className={"sd-themepick-item" + (theme === t.id ? " on" : "")}
              onClick={() => { setTheme(t.id); setOpen(false); }}>
              <Swatch id={t.id} />
              <span><strong>{t.label}</strong><small>{t.hint}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// tiny preview of each design
function Swatch({ id }) {
  if (id === "motion") return (
    <svg className="sd-swatch" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#2f5bea" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".45" />
      <rect x="6.5" y="10" width="2" height="4" rx="1" fill="#fff" /><rect x="9.5" y="7.5" width="2" height="9" rx="1" fill="#fff" />
      <rect x="12.5" y="9" width="2" height="6" rx="1" fill="#fff" /><rect x="15.5" y="10.5" width="2" height="3" rx="1" fill="#fff" />
    </svg>
  );
  if (id === "steampunk") return (
    <svg className="sd-swatch" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#b8873b" /><circle cx="12" cy="12" r="7.5" fill="#efe2c4" stroke="#6b4a1f" strokeWidth="1" />
      <path d="M12 12 L16.5 7.5" stroke="#7a2e24" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="12" r="1.4" fill="#2b1e12" />
    </svg>
  );
  if (id === "isometric") return (
    <svg className="sd-swatch" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 L21 8 L12 13 L3 8 Z" fill="#ffffff" stroke="#1c2340" strokeWidth="1" strokeLinejoin="round" />
      <path d="M3 8 L12 13 L12 22 L3 17 Z" fill="#c9d0e6" stroke="#1c2340" strokeWidth="1" strokeLinejoin="round" />
      <path d="M21 8 L12 13 L12 22 L21 17 Z" fill="#4b47d6" stroke="#1c2340" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
  return (
    <svg className="sd-swatch" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#0d8566" /><circle cx="12" cy="15.5" r="2.2" fill="#fff" />
      <path d="M8 11.5a5.5 5.5 0 0 1 8 0" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
