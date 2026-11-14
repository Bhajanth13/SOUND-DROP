import { safeHref, formatLabel } from "../lib/formats.js";
import { MODES } from "../lib/modem.js";

// Shows one received message according to its format.
export default function MessageCard({ message: m, info }) {
  const href = m.format === "link" ? safeHref(m.url) : null;   // only http(s) links are clickable
  return (
    <div>
      <span className="badge text-bg-success mb-2">Received: {formatLabel(m.format)}</span>
      {m.format === "text" && <p className="fs-5 mb-2 text-break">{m.text}</p>}
      {m.format === "link" && <p className="fs-5 mb-2 text-break">{href ? <a href={href} target="_blank" rel="noopener noreferrer">{m.url}</a> : m.url}</p>}
      {m.format === "wifi" && (
        <dl className="row mb-2">
          <dt className="col-4">Network</dt><dd className="col-8">{m.ssid}</dd>
          <dt className="col-4">Password</dt><dd className="col-8 font-monospace text-break">{m.security === "nopass" ? "None (open)" : m.password}</dd>
        </dl>
      )}
      {m.format === "contact" && (
        <dl className="row mb-2">
          <dt className="col-4">Name</dt><dd className="col-8">{m.name}</dd>
          <dt className="col-4">Phone</dt><dd className="col-8">{m.phone}</dd>
          {m.email && <><dt className="col-4">Email</dt><dd className="col-8 text-break">{m.email}</dd></>}
        </dl>
      )}
      <div className="small text-body-secondary">
        {MODES[info.mode].label} mode, {info.bytes} bytes in {(info.ms / 1000).toFixed(1)} s, signal {Math.round(info.avgSnr)} dB
      </div>
    </div>
  );
}
