# Autocratico UI

React + Vite + Tailwind v4 + shadcn/ui (`base-ui` primitives, lucide icons). Reads data from the Python server (`scripts/serve.py`) through `/api`.

```bash
pnpm install
pnpm dev        # http://localhost:5173, also starts the Python server
pnpm build      # dist/, served by scripts/serve.py
pnpm lint
```

- UI strings live in `src/i18n/` (`en.ts` defines the shape, `it.ts` follows it). Never hard-code user-facing text in components.
- Personal data is rendered only inside `<Sensitive>` (`src/components/privacy.tsx`), so privacy mode can hide it.
