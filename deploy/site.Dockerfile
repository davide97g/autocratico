# Public landing page (apps/site): static files behind nginx, no data, no secrets.
# Build from the repository root: docker build -f deploy/site.Dockerfile -t autocratico-site .

FROM node:24-trixie-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/site/package.json apps/site/
RUN pnpm install --frozen-lockfile --filter @autocratico/site
COPY apps/site apps/site
ARG SITE_URL=https://get-autocratico.davideghiotto.it/
RUN SITE_URL="$SITE_URL" pnpm --filter @autocratico/site build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY deploy/site.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/site/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
