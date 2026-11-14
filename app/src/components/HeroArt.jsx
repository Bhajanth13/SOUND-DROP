import { useTheme } from "../hooks/ThemeContext.jsx";

// Real output of encode("Hi"): START, length, data, CRC-16, END
const HI = [17, 0, 2, 4, 8, 6, 9, 6, 4, 14, 5, 18];

export default function HeroArt() {
  const { theme } = useTheme();
  if (theme === "steampunk") return <SteamArt />;
  if (theme === "isometric") return <IsoArt />;
  if (theme === "motion") return <MotionArt />;
  return <ClassicArt />;
}

// ---------- Classic: tones over time ----------
function ClassicArt() {
  const w = 320, h = 200, pad = 26, cw = (w - pad - 8) / HI.length;
  const y = (t) => h - pad - (t / 18) * (h - pad - 28);
  return (
    <figure className="sd-art sd-art-classic">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="The text Hi as a sequence of tones over time">
        <line x1={pad} y1={h - pad} x2={w - 4} y2={h - pad} className="sd-axis" />
        <line x1={pad} y1={8} x2={pad} y2={h - pad} className="sd-axis" />
        <text x={pad} y={h - 8} className="sd-axis-label">time</text>
        <text x={4} y={14} className="sd-axis-label">Hz</text>
        {HI.map((t, i) => (
          <rect key={i} x={pad + 4 + i * cw} y={y(t) - 4} width={cw - 3} height={8} rx={2} className={t >= 17 ? "sd-tone-mark" : "sd-tone"} />
        ))}
      </svg>
      <figcaption>"Hi" as SoundDrop tones: a start tone, one tone per 4 bits, a checksum and an end tone.</figcaption>
    </figure>
  );
}

// ---------- Steampunk: brass horn printing the tones on telegraph tape ----------
function SteamArt() {
  return (
    <figure className="sd-art sd-art-steam">
      <svg viewBox="0 0 340 230" role="img" aria-label="A brass gramophone horn sending sound waves, with the tones of Hi punched into a telegraph tape">
        <defs>
          <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2d389" /><stop offset=".45" stopColor="#c99a45" /><stop offset="1" stopColor="#7a5520" />
          </linearGradient>
          <radialGradient id="bell" cx=".3" cy=".4" r=".8">
            <stop offset="0" stopColor="#3a2614" /><stop offset="1" stopColor="#120b05" />
          </radialGradient>
        </defs>
        {/* cog behind the horn */}
        <g className="sd-cog" transform="translate(70 70)">
          <Cog r={34} teeth={12} />
        </g>
        {/* horn */}
        <path d="M30 128 L60 120 C110 110 150 70 178 40 L196 196 C160 160 110 140 60 140 L30 136 Z" fill="url(#brass)" stroke="#5b3d15" strokeWidth="2" />
        <ellipse cx="187" cy="118" rx="16" ry="79" fill="url(#bell)" stroke="#5b3d15" strokeWidth="3" />
        <rect x="14" y="122" width="22" height="20" rx="3" fill="#7a5520" stroke="#3b2810" strokeWidth="2" />
        {[0, 1, 2, 3].map((i) => <circle key={i} cx={66 + i * 30} cy={124 - i * 9 + (i === 3 ? -14 : 0)} r="2.2" fill="#5b3d15" />)}
        {/* sound waves */}
        {[0, 1, 2].map((i) => (
          <path key={i} className={"sd-wave w" + i} d={`M${214 + i * 26} ${62 - i * 10} Q${244 + i * 30} 118 ${214 + i * 26} ${174 + i * 10}`} fill="none" stroke="#efe2c4" strokeWidth="2.4" strokeDasharray="7 6" strokeLinecap="round" />
        ))}
        {/* telegraph tape with the tones of "Hi" punched as holes */}
        <g transform="translate(16 206)">
          <rect x="0" y="-12" width="308" height="24" fill="#efe2c4" stroke="#6b4a1f" strokeWidth="1.5" />
          {HI.map((t, i) => (
            <circle key={i} cx={14 + i * 25.5} cy={-8 + (t / 18) * 16} r="3" fill={t >= 17 ? "#7a2e24" : "#2b1e12"} />
          ))}
        </g>
      </svg>
      <figcaption>The horn plays "Hi" as tones; the tape shows each tone's pitch, punched in order.</figcaption>
    </figure>
  );
}

function Cog({ r, teeth }) {
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth, rr = i % 2 ? r : r + 7;
    pts.push([Math.cos(a - 0.12) * rr, Math.sin(a - 0.12) * rr], [Math.cos(a + 0.12) * rr, Math.sin(a + 0.12) * rr]);
  }
  return (
    <g>
      <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="#5a3d1c" stroke="#3b2810" strokeWidth="1.5" />
      <circle r={r * 0.45} fill="#2a1d14" stroke="#b8873b" strokeWidth="2" />
    </g>
  );
}

// ---------- Isometric: desk with laptop and phone, tone cubes travelling ----------
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
const P = (x, y, z, s = 10, ox = 170, oy = 70) => [ox + (x - y) * C30 * s, oy + (x + y) * S30 * s - z * s];
const pts = (arr) => arr.map((p) => p.join(",")).join(" ");
function Box({ x, y, z = 0, w, d, h, top, left, right, className }) {
  const A = P(x, y, z + h), B = P(x + w, y, z + h), Cc = P(x + w, y + d, z + h), D = P(x, y + d, z + h);
  const E = P(x + w, y + d, z), F = P(x, y + d, z), G = P(x + w, y, z);
  return (
    <g className={className}>
      <polygon points={pts([D, Cc, E, F])} fill={left} />
      <polygon points={pts([B, Cc, E, G])} fill={right} />
      <polygon points={pts([A, B, Cc, D])} fill={top} />
      <polygon points={pts([A, B, Cc, D])} fill="none" stroke="#1c2340" strokeWidth="1.2" strokeLinejoin="round" />
      <polyline points={pts([D, F, E, G, B])} fill="none" stroke="#1c2340" strokeWidth="1.2" strokeLinejoin="round" />
      <line x1={Cc[0]} y1={Cc[1]} x2={E[0]} y2={E[1]} stroke="#1c2340" strokeWidth="1.2" />
    </g>
  );
}
const CUBE_COLORS = ["#4b47d6", "#19b5c9", "#ffc43d", "#4b47d6", "#19b5c9", "#ffc43d"];
function IsoArt() {
  return (
    <figure className="sd-art sd-art-iso">
      <svg viewBox="0 0 340 250" role="img" aria-label="A laptop and a phone on a desk, with small cubes of sound travelling from the laptop to the phone">
        {/* desk slab */}
        <Box x={-2} y={-2} z={-1.2} w={22} d={14} h={1.2} top="#ffffff" left="#c9d0e6" right="#aab4d3" />
        {/* laptop: base + screen */}
        <Box x={1} y={2} w={7} d={6} h={0.6} top="#dfe4f2" left="#b9c2da" right="#9aa5c6" />
        <Box x={1} y={2} z={0.6} w={0.5} d={6} h={5} top="#1c2340" left="#2b3561" right="#4b47d6" />
        {/* phone */}
        <Box x={15} y={4} w={2.4} d={4.4} h={0.5} top="#1c2340" left="#2b3561" right="#3a4580" />
        <polygon points={pts([P(15.3, 4.3, 0.52), P(17.1, 4.3, 0.52), P(17.1, 8.1, 0.52), P(15.3, 8.1, 0.52)])} fill="#19b5c9" opacity=".85" />
        {/* tone cubes along the path */}
        <g className="sd-iso-path">
          {CUBE_COLORS.map((c, i) => (
            <g key={i} className={"sd-cube c" + i}>
              <Box x={9 + i * 1.0} y={5} z={1.4 + Math.sin(i * 1.3) * 0.8} w={0.7} d={0.7} h={0.7} top="#ffffff" left={c} right={c} />
            </g>
          ))}
        </g>
      </svg>
      <figcaption>Each cube is one tone: the laptop plays them, the phone hears them and rebuilds the message.</figcaption>
    </figure>
  );
}

// ---------- Motion: a playhead plays "Hi" tone by tone, rings spread from each tone ----------
function MotionArt() {
  const w = 320, h = 210, pad = 18, cw = (w - pad * 2) / HI.length;
  const y = (t) => h - 34 - (t / 18) * (h - 70);
  const step = 0.28;                                   // seconds per tone in the animation
  return (
    <figure className="sd-art sd-art-motion">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="The text Hi played as tones, one after another">
        <line x1={pad} y1={h - 22} x2={w - pad} y2={h - 22} className="sd-axis" />
        {HI.map((t, i) => {
          const cx = pad + i * cw + cw / 2;
          return (
            <g key={i} style={{ "--d": (i * step) + "s" }}>
              <circle cx={cx} cy={y(t)} r="5" className="sd-mo-ring" />
              <rect x={pad + i * cw + 3} y={y(t) - 5} width={cw - 6} height={10} rx={5} className={"sd-mo-tone" + (t >= 17 ? " mark" : "")} />
            </g>
          );
        })}
        <line className="sd-mo-playhead" x1={pad} y1={14} x2={pad} y2={h - 22} style={{ "--run": (HI.length * step) + "s" }} />
        <text x={pad} y={h - 6} className="sd-axis-label">time</text>
      </svg>
      <figcaption>"Hi" played as SoundDrop tones, one tone every few hundredths of a second.</figcaption>
    </figure>
  );
}
