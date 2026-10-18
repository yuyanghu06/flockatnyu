# Map buildings and avatar people

Goal: create service-only Supabase buildings/person tables after proposal review, add first/last names, seed all26people in assets/avatars and match their Discord identities using the existing configured bot.

Scope: nine selectable locations (including the Arch),26avatar rows, validated JSONB people_here arrays, atomic service-only presence RPCs, conservative name matching and explicit conditional imports. No source-membership grants, frontend changes, inferred presence or broad guild directory archive.

Status: tables hosted through021(receipt20261017194715),26people/9locations/allpresenceempty verified. All26unique Discord identities linked after live checks:15initial name matches plus11user confirmations. Role audit:25Eboard and one explicitly approved senior-advisor exception. No pending identities. Local26checks and Discord5checks/API build pass; evaluator ACCEPT. Matching rerun performs zero writes. Calendar deferral remains unchanged.

Identity linking is complete. Preserve user-confirmed identities/name spellings and original provider display names; never replace them with fresh name guesses. Future frontend/agent map tools must enforce source access independently of provenance stored in JSON.
