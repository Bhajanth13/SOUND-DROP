// Vite build settings.
// The website is built straight into the repository root (outDir ".."), which
// GitHub Pages serves. Files in public/ (sw.js, manifest, icons) are copied there
// as they are. Fixed file names (assets/app.js, assets/app.css) let the Service
// Worker list exactly which files to keep for offline use.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",                 // relative paths, so the site works inside /SOUND-DROP/
  build: {
    outDir: "..",
    emptyOutDir: false,       // never empty the repository folder
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        assetFileNames: "assets/app[extname]"
      }
    }
  }
});
