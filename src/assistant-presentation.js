// Presentation only: source identity and href validation stay in chat-client.js.
function decoded(value) {
  for (let i = 0; i < 2; i++) {
    try { const next = decodeURIComponent(value); if (next === value) break; value = next; }
    catch { break; }
  }
  return value;
}

export function sourceLabel(source, href) {
  const url = new URL(href);
  const miro = url.hostname === 'miro.com' || url.hostname.endsWith('.miro.com');
  const boardId = miro && decoded(url.pathname).match(/\/(?:app\/)?board\/([^/]+)/i)?.[1];
  const labels = [source?.title, source?.name].filter(value => typeof value === 'string' && value.trim()).map(value => value.trim());
  if (!boardId) return labels[0] || url.hostname;
  const readable = labels.find(label => {
    const value = decoded(label).replace(/\/$/, '');
    return value !== boardId && !/^Miro board$/i.test(value)
      && value !== decoded(href).replace(/\/$/, '')
      && value.replace(/^\//, '') !== decoded(url.pathname).replace(/^\//, '').replace(/\/$/, '')
      && value.replace(/^Miro board[:\s]+/i, '') !== boardId
      && !/^https?:\/\/(?:[^/]+\.)?miro\.com\/(?:app\/)?board\//i.test(value);
  });
  return readable || 'Miro board';
}

export function assistantShortcut(navigator = {}) {
  const read = getter => { try { return getter(); } catch { return undefined; } };
  const data = read(() => navigator.userAgentData);
  const platform = read(() => data?.platform) || read(() => navigator.platform) || '';
  const agent = read(() => navigator.userAgent) || '';
  const mobile = read(() => data?.mobile) === true || /Android|iPhone|iPad|iPod|Mobile/i.test(`${platform} ${agent}`)
    || (/Mac/i.test(platform) && Number(read(() => navigator.maxTouchPoints)) > 1);
  const mac = /Mac/i.test(platform) || (!platform && /Macintosh|Mac OS X/i.test(agent));
  return { label: mac ? '⌘ K' : 'Ctrl K', key: mac ? 'Meta+K' : 'Control+K', modifier: mac ? 'metaKey' : 'ctrlKey', mobile };
}
