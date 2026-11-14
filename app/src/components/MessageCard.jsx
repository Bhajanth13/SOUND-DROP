import { safeHref, formatLabel } from "../lib/formats.js";
import { MODES } from "../lib/modem.js";

// Shows one received message according to its format.
export default function MessageCard({ message, info }) {
  const m = message;
  return (
    <div className="sd-message">
      <span className="badge text-bg-primary sd-format">{formatLabel(m.format)}</span>
      {m.format === "text" && <p className="sd-message-text">{m.text}</p>}
      {m.format === "link" && (
        <p className="sd-message-text">
          {safeHref(m.url) ? <a href={safeHref(m.url)} target="_blank" rel="noopener noreferrer">{m.url}</a> : m.url}
        </p>
      )}
      {m.format === "wifi" && (
        <dl className="sd-fields">
          <dt>Network</dt><dd>{m.ssid}</dd>
          <dt>Password</dt><dd className="font-monospace">{m.security === "nopass" ? "None (open network)" : m.password}</dd>
          <dt>Security</dt><dd>{m.security === "nopass" ? "Open" : m.security}</dd>
        </dl>
      )}
      {m.format === "contact" && (
        <dl className="sd-fields">
          <dt>Name</dt><dd>{m.name}</dd>
          <dt>Phone</dt><dd className="tnum">{m.phone}</dd>
          {m.email && (<><dt>Email</dt><dd>{m.email}</dd></>)}
        </dl>
      )}
      {info && (
        <div className="sd-message-meta tnum">
          {MODES[info.mode].label} mode · {info.bytes} bytes · {(info.ms / 1000).toFixed(1)} s · signal {Math.round(info.avgSnr)} dB
        </div>
      )}
    </div>
  );
}
