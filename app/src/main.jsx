/*
 * main.jsx: where the app starts.
 *
 * 1. Loads Bootstrap and our own styles.
 * 2. Follows the phone's light or dark setting.
 * 3. Keeps the browser's "install app" offer for the Install button.
 * 4. Draws the app: a navbar plus one of three pages (Home, Send, Receive).
 * 5. Registers the Service Worker (sw.js), which keeps the app working offline.
 */

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./app.css";
import { SoundDropProvider, useSoundDrop } from "./SoundDropContext.jsx";
import { HomePage, SendPage, ReceivePage } from "./pages.jsx";

// ---------- light / dark mode ----------
// Bootstrap 5 switches its colours with the data-bs-theme attribute on <html>.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const setMode = () => document.documentElement.setAttribute("data-bs-theme", dark.matches ? "dark" : "light");
setMode();
dark.addEventListener("change", setMode);       // follow the phone if it switches later

// ---------- install offer ----------
// Chrome, Edge and Android fire "beforeinstallprompt" when the app can be installed.
// We stop the browser's own banner and keep the event, so our Install button can show it.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.installPrompt = e;
  window.dispatchEvent(new Event("install-ready"));   // tells the Install card to show its button
});

// ---------- page routing ----------
// The page comes from the part of the address after "#": "#/send" -> "send".
// That part never reaches the server, so GitHub Pages always serves index.html
// and React picks the page. No routing library is needed.
const PAGES = { home: HomePage, send: SendPage, receive: ReceivePage };
const currentRoute = () => {
  const r = window.location.hash.replace(/^#\/?/, "");
  return PAGES[r] ? r : "home";
};

function useHashRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => { setRoute(currentRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);   // clean up when unmounted
  }, []);
  return route;
}

// ---------- navbar ----------
const LINKS = [["home", "Home", "#/"], ["send", "Send", "#/send"], ["receive", "Receive", "#/receive"]];

function NavBar({ route }) {
  const { listening } = useSoundDrop();          // green dot next to Receive while the microphone is on
  return (
    <nav className="navbar py-1 border-bottom bg-body sticky-top">
      <div className="container sd-container flex-nowrap">
        <a className="navbar-brand fw-bold d-flex align-items-center gap-2" href="#/">
          <img src="./icon.svg" width="26" height="26" alt="" /> SoundDrop
        </a>
        <div className="d-flex gap-1">
          {LINKS.map(([id, label, href]) => (
            <a key={id} href={href} className={"nav-link px-1 px-sm-2" + (route === id ? " active fw-semibold" : "")} aria-current={route === id ? "page" : undefined}>
              {label}{id === "receive" && listening && <span className="sd-dot" title="Listening" />}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ---------- the app ----------
// SoundDropProvider sits above every page, so listening keeps running while
// the user switches pages.
function App() {
  const route = useHashRoute();
  const Page = PAGES[route];
  return (
    <SoundDropProvider>
      <NavBar route={route} />
      <main className="container sd-container py-2">
        <Page />
      </main>
    </SoundDropProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ---------- offline ----------
// The Service Worker saves the app's files on the device so it opens without
// internet. Only in the built version (npm run build), not while developing.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
