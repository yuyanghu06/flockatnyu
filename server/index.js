import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createKnowledgeRepository } from './knowledge.js';
import { createDiscordStore } from './discord/store.js';
import { readDiscordConfig } from './discord/config.js';
import { createEmbeddingProvider } from './discord/embeddings.js';

const config = readConfig();
const discordConfig = readDiscordConfig();
const app = createApp({ config, repository: createKnowledgeRepository(), discordStore: createDiscordStore(), discordConfig, discordEmbedder: createEmbeddingProvider({ config: discordConfig }) });
serve({ fetch: app.fetch, hostname: config.host, port: config.port });
