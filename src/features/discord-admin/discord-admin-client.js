export async function discordAdminRequest(
  path = '/api/admin/discord',
  { channel, fetchImpl = fetch, signal } = {},
) {
  const response = await fetchImpl(path, {
    method: channel ? 'PUT' : 'GET',
    cache: 'no-store',
    signal,
    headers: {
      Accept: 'application/json',
      ...(channel ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(channel ? { body: JSON.stringify({ channel }) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The administration API is unavailable.');
  }
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'Administrator access is required.'
        : response.status === 503
          ? 'The channel catalogue is not ready.'
          : 'The channel could not be saved. Check its settings.',
    );
  if (!data || data.status !== 'ready')
    throw new Error('The channel API returned an invalid response.');
  return data;
}
