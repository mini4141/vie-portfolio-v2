# Build context is the repo root:  docker build -f devops/Dockerfile -t vie-portfolio .
# Dependencies are installed INSIDE the image (sharp ships per-OS binaries), never copied from Windows.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 \
    DB_PATH=/data/app.db UPLOAD_DIR=/data/uploads MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/package.json ./package.json
# seed + first-boot script reuse the app's own modules
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/seed-assets ./seed-assets
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["sh", "/app/scripts/docker-entrypoint.sh"]
