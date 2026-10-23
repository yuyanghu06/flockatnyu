// Version 1 is append-only. Never derive labels or field IDs from user/source text.
const dictionary=names=>Object.freeze(Object.fromEntries(names.map((name,index)=>[name,index])));
export const DIAGNOSTIC_CODES=Object.freeze({version:1,
 stage:dictionary(['unknown','orchestration','local_validation','oauth','account_verification','calendar_acl','provider_request','response_parse','execution','authorization','completion','prepare']),
 outcome:dictionary(['unknown','success','empty','partial','pending','deferred','policy_denied','cancelled','rejected','failed','duplicate']),
 reason:dictionary(['unknown','none','invalid_arguments','unknown_tool','duplicate_call','bug_report_already_attempted','request_call_limit','round_call_limit','invalid_tool_call','invalid_completion','invalid_input_scope','invalid_result','result_too_large','exception','aborted','timeout','forbidden','permission_denied','access_denied','channel_scope_denied','forbidden_source','not_configured','unavailable','provider_unavailable','request_timeout','network_error','http_error','invalid_json','invalid_response','missing_scope','missing_access_token','account_mismatch','invalid_time_window','empty','partial','metadata_only','pending','deferred','miro_navigation_deferred','quota_exhausted','budget_exhausted','quota_state_unavailable','reconciliation_deferred','conflict','stale','not_found','read_required','context_limit','unsupported_content','tool_result_error','invalid_request','policy_denied','preflight_failed','invalid_batch','incomplete_batch','call_limit','audit_unavailable','invalid_completion_scope','cancelled','rate_limited','authentication_failed','coverage_incomplete','calendar_projection_incomplete','empty_handled_input_ids','round_limit','already_succeeded','provider_refusal','provider_incomplete','output_too_large','payload_too_large','foreign_citation','evidence_required','source_already_written','map_update_not_requested','invalid_grant','invalid_token','insufficient_permissions','google_unavailable','reauthorization_required','response_too_large','unmanaged_event','human_modified','unsupported_event','cancelled_event','gone','malformed_tool_arguments','duplicate_call_id','reused_call_id','invalid_tool_shape','invalid_response_shape','finish_reason_mismatch','tool_failed','team_request_required','schema','canvas_options','table_options','too_many_tool_calls','discord_unavailable','policy_unavailable','policy_changed','paused','indexing','invalid_cursor','invalid','auth_required','response_byte_limit','content_changed','invalid_mcp_result','invalid_svg','duplicate_check_incomplete','duplicate_check_budget_exhausted','ambiguous_local_time','nonexistent_local_time','invalid_event','ambiguous_existing_events','existing_event_requires_update','unattempted','access_changed','authorized_catalogue_only','batch_not_prepared','current_presence_requires_timed_window','directory_unavailable','download_unavailable','fragmented_content','input_too_large','invalid_config','live_summary_unavailable','request_budget','request_local_attendance_required','reread_attendance_targets','serialized_result_fragments','unobserved_calendar_page_token','unverified_chat_identity','ambiguous_attendance_date','incomplete_member_search','no_name_match','duplicate_roster_claim','initial_requires_confirmation','existing_identity_preserved','discord_identity_already_used','reply_text_budget','trigger_unverified','write_outcome_unknown','current_user_instruction_required','writes_disabled']),
 field:dictionary(['unknown','additional_properties','inputIds','arguments','handledInputIds','query','channelId','channelIds','authorId','from','to','messageId','fileId','folderId','url','limit','mode','context','timeZone','boardId','itemId','type','targetId','resultMode','cursor','offset','patterns','expectedHash','itemIds','scope','eventId','sourceId','sourceRecordId','provider','providerUserId','sourceUrl','timeMin','timeMax','pageToken','personName','eventQuery','date','personId','expectedUpdatedAt','events','title','description','location','start','end','dateTime','sourceKey','content','id','event','buildingIds','people','kind','label','startsAt','endsAt','expectedVersion','attendance_status','building_id','buildings','ends_at','ends_on','height','location_notes','name','notes','person_id','presence_basis','reported_at','source_id','source_record_id','source_url','starts_at','starts_on','status','time_kind','time_zone','type_id','width','x','y','startTime','endTime','object','recordId','values']),
 validation:dictionary(['none','type','required','additional_properties','enum','min_items','max_items','min_length','max_length','pattern','minimum','maximum','depth','scope']),
});
const known=(table,value,fallback='unknown')=>Object.hasOwn(table,value)?value:fallback;
const tools=new Set(('search_attio_records read_attio_record create_attio_record update_attio_record list_attio_attributes read_memory update_memory search_gmail read_gmail search_drive read_drive list_drive_folder list_calendar_events read_calendar_event create_calendar_event update_calendar_event delete_calendar_event create_calendar_events update_calendar_events upsert_calendar_event cancel_calendar_event list_discord_channels read_discord_messages read_discord_window read_discord_summary search_discord list_miro_boards read_miro_board read_miro_item search_miro_board read_miro_items read_map_events lookup_map_person upsert_map_event find_map_attendance_targets set_map_attendance bug_reports read_context_fragment finish_batch prepare_batch draft_discord_message list_member_plans read_member_plan upsert_member_plan cancel_member_plan defer_task read_pending_task resolve_pending_task').split(' '));
export const safeDiagnosticTool=name=>tools.has(name)?name:'unknown_tool';
const success=new Set(['ready','ok','success','succeeded','completed','applied','already_succeeded']);
const policy=new Set(['forbidden','permission_denied','access_denied','channel_scope_denied','forbidden_source','policy_denied','team_request_required','policy_changed','paused','auth_required','reauthorization_required']);
const partial=new Set(['partial','metadata_only','unsupported_content']);
const retryable=new Set(['timeout','request_timeout','network_error','rate_limited']);
export function toolDiagnostics({result,status,error,stage,reason,dispatched=true,proposalSequence,validation}={}) {
 const batchFailures=calendarBatchFailures(result?.calendarBatchWrite?.items);
 const primary=batchFailures.find(item=>item.status==='failed')??batchFailures[0];
 const metadata=result?.diagnostics??error?.diagnostics??primary;
 const sourceStatus=typeof result?.sourceStatus==='string'?result.sourceStatus:undefined;
 const actual=status??result?.status??'unknown';
 const effective=['failed','aborted','cancelled','result_too_large','invalid_result'].includes(status)?status:sourceStatus??actual;
 const fixedReason=known(DIAGNOSTIC_CODES.reason,reason??(validation?'invalid_arguments':undefined)??(['aborted','cancelled','result_too_large','invalid_result'].includes(effective)?effective:undefined)??error?.diagnostics?.reason??(error?(Object.hasOwn(DIAGNOSTIC_CODES.reason,error?.message)?error.message:'exception'):undefined)??metadata?.reason??result?.reason??effective,'unknown');
 let outcome='failed';
 if(batchFailures.length&&partial.has(effective))outcome='partial';
 else if(['aborted','cancelled'].includes(effective)||['aborted','cancelled'].includes(fixedReason))outcome='cancelled';
 else if(policy.has(effective)||policy.has(fixedReason))outcome='policy_denied';
 else if(!['invalid_result','result_too_large','failed'].includes(effective)&&(result?.deferred===true||effective==='deferred'||['miro_navigation_deferred','reconciliation_deferred','round_call_limit'].includes(fixedReason)))outcome='deferred';
 else if(effective==='empty')outcome='empty';
 else if(partial.has(effective)||success.has(effective)&&(result?.coverage?.complete===false||result?.complete===false||result?.possiblyTruncated===true))outcome='partial';
 else if(['pending','indexing'].includes(effective))outcome='pending';
 else if(effective==='duplicate_call_skipped')outcome='duplicate';
 else if(success.has(effective))outcome='success';
 else if(dispatched===false||['invalid','invalid_cursor','invalid_event','invalid_request','invalid_arguments','invalid_tool_call','invalid_completion','budget_exhausted'].includes(effective))outcome='rejected';
 const http=metadata?.httpStatus;
 const observedHttpStatus=Number.isInteger(http)&&http>=100&&http<=599?http:undefined;
 const knownRetry=observedHttpStatus!==undefined||retryable.has(fixedReason)||['invalid_arguments','not_configured','forbidden','access_denied','account_mismatch','missing_scope','missing_access_token','invalid_grant','invalid_token'].includes(fixedReason);
 const sequence=Number.isSafeInteger(proposalSequence)&&proposalSequence>=0&&proposalSequence<=1e9?proposalSequence:undefined;
 return Object.freeze({diagnosticsVersion:1,stage:known(DIAGNOSTIC_CODES.stage,stage??metadata?.stage??(validation?'local_validation':policy.has(effective)?'authorization':dispatched?'execution':'orchestration')),reason:fixedReason==='unknown'&&success.has(effective)?'none':fixedReason,outcome,
  dispatched:dispatched===true?1:0,retryabilityKnown:knownRetry?1:0,...(knownRetry?{retryable:observedHttpStatus!==undefined?([408,425,429].includes(observedHttpStatus)||observedHttpStatus>=500?1:0):retryable.has(fixedReason)?1:0}:{}),
  ...(observedHttpStatus!==undefined?{observedHttpStatus}:{}),...(sequence!==undefined?{proposalSequence:sequence}:{}),
  ...(sourceStatus?{sourceOutcomeCode:DIAGNOSTIC_CODES.outcome[classifySource(sourceStatus)],sourceReasonCode:DIAGNOSTIC_CODES.reason[known(DIAGNOSTIC_CODES.reason,sourceStatus)]}:{}),
  ...(result?.deferred===true?{deferred:1}:{}),...(batchFailures.length?{batchFailures:Object.freeze(batchFailures)}:{}),...(validation?{validationCode:DIAGNOSTIC_CODES.validation[known(DIAGNOSTIC_CODES.validation,validation.keyword,'none')],schemaFieldId:DIAGNOSTIC_CODES.field[known(DIAGNOSTIC_CODES.field,validation.field)]}:{})});
}
// Batch details remain a bounded Railway-only diagnostic, never source receipts.
// Reused by the logger so forged diagnostics cannot bypass fixed dictionaries.
export function safeBatchFailures(value) {
 if(!Array.isArray(value))return [];
 return value.slice(0,50).flatMap((item,index)=>{
  if(!item||!['failed','unattempted'].includes(item.status))return [];
  const itemIndex=Number.isInteger(item.itemIndex)&&item.itemIndex>=0&&item.itemIndex<50?item.itemIndex:index;
  const stage=known(DIAGNOSTIC_CODES.stage,item.stage);
  const reason=known(DIAGNOSTIC_CODES.reason,item.reason);
  const dispatched=item.status==='unattempted'||stage==='local_validation'?0:item.dispatched===1?1:0;
  return [Object.freeze({itemIndex,status:item.status,stage,reason,dispatched,
   ...(dispatched===1&&Number.isInteger(item.httpStatus)&&item.httpStatus>=100&&item.httpStatus<=599?{httpStatus:item.httpStatus}:{})})];
 });
}
function calendarBatchFailures(items) {
 if(!Array.isArray(items))return [];
 return safeBatchFailures(items.slice(0,50).flatMap((item,itemIndex)=>item&&['failed','unattempted'].includes(item.status)?[{
  itemIndex,status:item.status,stage:item.diagnostics?.stage??'execution',reason:item.diagnostics?.reason??item.reason,
  dispatched:item.status==='unattempted'||item.diagnostics?.stage==='local_validation'?0:1,httpStatus:item.diagnostics?.httpStatus,
 }]:[]));
}
function classifySource(status){return success.has(status)?'success':status==='empty'?'empty':partial.has(status)?'partial':policy.has(status)?'policy_denied':['pending','indexing'].includes(status)?'pending':status==='deferred'?'deferred':['aborted','cancelled'].includes(status)?'cancelled':'failed';}
export function diagnosticCounts(diagnostics) {
 // Re-normalize labels, whitelist every numeric slot; callers cannot add dynamic keys.
 const d=diagnostics??{},counts={diagnosticsVersion:1,reasonCode:DIAGNOSTIC_CODES.reason[known(DIAGNOSTIC_CODES.reason,d.reason)],stageCode:DIAGNOSTIC_CODES.stage[known(DIAGNOSTIC_CODES.stage,d.stage)],outcomeCode:DIAGNOSTIC_CODES.outcome[known(DIAGNOSTIC_CODES.outcome,d.outcome)]};
 const limits={dispatched:[0,1],retryabilityKnown:[0,1],retryable:[0,1],observedHttpStatus:[100,599],proposalSequence:[0,1e9],sourceOutcomeCode:[0,Object.keys(DIAGNOSTIC_CODES.outcome).length-1],sourceReasonCode:[0,Object.keys(DIAGNOSTIC_CODES.reason).length-1],deferred:[0,1],validationCode:[0,Object.keys(DIAGNOSTIC_CODES.validation).length-1],schemaFieldId:[0,Object.keys(DIAGNOSTIC_CODES.field).length-1]};
 for(const [key,[min,max]]of Object.entries(limits))if(Number.isSafeInteger(d[key])&&d[key]>=min&&d[key]<=max)counts[key]=d[key];
 const batch=safeBatchFailures(d.batchFailures);if(batch.length){counts.batchFailed=batch.filter(item=>item.status==='failed').length;counts.batchUnattempted=batch.filter(item=>item.status==='unattempted').length;}
 return counts;
}
// Only traverse declared schema properties. Unknown property NAMES never leave here.
export function argumentDiagnostic(value,schema) {try{return inspectArguments(value,schema);}catch{return {keyword:'type',field:'unknown'};}}
function inspectArguments(value,schema,depth=0,field='unknown') {
 if(depth>8)return {keyword:'depth',field};
 if(!schema||typeof schema!=='object')return {keyword:'type',field};
 if(schema.enum&&!schema.enum.some(item=>JSON.stringify(item)===JSON.stringify(value)))return {keyword:'enum',field};
 const type=schema.type;
 if(type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))return {keyword:'type',field};
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))return {keyword:'required',field:known(DIAGNOSTIC_CODES.field,key)};
  for(const key of Object.keys(value)){
   if(!Object.hasOwn(schema.properties??{},key)){if(schema.additionalProperties!==true)return {keyword:'additional_properties',field:'additional_properties'};continue;}
   const failure=inspectArguments(value[key],schema.properties[key],depth+1,known(DIAGNOSTIC_CODES.field,key));if(failure)return failure;
  }
 }else if(type==='array'){
  if(!Array.isArray(value))return {keyword:'type',field};
  if(value.length<(schema.minItems??0))return {keyword:'min_items',field};if(value.length>(schema.maxItems??1000))return {keyword:'max_items',field};
  for(const item of value){const failure=inspectArguments(item,schema.items,depth+1,field);if(failure)return failure;}
 }else if(type==='string'){
  if(typeof value!=='string')return {keyword:'type',field};if(value.length<(schema.minLength??0))return {keyword:'min_length',field};if(value.length>(schema.maxLength??65536))return {keyword:'max_length',field};if(schema.pattern&&!new RegExp(schema.pattern,'u').test(value))return {keyword:'pattern',field};
 }else if(type==='integer'||type==='number'){
  if(typeof value!=='number'||!Number.isFinite(value)||type==='integer'&&!Number.isSafeInteger(value))return {keyword:'type',field};if(value<(schema.minimum??-Infinity))return {keyword:'minimum',field};if(value>(schema.maximum??Infinity))return {keyword:'maximum',field};
 }else if(type==='boolean'?typeof value!=='boolean':type==='null'?value!==null:true)return {keyword:'type',field};
 return null;
}
