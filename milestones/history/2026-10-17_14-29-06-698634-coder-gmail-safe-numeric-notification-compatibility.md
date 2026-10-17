# Safe numeric Gmail notification compatibility

- Local timestamp / acting role / milestone: 2026-10-17_14-29-06-698634 America/New_York / coder / M35.
- Scope/files: subscription.js, subscription-cli.js and server/google/info.md only; no tests/cloudwrites.
- Work: exact positive safe-integer numeric notification wake-up hints convert to decimal strings. Unsafe/fractional/nonpositive/nonfinite numbers stay invalid; provider API cursors remain strings and never derive from push hints. CLI logs only allowlisted classification with fixedreason.
- Checks: syntax/whitespace PASS;38/39previous tests pass, with sole outdated fixture push123 intentionally now valid and awaiting tester-owned update. No live outcome claimed.
- Remaining: independent numeric/wakeup/cursor tests, review, redeploy and signedretry verification.
