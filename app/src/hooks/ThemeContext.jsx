// Visual design chosen by the user: Classic, Steampunk or Isometric.
// Stored in the browser so it is remembered; ?theme=steampunk in the address
// opens a design directly (handy for demos).
import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "classic", label: "Classic", hint: "Clean and simple" },
  { id: "steampunk", label: "Steampunk", hint: "Brass, rivets and parchment" },
  { id: "isometric", label: "Isometric", hint: "3-D blocks on a desk" }
];

const Ctx = createContext({ theme: "classic", setTheme() {} });
export const useTheme = () => useContext(Ctx);

function initial() {
  const q = new URLSearchParams(window.location.search).get("theme");
  if (THEMES.some((t) => t.id === q)) return q;
  try { const s = localStorage.getItem("sd-theme"); if (THEMES.some((t) => t.id === s)) return s; } catch (e) {}
  return "classic";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial);
  // Bootstrap colour mode: Classic follows the phone's light/dark setting,
  // Steampunk is always dark, Isometric is always light.
  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.setAttribute("data-bs-theme",
      theme === "steampunk" ? "dark" : theme === "isometric" ? "light" : dark.matches ? "dark" : "light");
    apply();
    dark.addEventListener("change", apply);
    return () => dark.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute("data-sd-theme", theme);
    try { localStorage.setItem("sd-theme", theme); } catch (e) {}
    const color = { classic: "#0d8566", steampunk: "#2a1d14", isometric: "#eef1f7" }[theme];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", color);
  }, [theme]);
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}
