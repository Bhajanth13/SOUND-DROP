import { useTheme } from "../hooks/ThemeContext.jsx";

// Signal strength, symbol count and microphone rate. Steampunk shows a brass
// needle gauge; the other designs show three compact readouts.
export default function SignalReadout({ signal, symbols, rate }) {
  const { theme } = useTheme();
  const items = [
    { k: "Signal", v: signal != null ? signal + " dB" : "—" },
    { k: "Symbols", v: String(symbols) },
    { k: "Mic", v: rate || "—" }
  ];
  if (theme === "steampunk") {
    const val = Math.max(0, Math.min(60, signal || 0));
    const angle = -90 + (val / 60) * 180;
    return (
      <div className="sd-gaugewrap">
        <svg className="sd-gauge" viewBox="0 0 200 118" role="img" aria-label={"Signal " + (signal != null ? signal + " decibels" : "not measured")}>
          <defs>
            <linearGradient id="gbrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2d389" /><stop offset="1" stopColor="#8a6126" /></linearGradient>
          </defs>
          <path d="M8 110 A92 92 0 0 1 192 110 Z" fill="url(#gbrass)" stroke="#3b2810" strokeWidth="2" />
          <path d="M20 110 A80 80 0 0 1 180 110 Z" fill="#efe2c4" />
          {[0, 10, 20, 30, 40, 50, 60].map((d) => {
            const a = (Math.PI * (180 - d * 3)) / 180, x1 = 100 + Math.cos(a) * 72, y1 = 110 - Math.sin(a) * 72, x2 = 100 + Math.cos(a) * 62, y2 = 110 - Math.sin(a) * 62;
            const tx = 100 + Math.cos(a) * 52, ty = 113 - Math.sin(a) * 52;
            return (
              <g key={d}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2b1e12" strokeWidth="2" />
                <text x={tx} y={ty} textAnchor="middle" className="sd-gauge-num">{d}</text>
              </g>
            );
          })}
          <path d="M28 110 A72 72 0 0 1 64 48" fill="none" stroke="#7a2e24" strokeWidth="5" opacity=".55" />
          <path d="M136 48 A72 72 0 0 1 172 110" fill="none" stroke="#3f7f74" strokeWidth="5" opacity=".7" />
          <g className="sd-needle" style={{ transform: `rotate(${angle}deg)` }}>
            <line x1="100" y1="110" x2="100" y2="40" stroke="#7a2e24" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="100" cy="110" r="7" fill="#2b1e12" stroke="#b8873b" strokeWidth="2" />
          <text x="100" y="92" textAnchor="middle" className="sd-gauge-unit">dB</text>
        </svg>
        <div className="sd-gauge-side">
          {items.map((i) => (<div key={i.k} className="sd-readout"><span className="k">{i.k}</span><span className="v">{i.v}</span></div>))}
        </div>
      </div>
    );
  }
  return (
    <div className="sd-readouts">
      {items.map((i) => (<div key={i.k} className="sd-readout"><span className="k">{i.k}</span><span className="v">{i.v}</span></div>))}
    </div>
  );
}
