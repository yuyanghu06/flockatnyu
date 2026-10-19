# Opaque Drive cursors implemented

- Local timestamp / acting role / milestone: 2026-10-19_18-15-04-845122 / coder / Drive search repair.
- Requested scope: repair confirmed valid Google pages discarded for cursor punctuation.
- Starting state: diagnosis accepted; existing native Calendar changes preserved.
- Work performed: tools/google/cursor.js defines shared strict printable ASCII cursor validation with the existing 2048-character bound. Google client, tool schema and chat public-result projection use it. Automation schema validation admits only this exact reviewed terminal assertion; general complex regular expressions remain rejected. Connector and affected folder guides updated.
- Decisions: exact cursor bytes pass through URLSearchParams; whitespace/control/null/oversized cursors still fail before OAuth. Source/account/permission checks and continuation coverage unchanged.
- Checks and evidence: coder reports 63 focused connector, native Drive and automation checks passing. Root independently repeated four formerly failing queries across two audited runs; each returned five files and a successful five-file continuation using real Google responses. Provider cursors measured 528 then 636 characters. Only aggregate evidence retained; no source business writes.
- Resulting state: implementation frozen; API and frontend builds pass. Independent final review, full regressions and guarded release package checks running.
- Remaining work: finish independent test/review, deploy shared web and update-agent code, verify promoted read-only behavior and publish.
