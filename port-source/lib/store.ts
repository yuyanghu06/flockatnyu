/** Postgres state. Same three tables as the SQLite version.
 *
 * Serverless functions have no persistent filesystem, so SQLite is out.
 * Neon and Supabase both have a free tier that covers this comfortably.
 */

import { createHash } from "node:crypto";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export { sql };

/** Short, stable handle for an event, safe inside a Discord custom_id. */
export function tokenFor(eventId: string): string {
  return createHash("sha1").update(eventId).digest("hex").slice(0, 12);
}

export async function ensureSchema(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS sent (
    event_id TEXT NOT NULL,
    kind     TEXT NOT NULL,
    sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, kind)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS events (
    token      TEXT PRIMARY KEY,
    event_id   TEXT NOT NULL UNIQUE,
    title      TEXT NOT NULL,
    event_date DATE NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS details (
    event_id   TEXT PRIMARY KEY,
    data       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel_id TEXT,
    message_id TEXT
  )`;
}

/** Attachments waiting for someone to pick an event. Discord hands us the
 *  file list in the context-menu interaction; re-fetching the message later
 *  isn't reliable, so we hold onto it between the two steps. */
export interface PendingAsset {
  filename: string;
  url: string;
  size: number;
}

export async function savePendingAssets(
  messageId: string,
  assets: PendingAsset[],
): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS pending_assets (
    message_id TEXT PRIMARY KEY,
    data       JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`INSERT INTO pending_assets (message_id, data)
            VALUES (${messageId}, ${sql.json(assets as any)})
            ON CONFLICT (message_id) DO UPDATE
              SET data = EXCLUDED.data, created_at = now()`;
}

export async function getPendingAssets(messageId: string): Promise<PendingAsset[]> {
  const rows = await sql<{ data: PendingAsset[] }[]>`
    SELECT data FROM pending_assets WHERE message_id = ${messageId}`;
  return rows[0]?.data ?? [];
}

export async function alreadySent(eventId: string, kind: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM sent WHERE event_id = ${eventId} AND kind = ${kind}`;
  return rows.length > 0;
}

export async function markSent(eventId: string, kind: string): Promise<void> {
  await sql`INSERT INTO sent (event_id, kind) VALUES (${eventId}, ${kind})
            ON CONFLICT DO NOTHING`;
}

export async function clearSent(): Promise<number> {
  const rows = await sql`DELETE FROM sent RETURNING 1`;
  return rows.length;
}

export interface EventRow {
  token: string;
  event_id: string;
  title: string;
  event_date: string;
}

export async function registerEvent(
  eventId: string,
  title: string,
  eventDate: string,
): Promise<string> {
  const token = tokenFor(eventId);
  await sql`INSERT INTO events (token, event_id, title, event_date)
            VALUES (${token}, ${eventId}, ${title}, ${eventDate})
            ON CONFLICT (event_id) DO UPDATE
              SET title = EXCLUDED.title, event_date = EXCLUDED.event_date`;
  return token;
}

export async function eventForToken(token: string): Promise<EventRow | null> {
  const rows = await sql<EventRow[]>`
    SELECT token, event_id, title, to_char(event_date, 'YYYY-MM-DD') AS event_date
    FROM events WHERE token = ${token}`;
  return rows[0] ?? null;
}

export type Details = Record<string, string>;

export async function getDetails(eventId: string): Promise<Details> {
  const rows = await sql<{ data: Details }[]>`
    SELECT data FROM details WHERE event_id = ${eventId}`;
  return rows[0]?.data ?? {};
}

export async function mergeDetails(eventId: string, incoming: Details): Promise<Details> {
  const cleaned = Object.fromEntries(
    Object.entries(incoming).filter(([, v]) => v && v.trim()),
  );
  const merged = { ...(await getDetails(eventId)), ...cleaned };
  await sql`INSERT INTO details (event_id, data) VALUES (${eventId}, ${sql.json(merged)})
            ON CONFLICT (event_id) DO UPDATE
              SET data = EXCLUDED.data, updated_at = now()`;
  return merged;
}

export async function getSummaryMessage(
  eventId: string,
): Promise<{ channelId: string; messageId: string } | null> {
  const rows = await sql<{ channel_id: string | null; message_id: string | null }[]>`
    SELECT channel_id, message_id FROM details WHERE event_id = ${eventId}`;
  const row = rows[0];
  if (row?.channel_id && row?.message_id) {
    return { channelId: row.channel_id, messageId: row.message_id };
  }
  return null;
}

export async function setSummaryMessage(
  eventId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  await sql`UPDATE details SET channel_id = ${channelId}, message_id = ${messageId}
            WHERE event_id = ${eventId}`;
}