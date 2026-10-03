import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const API_PORT = Number(process.env.PORT ?? 8790)

// In development, also start the API server (apps/server) on loopback.
function apiServer(): Plugin {
  let child: ChildProcess | undefined
  return {
    name: "autocratico-api-server",
    apply: "serve",
    configureServer() {
      child = spawn(process.execPath, ["--watch", resolve(import.meta.dirname, "../server/src/main.ts")], {
        stdio: "inherit",
        env: { ...process.env, PORT: String(API_PORT), AUTOCRATICO_AUTH: "dev" },
      })
      const stop = () => child?.kill()
      process.once("exit", stop)
      process.once("SIGINT", () => {
        stop()
        process.exit()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiServer(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "Autocratico",
        short_name: "Autocratico",
        description: "Personal register for Italian bureaucracy",
        lang: "it",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        categories: ["productivity", "finance"],
        background_color: "#e6e6e6",
        theme_color: "#1a1a1a",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Inbox", url: "/#inbox" },
          { name: "Scadenze", url: "/#deadlines" },
        ],
      },
      workbox: {
        // App shell only: personal data from /api is never cached.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": `http://127.0.0.1:${API_PORT}` },
  },
})
