export function discordCalendarIntent(content, { cancel = false } = {}) {
  if (typeof content !== 'string' || !content.trim()) return false;
  const text = content.toLowerCase();
  if (/\brsvp\s*[:=-]?\s*(?:yes|no|maybe|accepted|declined|going|not going)\b/.test(text))
    return false;
  if (
    /\b(?:i|we)(?:'m|'re| am| are)?\s+(?:plan(?:ning)?|intend(?:ing)?|want(?:ing)?|hope|hoping)\s+to\s+(?:attend|join|go)\b/.test(
      text,
    )
  )
    return false;
  if (/\b(?:not|never|no longer)\s+(?:cancelled|canceled|called off)\b/.test(text)) return false;
  if (
    /\b(?:i(?:'m|'ll| am| will|’m)?|we(?:'re| are| will)?|[a-z]+ (?:is|are|will))\s+(?:not\s+)?(?:attend(?:ing)?|join(?:ing)?|go(?:ing)?|be there|can help)\b/.test(
      text,
    )
  )
    return false;
  if (
    /^\s*(?:i(?:'ll| will| am|'m|’m)?\s+(?:attend|join|go(?:ing)?|be there|study|studying)|count me in|rsvp\b|i can help)/i.test(
      text,
    )
  )
    return false;
  if (
    /^\s*(?:co[- ]?working\b|studying\b|i(?:'m|’m| am|m)?\s+(?:at|here|heading|working)\b)/i.test(
      text,
    )
  )
    return false;
  if (
    /\b(?:maybe|might|proposed|proposal)\b/.test(text) ||
    /\b(?:cancelled|canceled|rescheduled)\s*\?/.test(text)
  )
    return false;
  const cancelled = /\b(?:cancel(?:led|ed)?|called off)\b/.test(text);
  if (cancel)
    return cancelled && !/\b(?:not|never|no longer|isn't|wasn't|hasn't|don't)\b|["“”?]/.test(text);
  // Semantic event interpretation belongs to the planner. Backend checks retain
  // exact originals, ownership, duplicate coverage and narrow unsafe negatives.
  return !cancelled;
}
