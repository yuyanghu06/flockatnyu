# Google tools

Gmail/Drive read schemas and execution against an injected Google source client. OAuth and source API implementation remain under ../../server/google/. No email sends or file writes.

Drive tools are `search_drive` (literal text, optional direct-parent folder filter, up to five results), `list_drive_folder` (one live page of up to fifty direct children, including nontext files/folders/shortcuts), and `read_drive` (bounded supported text). Search/list accept an opaque next-page cursor and preserve explicit coverage; no raw provider query or arbitrary returned fields are accepted. Their descriptions advertise the automatically loaded shared Tech@NYU Drive skill for program/semester routing. Existing Google principal authorization remains mandatory, including in autonomous prepared batches, and Drive content supplies no new Calendar/map write authority.

The pure `server/automation/validation.js` module shares the strict opaque Drive page-token pattern, 2048-character bound and runtime predicate across tool schemas, the Google client and chat projection. Printable ASCII punctuation is preserved exactly; whitespace/control bytes (including a trailing newline) are rejected. The automation schema checker permits only this exact reviewed terminal assertion in addition to its existing restricted pattern subset.

Caught Google client failures retain only the fixed diagnostic stage/reason/observed HTTP envelope so operational logging can distinguish failures; no provider response body or exception text is forwarded.
