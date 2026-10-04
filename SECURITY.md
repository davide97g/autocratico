# Security

Autocratico runs on your own machines (a computer or a home server), but it handles sensitive personal data, so security reports are welcome.

## Reporting

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/davide97g/autocratico/security/advisories/new), not in public issues. Include the steps to reproduce and the impact you expect.

Never attach real personal data, tokens or credentials to a report: use the `example/` dataset.

## Scope

- `apps/server/src/auth.ts` and `account.ts`: anything that lets a website, another user or a remote host read the data, trigger the chat or the agent without the masterpass; claiming a fresh instance without the setup code; creating a second user; bypasses of the login throttle or of the Cloudflare Access check.
- `apps/server/src/claude.ts` and `jobs.ts`: ways for file contents (an email, an upload, a WhatsApp export) to make the agent write outside the data folder, read secrets, run commands or send data outside the allowed domains.
- `apps/server/src/telegram.ts`: messages from unpaired chats being served; personal data leaving unredacted.
- `apps/server/src/inbox.ts`, `scripts/gmail.py`: file names, zip contents and attachments from strangers (path traversal, zip bombs, content served inline).
- OAuth handling and token storage (`gmail.py`, `data/secrets/`).
- Anything that could put personal data into the repository (code, `example/`, build output, Docker image).
