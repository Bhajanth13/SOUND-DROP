import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./app.css";
import App from "./App.jsx";

// Follow the phone's light or dark setting (Bootstrap colour modes).
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const setMode = () => document.documentElement.setAttribute("data-bs-theme", dark.matches ? "dark" : "light");
setMode();
dark.addEventListener("change", setMode);

// Keep the browser's install offer (Chrome, Edge, Android) for the Install button.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.installPrompt = e;
  window.dispatchEvent(new Event("install-ready"));
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker: saves the app on the device so it opens offline (production build only).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
