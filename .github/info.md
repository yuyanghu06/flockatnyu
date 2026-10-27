# GitHub checks and release preparation

`workflows/ci.yml` runs deterministic quality and isolated browser checks on pull
requests and main pushes. `workflows/release.yml` reruns those checks before
preparing commit-labelled service archives. The pull request template asks for
behavior, verification and release details. No workflow changes production data.
See `docs/ci-cd.md` for branch rules and the manual production deployment step.
