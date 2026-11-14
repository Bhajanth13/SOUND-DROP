import { summary, formatLabel } from "../lib/formats.js";
import { MODES } from "../lib/modem.js";

const two = (n) => String(n).padStart(2, "0");
const time = (d) => two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());

// Received messages: a table on wide screens, a simple list on phones.
export default function InboxTable({ items, onClear }) {
  return (
    <section className="sd-panel">
      <div className="sd-panel-head">
        <h2 className="sd-h2">Inbox{items.length ? ` (${items.length})` : ""}</h2>
        {items.length > 0 && <button type="button" className="sd-btn-ghost" onClick={onClear}>Clear</button>}
      </div>
      {items.length === 0 && <p className="sd-empty">Messages you receive will be listed here.</p>}
      {items.length > 0 && (
        <>
          <ul className="sd-inbox-list">
            {items.map((it) => (
              <li key={it.id}>
                <div className="sd-inbox-top"><span className="sd-tag">{formatLabel(it.message.format)}</span><span className="sd-inbox-time">{time(it.at)}</span></div>
                <div className="sd-inbox-msg">{summary(it.message)}</div>
                <div className="sd-inbox-meta">{MODES[it.info.mode].label}, {it.info.bytes} bytes, {(it.info.ms / 1000).toFixed(1)} s, signal {Math.round(it.info.avgSnr)} dB</div>
              </li>
            ))}
          </ul>
          <div className="table-responsive sd-inbox-table">
            <table className="table table-sm align-middle mb-0 sd-table">
              <thead>
                <tr><th>Time</th><th>Type</th><th>Message</th><th>Mode</th><th className="text-end">Bytes</th><th className="text-end">Took</th><th className="text-end">Signal</th></tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="tnum text-nowrap">{time(it.at)}</td>
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
        </>
      )}
    </section>
  );
}
