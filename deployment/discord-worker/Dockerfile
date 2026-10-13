FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY tools/check-api.mjs ./tools/check-api.mjs
RUN npm run build:api
USER node
CMD ["node", "server/discord/cli.js", "sync"]
