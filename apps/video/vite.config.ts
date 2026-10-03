import { defineConfig, type Plugin } from 'vite';
import { cpSync } from 'node:fs';
import path from 'node:path';

const root = import.meta.dirname;

// song/ and data/ sit beside the app rather than in public/ (the analysis writes data/, and the song
// is not an asset of the page so much as its subject). The dev server serves them from the root as it
// is; a build copies them next to the bundle.
function songAndData(): Plugin {
  return {
    name: 'song-and-data',
    writeBundle(options) {
      if (!options.dir) return;
      for (const dir of ['song', 'data']) cpSync(path.join(root, dir), path.join(options.dir, dir), { recursive: true });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [songAndData()],
  // VIDEO_NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.VIDEO_NO_HMR ? false : undefined },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
