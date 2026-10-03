# Autocratico web app

React + Vite + Tailwind v4 + shadcn/ui (`base-ui` primitives, lucide icons), installable as a PWA. Reads data from the server (`apps/server`) through `/api`; shapes come from `@autocratico/core`.

```bash
pnpm dev        # http://localhost:5173, also starts the API server on 127.0.0.1:8790
pnpm build      # dist/, served by apps/server
pnpm lint
```

- UI strings live in `src/i18n/` (`en.ts` defines the shape, `it.ts` follows it). Never hard-code user-facing text in components.
- Personal data is rendered only inside `<Sensitive>` (`src/components/privacy.tsx`), so privacy mode can hide it.
- The service worker caches the app shell only: responses from `/api` are never cached.
