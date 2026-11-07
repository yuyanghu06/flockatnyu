/** Registers the slash commands. Run once, and again whenever you change them.
 *
 *   npm run register
 */

const commands = [
  {
    // No permission restriction — this is the one leadership actually uses.
    name: "event-details",
    description: "Fill in event details for marketing",
    options: [
      {
        type: 5,
        name: "extras",
        description: "Open the extras form (assets, collab) instead",
      },
    ],
  },
  {
    // type 3 = message context menu (right-click a message -> Apps)
    name: "Attach to event",
    type: 3,
  },
  {
    name: "event-info",
    description: "Look up the details submitted for an event",
  },
  {
    name: "check-reminders",
    description: "Run the reminder sweep right now",
    default_member_permissions: "32", // Manage Server
    options: [
      { type: 5, name: "dry_run", description: "Only report what would be sent" },
      {
        type: 3,
        name: "as_of",
        description: "Pretend today is this date (YYYY-MM-DD) — testing only",
      },
    ],
  },
  {
    name: "upcoming",
    description: "Show the reminder timeline for upcoming events",
    default_member_permissions: "32",
  },
  {
    name: "reset-reminders",
    description: "Forget which reminders were already sent (testing)",
    default_member_permissions: "32",
  },
];

async function main() {
  const { DISCORD_TOKEN, DISCORD_APP_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !DISCORD_APP_ID || !GUILD_ID) {
    throw new Error("Set DISCORD_TOKEN, DISCORD_APP_ID and GUILD_ID first");
  }

  const res = await fetch(
    `https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${GUILD_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    },
  );

  if (!res.ok) {
    throw new Error(`Discord ${res.status}: ${await res.text()}`);
  }
  const registered = (await res.json()) as { name: string }[];
  console.log(`Registered ${registered.length}: ${registered.map((c) => c.name).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});