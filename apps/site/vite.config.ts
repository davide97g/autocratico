import { defineConfig, type Plugin } from "vite"

// Absolute address the page is served from: canonical link, Open Graph, sitemap.
// Override with SITE_URL to build for another host (e.g. a preview deploy).
const SITE_URL = (process.env.SITE_URL ?? "https://get-autocratico.davideghiotto.it/").replace(/\/?$/, "/")
const REPO_URL = "https://github.com/davide97g/autocratico"

/** Fills %SITE_URL% / %REPO_URL% in index.html and writes robots.txt, sitemap.xml and llms.txt. */
function seo(): Plugin {
  const fill = (s: string) => s.replaceAll("%SITE_URL%", SITE_URL).replaceAll("%REPO_URL%", REPO_URL)
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
  build: { target: "es2022", assetsInlineLimit: 0 },
})
