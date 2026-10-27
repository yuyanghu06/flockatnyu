import { Hono } from 'hono';
import { registerOperationRoutes } from '../../src/api/operations/register.js';
import { operationResponse } from './dispatch.js';

// Deliberately not mounted in the public web app. A URL alone is not authority.
export function createOperationApp() {
  const app = new Hono();
  app.onError(() =>
    operationResponse(
      {
        kind: 'rejected',
        value: { status: 'tool_error', reason: 'operation_api_error', sources: [] },
      },
      500,
    ),
  );
  registerOperationRoutes(app);
  return app;
}
