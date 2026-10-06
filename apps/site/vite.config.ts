import { defineConfig, type Plugin } from "vite"

// Absolute address the page is served from: canonical link, Open Graph, sitemap.
// Override with SITE_URL to build for another host (e.g. a preview deploy).
const SITE_URL = (process.env.SITE_URL ?? "https://autocratico.it/").replace(/\/?$/, "/")
const REPO_URL = "https://github.com/davide97g/autocratico"
// The public demo (apps/web built with --mode demo): the whole app, with a made-up register.
const DEMO_URL = process.env.DEMO_URL?.trim() || "https://demo.autocratico.it/"
// Google Analytics 4 measurement ID (G-XXXXXXXXXX). Unset: no analytics and no cookie banner.
const GA_ID = process.env.GA_MEASUREMENT_ID?.trim() ?? ""
if (GA_ID && !/^G-[A-Z0-9]{4,16}$/.test(GA_ID)) throw new Error(`GA_MEASUREMENT_ID looks wrong: ${GA_ID}`)
// Data controller named on privacy.html (GDPR): set both for a public deploy.
const OWNER = process.env.SITE_OWNER?.trim() || "Il manutentore del progetto"
const CONTACT = process.env.SITE_CONTACT_EMAIL?.trim() || ""

/** Fills the %PLACEHOLDERS% in the HTML pages and writes robots.txt, sitemap.xml and llms.txt. */
function seo(): Plugin {
  const fill = (s: string) =>
    s
      .replaceAll("%SITE_URL%", SITE_URL)
      .replaceAll("%REPO_URL%", REPO_URL)
      .replaceAll("%DEMO_URL%", DEMO_URL)
      .replaceAll("%SITE_OWNER%", OWNER)
      .replaceAll("%CONTACT_HREF%", CONTACT ? `mailto:${CONTACT}` : `${REPO_URL}/issues`)
      .replaceAll("%CONTACT%", CONTACT || "le issue del repository")
  return {
    name: "autocratico-seo",
    transformIndexHtml: fill,
    async generateBundle() {
      const { readFile } = await import("node:fs/promises")
      const llms = await readFile(new URL("./src/llms.txt", import.meta.url), "utf8")
      const today = new Date().toISOString().slice(0, 10)
      const files: Record<string, string> = {
        "robots.txt": `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`,
        "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}</loc><lastmod>${today}</lastmod></url>\n</urlset>\n`,
        "llms.txt": fill(llms),
      }
      for (const [fileName, source] of Object.entries(files)) this.emitFile({ type: "asset", fileName, source })
    },
  }
}

export default defineConfig({
  base: "./",
  plugins: [seo()],
  define: { __GA_ID__: JSON.stringify(GA_ID) },
  // The waitlist service (apps/waitlist) in development; nginx proxies it in production.
  server: { proxy: { "/api": "http://127.0.0.1:8792" } },
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: "index.html", privacy: "privacy.html" } },
  },
})
