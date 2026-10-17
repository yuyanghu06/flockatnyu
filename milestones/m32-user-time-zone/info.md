# User timezone scan boundaries

M32 makes date-based Discord requests use the current browser timezone.
Scope includes chat transport, one server request clock, assistant prompts and both
Discord tool paths. Completion requires strict boundary/DST tests, browser request
evidence, independent review and current local runtime. No schema or scheduler change.
Status: complete. Independent tester95/95 Node and4/4 Chrome checks, final
integrated134/134, builds, runtime validation and independent evaluator acceptance
are recorded in the rolling milestone and evidence/m32-user-time-zone.
