import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? "./" : "/hyperforest/",
  clearScreen: false,
});
