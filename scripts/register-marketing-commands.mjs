// Registers named marketing slash commands in the configured guild, one at a
// time. It uses the single-command POST endpoint, which creates the command or
// updates the existing command with the same name. It never calls the bulk
// PUT endpoint, so every other command on the application is left unchanged.
//
//   npm run marketing:register -- event-info            # register one command
//   npm run marketing:register -- event-info --dry-run  # print, send nothing
import { REST } from '@discordjs/rest';
import { readDiscordConfig } from '../server/discord/config.js';
import { MARKETING_COMMANDS } from '../server/marketing/commands.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const names = args.filter((arg) => arg !== '--dry-run');

if (!names.length || names.some((name) => !Object.hasOwn(MARKETING_COMMANDS, name))) {
  console.error(
    `Name the commands to register. Known: ${Object.keys(MARKETING_COMMANDS).join(', ')}`,
  );
  process.exit(1);
}

const config = readDiscordConfig(process.env);
if (dryRun) {
  for (const name of names)
    console.log(
      JSON.stringify({ guildId: config.guildId || null, command: MARKETING_COMMANDS[name] }),
    );
  process.exit(0);
}
if (!config.configured) {
  console.error('DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set.');
  process.exit(1);
}

const rest = new REST({ version: '10', timeout: 15000, retries: 0 }).setToken(config.botToken);
try {
  const application = await rest.get('/applications/@me');
  for (const name of names) {
    const saved = await rest.post(
      `/applications/${application.id}/guilds/${config.guildId}/commands`,
      {
        body: MARKETING_COMMANDS[name],
      },
    );
    console.log(JSON.stringify({ status: 'registered', name: saved.name, id: saved.id }));
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', httpStatus: error?.status ?? null }));
  process.exitCode = 1;
}
