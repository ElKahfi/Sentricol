# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.7.0
ENV NEXT_TELEMETRY_DISABLED=1 PYTHONDONTWRITEBYTECODE=1

FROM base AS build
ARG APP
WORKDIR /app
COPY ai-harness/ ./ai-harness/
COPY ${APP}/ ./${APP}/
WORKDIR /app/${APP}
RUN pnpm install --frozen-lockfile
RUN if [ "$APP" = "protocol" ]; then python3 -m venv .venv && .venv/bin/pip install --no-cache-dir -r requirements.txt; fi
RUN pnpm build

FROM base AS runtime
ARG APP
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app /app
WORKDIR /app/${APP}
RUN mkdir -p .sentri && chown node:node .sentri
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port $PORT"]
