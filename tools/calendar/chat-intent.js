// Current user commands authorize Calendar mutations. The sole history exception
// is an affirmative response to an immediate confirmation of that user's own
// explicit request. Source text and model arguments never grant authority.
function commandText(userMessage) {
  if (typeof userMessage !== 'string' || !userMessage.trim() || userMessage.length > 32000) return null;
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
  return request.replaceAll('__calendar_quoted__',' ');
}
const verbs = 'add|create|schedule|put|book|update|edit|change|move|reschedule|rename|adjust|cancel|delete|remove';
const fillers = '(?:(?:hey|hi|hello|yes|yeah|yep|sure|okay|ok|please|pls|plz|just|also|then)[,\\s]+)*';
const imperative = new RegExp(`^${fillers}(?:(?:can|could|would|will) you\\s+|i (?:want|need)(?: you)? to\\s+|i['’]d like(?: you)? to\\s+)?${fillers}(${verbs})\\b`, 'i');
const coordinated = new RegExp(`\\s+(?:and|also|then)\\s+(?=${fillers}(?:${verbs})\\b)`, 'i');
const blocked = /\b(?:not|never|unless|hypothetical|example|whether|if)\b|\b(?:don['’]t|do not|no need to)\b/i;
const affirmative = /^(?:yes|yeah|yep|sure|okay|ok)\b/i;
const calendarDomain = /\b(?:calendar|gcal|events?|meetings?)\b/i;
function actionFor(value, inheritedDomain=false, confirmation=false) {
  const clause=value.trim();
  if (!clause || blocked.test(clause)) return null;
  const verb=imperative.exec(clause)?.[1].toLowerCase();
  const anaphora=verb && /^(?:it|this|that|these|those|them|(?:the )?other one)\b/i.test(clause.slice(imperative.exec(clause)[0].length).trim());
  if (!verb || !['schedule','reschedule'].includes(verb) && !calendarDomain.test(clause) && !(inheritedDomain && (confirmation || anaphora))) return null;
  return ['add','create','schedule','put','book'].includes(verb)?'create':['cancel','delete','remove'].includes(verb)?'delete':'update';
}
function currentActions(request, pending=[]) {
  const clauses=request.split(/[.!?;\n]+/).flatMap(value=>value.split(coordinated)).map(value=>value.trim()).filter(Boolean);
  // A read/report directive followed by imperative-looking lines stays read-only.
  // A validated affirmative can precede a new explicit coordinated command.
  const first=clauses.find(value=>!/^(?:hi|hello|hey|yes|yeah|yep|sure|okay|ok|please|pls|plz|thanks|thank you)[,\s]*$/i.test(value));
  if (!pending.length && (!first || !actionFor(first))) return [];
  const actions=new Set(pending);
  let domain=pending.length>0;
  for(const clause of clauses) {
    const action=actionFor(clause,domain);
    if(action){actions.add(action);domain=true;}
  }
  return [...actions];
}
function pendingConfirmation(userMessage,messages) {
  // Only the immediate exchange is considered; unrelated turns, tool/source
  // envelopes and older suggestions cannot resurrect an authorization.
  if(!Array.isArray(messages)||messages.length<3||!affirmative.test(userMessage.trim()))return [];
  const [previous,assistant,current]=messages.slice(-3);
  if(previous?.role!=='user'||assistant?.role!=='assistant'||current?.role!=='user'||current.content!==userMessage)return [];
  if(typeof assistant.content!=='string'||assistant.content.length>32000)return [];
  const prior=calendarChatIntent(previous.content);
  if(!prior.length)return [];
  if(/\b(?:saved|created|added|updated|cancelled|canceled|deleted)\b/i.test(assistant.content))return [];
  const confirmation=commandText(assistant.content);
  if(typeof confirmation!=='string')return [];
  const asked=new Set();
  // Recognize a direct assistant confirmation question, never a statement
  // about a source asking for an action. It can follow factual explanations.
  for(const sentence of confirmation.split(/[.!;\n]+/)) {
    const question=/^\s*(?:should|shall|can|may) i\s+([^?]+)\?/i.exec(sentence);
    if(question){const action=actionFor(question[1],true,true);if(action)asked.add(action);}
  }
  return prior.filter(action=>asked.has(action));
}
export function calendarChatIntent(userMessage,{messages}={}) {
  const request=commandText(userMessage);
  if(typeof request!=='string')return Object.freeze([]);
  const pending=pendingConfirmation(userMessage,messages);
  // Negated/hypothetical affirmative text is never a confirmation.
  const continuation=request.trim().replace(/^(?:yes|yeah|yep|sure|okay|ok)\b[,\s!]*/i,'').replace(/^(?:(?:please|pls|plz)\b[,\s!]*)*/i,'').replace(/^(?:and|also|then)\s+/i,'');
  const confirms=!continuation.replace(/[.!?;\s]/g,'') || Boolean(actionFor(continuation,true));
  const confirmed=pending.length&&confirms&&!blocked.test(request)?pending:[];
  return Object.freeze(currentActions(request,confirmed));
}
