FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html tsconfig.client.json tsconfig.server.json vite.config.ts ./
COPY src ./src
COPY shared ./shared
COPY server ./server
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV PORT=10000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server

USER node
EXPOSE 10000
CMD ["node", "dist-server/server/index.js"]
