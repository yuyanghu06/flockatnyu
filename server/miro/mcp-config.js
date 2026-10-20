import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export const validMiroId = value => typeof value === 'string' && /^[A-Za-z0-9_=-]{1,200}$/.test(value);
export function parseBoardIds(value = '') {
  if (typeof value !== 'string') throw new Error('invalid_board_scope');
  const ids=value.split(',').map(v=>v.trim()).filter(Boolean).map(value=>{
    if(!value.startsWith('https://')){if(!validMiroId(value))throw new Error('invalid_board_scope');return value;}
    const url=new URL(value),match=/^\/app\/board\/([^/]+)\/?$/.exec(url.pathname);
    if(!['miro.com','www.miro.com'].includes(url.hostname)||url.username||url.password||!match)throw new Error('invalid_board_scope');
    const id=decodeURIComponent(match[1]);if(!validMiroId(id))throw new Error('invalid_board_scope');return id;
  });
  if(ids.length>100)throw new Error('invalid_board_scope');return [...new Set(ids)];
}

export const MIRO_MCP_ENDPOINT = 'https://mcp.miro.com/';
export const MIRO_MCP_SCOPES = 'boards:read openid email';
export const MIRO_MCP_CALLBACK = 'http://127.0.0.1:8766/oauth2callback';
export const MIRO_MCP_READ_TOOLS = Object.freeze(['canvas_search', 'canvas_read_as_svg', 'table_list_rows']);
const secret = value => typeof value === 'string' && value.length <= 32768 && !/[\r\n\0]/.test(value) ? value.trim() : '';
const limit = (value, fallback, min, max) => value === undefined || value === '' ? fallback : Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;

export function readMiroMcpConfig(env = process.env) {
  const issues = [];
  const budgetEnabled = env.MIRO_MCP_BUDGET_ENABLED === undefined ? env.NODE_ENV === 'production' : env.MIRO_MCP_BUDGET_ENABLED === 'true';
  if (env.MIRO_MCP_BUDGET_ENABLED !== undefined && !['true', 'false'].includes(env.MIRO_MCP_BUDGET_ENABLED)) issues.push('invalid_budget_enabled');
  let boardIds = [];
  try { boardIds = parseBoardIds(env.MIRO_BOARD_IDS); } catch { issues.push('invalid_board_scope'); }
  if (!boardIds.length) issues.push('missing_board_scope');
  const teamId = secret(env.MIRO_TEAM_ID) || null;
  if (teamId && !validMiroId(teamId)) issues.push('invalid_team_scope');
  const accessToken = secret(env.MIRO_MCP_ACCESS_TOKEN);
  const refreshToken = secret(env.MIRO_MCP_REFRESH_TOKEN);
  const clientId = secret(env.MIRO_MCP_CLIENT_ID);
  const clientSecret = secret(env.MIRO_MCP_CLIENT_SECRET);
  const authFile = resolve(env.MIRO_MCP_AUTH_FILE || '.miro-mcp-auth.json');
  let tokenBrokerUrl = null;
  const tokenBrokerSecret = secret(env.MIRO_TOKEN_BROKER_SECRET);
  if (env.MIRO_MCP_TOKEN_BROKER_URL) {
    try {
      const url = new URL(env.MIRO_MCP_TOKEN_BROKER_URL);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/internal/miro/token' || url.search || url.hash) throw new Error();
      tokenBrokerUrl = url.href;
    } catch { issues.push('invalid_token_broker_url'); }
    if (tokenBrokerSecret.length < 32 || tokenBrokerSecret.length > 512) issues.push('invalid_token_broker_secret');
    if (accessToken || refreshToken || clientId || clientSecret || env.MIRO_MCP_AUTH_FILE || env.MIRO_MCP_PERSIST_AUTH === 'true') issues.push('broker_credentials_conflict');
  }
  const requestTimeoutMs = limit(env.MIRO_MCP_REQUEST_TIMEOUT_MS, SOURCE_TOOL_TIMEOUT_MS, 1000, 120000);
  const maxResponseBytes = limit(env.MIRO_MCP_MAX_RESPONSE_BYTES, 8388608, 1024, 33554432);
  if (!requestTimeoutMs || !maxResponseBytes) issues.push('invalid_resource_limit');
  if (env.MIRO_MCP_ENDPOINT && env.MIRO_MCP_ENDPOINT !== MIRO_MCP_ENDPOINT) issues.push('invalid_endpoint');
  for (const key of ['MIRO_MCP_ACCESS_TOKEN', 'MIRO_MCP_REFRESH_TOKEN', 'MIRO_MCP_CLIENT_ID', 'MIRO_MCP_CLIENT_SECRET']) {
    if (env[key] && !secret(env[key])) issues.push('invalid_credentials');
  }
  if (refreshToken && !clientId) issues.push('refresh_client_required');
  const hasFile = existsSync(authFile);
  const persistAuth = env.MIRO_MCP_PERSIST_AUTH === 'true';
  if (env.MIRO_MCP_PERSIST_AUTH && !['true', 'false'].includes(env.MIRO_MCP_PERSIST_AUTH)) issues.push('invalid_persist_auth');
  if (!tokenBrokerUrl && !accessToken && !refreshToken && !hasFile) issues.push('auth_required');
  return Object.freeze({ endpoint: MIRO_MCP_ENDPOINT, configured: !issues.length, issues: Object.freeze(issues),
    accessToken, refreshToken, clientId, clientSecret, authFile, persistAuth, tokenBrokerUrl, tokenBrokerSecret, boardIds: Object.freeze(boardIds), teamId, requestTimeoutMs, maxResponseBytes, budgetEnabled });
}
