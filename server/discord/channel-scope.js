// Server-owned routing for the Tech NYU guild. IDs were checked against live
// metadata; names are used only for explicit user requests, never as grants.
export const EBOARD_CATEGORY_ID = '1203562091982622813';
export const LEADERSHIP_CHANNEL_ID = '1203562092213305365';
const teamCategories = new Set(['1203562092213305364','1203562092574277673',
  '1203562092574277676','1203562092574277679','1203562092825813023',
  '1374458522774933564','1515491119138345112']);
export const DISCORD_SCOPES = Object.freeze(['eboard','general','team','all']);
export function discordChannelScope(channel, channels) {
  const map = channels instanceof Map ? channels : new Map();
  let row = channel; const seen = new Set();
  while (row && !seen.has(row.id)) {
    seen.add(row.id);
    if (row.id === EBOARD_CATEGORY_ID) return 'eboard';
    if (teamCategories.has(row.id)) return 'team';
    row = map.get(row.parent_id);
  }
  return 'general';
}
const words = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function explicitlyRequestedTeam(userMessage, channel, channels) {
  // Negative clauses cannot opt a user into a team. Keep distinct affirmative
  // sentences so “don't read marketing; read engineering” can still select the
  // second team without giving the first one access.
  const requests = String(userMessage || '').split(/[.;!?\n]/u).map(words)
    .filter(clause => !/\b(do not|don t|dont|never|avoid|skip|exclud\w*|except|without|not|other than|leave out|omit\w*|ignor\w*|instead of|rather than|shouldn t)\b/.test(clause))
    .filter(clause => /\b(read|show|summari[sz]e|check|tell|what|when|where|how|news|updates?|anything|find|search|look|give|brief|review|recap|latest)\b/.test(clause))
    .filter(clause => !(/\beboard\b/.test(clause)&&/\b(about|regarding|mentioning|discussing|related to|for|with|on)\b/.test(clause)));
  if (!requests.length) return false;
  const names = []; let row = channel; const seen = new Set();
  while (row && !seen.has(row.id)) { seen.add(row.id); names.push(words(row.name)); row = channels?.get(row.parent_id); }
  return requests.some(request => {
    if (/\b(all|every) (?:the )?team(?:s| channels)?\b/.test(request)
      || /\b(read|check|summari[sz]e|show) (?:the )?team channels\b/.test(request)
      || /\b(in|through|across) (?:the )?team channels\b/.test(request)) return true;
    if (/\beboard\b/.test(request)&&!/\b(and|plus|also|then)\b/.test(request)) return false;
    return names.some(name => {
    if (!name || ['eboard teams','team','teams'].includes(name)) return false;
    const distinctive = name.split(' ').filter(word => word.length >= 3 && !['team','teams','general','events','program','and','content','announcements','random','pictures','website','members','the','meeting','meetings','chat','discussion','discussions','update','updates'].includes(word));
    // A full team name remains explicit even when its subject is generic
    // (content/events/website team). A bare “meetings” channel is not a team.
    if (!distinctive.length) return /\bteam\b/.test(name)
      && (' ' + request + ' ').includes(' ' + name + ' ');
    if ((' ' + request + ' ').includes(' ' + name + ' ')) return true;
    // Multiword team names must match together: “tech treks” cannot opt in to
    // another “tech …” team or to any channel whose name includes “meetings”.
    return (' ' + request + ' ').includes(' ' + distinctive.join(' ') + ' ');
    });
  });
}
