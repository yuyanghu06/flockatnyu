FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server ./server
COPY tools ./tools
RUN find server tools -name '*.js' -print0 | xargs -0 -r -n 1 node --check
USER node
CMD ["node", "server/automation/cli.js", "serve"]
