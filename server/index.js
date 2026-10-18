import { serve } from '@hono/node-server';
import { readConfig } from './config.js';
import { createRuntimeApp } from './runtime-app.js';

const config = readConfig();
const app = createRuntimeApp({config});
serve({fetch:app.fetch, hostname:config.host, port:config.port});
