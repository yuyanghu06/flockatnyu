/** Diagnostic: what can the service account actually see?
 *
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/check-calendar.ts
 */

import { JWT } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

async function main() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const calendarId = process.env.CALENDAR_ID;

  console.log("GOOGLE_CLIENT_EMAIL:", email || "(EMPTY)");
  console.log("CALENDAR_ID:", calendarId ? `[${calendarId}]` : "(EMPTY)");
  console.log("GOOGLE_PRIVATE_KEY:", key ? `${key.length} chars` : "(EMPTY)");
  console.log();

  if (!email || !key) throw new Error("Credentials missing from the environment");

  const jwt = new JWT({ email, key, scopes: SCOPES });
  const { access_token } = await jwt.authorize();
  console.log("Auth: OK\n");

  // 1. Everything this service account has been given access to.
  const listRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  const list = (await listRes.json()) as any;

  if (!list.items?.length) {
    console.log("This service account can see NO calendars.");
    console.log(`Share the calendar with: ${email}`);
  } else {
    console.log("Calendars this service account can see:");
    for (const cal of list.items) {
      const match = cal.id === calendarId ? "  <-- matches CALENDAR_ID" : "";
      console.log(`  ${cal.id}  (${cal.summary}) [${cal.accessRole}]${match}`);
    }
  }
  console.log();

  // 2. Direct hit on the configured ID.
  if (calendarId) {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    if (res.ok) {
      const cal = (await res.json()) as any;
      console.log(`CALENDAR_ID resolves: "${cal.summary}" — this should work.`);
    } else {
      console.log(`CALENDAR_ID failed with ${res.status}.`);
      console.log("Either the ID is wrong, or it isn't shared with the service account.");
    }
  }
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});