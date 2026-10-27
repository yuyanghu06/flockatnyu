/**
 * GET /healthz
 *
 * Why: Let the host check that this API process responds before sending people to it.
 * Inputs: No path parameters, query validation or request body. This is the one route
 * outside /api.
 * Access: Public process health; no session, source permission or Origin check.
 * Service and effects: No model, provider, database or business write. Does not assert
 * downstream readiness.
 * Response and failure: 200 JSON {ok:true, service:"tech-nyu-api"}; no source content or
 * credentials.
 */
export function registerHealthzGet({ app }) {
  app.get('/healthz', (c) => c.json({ ok: true, service: 'tech-nyu-api' }));
}
