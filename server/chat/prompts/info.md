# Chat prompt assembly

`planning.js` builds the existing tool-selection prompt. `answer.js` builds the
final reply prompt and its bounded reference section. `policies.js` keeps the
existing routing, latest-turn, Contacts, Gmail, Treg and Discord draft instructions;
`time.js` renders the trusted timezone/current-clock instructions.

These functions are re-exported through `../context.js`. They combine existing
policy strings with actual validated context and receipts; retrieved text does
not authorize writes. Reorganization preserved every original string/template
value and byte-identical representative generated prompts. Any future wording
change is a prompt change and needs the project's actual-model verification.
