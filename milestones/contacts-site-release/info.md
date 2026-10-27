# Approved Contacts design site release

Apply the approved standalone Contacts design to the real API-backed Contacts view, preserving authentication, partial timestamp-checked updates, legacy values, draft/error handling and map/assistant isolation. Publish only the compatible website service, including the existing Contacts backend routes/store and real built assets. Never package sample data or mock entry points. No worker/collector deployments, environment changes or schema migrations.

Completion requires independent synthetic browser-to-API CRUD/error checks, builds/package inspection, final review, successful website deployment and actual authenticated read/visual verification. Live contact mutations are unnecessary. Current status lives in [the milestone snapshot](../milestone.md).

Complete: web `a3bc66fa-2911-449b-ba38-3cb6fb71db98` is live and independently accepted. Synthetic browser-to-API CRUD/error tests, builds/package verification and real hosted auth/assets/Contacts list plus browser checks pass. Hosted CRM is empty; no live mutations/model calls or worker/collector/env/schema changes were performed.

Latest frontend-only refinement: web `fe61b7e8-872d-418b-887a-9ad50af92848` removes the duplicate empty CTA and uses a12px Search-to-message gap. Actual hosted verification accepted. Backend bytes remain those of prior live release; separate local Treg additions were excluded.
