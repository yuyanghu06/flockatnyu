# Source cleanup and CI

Group browser code by responsibility and server HTTP routes by provider. Preserve
all existing behavior and security checks. Add actual formatting/lint/line limits,
offline test and build commands, GitHub checks and checked release packages.

Completion requires independent behavior testing, browser evidence, review,
resolved findings and recorded commits/push. Initial feature publication is
complete at fb2cd5b. Structural implementation and verification are in progress;
no live application deployment is part of this cleanup.
