/** Compose existing endpoint registrations only; this module defines no route itself. */
import { registerApiContactsGet } from './get.js';
import { registerApiContactsIdGet } from './[id]/get.js';
import { registerApiContactsPost } from './post.js';
import { registerApiContactsIdPatch } from './[id]/patch.js';
import { registerApiContactsIdDelete } from './[id]/delete.js';
export function registerContactsApi(dependencies) {
  registerApiContactsGet(dependencies);
  registerApiContactsIdGet(dependencies);
  registerApiContactsPost(dependencies);
  registerApiContactsIdPatch(dependencies);
  registerApiContactsIdDelete(dependencies);
}
