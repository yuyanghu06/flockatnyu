# Chat participant labels and duplicate rows

Goal: save valid chat map updates when participant labels are omitted or identical participants repeat.

Scope: chat-only label completion and conservative duplicate removal. Different facts, strict versions/source permissions and duplicate-building validation remain.

Status: implemented and independently accepted. Component checks pass; actual gpt-6-luna scenarios pass with 14 requests including a retained time-copy failure. Tested storage is synthetic. Reviewed web package prepared; live release verification pending. Current truth is in ../milestone.md.
