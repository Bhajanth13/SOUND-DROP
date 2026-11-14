import { useState } from "react";
import { useSoundDrop } from "../hooks/SoundDropContext.jsx";

const stamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
};

// Test log: every message sent, received or failed on this device.
export default function LogPanel({ page }) {
  const { logLines, buildLog, clearLog } = useSoundDrop();
  const [msg, setMsg] = useState("");
  const save = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buildLog(page)], { type: "text/plain" }));
    a.download = "sounddrop-" + page + "-" + stamp() + ".txt";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setMsg("Saved " + a.download + ".");
  };
  return (
    <details className="sd-panel sd-details sd-log">
      <summary><span className="sd-h2">Test log</span> <span className="sd-muted">({logLines.length} entries)</span></summary>
      <div className="sd-log-body">
        <p className="sd-hint">Every message sent, received or failed on this device is recorded. Save the log on both devices to compare them.</p>
        <div className="sd-btnrow">
          <button type="button" className="sd-btn-ghost" onClick={save}>Save log (.txt)</button>
          <button type="button" className="sd-btn-ghost" onClick={() => { clearLog(); setMsg("Log cleared."); }}>Clear</button>
        </div>
        {msg && <p className="sd-hint" aria-live="polite">{msg}</p>}
      </div>
    </details>
  );
}
