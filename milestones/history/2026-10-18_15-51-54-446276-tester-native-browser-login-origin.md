# native browser login origin

- Local timestamp / acting role / milestone: 2026-10-18_15-51-54-446276 / tester / live launch
- Requested scope: safe working private deployment and autonomous updates.
- Starting repository state: verified local implementation.
- Work performed / changed files: Native Chrome revealed no-referrer makes formOrigin:null. Coder changed to same-origin, strictnull/foreignOrigin rejection remains.21focusedchecks pass; browserretestinprogress.
- Decisions: no source expansion; preserve sourceboundaries.
- Checks and evidence: Native Chrome revealed no-referrer makes formOrigin:null. Coder changed to same-origin, strictnull/foreignOrigin rejection remains.21focusedchecks pass; browserretestinprogress.
- Resulting state / acceptance: website/collectors healthy; queue selectionfixrequired beforeclaiming agentupdatecomplete.
- Remaining work and handoff: scopedclaimimplementation/review/apply, livebatchacceptance, commits/push.
