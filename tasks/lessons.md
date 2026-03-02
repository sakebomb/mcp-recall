# lessons

Learnings captured after corrections. Updated after any mistake or course correction.

## Format

**Pattern**: what situation triggers this
**Mistake**: what went wrong
**Rule**: the corrected behavior
**Date**: YYYY-MM-DD

---

## Git

**Pattern**: Pushing commits to GitHub repos with email privacy enabled
**Mistake**: Committed with local Gmail address; GitHub rejected push with GH007
**Rule**: Both author AND committer email must use the GitHub noreply address (`<id>+<username>@users.noreply.github.com`). Amending author alone is not enough — set `GIT_COMMITTER_EMAIL` too, or configure `user.email` globally.
**Date**: 2026-03-01
