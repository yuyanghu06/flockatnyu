# Tech@NYU reminder bot — serverless version

Same bot, no always-on process. Discord POSTs each click to `/api/discord`;
Vercel Cron hits `/api/sweep` once a day. Nothing of yours is ever "running",
so nothing can be "down".

| Python version | This version |
| --- | --- |
| gateway websocket | HTTP interactions endpoint |
| `sleep_until` in-process | Vercel Cron |
| SQLite file | Postgres (Neon / Supabase) |
| `service-account.json` | two env vars |
| your laptop | Vercel free tier |

The reminder timeline and the two modals are unchanged.

## 1. Database

Make a free Postgres at [Neon](https://neon.tech) or Supabase, copy the
connection string. Tables are created automatically on first request.

## 2. Deploy

```bash
npm install
npx vercel          # links/creates the project
npx vercel --prod
```

Add every variable from `.env.example` in Vercel → Settings → Environment
Variables. Two to watch:

- `GOOGLE_PRIVATE_KEY` — paste the whole key *with* the `\n` escapes, in quotes,
  exactly as it appears in `service-account.json`. The code converts them back.
- `CRON_SECRET` — any long random string. Vercel sends it to `/api/sweep`.

`DISCORD_PUBLIC_KEY` is on the Developer Portal's General Information page,
next to the Application ID. It is not the token.

## 3. Point Discord at it

Developer Portal → General Information → **Interactions Endpoint URL**:

```
https://bot.techatnyu.org/api/discord
```

Save. Discord immediately sends a signed PING plus some deliberately malformed
requests; it only accepts the URL if you answer the good one and reject the bad
ones with 401. If it refuses, the signature check or `DISCORD_PUBLIC_KEY` is
wrong — nothing else causes this.

## 4. Register the commands

```bash
DISCORD_TOKEN=... DISCORD_APP_ID=... GUILD_ID=... npm run register
```

## 5. Custom domain

Vercel → Settings → Domains → add `bot.techatnyu.org`. Vercel shows a CNAME
record; whoever controls the DNS for techatnyu.org adds it. You can test on the
`*.vercel.app` URL in the meantime — Discord accepts it fine.

## Cron timing

`vercel.json` runs the sweep at `0 13 * * *` — **13:00 UTC**, which is 9am
Eastern during daylight saving and 8am in winter. Vercel Cron is UTC only. If
the winter hour bothers you, change it in November.

The Hobby plan allows one cron job per day, which is exactly what this uses.

## Testing

Same commands as the Python version:

```
/upcoming
/check-reminders dry_run:True as_of:2026-10-23
/reset-reminders
```

To trigger the sweep by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://bot.techatnyu.org/api/sweep
```

Logs are in Vercel → Deployments → Functions. There's no terminal to watch, so
that's where failures show up.

## Local development

`npm run dev` serves on localhost, which Discord can't reach. Use `ngrok http
3000` and put the ngrok URL in the Interactions Endpoint field while you work,
then switch it back. Only one endpoint URL can be active at a time, which is a
good reason to make a second Discord application for development.

## Files

| Path | What it does |
| --- | --- |
| `app/api/discord/route.ts` | Every button, modal and slash command |
| `app/api/sweep/route.ts` | Cron entry point |
| `lib/schedule.ts` | The timeline math (port of `schedule.py`) |
| `lib/sweep.ts` | Decides what's due, composes the reminders |
| `lib/calendar.ts` | Google Calendar |
| `lib/details.ts` | Modals, buttons, summary embed |
| `lib/store.ts` | Postgres |
| `lib/discord.ts` | REST calls + Ed25519 verification |
