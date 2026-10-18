// A conservative current-turn action fence. Retrieved text and negated action
// clauses cannot request a map mutation on behalf of the chat user.
export function requestsMapUpdate(message) {
  if (typeof message!=='string') return false;
  return message.split(/[;!?\n]+|\.(?=\s|$)/u).some(clause=>
    !/\b(do not|don['’]?t|never|avoid|skip|without|not|instead of|rather than)\b/i.test(clause)
    && /\bmap\b/i.test(clause)
    && /\b(update|add|put|record|save|change|remove|correct|mark)\b/i.test(clause));
}

// A separate, narrow authorization for chat-declared attendance. This never
// supplies provider identity or authorizes a general event replacement.
export function chatAttendanceDeclarations(message) {
  if (typeof message !== 'string') return [];
  // Preserve quote context before splitting lines: a middle line inside a
  // fenced or quoted example must never become a fresh user declaration.
  const unquoted=message.replace(/```[\s\S]*?(?:```|$)/gu,'\n')
    .replace(/`[^`]*(?:`|$)|"[^"]*(?:"|$)|“[^”]*(?:”|$)/gu,'\n')
    .replace(/(^|[\s:])'[^']*'/gu,'$1\n');
  return unquoted.split(/[;!\n]+|\.(?=\s|$)/u).map(value=>value.trim()).filter(clause => {
    if (!clause || /[?"“”`<>]/u.test(clause)
      || /\b(not|never|no|don['’]?t|won['’]?t|would|could|might|maybe|perhaps|if|unless|hypothetical|example|quote|said|says|reported|history)\b/i.test(clause)) return false;
    const match = /^([\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*){0,4})\s+(?:will\s+(?:be\s+(?:going\s+to|attending|at)|attend|go\s+to)|is\s+(?:going\s+to|attending)|plans\s+to\s+attend)\s+\S/iu.exec(clause);
    return Boolean(match && !/\b(i|me|myself|we|us|you|he|she|they|someone|somebody|everyone|anyone|nobody)\b/i.test(match[1]));
  });
}

export function requestsChatAttendance(message) {
  return chatAttendanceDeclarations(message).length>0;
}
