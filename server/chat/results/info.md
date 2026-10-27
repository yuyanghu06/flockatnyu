# Model-facing tool result projections

Each service file copies only the supported, bounded fields from its own result:
Contacts, Treg, Gmail sends, Calendar, map, Discord, Drive, Miro, Attio and saved
memory/bug receipts are separate. `coverage.js` preserves the final common
coverage/truncation/channel metadata rules. `../public-result.js` invokes these
projections in the original order.

Projection changes no service data and invokes no tool. Confirmed receipt fields
and source access remain necessary for a success claim. Complete native Contacts
or Treg objects, outgoing email bodies, credentials and private log handles must
stay out of model-visible results and streaming metadata. Preserve the early
return rules for Gmail sends and native Treg imports.
