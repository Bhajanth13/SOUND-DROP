import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "@fontsource/im-fell-english-sc/latin-400.css";
import "@fontsource/crimson-pro/latin-400.css";
import "@fontsource/crimson-pro/latin-600.css";
import "@fontsource/special-elite/latin-400.css";
import "@fontsource-variable/archivo/wdth.css";
import "./index.css";
import "./theme-steampunk.css";
import "./theme-isometric.css";
import App from "./App.jsx";

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
