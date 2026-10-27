FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server ./server
COPY entrypoint.sh ./entrypoint.sh
RUN find server -name '*.js' -print0 | xargs -0 -r -n 1 node --check && chmod 0755 /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
