FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/* && mkdir -p /data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server ./server
COPY tools ./tools
COPY dist ./dist
RUN find server tools -name '*.js' -print0 | xargs -0 -r -n 1 node --check
COPY entrypoint.sh /usr/local/bin/tech-nyu-web-entrypoint
RUN chmod 0755 /usr/local/bin/tech-nyu-web-entrypoint
USER root
ENTRYPOINT ["/usr/local/bin/tech-nyu-web-entrypoint"]
