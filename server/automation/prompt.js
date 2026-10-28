import { promptText } from '../prompt-loader/index.js';
import {AUTOMATION_MAX_TOOL_CALLS,AUTOMATION_MAX_STAGE_CALLS} from './config.js';
const toolFailurePrompt=promptText("agents/update/policies#tool-failure");
const observationReusePrompt=promptText("agents/update/policies#observation-reuse");
const savedHistoryPrompt=promptText("agents/update/policies#saved-history");
const sourceCallFormatPrompt=promptText("agents/update/policies#source-call-format");
const taskResolutionPrompt=promptText("agents/update/policies#task-resolution");
const trimmedConversationPrompt=promptText("agents/update/policies#trimmed-conversation");
const conversationContextPrompt=promptText("agents/update/policies#conversation-context");
const inputDispositionPrompt=promptText("agents/update/policies#input-disposition");
const timeBoundaryPrompt=({participationPatch=false}={})=>promptText("agents/update/policies#time-boundary", {relativeBoundaryInstructions: (participationPatch?promptText("agents/update/policies#time-boundary.participation"):promptText("agents/update/policies#time-boundary.relative"))});
const activityInterpretationPrompt=promptText("agents/update/policies#activity-interpretation");

export function buildAutomationPrompt({timezone,now,phase}) {
  if(phase==='initial'||phase==='followup')return buildStagedAutomationPrompt({timezone,now,phase});
  return promptText("agents/update/legacy#system", {nowIso: (new Date(now).toISOString()), timezone: (timezone), conversationContextPrompt: (conversationContextPrompt), inputDispositionPrompt: (inputDispositionPrompt), activityInterpretationPrompt: (activityInterpretationPrompt), timeBoundaryPrompt: (timeBoundaryPrompt()), toolFailurePrompt: (toolFailurePrompt), observationReusePrompt: (observationReusePrompt), AUTOMATION_MAX_TOOL_CALLS: (AUTOMATION_MAX_TOOL_CALLS), AUTOMATION_MAX_STAGE_CALLS: (AUTOMATION_MAX_STAGE_CALLS)});
}


function buildStagedAutomationPrompt({timezone,now,phase}) {
  const scope=phase==='initial'
    ?promptText("agents/update/core#scope.initial")
    :promptText("agents/update/core#scope.followup");
  const common=promptText("agents/update/core#staged.common", {phase: (phase), scope: (scope), initialScopeInstructions: (phase==='initial'?promptText("agents/update/core#scope.initial-input"):''), followupRecoveryInstructions: (phase==='followup'?promptText("agents/update/core#followup.recovery"):''), timeBoundaryPrompt: (timeBoundaryPrompt({participationPatch:phase==='followup'})), sourceCallFormatPrompt: (sourceCallFormatPrompt), taskResolutionPrompt: (taskResolutionPrompt), AUTOMATION_MAX_TOOL_CALLS: (AUTOMATION_MAX_TOOL_CALLS), AUTOMATION_MAX_STAGE_CALLS: (AUTOMATION_MAX_STAGE_CALLS), batchInstructions: (phase==='followup'?promptText("agents/update/core#batch.followup"):promptText("agents/update/core#batch.independent")), toolFailurePrompt: (toolFailurePrompt), observationReusePrompt: (observationReusePrompt), savedHistoryPrompt: (savedHistoryPrompt), trimmedConversationPrompt: (trimmedConversationPrompt)});
  const workflow=phase==='initial'?promptText("agents/update/initial#workflow"):promptText("agents/update/followup#workflow");
  return common+workflow+'\n\n'+promptText("agents/update/core#staged.clock",{nowIso:new Date(now).toISOString(),timezone});
}
