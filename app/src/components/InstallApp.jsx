import { useEffect, useState } from "react";

// Install card. Chrome, Edge and Android give an install prompt (saved in main.jsx);
// iPhone uses Share > Add to Home Screen. Once installed, SoundDrop opens offline.
const installed = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export default function InstallApp() {
  const [canInstall, setCanInstall] = useState(!!window.installPrompt);
  useEffect(() => {
    const onReady = () => setCanInstall(!!window.installPrompt);
    window.addEventListener("install-ready", onReady);
    return () => window.removeEventListener("install-ready", onReady);
  }, []);

  async function install() {
    window.installPrompt.prompt();
    await window.installPrompt.userChoice;
    window.installPrompt = null;
    setCanInstall(false);
  }

  return (
    <div className="card border-primary-subtle"><div className="card-body p-2 d-flex align-items-center gap-2 small">
      <div className="flex-grow-1">
        <strong>{installed() ? "SoundDrop is installed" : "Install SoundDrop"}</strong>
        <div className="small text-body-secondary">
          {installed() ? "It opens from your home screen and works with no internet."
            : canInstall ? "Add it to your home screen. After that it works with no internet."
            : "Browser menu: Install app or Add to Home Screen (iPhone: Share first)."}
        </div>
      </div>
      {canInstall && !installed() && <button type="button" className="btn btn-primary btn-sm text-nowrap" onClick={install}>Install app</button>}
    </div></div>
  );
}
