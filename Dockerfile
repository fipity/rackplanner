# syntax=docker/dockerfile:1

# ---- build: install everything, validate catalog, build web + server ----
FROM node:22-bookworm-slim AS build
# Toolchain only used if better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- deps: the only runtime dependency left after bundling is the native
# better-sqlite3 module (musl build for alpine, same version as the lockfile).
FROM node:22-alpine AS deps
# Toolchain only used if better-sqlite3 has no prebuilt binary for this platform.
RUN apk add --no-cache python3 make g++
WORKDIR /deps
COPY package-lock.json /tmp/package-lock.json
RUN V=$(node -p "require('/tmp/package-lock.json').packages['node_modules/better-sqlite3'].version") \
 && npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund --no-package-lock "better-sqlite3@$V" \
 && rm -rf node_modules/better-sqlite3/deps node_modules/better-sqlite3/src node_modules/better-sqlite3/build/Release/obj* \
 && npm cache clean --force

# ---- runtime ----
FROM node:22-alpine
RUN apk add --no-cache su-exec \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn*
ENV NODE_ENV=production \
    PORT=8085 \
    DATA_DIR=/data \
    CATALOG_DIR=/app/catalog \
    WEB_DIST=/app/web
WORKDIR /app
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist ./web
COPY catalog ./catalog
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /data && chown node:node /data \
 && find ./web -name '*.map' -delete \
 && rm -f ./server/*.map
EXPOSE 8085
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8085)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
