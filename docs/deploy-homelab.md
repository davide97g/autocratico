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

Personal instructions for every agent go in `data/notes/INSTRUCTIONS.md` (language, mailboxes): the container has no `CLAUDE.local.md`.

## 2. Secrets

| Variable | Where it comes from |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude setup-token` on the Mac (your subscription, valid one year) |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` (see docs/telegram.md) |
| `PUBLIC_ORIGIN` | `https://autocratico.<your domain>` |
| `CF_ACCESS_TEAM` | Zero Trust → Settings → team name (`<team>.cloudflareaccess.com`) |
| `CF_ACCESS_AUD` | Zero Trust → Access → Applications → autocratico → Application Audience (AUD) tag |

Set them in Dokploy's Environment tab of the compose app (never in the repository).

## 3. Dokploy

With Dokploy (adapt to your own runbook):

1. Project `autocratico`, compose app with `appName: autocratico`, source GitHub `main`, compose path `deploy/compose.homelab.yml`, `autoDeploy: false`.
2. Environment: the variables above, plus `AUTOCRATICO_DATA_DIR` and `AUTOCRATICO_BACKUP_DIR` (absolute paths of the two folders from step 1).
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

## 5. Pair your devices

```bash
docker exec -it $(docker ps -qf name=autocratico) node apps/server/src/cli.ts pair --name "Mac"
```

Open the site, enter the code. From then on, create codes for other devices in **Settings → Devices** (iPhone: open the site in Safari, pair, then Share → Add to Home Screen).

- Shortcut token: Settings → Devices → **Token for a shortcut** (see docs/ios-shortcut.md).
- Telegram: Settings → Telegram → **Pair a chat**, send `/start <code>` to the bot.
- Gmail: `docker exec -it … python3 scripts/gmail.py login --account personal --manual` (see docs/gmail.md).

## 6. Backups and updates

- 03:00 every day: commit of the register in `data/.git` and `autocratico-YYYY-MM-DD.tar.gz` in the backup folder (14 kept, mode 0600, they contain the secrets). Copy that folder to the NAS too.
- Update: push to `main`, redeploy in Dokploy. Claude Code is pinned by `CLAUDE_CODE_VERSION` in the Dockerfile (auto-update is off inside the container).
- Logs: `docker logs autocratico-…`; job history: **Activity** in the web app or `/stato` in Telegram.

## Without Cloudflare Access

`CF_ACCESS=off` lets the server start with paired devices only (e.g. behind Tailscale Serve). Then every request still needs a device token, but nothing filters traffic before it reaches the server.
