# Table labels hosted integration

- Local timestamp / acting role / milestone: 2026-10-17T16:38:02.012947-04:00; orchestrator; map-presence-labels.
- Requested scope: store/display explicitlabels and preserve fixedbuildingwrites.
- Starting state:26people/9buildings/fiveBobst fixtures,022ACLs; legacy6fieldentries.
- Work performed: appliedonly023 with exactSQLreceipt20261017203512; orderedblankbackfill. Service-role CASupdatedonlyfiveexistingfixturelabels toTest, preservingallpriorfields/order/expiry. Restartedonlyprimary4187/API3127 fornewcontract (session56219), old5173/3001 preserved. Updatedguides/notes andstandardSQLcommand.
- Checks/evidence: receiptMD5/SHA256 exact; all26people,9fixedcatalogue,otherfunctions/table-column/functionACLsunmodified; prior6fields/validity/expiry exact. LiveAPI200/fiveTestlabels/noisDebug; independent62tests/builds/browser15+4+1PASS, evaluatorACCEPT. evidence/map-presence-labels/hosted-verification.json aggregateonly.
- Decisions: displaystringscome from table label/name/buildingname, sourcechecks privateauthorizationonly. Emptylabel hidescaption. No agentwrite tools, broadersourceaccess or deployments introduced.
- Resulting state: requested table-labelbehaviorcomplete locallyandhosted. No oldmigrationedits, commit orpush.
- Handoff: edit people_here[].label tochangevisiblecaption; keepallsevenrequiredfields. Separate favicon sizing clarification pending.
