# Builds the guest web app and runs the signaling server (which also serves the web app).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @watchalong/server... --filter @watchalong/web... \
  && pnpm --filter @watchalong/web build

FROM node:22-slim
WORKDIR /app/apps/server
COPY --from=build /app /app
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
# Run the server directly (no pnpm wrapper): faster boot, no corepack download at runtime,
# and SIGTERM/SIGINT reach the process so it shuts down gracefully.
CMD ["node", "--import", "tsx", "src/main.ts"]
