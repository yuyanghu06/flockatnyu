// Calendar placement uses only the existing fixed building catalogue. Provider
// text is bounded by the Calendar location field; no source/identity lookup runs.
const normalize = (value) =>
  String(value || '')
    .slice(0, 500)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\bst\b/g, 'street')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\be lab\b/g, 'elab');
const genericWords = new Set([
  'a',
  'an',
  'and',
  'at',
  'the',
  'of',
  'for',
  'in',
  'nyu',
  'new',
  'york',
  'building',
  'buildings',
  'center',
  'centre',
  'hall',
  'room',
  'rooms',
  'lab',
  'laboratory',
  'library',
  'school',
  'university',
  'campus',
  'common',
  'other',
  'north',
  'south',
  'east',
  'west',
  'street',
  'avenue',
  'place',
  'square',
]);
const letters = (value) => [...value.replace(/[^\p{L}]/gu, '')].length;
const uncertain = (value, raw) =>
  String(raw || '')
    .slice(0, 500)
    .includes('?') ||
  /(?:^| )(?:or|either|tbd|maybe|tentative|unknown|to be determined|to be confirmed)(?: |$)/.test(
    value,
  );

// Banded optimal-string-alignment distance: adjacent transposition counts as
// one typo. The fixed 1/2 edit budget bounds each row; length mismatch and rows
// outside that budget stop before an unbounded quadratic comparison.
function withinEdits(left, right, limit) {
  const a = [...left],
    b = [...right];
  if (Math.abs(a.length - b.length) > limit) return false;
  const beyond = limit + 1;
  let beforePrevious;
  let previous = new Map();
  const at = (row, column) => row?.get(column) ?? beyond;
  for (let column = 0; column <= Math.min(b.length, limit); column++) previous.set(column, column);
  for (let row = 1; row <= a.length; row++) {
    const current = new Map();
    if (row <= limit) current.set(0, row);
    let minimum = at(current, 0);
    for (
      let column = Math.max(1, row - limit);
      column <= Math.min(b.length, row + limit);
      column++
    ) {
      let distance = Math.min(
        at(previous, column) + 1,
        at(current, column - 1) + 1,
        at(previous, column - 1) + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1])
        distance = Math.min(distance, at(beforePrevious, column - 2) + 1);
      current.set(column, distance);
      minimum = Math.min(minimum, distance);
    }
    if (minimum > limit) return false;
    beforePrevious = previous;
    previous = current;
  }
  return at(previous, b.length) <= limit;
}

function catalogueAliases(buildings) {
  const aliases = new Map();
  for (const row of buildings) {
    if (typeof row?.id !== 'string' || !row.id) continue;
    for (const label of [
      row.id,
      row.name,
      ...(Array.isArray(row.aliases) ? row.aliases.slice(0, 30) : []),
    ]) {
      const key = normalize(label);
      if (key.length < 3) continue;
      if (!aliases.has(key)) aliases.set(key, new Set());
      aliases.get(key).add(row.id);
    }
  }
  return [...aliases].map(([alias, ids]) => {
    const size = letters(alias);
    const budget =
      /^[\p{L} ]+$/u.test(alias) &&
      size >= 5 &&
      alias.split(' ').some((word) => !genericWords.has(word))
        ? size < 12
          ? 1
          : 2
        : 0;
    return { alias, ids, words: alias.split(' ').length, budget };
  });
}

export function matchCalendarBuildings(location, buildings = []) {
  const text = normalize(location),
    tokens = text ? text.split(' ') : [];
  if (!tokens.length || !Array.isArray(buildings) || buildings.length > 100)
    return { status: 'unknown', buildingIds: [] };
  const aliases = catalogueAliases(buildings),
    hits = new Set(),
    exactTokens = new Set();
  const starts = [];
  let offset = 0;
  for (const token of tokens) {
    starts.push(offset);
    offset += token.length + 1;
  }
  // Whole-token exact matches have priority. Canonical collisions remain
  // ambiguous, including catalogue aliases spelling eLab / E-Lab differently.
  for (const { alias, ids, words } of aliases) {
    for (let start = 0; start + words <= tokens.length; start++) {
      const end = starts[start] + alias.length;
      if (!text.startsWith(alias, starts[start]) || (end < text.length && text[end] !== ' '))
        continue;
      if (ids.size > 1) return { status: 'ambiguous', buildingIds: [] };
      hits.add([...ids][0]);
      for (let index = start; index < start + words; index++) exactTokens.add(index);
    }
  }
  if (hits.size > 1 || (hits.size && uncertain(text, location)))
    return { status: 'ambiguous', buildingIds: [] };
  const exactPrefix = [0];
  for (let index = 0; index < tokens.length; index++)
    exactPrefix.push(exactPrefix[index] + Number(exactTokens.has(index)));
  // Compare only bounded whole-token windows. One added/deleted space can
  // match Pa ulson / BobstLibrary, while a substring inside SuperBobst cannot.
  for (const { alias, ids, words, budget } of aliases) {
    if (!budget) continue;
    for (let start = 0; start < tokens.length; start++) {
      if (exactTokens.has(start)) continue;
      for (let count = Math.max(1, words - budget); count <= words + budget; count++) {
        if (start + count > tokens.length) break;
        if (exactPrefix[start + count] !== exactPrefix[start]) continue;
        const end = start + count < tokens.length ? starts[start + count] - 1 : text.length;
        if (Math.abs(end - starts[start] - alias.length) > budget) continue;
        const candidate = text.slice(starts[start], end);
        if (letters(candidate) < 5) continue;
        if (!/^[\p{L} ]+$/u.test(candidate) || !withinEdits(alias, candidate, budget)) continue;
        for (const id of ids) hits.add(id);
        if (hits.size > 1) return { status: 'ambiguous', buildingIds: [] };
      }
    }
  }
  if (hits.size && uncertain(text, location)) return { status: 'ambiguous', buildingIds: [] };
  return { status: hits.size ? 'matched' : 'unknown', buildingIds: [...hits].sort() };
}
