# Builds the guest web app and runs the signaling server (which also serves the web app).
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @watchalong/server... --filter @watchalong/web... \
  && pnpm --filter @watchalong/web build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["pnpm", "--filter", "@watchalong/server", "start"]
