// Small hash router: #/send -> "send". Hash routes work on GitHub Pages
// without any server configuration, and need no extra library.
import { useEffect, useState } from "react";

export const ROUTES = ["home", "send", "receive", "lab", "about"];

function current() {
  const r = window.location.hash.replace(/^#\/?/, "").split(/[?/]/)[0];
  return ROUTES.includes(r) ? r : "home";
}

export function navigate(route) {
  window.location.hash = route === "home" ? "#/" : "#/" + route;
}

export function useHashRoute() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => { setRoute(current()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
