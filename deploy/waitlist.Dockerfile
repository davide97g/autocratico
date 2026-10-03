# Waitlist API for the landing page (apps/waitlist): Hono + Postgres, no register data.
# Build from the repository root: docker build -f deploy/waitlist.Dockerfile -t autocratico-waitlist .

FROM node:24-trixie-slim AS deps
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/waitlist/package.json apps/waitlist/
RUN pnpm install --prod --frozen-lockfile --filter "@autocratico/waitlist..."

FROM node:24-trixie-slim
WORKDIR /app
COPY --from=deps /src/node_modules node_modules
COPY --from=deps /src/apps/waitlist/node_modules apps/waitlist/node_modules
COPY package.json ./
COPY apps/waitlist/package.json apps/waitlist/
COPY apps/waitlist/src apps/waitlist/src
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8792
USER node
EXPOSE 8792
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8792/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/waitlist/src/main.ts"]
