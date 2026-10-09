# The maintainer's homelab

This is the runbook of the maintainer's own instance, kept as a worked example. To host your own, start from [docs/self-hosting.md](../self-hosting.md): it covers any Docker host, with or without Cloudflare. The landing page, waitlist and public demo are in [site-and-demo.md](site-and-demo.md).

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

## Domains

`autocratico.it` is a Cloudflare zone (registered at register.it, nameservers delegated to Cloudflare). Every host is a proxied CNAME to the mini PC's tunnel, whose ingress points at loopback ports:

| Host | Port | What | Access |
|---|---|---|---|
| `autocratico.it`, `www.autocratico.it` | 8791 | landing page + waitlist (`deploy/compose.site.yml`) | public |
| `app.autocratico.it` | 8790 | the register (`deploy/compose.homelab.yml`) | Cloudflare Access |
| `demo.autocratico.it` | 8793 | public demo (`deploy/compose.demo.yml`) | public |
| a second register's host | 8794 | another person's register (`deploy/compose.homelab.yml` again, see 7) | Cloudflare Access |

Moving the app to another host means: the host in the Access application, `PUBLIC_ORIGIN` (write requests must come from it), the Gmail OAuth client's redirect URI (`https://<host>/oauth/gmail` in Google Cloud), and the iOS shortcut's URL.

## 2. Secrets

| Variable | Where it comes from |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` on the Mac (your subscription, valid one year) |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` (see ../telegram.md) |
| `PUBLIC_ORIGIN` | `https://app.autocratico.it` (the host the app is served on) |
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

- Shortcut token: Settings → **Shortcut tokens** (see ../ios-shortcut.md).
- Telegram: Settings → Telegram → **Pair a chat**, send `/start <code>` to the bot.
- Gmail: `docker exec -it … python3 scripts/gmail.py login --account personal --manual` (see ../gmail.md).
- Finance: Settings → **Finance** → Finance server (API), address `http://finance-api:3000` (the maintainer's own finance server, reached on `dokploy-network`) and a token from `bun run token create autocratico --scope write` there (see ../finance.md).

## 6. Backups and updates

- 03:00 every day: commit of the register in `data/.git` and `autocratico-YYYY-MM-DD.tar.gz` in the backup folder (14 kept, mode 0600, they contain the secrets). Copy that folder to the NAS too.
- Update: push to `main`, redeploy in Dokploy. Claude Code is pinned by `CLAUDE_CODE_VERSION` in the Dockerfile (auto-update is off inside the container).
- Logs: `docker logs autocratico-…`; job history: **Activity** in the web app or `/stato` in Telegram.

## 7. A second register

Another person's register is the same compose file deployed again (see ../self-hosting.md, "More than one person"):

1. On the box: a new data folder and backup folder (`chmod 700`), e.g. next to the first one.
2. Dokploy: a second compose app from `deploy/compose.homelab.yml`, with its own `AUTOCRATICO_DATA_DIR`, `AUTOCRATICO_BACKUP_DIR`, `AUTOCRATICO_PORT=8794`, `PUBLIC_ORIGIN`, `TELEGRAM_BOT_TOKEN` (a new bot) and `AUTOCRATICO_REGISTERS` pointing back to the first; the same `CLAUDE_CODE_OAUTH_TOKEN`, `CF_ACCESS_TEAM` and ASR folder. Add `AUTOCRATICO_REGISTERS` to the first app too, and redeploy it.
3. Cloudflare: a tunnel hostname to `http://localhost:8794` and a self-hosted Access application for it, allowing the emails of the people who use that register; its AUD tag goes in `CF_ACCESS_AUD`.
4. Setup code: with two apps running, `docker ps -qf name=autocratico` matches both; use the container name Dokploy gave the new one.
