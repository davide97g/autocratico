# Landing page, waitlist and public demo

Maintainer-only: the marketing site at `autocratico.it`, its waitlist and the public demo. A fork that only wants its own register can ignore this file, and delete `apps/site`, `apps/waitlist`, `apps/video`, `apps/web/src/demo` and the matching `deploy/` files (see CUSTOMIZE.md, "Safe to delete"). Building them from a fork: set `REPO_URL` so the fork button and the install prompt point to the fork.

## Landing page

`apps/site` is a separate, public compose app: `deploy/compose.site.yml` on `127.0.0.1:8791`. Three containers, none of them touching the register:

- `site`: nginx with the static page; proxies `POST /api/waitlist` to `waitlist` (rate-limited per `CF-Connecting-IP`).
- `waitlist` (`apps/waitlist`): checks the address (syntax, DNS, then Jev by TypeSafe for placeholders, disposable inboxes and provider typos; it fails open if Jev is down) and stores it. No published port.
- `db`: Postgres 18, volume `waitlist_db`. No published port.

1. Dokploy: compose app from GitHub `main`, compose path `deploy/compose.site.yml`. Environment:
   - `WAITLIST_DB_PASSWORD` (required): `openssl rand -hex 24`. Set it before the first deploy: Postgres keeps the first password it sees.
   - `TYPESAFE_API_KEY` (required): from the TypeSafe dashboard.
   - `GA_MEASUREMENT_ID` (optional): `G-XXXXXXXXXX`. Empty = no analytics and no cookie banner. Build argument: redeploy after changing it.
   - `SITE_OWNER`, `SITE_CONTACT_EMAIL`: the data controller shown on `privacy.html` (GDPR). Build arguments.
   - `WAITLIST_ORIGINS` (optional): origins allowed to post, default `https://autocratico.it,https://www.autocratico.it`.
   - `SITE_URL`, `DEMO_URL` (optional): the page's own address (canonical link, Open Graph, sitemap) and the public demo it links to; defaults `https://autocratico.it/` and `https://demo.autocratico.it/`. Build arguments.
2. Cloudflare: tunnel public hostnames `autocratico.it` and `www.autocratico.it` → `http://localhost:8791`, proxied CNAMEs. No Access application: the page is meant to be public.
3. Check on the box: `curl -s http://127.0.0.1:8791/healthz` → `ok`; `docker compose -p <project> logs waitlist` shows `listening` and no `TYPESAFE_API_KEY is not set` warning.

Waitlist chores (on the box, in the compose project's folder, `-p <project>` as Dokploy names it):

- Count: `docker compose exec db psql -U waitlist -c "select count(*) from waitlist"`
- Export: `docker compose exec waitlist node apps/waitlist/src/export.ts > waitlist.csv`
- Delete someone on request: `docker compose exec db psql -U waitlist -c "delete from waitlist where email = 'name@example.org'"`
- Backup: `docker compose exec db pg_dump -U waitlist waitlist | gzip > waitlist-$(date +%F).sql.gz`

### Google Analytics

The page loads GA4 only after the visitor accepts the banner (choice stored for 6 months, then asked again), with Google signals and ad personalisation off. The CSP in `deploy/site.nginx.conf` allows the Google Analytics hosts.

Events sent (never what people type):

| Event | When | Parameters |
| --- | --- | --- |
| `page_view` | page load (automatic) | |
| `section_view` | a section crosses the middle of the screen, once | `section` |
| `cta_click` | an element with `data-track` | `cta`, `location` |
| `outbound_click` | a link to another site | `link_url`, `link_domain`, `link_text`, `cta`, `location` |
| `faq_open` | an FAQ entry is opened | `question` |
| `hero_skip`, `hero_replay` | the guided story at the top is skipped or replayed | |
| `demo_view`, `demo_chat`, `demo_palette`, `demo_ask`, `demo_arrival`, `demo_done`, `demo_undo`, `demo_telegram` | demo use | `view`, `question` (category), `via`, `doc`, `done`, `action` |
| `try_in_demo` | a "try it in the demo" button in a section | `what` |
| `time_machine`, `time_machine_done`, `privacy_toggle`, `pile_stamp`, `copy_install`, `theme_toggle` | other interactive bits | `days`, `item`, `done`, `on`, `via`, `theme` |
| `section_confirm`, `section_undo`, `section_telegram`, `splash_replay` | the small live pieces in the sections | `yes`, `undone`, `action` |
| `waitlist_start`, `generate_lead`, `waitlist_error` | waitlist form focus, sign-up, rejection | `method`, `reason` |
| `consent_granted` | the visitor accepts the banner | |

GA4 property setup: Admin → Data streams → Web, URL of the landing page → copy the measurement ID. In the stream's Enhanced measurement, turn off **Outbound clicks** (the page sends its own `outbound_click` with the section) and **Form interactions** (the demo chat would add noise); keep page views and scrolls. Admin → Events: mark `generate_lead` and `copy_install` as key events. Admin → Custom definitions: event-scoped dimensions for `cta`, `location`, `section`, `reason`, `link_domain`, `via`, `doc`. Admin → Data collection: leave Google signals off; Data retention: 14 months.

## Public demo

`demo.autocratico.it` lets anyone try the app without an account: the real web app built with `--mode demo` (`pnpm --filter @autocratico/web build:demo` → `apps/web/dist-demo/`), whose server is pretended inside the page (`apps/web/src/demo/`). It is a separate compose app, `deploy/compose.demo.yml` on `127.0.0.1:8793`, with one nginx container and nothing else:

- no server code, no Claude, no Gmail, finance app or Telegram, no volumes, no secrets, no network shared with the real app;
- each visitor's made-up register is generated in their browser and kept in the tab's `sessionStorage`: a reload keeps it, closing the tab (or "Ricomincia") deletes it;
- nginx answers `/api/*` with 404 (nothing should ever ask), and its CSP names `index.html`'s inline scripts by hash, computed when the image is built.

1. Dokploy: compose app from GitHub `main`, compose path `deploy/compose.demo.yml`. Environment (both build arguments, redeploy after changing them):
   - `GA_MEASUREMENT_ID` (optional): the same `G-XXXXXXXXXX` as the landing page. Empty = no analytics and no consent banner.
   - `SITE_URL` (optional): the landing page, for the waiting list and the privacy notice; default `https://autocratico.it`.
2. Cloudflare: tunnel public hostname `demo.autocratico.it` → `http://localhost:8793`, proxied CNAME. No Access application.
3. Check on the box: `curl -s http://127.0.0.1:8793/healthz` → `ok`.

Locally: `pnpm --filter @autocratico/web dev:demo` (no API server is started), or `docker compose -f deploy/compose.demo.yml up --build` → http://127.0.0.1:8793.

Events sent to Google Analytics after consent (never what people type, upload or name their register): `app_demo_start`, `app_demo_generate` (`named`), `app_demo_ready` (`tour`), `app_demo_view` (`view`), `app_demo_ask` (`question`: the category of the scripted answer), `app_demo_upload` (`files`), `app_demo_reset`, `app_demo_waitlist`, `app_demo_copy_prompt` (the prompt that has Claude Code fork and install Autocratico), `app_demo_fork`.
