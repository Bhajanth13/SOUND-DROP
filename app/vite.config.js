import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds to app/dist; scripts/publish.mjs then copies it to the repository
// root, which GitHub Pages serves. Fixed file names let the Service Worker
// list the files it keeps offline.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (info) => (info.name && info.name.endsWith(".css") ? "assets/app.css" : "assets/[name][extname]")
      }
    }
  }
});
