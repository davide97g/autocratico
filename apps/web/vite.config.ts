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

// The public demo (`--mode demo`, demo.autocratico.it): the same app, its server pretended in the page.
function demoPage(): Plugin {
  return {
    name: "autocratico-demo-page",
    transformIndexHtml: (html) =>
      html.replace(
        "<title>Autocratico</title>",
        `<title>Autocratico · Demo</title>\n    <meta name="description" content="Prova Autocratico con un registro inventato: scadenze, pratiche, email e spese. Niente account, niente viene salvato." />`
      ),
  }
}

export default defineConfig(({ mode }) => {
  const demo = mode === "demo"
  const gaId = demo ? (process.env.GA_MEASUREMENT_ID?.trim() ?? "") : ""
  if (gaId && !/^G-[A-Z0-9]{4,16}$/.test(gaId)) throw new Error(`GA_MEASUREMENT_ID looks wrong: ${gaId}`)
  const siteUrl = process.env.SITE_URL?.trim() || "https://autocratico.it"
  // The repository the demo's fork button and install prompt point to: set REPO_URL when building from a fork.
  const repoUrl = (process.env.REPO_URL?.trim() || "https://github.com/davide97g/autocratico").replace(/\/+$/, "")
  return {
  define: {
    __DEMO__: JSON.stringify(demo),
    __DEMO_GA_ID__: JSON.stringify(gaId),
    __DEMO_SITE_URL__: JSON.stringify(demo ? siteUrl : ""),
    __DEMO_REPO_URL__: JSON.stringify(demo ? repoUrl : ""),
  },
  build: { outDir: demo ? "dist-demo" : "dist" },
  plugins: [
    react(),
    tailwindcss(),
    // The demo has no server, and neither do the tests: nothing to start.
    !demo && mode !== "test" && apiServer(),
    demo && demoPage(),
    VitePWA({
      // No service worker in the demo: nothing cached, a reload always gets the latest build.
      disable: demo,
      registerType: "autoUpdate",
      // Registered by the app (src/lib/update.ts), which also checks for new builds and reloads when idle.
      injectRegister: false,
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
        // A new worker takes over at once; the page reloads onto it when idle (src/lib/update.ts).
        skipWaiting: true,
        clientsClaim: true,
        // Pages network-first: a launch after a deploy opens the new build, and an expired Cloudflare Access
        // session reaches the login redirect. The precached shell is the offline fallback.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 3,
              precacheFallback: { fallbackURL: "/index.html" },
            },
          },
        ],
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
    proxy: demo ? undefined : { "/api": `http://127.0.0.1:${API_PORT}` },
  },
  }
})
