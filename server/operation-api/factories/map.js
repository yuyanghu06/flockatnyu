import { bindOperationApi } from '../adapter.js';
import { createMapOperationService } from '../../map/operations/service.js';
import { createChatMapOperationService } from '../../map/operations/chat.js';

// This private map links constructed endpoint clients to their backend operation
// services. A chat wrapper must not invoke another thin tool or cross HTTP twice.
const backendByClient = new WeakMap();
export function createMapOperationApi(options) {
  const service = createMapOperationService(options);
  const client = bindOperationApi(service);
  backendByClient.set(client, service);
  return client;
}
export function createChatMapOperationApi({ mapTools, service, ...options } = {}) {
  // The service option constructs the lower layer directly. Existing composition
  // may instead pass a client made above; unwrap it before backend construction.
  // An injected backend adapter is accepted for the existing trusted constructor seam.
  const backend = service
    ? createMapOperationService({ service })
    : (backendByClient.get(mapTools) ?? mapTools);
  return bindOperationApi(createChatMapOperationService({ ...options, mapTools: backend }));
}
