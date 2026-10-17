# Schema cleanup audit evidence

schema-inventory.json is a read-only hosted inventory of public Discord/knowledge
tables, exact counts, allocated relation sizes, foreign keys, trigger names and
function/table textual references. It contains no source message/document bodies
or secrets. Active-job counts may change. The primary agent owns this evidence;
no cleanup has been applied. Conclusions are in docs/schema-cleanup-audit.md.
