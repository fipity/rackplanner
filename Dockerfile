# syntax=docker/dockerfile:1

# ---- build: install everything, validate catalog, build web + server ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- deps: production dependencies of the server only ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @rackplanner/server --no-audit --no-fund \
 && rm -rf node_modules/@rackplanner

# ---- runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8085 \
    DATA_DIR=/data \
    CATALOG_DIR=/app/catalog \
    WEB_DIST=/app/web
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist ./web
COPY catalog ./catalog
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8085
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8085)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
