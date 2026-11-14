import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import App from "./App.jsx";

// Follow the phone's light or dark setting (Bootstrap 5.3 colour modes).
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.setAttribute("data-bs-theme", dark.matches ? "dark" : "light");
applyTheme();
dark.addEventListener("change", applyTheme);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker: keeps a copy of the app so it opens offline (production only).
if (import.meta.env.PROD && "serviceWorker" in navigator && !new URLSearchParams(location.search).has("nosw")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
