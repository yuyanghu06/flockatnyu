# Shared server HTTP helpers

These files register no endpoints. `http.js` retains bounded JSON reads,
NDJSON errors and shared result-to-HTTP mappings; `development-auth.js` retains
the loopback-only nonproduction authentication adapter. `chat-input.js` validates
conversation text, attachments, selected-contact context and timezone fields.

`contacts.js` retains saved-Contacts authentication, exact-version validation,
six-field response projection and honest uncertain-write results.
`gmail-send.js` retains Google-access/Origin admission and public receipt
projection. `treg-lookups.js` validates the projected output of dormant lookup
handlers and remains unreachable from the production registration graph.

Helpers are shared only within their named service boundary. They do not dispatch
another service, read an original source implicitly, start a model, or register a
hidden route. Keep credentials and provider-native records outside HTTP responses.
