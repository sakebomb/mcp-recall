# Agent image for the #414 MCP-heavy test: Playwright MCP 0.0.68, the version MCPMark
# pins, with the Chromium build its own bundled Playwright expects. The claude and
# mcp-recall binaries are mounted at run time, as in the SWE-bench runs.
FROM node:22-bookworm
RUN npm install -g @playwright/mcp@0.0.68 \
 && node "$(npm root -g)/@playwright/mcp/node_modules/playwright/cli.js" install --with-deps chromium
