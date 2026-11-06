import { defineConfig } from "vite";

// base relative : l'app fonctionne sur GitHub Pages comme dans n'importe quel sous-dossier.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2022" },
  test: { environment: "node" },
} as any);
