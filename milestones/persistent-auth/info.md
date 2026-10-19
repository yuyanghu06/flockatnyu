# Persistent website login

Goal: password entry remembers this browser for30days, including restarts. Scope: signed host-only cookie lifetime/expiry, logout, focused security tests and auth-only web rollout. Acceptance: independent tests plus hosted cookie/protected/logout verification; preserve other web/Discord changes and all access boundaries. Status: complete and live. Web 5307cf5e issued a verified 30-day cookie; protected access and logout passed. Existing 12-hour cookies require one re-login. Physical browser restart was not performed. Authoritative live state is ../milestone.md.
