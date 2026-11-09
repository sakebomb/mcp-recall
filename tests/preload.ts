// Loaded before every test file (bunfig.toml). install / uninstall / status
// detect pi from its config dir, so point that at a path that never exists:
// a test that forgets to pass piDir then sees no pi, and never writes to the
// developer's real ~/.pi. Tests that exercise pi pass their own piDir.
import os from "os";
import path from "path";

process.env.PI_CODING_AGENT_DIR = path.join(os.tmpdir(), `mcp-recall-test-no-pi-${process.pid}`);
