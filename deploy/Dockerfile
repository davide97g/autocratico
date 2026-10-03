# Autocratico server: API, PWA, scheduled jobs, Telegram bot, headless Claude Code.
# Build from the repository root: docker build -f deploy/Dockerfile -t autocratico .

FROM node:24-trixie-slim AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json .prettierrc ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY apps apps
COPY packages packages
RUN pnpm --filter @autocratico/web build

# Production dependencies of the server only, keeping the workspace layout: Node runs the
# TypeScript sources directly, which it refuses to do for files inside node_modules.
FROM node:24-trixie-slim AS deps
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
RUN pnpm install --prod --frozen-lockfile --filter "@autocratico/server..."

# trixie: parakeet-cli (speech to text, mounted from the host at /asr) needs glibc 2.38.
FROM node:24-trixie-slim
ARG CLAUDE_CODE_VERSION=2.1.288
# python3: the CLIs in scripts/ (Gmail sync, upcoming, ics); git: history of the data folder;
# ffmpeg + libgomp1: voice messages (Opus to WAV, and the runtime parakeet-cli links against).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 git tini ca-certificates tzdata ffmpeg libgomp1 \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm cache clean --force

WORKDIR /app
# The agent reads AGENTS.md / CLAUDE.md from the repository root (claude runs with cwd=/app).
COPY AGENTS.md CLAUDE.md ./
COPY scripts scripts
COPY example example
COPY --from=deps /src/node_modules node_modules
COPY --from=deps /src/apps/server/node_modules apps/server/node_modules
COPY --from=deps /src/packages/core/node_modules packages/core/node_modules
COPY package.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY packages/core/package.json packages/core/
COPY packages/core/src packages/core/src
COPY --from=build /src/apps/web/dist apps/web/dist

ENV NODE_ENV=production \
    AUTOCRATICO_AUTH=prod \
    AUTOCRATICO_DATA=/data \
    BACKUP_DIR=/backups \
    HOST=0.0.0.0 \
    PORT=8790 \
    TZ=Europe/Rome \
    HOME=/home/node \
    CLAUDE_CONFIG_DIR=/home/node/.claude \
    DISABLE_AUTOUPDATER=1 \
    PYTHONDONTWRITEBYTECODE=1

# /home/node/.claude must exist and belong to node: a new named volume copies this ownership,
# otherwise it is root's and Claude Code cannot save sessions (every resumed chat then fails).
RUN mkdir -p /data /backups /home/node/.claude && chown node:node /data /backups /home/node/.claude
USER node
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8790/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/src/main.ts"]
