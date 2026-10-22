const PERSON_AVATAR_PATH = /^\/api\/map\/people\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/avatar$/u;
const LEGACY_PORTRAIT_PREFIX = '/assets/avatars/';

// The API authorizes and streams private Storage images. Accept only its exact,
// person-bound path so profile data cannot make the browser contact other hosts.
export function resolveMapAvatarUrl(value, personId, legacyPortraits = new Map()) {
  if (typeof value !== 'string') return null;
  const proxy = PERSON_AVATAR_PATH.exec(value);
  if (proxy) return proxy[1] === personId ? value : null;

  // Temporary compatibility for profile rows awaiting the Storage backfill.
  // The supplied map contains only build-time approved local artwork imports.
  if (!value.startsWith(LEGACY_PORTRAIT_PREFIX)) return null;
  try {
    const name = decodeURIComponent(value.slice(LEGACY_PORTRAIT_PREFIX.length));
    if (!/^[^/\\?#\u0000-\u001f\u007f]+\.png$/u.test(name)) return null;
    return legacyPortraits.get(name) ?? null;
  } catch {
    return null;
  }
}
