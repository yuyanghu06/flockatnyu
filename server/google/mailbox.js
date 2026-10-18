// Extract one unambiguous From mailbox. Display-name text is never identity.
// Unsupported address syntax is deferred rather than guessed.
export function sourceMailbox(value) {
  if (typeof value !== 'string' || value.length > 1000 || /[\r\n\x00]/.test(value)) return null;
  const header = value.trim();
  const angle = /^(?:"(?:[^"\\]|\\.)*"|[^<>,;"\r\n]*)?\s*<([^<>\s]+)>$/u.exec(header);
  const address = angle ? angle[1] : header;
  return /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/u.test(address) ? address.toLowerCase() : null;
}
