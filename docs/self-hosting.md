# Self-hosting

Run Autocratico always-on, on any machine with Docker (a mini PC, a NAS, a VPS), and reach it from your phone. Locally, `./setup.sh --start` is enough; this page is for the server.

The container listens on `127.0.0.1:8790` only. Something in front of it serves your address over HTTPS: a reverse proxy, Tailscale or a Cloudflare Tunnel. Every request then needs the owner's masterpass session (or a shortcut token, which can only add documents); Cloudflare Access can sit in front of that as a second gate.

## 1. Settings

```bash
git clone https://github.com/<you>/autocratico.git && cd autocratico
cp deploy/.env.example deploy/.env
```

Fill in `deploy/.env` (every variable is in [configuration.md](configuration.md)):

| Variable | |
|---|---|
| `PUBLIC_ORIGIN` | required: the HTTPS address you will open, e.g. `https://autocratico.example.com`. Browser writes must come from it. |
| `CLAUDE_CODE_OAUTH_TOKEN` | your Claude subscription: run `claude setup-token` on any computer (valid one year) |
| `ANTHROPIC_API_KEY` | instead of the token: an API key, billed per use |
| `TZ`, `AUTOCRATICO_LOCALE` | time zone of the deadlines and jobs (default `Europe/Rome`); language of Telegram, ntfy and the agent (`it` or `en`) |
| `TELEGRAM_BOT_TOKEN`, `NTFY_URL` | notifications, optional: [telegram.md](telegram.md), [ntfy.md](ntfy.md) |
| `AUTOCRATICO_DATA_DIR`, `AUTOCRATICO_BACKUP_DIR` | where the register and the nightly backups live on the host; default `data/` and `backups/` in the clone |

Without a Claude token or key the app works, but the chat and the agent don't.

## 2. Data folder

The container runs as uid 1000. Create the folders and give them to that user once:

```bash
mkdir -p data backups && sudo chown -R 1000:1000 data backups && chmod 700 data backups
```

An empty folder gets the empty register on first start. To bring an existing register (from `./setup.sh` on your laptop), copy its `data/` folder there first: `rsync -a data/ server:autocratico/data/`. After that, write to one copy only.

## 3. Start

```bash
docker compose -f deploy/compose.yml up -d --build
curl -s http://127.0.0.1:8790/api/health        # {"ok":true}
```

The log prints a one-time **setup code** (8 digits, 10 minutes) on first start:

```bash
docker compose -f deploy/compose.yml logs | grep "setup code"
# or a new one:
docker compose -f deploy/compose.yml exec autocratico node apps/server/src/cli.ts setup-code
```

Open `PUBLIC_ORIGIN`: the onboarding asks for your name, the masterpass and the setup code. Other devices just log in with the masterpass (iPhone: Safari, log in, Share → Add to Home Screen). Forgot the masterpass: `… exec autocratico node apps/server/src/cli.ts reset-password`.

Scheduled jobs (Gmail sync, filing what arrives, reminders, the Monday digest, backups, energy offers, catalog re-checks, the tax return case) run by default in the container; `AUTOCRATICO_JOBS=off` pauses them.

## 4. Reach it from your phone

Pick one. In every case only `127.0.0.1:8790` is exposed on the host, and `PUBLIC_ORIGIN` must match the address you open.

### Tailscale

The simplest private option: only your devices can reach it.

```bash
tailscale serve --bg 8790          # https://<machine>.<tailnet>.ts.net
```

Set `PUBLIC_ORIGIN=https://<machine>.<tailnet>.ts.net`. The iOS shortcut and Telegram keep working (Telegram's bot talks to Telegram, not to your server).

### A reverse proxy (Caddy)

For a public hostname with automatic HTTPS:

```
autocratico.example.com {
  reverse_proxy 127.0.0.1:8790
}
```

The masterpass is then the only gate: choose a long one. Five wrong attempts lock logins for 15 minutes.

### Cloudflare Tunnel and Access

A public hostname with Cloudflare Access in front (one-time PIN or your identity provider), checked again by the server on every request:

1. Tunnel → Public hostname: `autocratico.<domain>` → `http://localhost:8790`.
2. Zero Trust → Access → Applications → Self-hosted `autocratico.<domain>`, with two policies:
   - **Allow** for your email;
   - **Service Auth** with a service token (for the iOS shortcut: keep its Client ID and Secret, see [ios-shortcut.md](ios-shortcut.md)).

   One application for the whole host on purpose: a separate one on `/api/ingest` would need its own login, which breaks uploads from the web app. The service token passes Access for any path, but the server lets its ingest-only bearer token call `/api/ingest` only.
3. Put the team name (`<team>.cloudflareaccess.com`) in `CF_ACCESS_TEAM` and the application's AUD tag in `CF_ACCESS_AUD`, then start with the override:

```bash
docker compose -f deploy/compose.yml -f deploy/compose.cloudflare.yml up -d --build
```

The server then rejects any request without a valid Access token, even from the LAN.

## 5. Optional pieces

- **Gmail** (read-only): [gmail.md](gmail.md). The OAuth redirect URI is `PUBLIC_ORIGIN/oauth/gmail`.
- **Telegram** or **ntfy**: [telegram.md](telegram.md), [ntfy.md](ntfy.md).
- **Finance**: a finance server or your bank's CSV exports, [finance.md](finance.md).
- **iOS share sheet**: [ios-shortcut.md](ios-shortcut.md).
- **Personal instructions** for every agent (language, mailboxes, preferences): `data/notes/INSTRUCTIONS.md`.

### More than one person

One instance is one register with one owner. For a second person (a partner, a parent, a sole proprietorship with its own paperwork), run a second instance: another data folder, another masterpass, another address. Nothing is shared, so neither agent can read the other's files, and a mistake in one cannot leak into the other.

- Same image, another compose project: `docker compose -p autocratico-second --env-file second.env -f deploy/compose.yml up -d`, with its own `AUTOCRATICO_DATA_DIR`, `AUTOCRATICO_BACKUP_DIR`, `PORT` and `PUBLIC_ORIGIN`.
- Its own Telegram bot (one token cannot be polled by two servers) and its own ntfy topic; both people can pair their chats with either bot.
- The same `CLAUDE_CODE_OAUTH_TOKEN` works for both, but they share the subscription's limits.
- `AUTOCRATICO_REGISTERS` on each points to the other (`Name=https://…`): the sidebar, the "More" sheet and ⌘K then offer a "Switch to" link. Sessions are per address, so both stay logged in; on a phone, add each to the Home Screen and name them as you like.
- Something that belongs to both (a house, a car) lives in the register of whoever it is in the name of.

### Speech to text

Voice messages sent to the Telegram bot are transcribed on the server, never by an outside service. Put a static `parakeet-cli` (from [whisper.cpp](https://github.com/ggml-org/whisper.cpp), built with `-DBUILD_SHARED_LIBS=OFF` on a glibc ≥ 2.38 system) and a ggml Parakeet model (e.g. `ggml-parakeet-tdt-0.6b-v3-q8_0.bin`, multilingual) in one folder, set `AUTOCRATICO_ASR_DIR` to it, and add the override:

```bash
docker compose -f deploy/compose.yml -f deploy/compose.asr.yml up -d
```

Without it, voice messages are refused with a short note; everything else works.

## 6. Backups and updates

- Every night at 03:00: a commit of the register in `data/.git` and `autocratico-YYYY-MM-DD.tar.gz` in the backup folder (14 kept, mode 0600: they contain the secrets). Copy that folder somewhere else too.
- Update: `git pull && docker compose -f deploy/compose.yml up -d --build`. Claude Code is pinned by `CLAUDE_CODE_VERSION` in `deploy/Dockerfile` (auto-update is off in the container).
- Logs: `docker compose -f deploy/compose.yml logs -f`; job history: **Activity** in the web app.

A worked example of a full setup (Dokploy, Cloudflare, a private finance server): [maintainer/homelab.md](maintainer/homelab.md).
