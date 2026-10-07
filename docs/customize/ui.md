# The web app

What you can change here: the look (palettes, tokens, components), the texts, and the views of the PWA in `apps/web/`. It is React, Vite, Tailwind v4 and shadcn/ui. A few conventions keep privacy mode, live updates, the two languages and the public demo working; follow them and the rest is ordinary React.

## Components and styling

- **Components**: use the shadcn components in `apps/web/src/components/ui/` (base-ui underneath) and lucide icons. Add more with the shadcn CLI rather than hand-rolling them.
- **Colours and sizes come from design tokens**:
  - No raw colours, arbitrary values or inline styles.
  - `@shadcn/lint` is configured in `apps/web/eslint.config.js` and enforces this, so run `pnpm --filter @autocratico/web lint` after UI edits.
  - Status colours (`status-overdue`, …) and money colours (`--money-in`, `--money-out`) are tokens too.
- **Palettes** are named colour sets over light and dark:
  - Listed in `apps/web/src/lib/palettes.ts` (`PALETTES`, `THEME_COLOR`).
  - Their tokens live in `apps/web/src/index.css` under `[data-palette="<id>"]`, for light and dark.
  - The launch-screen and browser-bar colours are set in `apps/web/index.html`.
  - `apps/web/test/palettes.test.ts` checks that every palette sets every required token in both modes and that the colours match. To add one, touch all three places, plus the picker strings in i18n.
- **Motion**: micro-interactions live in `components/motion.tsx` and at the end of `index.css`. They must stay off under `prefers-reduced-motion`.

## Texts

- **Every user-facing string goes through `useI18n()`.**
  - `apps/web/src/i18n/en.ts` defines the shape (`Messages`), and `it.ts` must match it; the typecheck catches a missing key.
  - Dates and money use `fmt` from the same hook (`apps/web/src/i18n/index.tsx`).
- **Demo-only texts** are in `apps/web/src/i18n/demo.ts`.
- **A new language**: see [country.md](country.md).

## Personal data

- Render anything personal through `<Sensitive>` (`apps/web/src/components/privacy.tsx`): names, amounts, document numbers, addresses, sensitive dates. Privacy mode (`P`) hides it, and screenshots and demos depend on this.
- Text from the agent marks personal data as `||…||`; the chat renderer already handles it.

## Views

- **Registering a view**:
  - The view ids and the sidebar/tab bar are in `apps/web/src/components/shell.tsx` (`View`, `VIEWS`, `TABS`).
  - Names come from `t.views` in i18n.
  - The ⌘K palette (`apps/web/src/components/command.tsx`) lists `VIEWS` automatically. Add commands or shortcuts there.
  - `apps/web/src/App.tsx` mounts each view (`view === "<id>" && …`).
- **A new view needs**:
  - a file in `apps/web/src/views/`
  - an entry in `View` and `VIEWS`
  - its strings
  - its mount in `App.tsx`
- **Data refresh**: views never refresh by hand. They call `useLiveRefresh(topic, refresh)` (`apps/web/src/lib/events.ts`), which reloads when `/api/events` reports that part of the register changed and polls only as a fallback. A new kind of data needs a topic (see [data-model.md](data-model.md)).
- **API calls** go through `apps/web/src/lib/api.ts`, with types from `@autocratico/core`.
- **Interface preferences per device** (theme, palette and the like) go in `apps/web/src/lib/prefs.tsx`. They are never part of the register.

## The demo must keep up

The public demo (`apps/web/src/demo/`, built with `--mode demo`) is this same app, with its server pretended inside the page.

- **A new `/api` route, or a new field in an answer, needs a matching answer** in `apps/web/src/demo/backend/router.ts`. Seed data goes in `seed.ts`.
- **`apps/web/test/demo.test.ts`** checks the demo's answers against the core schemas, so a forgotten field fails the tests.
- **The real build** must not contain demo code; CI greps `dist/` for it.

If you don't need the demo, delete `apps/web/src/demo/`, the `__DEMO__` branches, `apps/web/test/demo.test.ts`, the `build:demo`/`dev:demo` scripts and the CI step. Then there's no second backend to maintain (see `CUSTOMIZE.md`, Safe to delete).

## The landing page

`apps/site/` is the maintainer's marketing page: Italian copy and its own copy of the app's shell. It doesn't affect your install. A fork can delete it with `apps/waitlist/` and `deploy/compose.site.yml`, or rewrite it.

## Check

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @autocratico/web build && pnpm --filter @autocratico/web build:demo
pnpm dev    # http://localhost:5173, look at the change in both languages, light and dark, with privacy mode on
```
