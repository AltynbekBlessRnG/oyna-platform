import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Экран Zen на компьютере в зале. Сейчас открывается в браузере для разработки,
// дальше его завернёт в себя оболочка для Windows (Tauri) — сборка из dist та же.
export default defineConfig({
  plugins: [react()],
  server: { port: 3200 }
});
