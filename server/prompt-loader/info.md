# Server prompt loader

Loads the explicitly listed Markdown assets in the repository's `prompts/`
folder. Callers use fixed references; requests and model output never choose
paths. Named blocks preserve their exact whitespace. Named `{{values}}` are
substituted once as text, with missing and extra values rejected. The loader
does not render Markdown, execute expressions or expand inserted data.

Assets are cached for the process. Restart the service after wording changes.
The asset list also supplies source-only packages and copied evaluation sources.
