// Small hash router: "#/send" -> "send". The part after # never reaches the
// server, so GitHub Pages always serves index.html and React picks the page.
import { useEffect, useState } from "react";

const ROUTES = ["home", "send", "receive"];
const current = () => {
  const r = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.includes(r) ? r : "home";
};

export function useHashRoute() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onChange = () => { setRoute(current()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
