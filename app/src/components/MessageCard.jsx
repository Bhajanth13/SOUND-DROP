import { formatLabel } from "../lib/formats.js";
import { MODES } from "../lib/modem.js";

// Shows one received message according to its format.
export default function MessageCard({ message: m, info }) {
  return (
    <div>
      <span className="badge text-bg-success mb-1">Received: {formatLabel(m.format)}</span>
      {m.format === "text" && <p className="fs-5 mb-1 text-break">{m.text}</p>}
      {m.format === "contact" && (
        <dl className="row mb-1 small">
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
