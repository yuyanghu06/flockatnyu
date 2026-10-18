// A conservative current-turn action fence. Retrieved text and negated action
// clauses cannot request a map mutation on behalf of the chat user.
export function requestsMapUpdate(message) {
  if (typeof message!=='string') return false;
  return message.split(/[;!?\n]+|\.(?=\s|$)/u).some(clause=>
    !/\b(do not|don['’]?t|never|avoid|skip|without|not|instead of|rather than)\b/i.test(clause)
    && /\bmap\b/i.test(clause)
    && /\b(update|add|put|record|save|change|remove|correct|mark)\b/i.test(clause));
}
