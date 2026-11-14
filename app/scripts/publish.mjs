// Copies the Vite build (app/dist) to the repository root, which GitHub Pages serves.
import { cpSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist"), root = resolve(here, "../..");
for (const d of ["assets", "icons"]) if (existsSync(resolve(root, d))) rmSync(resolve(root, d), { recursive: true });
for (const f of ["index.html", "sw.js", "icon.svg", "manifest.webmanifest", "icons", "assets"]) cpSync(resolve(dist, f), resolve(root, f), { recursive: true });
// list every font file in the Service Worker so the installed app has them offline
const fonts = readdirSync(resolve(dist, "assets")).filter((f) => f.endsWith(".woff2")).sort();
const swPath = resolve(root, "sw.js");
writeFileSync(swPath, readFileSync(swPath, "utf8").replace("/*FONTS*/", fonts.map((f) => JSON.stringify("./assets/" + f)).join(", ")));
console.log("Published app/dist to the repository root (" + fonts.length + " font files saved for offline use).");
