FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./package.json
COPY server/miro ./server/miro
RUN find server/miro -name '*.js' -exec node --check {} \;
USER node
CMD ["node", "server/miro/cli.js", "scheduled"]
