# update contact

## description

<!-- prompt: description -->
Update one unambiguous contact only after read_contact in this request. First match actual user-supplied identifying facts against all observed candidates. Multiple same-name matches without a distinguishing user fact require clarification before any candidate read or write; desired new field values, ranking and an exact read do not resolve that ambiguity. Preserve the pending change while asking which person. Supply the exact saved updated_at. Only supplied fields change; an empty string explicitly clears a field. Preserve other and legacy fields. Never repeat an uncertain write.
<!-- /prompt -->
