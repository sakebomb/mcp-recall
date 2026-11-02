# Source of these tasks

The `easy/reddit` and `standard/reddit` directories are copied unchanged from MCPMark
(<https://github.com/eval-sys/mcpmark>), `tasks/playwright_webarena/`, at commit
`cd45b7f57923b9b3985467f5139927575f83141c` (2026-06-12). MCPMark is licensed under the
Apache License 2.0, included here as `LICENSE`.

Each task has a `description.md` (the instruction), a `label.txt` (expected values) and a
`verify.py` that checks the forum's final state with Playwright against `WEBARENA_BASE_URL`.
The forum is the WebArena Reddit (Postmill) site, run from the WebArena-Verified image
`am1n3e/webarena-verified-reddit@sha256:0594908059a03e5f610005689440a95c05e776e734006197c7b1eba12734cb46`.
