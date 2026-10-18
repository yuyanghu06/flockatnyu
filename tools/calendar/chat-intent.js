// Only the current user message can authorize chat Calendar mutations. Source
// text, history and model arguments never enter this gate. Keep ambiguity read-only.
export function calendarChatIntent(userMessage) {
  if (typeof userMessage !== 'string' || !userMessage.trim() || userMessage.length > 32000) return Object.freeze([]);
  const quoted=' __calendar_quoted__ ';
  let request = userMessage.replaceAll('__calendar_quoted__',' ')
    .replace(/```[\s\S]*?```/g, quoted)
    .replace(/^\s*>.*$/gm, quoted)
    .replace(/"[^"]*"|“[^”]*”|‘[^’]*’/g, quoted)
    .replace(/(?:^|\s)'[^']+'(?=\s|[.,!?;:]|$)/g, quoted);
  // A newline after "summarize this email:" does not promote its body into
  // user authority. Only an explicitly delimited quoted body has a reliable
  // end after which a separate user command can be considered. Unquoted
  // reported bodies grant no authority. Retain a clear outer command before
  // that body ("Create an event from this email:"), never commands in its body.
  const reported = /\b(?:email|message|document|text|note|source|transcript|content|quote|instructions?)\s+(?:says|reads|contains|instructs|asks)\b\s*:?|\b(?:summari[sz]e|read|explain|analy[sz]e|review|translate|inspect|quote)\b[^:\n]{0,160}:|\b(?:summari[sz]e|read|explain|analy[sz]e|review|translate|inspect|quote)\b[^:\n]{0,160}\b(?:email|message|document|text|note|source|transcript|content|instructions?)\b[^:\n]{0,80}\n|\b(?:email|message|document|text|note|source|transcript|content|quote|instructions?)\s*:/gi;
  let cutoff=request.length;const bodyQuotes=[];
  for (const marker of request.matchAll(reported)) {
    const after=marker.index+marker[0].length,body=request.slice(after),leading=body.length-body.trimStart().length;
    if(body.trimStart().startsWith('__calendar_quoted__'))bodyQuotes.push(after+leading);
    else if(body.trim()){cutoff=after;break;}
  }
  request=request.slice(0,cutoff);
  // Delimit reported bodies only. Ordinary quoted event titles remain spaces,
  // preserving commands such as Add "Workshop" to my calendar.
  for(const at of bodyQuotes.reverse())if(at<cutoff)request=request.slice(0,at)+'.'.padEnd('__calendar_quoted__'.length,' ')+request.slice(at+'__calendar_quoted__'.length);
  request=request.replaceAll('__calendar_quoted__',' ');
  const actionFor = value => {
    let clause=value.trim().toLowerCase();
    if (!clause || /\b(?:not|never|unless|hypothetical|example|whether)\b|\b(?:don['’]t|do not|no need to)\b/.test(clause)) return null;
    clause = clause.replace(/^(?:(?:hey|hi|hello|yes)[,\s]+)?(?:(?:can|could|would|will) you\s+|i (?:want|need)(?: you)? to\s+|i['’]d like(?: you)? to\s+)?(?:please\s+)?/, '');
    // A report about an instruction ("the email says add...") is not a command.
    const verb = /^(add|create|schedule|put|book|update|edit|change|move|reschedule|rename|adjust|cancel|delete|remove)\b/.exec(clause)?.[1];
    if (!verb || !['schedule','reschedule'].includes(verb) && !/\b(?:calendar|gcal|events?|meetings?)\b/.test(clause)) return null;
    return ['add','create','schedule','put','book'].includes(verb)?'create':['cancel','delete','remove'].includes(verb)?'delete':'update';
  };
  const clauses=request.split(/[.!?;\n]+/).map(value=>value.trim()).filter(Boolean);
  // Later imperative-looking source lines cannot change a read/report turn
  // into a mutation. The first meaningful unquoted user directive must itself
  // request a Calendar action. Standalone greetings are not directives.
  const first=clauses.find(value=>!/^(?:hi|hello|hey|yes|please|thanks|thank you)[,\s]*$/i.test(value));
  if(!first||!actionFor(first))return Object.freeze([]);
  const actions = new Set(clauses.map(actionFor).filter(Boolean));
  return Object.freeze([...actions]);
}
