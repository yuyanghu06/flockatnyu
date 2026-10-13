export async function discordAdminRequest(path = '/api/admin/discord', { channel, fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(path, { method: channel ? 'PUT' : 'GET', cache: 'no-store', signal,
    headers: { Accept: 'application/json', ...(channel ? { 'Content-Type': 'application/json' } : {}) },
    ...(channel ? { body: JSON.stringify({ channel }) } : {}) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The administration API is unavailable.'); }
  if (!response.ok) throw new Error(response.status === 403 ? 'Administrator access is required.' : response.status === 503 ? 'The archive database is not ready.' : 'The channel could not be saved. Check its settings.');
  if (!data || data.status !== 'ready') throw new Error('The archive API returned an invalid response.');
  return data;
}

export function newYorkMidnight(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid archive date.');
  const utc = new Date(date + 'T00:00:00.000Z');
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid archive date.');
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let guess = utc.getTime();
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
    const displayed = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    guess += utc.getTime() - displayed;
  }
  return new Date(guess).toISOString();
}
