import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./visual-test", import.meta.url)),
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5174
  },
  preview: {
    host: "127.0.0.1",
    port: 4174
  },
  build: {
    outDir: "../../visual-test",
    emptyOutDir: true
  }
});
