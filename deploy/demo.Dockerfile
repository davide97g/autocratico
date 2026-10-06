# Public demo (demo.autocratico.it): the web app built with `--mode demo`, whose server is
# pretended inside the page (apps/web/src/demo). Static files behind nginx: no server code, no data,
# no secrets, no Claude. Each visitor's register lives in their own browser tab and nowhere else.
# Build from the repository root: docker build -f deploy/demo.Dockerfile -t autocratico-demo .

FROM node:24-trixie-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .prettierrc ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter "@autocratico/web..."
COPY apps/web apps/web
COPY packages/core packages/core
# Optional: Google Analytics 4, only after the visitor's consent (empty = no analytics, no banner).
ARG GA_MEASUREMENT_ID=
# The landing page: waiting list and privacy notice.
ARG SITE_URL=https://autocratico.it
RUN GA_MEASUREMENT_ID="$GA_MEASUREMENT_ID" SITE_URL="$SITE_URL" pnpm --filter @autocratico/web build:demo

# The CSP names index.html's inline scripts by their hash, so they run and nothing else inline does.
COPY deploy/demo.nginx.conf deploy/
RUN node -e ' \
  const { createHash } = require("node:crypto"); const fs = require("node:fs"); \
  const html = fs.readFileSync("apps/web/dist-demo/index.html", "utf8"); \
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)] \
    .map((m) => `'"'"'sha256-${createHash("sha256").update(m[1]).digest("base64")}'"'"'`).join(" "); \
  const conf = "deploy/demo.nginx.conf"; \
  fs.writeFileSync(conf, fs.readFileSync(conf, "utf8").replaceAll("__INLINE_SCRIPTS__", hashes));'

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY --from=build /src/deploy/demo.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist-demo /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
