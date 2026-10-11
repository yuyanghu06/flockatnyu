import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createKnowledgeRepository } from './knowledge.js';

const config = readConfig();
const app = createApp({ config, repository: createKnowledgeRepository() });
serve({ fetch: app.fetch, hostname: config.host, port: config.port });
