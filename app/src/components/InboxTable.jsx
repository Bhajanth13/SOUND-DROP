import { summary, formatLabel } from "../lib/formats.js";
import { MODES } from "../lib/modem.js";

const two = (n) => String(n).padStart(2, "0");

export default function InboxTable({ items, onClear }) {
  return (
    <div className="card sd-card">
      <div className="card-header d-flex align-items-center justify-content-between">
        <h2 className="sd-h2 mb-0">Inbox</h2>
        {items.length > 0 && <button className="btn btn-sm btn-outline-secondary" onClick={onClear}>Clear</button>}
      </div>
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0 sd-table">
          <thead>
            <tr><th>Time</th><th>Type</th><th>Message</th><th>Mode</th><th className="text-end">Bytes</th><th className="text-end">Took</th><th className="text-end">Signal</th></tr>
          </thead>
          <tbody>
            {items.length === 0 && (<tr><td colSpan="7" className="text-body-secondary py-3">Nothing received yet. Messages you receive appear here.</td></tr>)}
            {items.map((it) => (
              <tr key={it.id}>
                <td className="tnum text-nowrap">{two(it.at.getHours())}:{two(it.at.getMinutes())}:{two(it.at.getSeconds())}</td>
                <td className="text-nowrap">{formatLabel(it.message.format)}</td>
                <td className="sd-cell-msg">{summary(it.message)}</td>
                <td>{MODES[it.info.mode].label}</td>
                <td className="text-end tnum">{it.info.bytes}</td>
                <td className="text-end tnum text-nowrap">{(it.info.ms / 1000).toFixed(1)} s</td>
                <td className="text-end tnum text-nowrap">{Math.round(it.info.avgSnr)} dB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
