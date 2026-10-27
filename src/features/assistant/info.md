# Assistant interface

`assistant.js` creates one assistant and binds its page and keyboard lifecycle.
The running instance is held in a private `view` object shared by its modules:
`assistant-elements.js` builds DOM/state, `assistant-layout.js` controls the modal
and resizing, `assistant-queue.js` manages pending messages and steering,
`assistant-composer.js` handles selected contacts/files, and
`assistant-response.js` streams replies and renders tool activity.

`chat-client.js` owns HTTP transport; `chat-attachments.js` reads user-selected
files using the existing shared validator. Markdown and shortcut presentation
remain separate helpers. CSS imports preserve shell, transcript, queue and
responsive rule order. Keep uncertain sends and queued request IDs intact.
