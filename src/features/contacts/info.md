# Contacts interface and design mock

`contacts.js` creates the production directory and connects lifecycle events.
`contacts-client.js` validates the saved-Contacts HTTP contract. The instance's
private `view` object connects element creation, directory search, detail/editor
rendering, mutations and modal lifecycle in their corresponding modules.
`contacts-helpers.js` contains labels, icons and small rendering helpers.

`contacts-mock.js` and `contacts-mock-*` contain the separate synthetic design
mock used by `contacts-mock.html`; they do not call production storage. Preserve
that boundary and native data/human edits in production client operations.
CSS imports keep the original shell, directory, profile and form rule order.
