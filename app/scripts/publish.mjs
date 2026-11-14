// Copies the Vite build (app/dist) to the repository root, which GitHub Pages serves.
import { cpSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist"), root = resolve(here, "../..");
for (const d of ["assets", "icons"]) if (existsSync(resolve(root, d))) rmSync(resolve(root, d), { recursive: true });
for (const f of ["index.html", "sw.js", "icon.svg", "manifest.webmanifest", "icons", "assets"]) cpSync(resolve(dist, f), resolve(root, f), { recursive: true });
console.log("Published app/dist to the repository root.");
