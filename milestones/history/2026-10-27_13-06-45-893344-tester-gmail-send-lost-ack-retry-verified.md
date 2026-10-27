# gmail send lost ack retry verified

- Timestamp / role / milestone: 2026-10-27T13:06:45.893344-04:00 / tester / Gmail send.
- Requested scope: build sending API/tool and recessed contact chip.
- Starting state: existing dirty workspace preserved; local code frozen/reviewed.
- Work / files / evidence: Independently reproduced original [A,A,B] request-group escape and intermediate cross-group rebinding. Final actual browser tests on assistant SHA d47223e763336da0ff3d3abbd107f01e5f77d9e22e70babd14e57b8a28f8928d pass missing applied ACK, missing HTTP+stream ACKs and queued-C reinjection refusal: [A,A,A], [A,A,A], [A,A,C,A]. Simulated local transport only, no email/model/user-tab activity. Evidence tester/lost-ack-fixed-report.json.
- Decisions: exact reviewed schema/package, website only, no automatic retry after uncertain sends, separate source operations.
- Result / acceptance: pass accepted against stated scope; no real delivery claimed.
- Remaining work / handoff: website release/live read-only check, then explicit Google send-scope consent; no real test recipient authorized.
