# Softer cursor and password placeholder

- Local timestamp / acting role / milestone: 2026-10-18T17:30:02.753307-04:00 / direct implementation and verification / password UI refinements.
- Requested scope: soften the massive cursor, position slightly left and show enter password until typing begins.
- Starting repository state: prior local cursor-only template and journal edits; production unchanged.
- Work performed / changed files: server/web.js uses a rounded gray cursor with smooth1.5s opacity breathing, responsive32–64px left shift and gray lowercase enter password copy beside it. Native input placeholder drives CSS :placeholder-shown so text hides immediately for any nonempty value and returns when cleared. No JavaScript or password mirroring. Existing hidden entry/native POST remains. Reduced-motion cursor stays steady.
- Decisions: cursor remains fixed when placeholder hides, so typing causes no layout jump; typed characters remain invisible as in prior pass. White background retained.
- Checks and evidence: node --test tests/site-auth.test.mjs7/7pass. Chrome preview refreshed; visually verified rounded gray cursor left of center with placeholder. Typed synthetic preview text without submitting and visually confirmed placeholder disappears; cleared field and left page ready. No real credentials, network submission, auth changes or deployment. Scoped whitespace check passes.
- Resulting state / acceptance: requested visual refinement implemented and open in Chrome.
- Remaining work and handoff: next user visual refinement; local preview remains on127.0.0.1:5174/login.
