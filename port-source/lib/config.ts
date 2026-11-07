/** Everything configurable lives in Vercel environment variables. */

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function num(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

export const config = {
  timezone: process.env.TIMEZONE ?? "America/New_York",

  discord: {
    token: () => need("DISCORD_TOKEN"),
    publicKey: () => need("DISCORD_PUBLIC_KEY"),
    appId: () => need("DISCORD_APP_ID"),
    guildId: () => need("GUILD_ID"),
  },

  channels: {
    marketing: () => need("MARKETING_CHANNEL_ID"),
    leadership: () => need("LEADERSHIP_CHANNEL_ID"),
  },

  roles: {
    marketing: () => process.env.MARKETING_ROLE_ID,
    leadership: () => process.env.LEADERSHIP_ROLE_ID,
    events: () => process.env.EVENTS_ROLE_ID,
  },

  calendar: {
    id: () => need("CALENDAR_ID"),
    clientEmail: () => need("GOOGLE_CLIENT_EMAIL"),
    // Vercel stores newlines as the literal characters \n, so put them back.
    privateKey: () => need("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    lookaheadDays: num("LOOKAHEAD_DAYS", 60),
    skipTitlePrefixes: (process.env.SKIP_TITLE_PREFIXES ?? "[TBD],TENTATIVE")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    skipColorIds: (process.env.SKIP_COLOR_IDS ?? "8")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  schedule: {
    postLeadDays: num("POST_LEAD_DAYS", 6),
    marketingWarningDays: num("MARKETING_WARNING_DAYS", 3),
    leadershipLeadDays: num("LEADERSHIP_LEAD_DAYS", 7),
    catchUpDays: num("CATCH_UP_DAYS", 2),
  },

  cronSecret: () => need("CRON_SECRET"),
};

export function mentionRoles(...names: Array<"marketing" | "leadership" | "events">): string {
  return names
    .map((n) => config.roles[n]())
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(" ");
}
