// Operational diagnostics only: never serialize errors, event payloads or IDs.
const codes=new Set(['aborted','not_configured','invalid_checkpoint','invalid_gateway_session','checkpoint_unavailable','checkpoint_conflict',
  'checkpoint_response_too_large','checkpoint_invalid_response','policy_unavailable','catalogue_unavailable','invalid_event','invalid_metadata',
  'metadata_changed','policy_changed','enqueue_failed','metadata_refresh_failed','metadata_refresh_pending','invalid_request','paused','disabled',
  'database_unavailable','concurrent_discovery','channel_scope_denied','invalid_response','invalid_cursor','permission_denied','invalid_token',
  'not_found','rate_limited','discord_unavailable','discovery_failed','response_too_large','invalid_channel','invalid_message','budget_exhausted','indexing',
  'queue_overflow','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','EHOSTUNREACH','ENETUNREACH','EPIPE',
  'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','EADDRINUSE','EACCES']);
const sdkMessages=new Map([['Authentication failed','gateway_authentication_failed'],['Invalid shard','gateway_invalid_shard'],
  ['Sharding is required','gateway_sharding_required'],['Used an invalid API version','gateway_invalid_api_version'],
  ['Used invalid intents','gateway_invalid_intents'],['Used disallowed intents','gateway_disallowed_intents']]);
const statuses=new Set(['collector_starting','collector_failed','collector_stopping','collector_unavailable','gateway_closed','gateway_ready','gateway_resumed',
  'gateway_socket_error','session_reset','event_queued','discord_chat_dispatch_failed','discord_chat_unavailable','server_unavailable','metadata_refresh_failed']);
const stages=new Set(['checkpoint_load','checkpoint_validate','checkpoint_save','gateway_create','gateway_connect','gateway_sdk','gateway_socket',
  'gateway_closed','gateway_session','event_ingestion','event_metadata_refresh','queue_overflow','chat_dispatch','chat_startup','server_startup',
  'periodic_metadata_refresh','startup','shutdown','chat_shutdown','gateway_shutdown','server_shutdown','top_level']);
const eventTypes=new Set(['MESSAGE_CREATE','MESSAGE_UPDATE','MESSAGE_DELETE','MESSAGE_DELETE_BULK','CHANNEL_CREATE','CHANNEL_UPDATE','CHANNEL_DELETE',
  'THREAD_CREATE','THREAD_UPDATE','THREAD_DELETE','READY','RESUMED']);
const reasons=new Set(['SIGTERM','SIGINT','requested','collector_failure','startup_failure','server_failure']);
// Reading a throwing property must not prevent shutdown or expose its value.
const field=(value,key)=>{try{return value?.[key];}catch{return undefined;}};
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
export function collectorErrorFields(error) {
  const result={errorCode:'unknown_error'},seen=new Set();let first=true;
  for(let depth=0;error&&depth<4&&!seen.has(error);depth++) {
    seen.add(error);
    const code=field(error,'code'),message=field(error,'message'),name=field(error,'name');
    const known=codes.has(code)?code:codes.has(message)?message:sdkMessages.get(message)
      ??(name==='AbortError'?'aborted':name==='TimeoutError'?'timeout':name==='SyntaxError'?'invalid_response':null);
    if(known) {if(first){result.errorCode=known;first=false;}else if(known!==result.errorCode&&!result.causeCode)result.causeCode=known;}
    const status=field(error,'httpStatus')??field(error,'status')??field(error,'statusCode');
    if(integer(status,100,599)&&result.httpStatus===undefined)result.httpStatus=status;
    // Some SDK transports wrap an Error. Never inspect provider bodies/data.
    error=field(error,'cause')??field(error,'error');
  }
  if(first&&result.httpStatus!==undefined)result.errorCode='http_error';
  return result;
}
export function logCollectorDiagnostic(write,entry) {
  try {
    const result={status:statuses.has(entry.status)?entry.status:'collector_unavailable',stage:stages.has(entry.stage)?entry.stage:'top_level'};
    if(Object.hasOwn(entry,'error'))Object.assign(result,collectorErrorFields(entry.error));
    for(const [key,min,max] of [['pending',0,1000000],['maxPending',1,1000000],['shardId',0,65535],['code',0,4999]])
      if(integer(entry[key],min,max))result[key]=entry[key];
    if(eventTypes.has(entry.eventType))result.eventType=entry.eventType;
    if(reasons.has(entry.reason))result.reason=entry.reason;
    if(entry.coverage==='possible_gap_no_backfill')result.coverage=entry.coverage;
    if(entry.diagnosticsVersion===1)result.diagnosticsVersion=1;
    // An async sink rejection is also contained; diagnostics never drive lifecycle.
    Promise.resolve(write(result)).catch(()=>{});
  } catch { /* Logging failure cannot stop cancellation or shutdown. */ }
}
