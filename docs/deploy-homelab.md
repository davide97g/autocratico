# Deploy on the homelab

Target: the mini PC with Docker + Dokploy + Cloudflare Tunnel. The container listens on `127.0.0.1:8790` only; the tunnel publishes it behind Cloudflare Access.

## 1. Data folder

On the server, as a user with uid 1000 (the `node` user in the container):

```bash
mkdir -p ~/autocratico ~/backups/autocratico && chmod 700 ~/autocratico ~/backups/autocratico
```

Move the data from the Mac (once), then stop using the Mac copy for writes:

```bash
rsync -a --chmod=Du=rwx,Dgo=,Fu=rw,Fgo= data/ homelab:autocratico/data/
```

Voice messages are transcribed on the server, never by an external service: put a static
`parakeet-cli` (whisper.cpp, built with `-DBUILD_SHARED_LIBS=OFF`) and a ggml Parakeet model
(`ggml-parakeet-tdt-0.6b-v3-q8_0.bin`, multilingual) in one folder, and point
`AUTOCRATICO_ASR_DIR` at it. A hard link to a model another app already downloaded costs no space:

```bash
mkdir -p ~/autocratico/asr && cp /usr/local/bin/parakeet-cli ~/autocratico/asr/
ln ~/path/to/ggml-parakeet-tdt-0.6b-v3-q8_0.bin ~/autocratico/asr/
```

Personal instructions for every agent go in `data/notes/INSTRUCTIONS.md` (language, mailboxes): the container has no `CLAUDE.local.md`.

## 2. Secrets

| Variable | Where it comes from |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` on the Mac (your subscription, valid one year) |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` (see docs/telegram.md) |
| `PUBLIC_ORIGIN` | `https://autocratico.<your domain>` |
| `CF_ACCESS_TEAM` | Zero Trust → Settings → team name (`<team>.cloudflareaccess.com`) |
| `CF_ACCESS_AUD` | Zero Trust → Access → Applications → autocratico → Application Audience (AUD) tag |
| `BETTER_AUTH_SECRET` | optional: otherwise generated once into `data/secrets/auth.json` |

Set them in Dokploy's Environment tab of the compose app (never in the repository).

## 3. Dokploy

With Dokploy (adapt to your own runbook):

1. Project `autocratico`, compose app with `appName: autocratico`, source GitHub `main`, compose path `deploy/compose.homelab.yml`, `autoDeploy: false`.
2. Environment: the variables above, plus `AUTOCRATICO_DATA_DIR`, `AUTOCRATICO_BACKUP_DIR` and `AUTOCRATICO_ASR_DIR` (absolute paths of the folders from step 1).
3. Deploy, then on the box: `curl -s http://127.0.0.1:8790/api/health` → `{"ok":true}`.

No Traefik route is needed: the tunnel points straight at `http://localhost:8790`.

## 4. Cloudflare

1. Tunnel → Public hostname: `autocratico.<domain>` → `http://localhost:8790` (before the catch-all rule); proxied CNAME.
2. Zero Trust → Access → Applications → Self-hosted `autocratico.<domain>`, with two policies:
   - **Allow** for your email (one-time PIN or your identity provider);
   - **Service Auth** with a service token named `autocratico-shortcut`. Keep its Client ID and Secret for the shortcut.

   One application for the whole host on purpose: a separate application on `/api/ingest` would need its own login, which breaks uploads from the web app. The service token passes Access for any path, but the server only lets its ingest-scope bearer token call `/api/ingest`.
3. Copy the AUD tag into `CF_ACCESS_AUD` and redeploy.

The server rejects any request without a valid Access JWT, so the app is not reachable around Access even from the LAN.

## 5. Set it up

On first start an empty data folder gets the empty register, and the log prints a one-time **setup code** (8 digits, 10 minutes):

```bash
docker logs $(docker ps -qf name=autocratico) | grep "setup code"
# or a new one:
docker exec -it $(docker ps -qf name=autocratico) node apps/server/src/cli.ts setup-code
```

Open the site: the onboarding asks for your name, the masterpass and the setup code, then your basics and first documents. Other devices just log in with the masterpass (iPhone: Safari, log in, then Share → Add to Home Screen); **Settings → Logged-in devices** lists them and logs them out.

Forgot the masterpass: `docker exec -it … node apps/server/src/cli.ts reset-password` (logs every browser out).

Upgrading from a version with device pairing: the register is kept, old device cookies stop working, and the onboarding (with the setup code) runs once, prefilled from `profile.toml`. Shortcut tokens keep working.

- Shortcut token: Settings → **Shortcut tokens** (see docs/ios-shortcut.md).
- Telegram: Settings → Telegram → **Pair a chat**, send `/start <code>` to the bot.
- Gmail: `docker exec -it … python3 scripts/gmail.py login --account personal --manual` (see docs/gmail.md).
- Finance app: Settings → **Finance app**, address `http://finance-api:3000` and a token from `bun run token create autocratico --scope write` on the finance server (see docs/finance.md).

## 6. Backups and updates

- 03:00 every day: commit of the register in `data/.git` and `autocratico-YYYY-MM-DD.tar.gz` in the backup folder (14 kept, mode 0600, they contain the secrets). Copy that folder to the NAS too.
- Update: push to `main`, redeploy in Dokploy. Claude Code is pinned by `CLAUDE_CODE_VERSION` in the Dockerfile (auto-update is off inside the container).
- Logs: `docker logs autocratico-…`; job history: **Activity** in the web app or `/stato` in Telegram.

## Without Cloudflare Access

`CF_ACCESS=off` lets the server start with the masterpass only (e.g. behind Tailscale Serve). Every request still needs the owner's session or a shortcut token, but nothing filters traffic before it reaches the server: choose a long masterpass.

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
   - `WAITLIST_ORIGINS` (optional): origins allowed to post, default `https://get-autocratico.davideghiotto.it`.
   `SITE_URL` is a build argument in `deploy/site.Dockerfile` (canonical link, Open Graph, sitemap).
2. Cloudflare: tunnel public hostname `get-autocratico.<domain>` → `http://localhost:8791`, proxied CNAME. No Access application: the page is meant to be public.
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
