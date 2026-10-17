# M28: schema simplification and shared source access

Goal: complete the approved cleanup after the live-first summary transition.
Migrations 013–016 remove 14 empty obsolete tables, simplify Miro to 12 columns,
rename the policy table to discord_view_policies and remove two membership tables
at the user’s request. The shared assistant uses server-owned source scope and
backend admin checks, preserving summaries, provenance, usage and source records.

Independent local SQL/runtime acceptance is complete. Hosted application,
preservation readback and all three final reviewed worker image builds are complete. Current state and final receipts live in ../milestone.md.
