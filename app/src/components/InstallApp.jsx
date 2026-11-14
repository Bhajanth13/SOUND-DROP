import { useEffect, useState } from "react";

// "Install app" card on the Home page. Chrome, Edge and Android offer a real
// install button; iPhone and iPad use Share > Add to Home Screen; when the app
// is already running installed, the card says it works offline.
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function InstallApp() {
  const [canPrompt, setCanPrompt] = useState(!!window.__sdInstall);
  const [installed, setInstalled] = useState(standalone);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const on = () => { setCanPrompt(!!window.__sdInstall); setInstalled(standalone()); };
    window.addEventListener("sd-install-ready", on);
    return () => window.removeEventListener("sd-install-ready", on);
  }, []);

  async function install() {
    const e = window.__sdInstall;
    if (!e) return;
    e.prompt();
    const choice = await e.userChoice.catch(() => null);
    window.__sdInstall = null; setCanPrompt(false);
    setMsg(choice && choice.outcome === "accepted" ? "Installed. Open SoundDrop from your home screen; it works offline." : "Not installed. You can install it later from this page.");
  }

  if (installed) {
    return (
      <section className="sd-panel sd-install">
        <strong>SoundDrop is installed</strong>
        <span className="sd-hint">It opens from your home screen and works with airplane mode on.</span>
      </section>
    );
  }
  return (
    <section className="sd-panel sd-install">
      <div>
        <strong>Install SoundDrop</strong>
        <span className="sd-hint">
          {canPrompt ? "Add it to your home screen. After installing, it opens and works with no internet."
            : ios() ? "In Safari, tap Share, then Add to Home Screen. After that it works with no internet."
            : "Use your browser menu: Install app, or Add to Home screen. After that it works with no internet."}
        </span>
      </div>
      {canPrompt && <button type="button" className="sd-send-btn sd-install-btn" onClick={install}>Install app</button>}
      {msg && <span className="sd-hint" aria-live="polite">{msg}</span>}
    </section>
  );
}
