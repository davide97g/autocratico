import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const API_PORT = 8765

// In development, also start the Python server that reads the TOML files.
function dataServer(): Plugin {
  let child: ChildProcess | undefined
  return {
    name: "autocratico-data-server",
    apply: "serve",
    configureServer() {
      child = spawn("python3", [resolve(import.meta.dirname, "../scripts/serve.py"), String(API_PORT)], {
        stdio: "inherit",
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
  plugins: [react(), tailwindcss(), dataServer()],
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
