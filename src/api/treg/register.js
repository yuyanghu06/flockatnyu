/** Compose existing endpoint registrations only; this module defines no route itself. */
import { registerApiTregPeopleEmailFindPost } from './people/email/find/post.js';
import { registerApiTregPeopleEmailVerifyPost } from './people/email/verify/post.js';
import { registerApiTregPeoplePhoneFindPost } from './people/phone/find/post.js';
import { registerApiTregCompaniesEnrichPost } from './companies/enrich/post.js';
export function registerTregLookupApi(dependencies) {
  registerApiTregPeopleEmailFindPost(dependencies);
  registerApiTregPeopleEmailVerifyPost(dependencies);
  registerApiTregPeoplePhoneFindPost(dependencies);
  registerApiTregCompaniesEnrichPost(dependencies);
}
