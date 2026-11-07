/** Reads upcoming events from the club Google Calendar.
 *
 * Same service account as the Python version — the key is split across two
 * env vars (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY) instead of a JSON file,
 * because serverless has nowhere to put a file.
 */

import { JWT } from "google-auth-library";

import { config } from "./config";
import { addDays } from "./schedule";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD in the club timezone
  when: string; // human readable
  location: string;
  description: string;
}

async function accessToken(): Promise<string> {
  const jwt = new JWT({
    email: config.calendar.clientEmail(),
    key: config.calendar.privateKey(),
    scopes: SCOPES,
  });
  const { access_token } = await jwt.authorize();
  if (!access_token) throw new Error("Google refused the service account credentials");
  return access_token;
}

export async function upcoming(today: string): Promise<CalEvent[]> {
  const token = await accessToken();
  const timeMin = new Date(`${today}T00:00:00Z`).toISOString();
  const timeMax = new Date(
    `${addDays(today, config.calendar.lookaheadDays)}T00:00:00Z`,
  ).toISOString();

  const events: CalEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        config.calendar.id(),
      )}/events`,
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { items?: any[]; nextPageToken?: string };
    for (const raw of body.items ?? []) {
      const parsed = parse(raw);
      if (parsed) events.push(parsed);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return events;
}

function parse(raw: any): CalEvent | null {
  if (raw.status === "cancelled") return null;
  if (config.calendar.skipColorIds.includes(String(raw.colorId ?? ""))) return null;

  const title = (raw.summary ?? "Untitled event").trim();
  const upper = title.toUpperCase();
  if (config.calendar.skipTitlePrefixes.some((p) => upper.startsWith(p.toUpperCase()))) {
    return null;
  }

  const allDay = !raw.start?.dateTime;
  let date: string;
  let when: string;

  if (allDay) {
    date = raw.start.date;
    when = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } else {
    const start = new Date(raw.start.dateTime);
    date = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(start);
    when = start.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: config.timezone,
    });
  }

  return {
    id: raw.id,
    title,
    date,
    when,
    location: (raw.location ?? "").trim(),
    description: (raw.description ?? "").trim(),
  };
}
