# Google tools

Gmail/Drive read schemas and execution against an injected Google source client. OAuth and source API implementation remain under ../../server/google/. No email sends or file writes.

Drive tools are `search_drive` (literal text, optional direct-parent folder filter, up to five results), `list_drive_folder` (one live page of up to fifty direct children, including nontext files/folders/shortcuts), and `read_drive` (bounded supported text). Search/list accept an opaque next-page cursor and preserve explicit coverage; no raw provider query or arbitrary returned fields are accepted. Their descriptions advertise the automatically loaded shared Tech@NYU Drive skill for program/semester routing. Existing Google principal authorization remains mandatory, including in autonomous prepared batches, and Drive content supplies no new Calendar/map write authority.
