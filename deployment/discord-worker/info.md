# Railway Discord workers

Run `npm run deploy:discord:prepare` to prepare a fresh 25-file backend context.
Compare it with current source before uploading. The context excludes `.env`,
map assets, migrations, tests and evidence. Its Docker image uses Node 22,
production dependencies, an API check and a non-root runtime. Credentials belong
in private Railway variables; the summary service needs no Discord bot token.

The summary service is `69883843-95df-4d3b-9a16-e44983e1964e` in the production
environment of the tech-nyu project. Accepted deployment
`d0c15dd5-544e-4349-968e-c9bdcda11bd5` completed the initial historical bootstrap and Monday rollover. Successful
one-shot jobs exit zero and stop normally.
Start command: `node server/discord/summary-cli.js scheduled --max-runs 100`.
Restart policy is NEVER with zero retries and no HTTP health check.
Cron `0 12,13 1 * 1` checks both UTC offsets; the application permits scheduled
work only at 08:00 America/New_York on Mondays or the first of the month.
A pending bootstrap can resume outside that hour. An independent live review confirmed that the service and effective image
settings match. An actual scheduled summary invocation has not been verified;
absence of logs does not prove a missed trigger. Next summary slot is October19.

An image uploaded to a service with cron configured may wait for its scheduled
start. An explicit restart of the accepted deployment and actual database request
progress verified both the original bootstrap and Monday rollover resumption. Do not run a second paid worker
or reset the existing operation's budgets. See the rolling milestone for counts.

The archive service is `2dad5e78-ff4f-4342-acc3-bf3daba2f3f3`. Its start command
is `node server/discord/cli.js sync` and daily cron is `15 6 * * *`.
Successful one-shot jobs exit zero and stop normally. Updated deployment `698e7995-d508-4cfe-9976-31d4da7efe5f` has built
successfully. Its explicit collection run after compaction completed ready/exit0
across 216 sources and stopped normally. No consumed history was re-imported.
The rolling milestone records counts; build status alone does not establish
execution.
Before final retention acceptance, refresh the calendar cutoff if work crosses
New York Monday midnight; October 5–11 was the initial frozen protected week.
