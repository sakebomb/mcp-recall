# mcp-recall — Competitive & Adjacent-Technology Landscape

_Research date: 2026-07-22. All claims are sourced; see `Sources` at the end. Where a claim rests on a third-party blog rather than primary docs, it is flagged inline._

---

## 0. TL;DR strategic read

- **The biggest strategic fact:** Anthropic's native context tooling has *mostly* solved large-tool-output offload for its **own built-in tools** (Read/Bash/Grep/Glob/WebSearch/WebFetch/Edit/Write) via **microcompaction** — but it does **not** offload **MCP** tool outputs. Claude Code **truncates** MCP outputs at a hard 25k-token ceiling (`MAX_MCP_OUTPUT_TOKENS`, warning at 10k) and throws the rest away. That truncation gap is exactly mcp-recall's niche and it is real and current.
- **mcp-recall is not alone in its niche.** Two Claude-Code-ecosystem projects overlap directly: **CompressMCP** (same PostToolUse `mcp__.*` hook interception, but lossless inline key-abbreviation, no store/retrieve) and **claude-mem** (~65k GitHub stars; cross-session memory via SQLite FTS5 + Chroma, but captures *session events*, not raw tool outputs). mcp-recall sits in the gap between them: real-time interception (like CompressMCP) + durable store-and-retrieve (like claude-mem).
- **General agent-memory platforms (mem0, Letta, Zep, Cognee, Supermemory) are adjacent, not competitors.** They target conversational/user memory and fact extraction, not verbatim large-tool-output offload. Their retrieval-tiering and eviction designs are worth borrowing, though.

---

## 1. Anthropic-native overlap (HIGHEST PRIORITY)

Anthropic now ships **four** overlapping mechanisms. Two are API-level (context editing, memory tool, compaction), and two are Claude-Code-level (auto-compaction, microcompaction). Honest assessment of each follows, ending with where mcp-recall still adds value.

### 1a. Claude API — Context editing (`clear_tool_uses_20250919`)
- **What:** Server-side strategy that automatically **clears the oldest tool results** once the conversation crosses a token/tool-use threshold, replacing each with a placeholder so the model knows it was removed. Config: `trigger` (default 100k input tokens), `keep` (default 3 tool-use pairs), `clear_at_least`, `exclude_tools`, `clear_tool_inputs` (default false).
- **Status:** **Beta.** Header `context-management-2025-06-27`. Announced 2025-09-29 alongside Sonnet 4.5; on Anthropic API, Bedrock, Vertex.
- **Critical limitation vs mcp-recall:** Cleared content is **permanently gone** — "cannot be retrieved directly." The *only* way to preserve it is if the model proactively wrote it to the memory tool before the clear fired. There is **no built-in retrieval, no search, no persistence**. It's eviction, not offload.

### 1b. Claude API — Memory tool (`memory_20250818`)
- **What:** A file-based tool (`view`/`create`/`str_replace`/`insert`/`delete`/`rename` under `/memories`) the **model** drives to persist knowledge across sessions. Client-side: the developer implements the storage backend (filesystem, DB, encrypted, etc.). SDKs ship `BetaLocalFilesystemMemoryTool`.
- **Status:** **Generally available** on the Messages API (no beta header). Available on Claude 4+. Anthropic cites 84% token reduction in extended workflows.
- **Critical limitation vs mcp-recall:** It is **model-managed and write-effortful** — Claude must *decide* to save something, in its own words, as a summary. It is not automatic verbatim capture of every large tool output. No FTS; retrieval is "the model reads a file it remembers creating." It is a scratchpad for *conclusions*, not an archive of *raw tool payloads*. Also: **you** have to build/run the backend — it is a primitive, not a product.

### 1c. Claude API — Compaction (`compact_20260112`)
- **What:** Server-side summarization of older conversation into a single `compaction` content block when input tokens hit a threshold (default 150k, min 50k). Optional `pause_after_compaction`, custom `instructions`. On the next request the API drops everything before the compaction block.
- **Status:** **Beta.** Header `compact-2026-01-12`. Supported on Opus 4.6/4.7/4.8, Sonnet 4.6/5, Fable 5, Mythos 5.
- **Critical limitation vs mcp-recall:** Lossy summarization with **no retrieval of the originals** — docs are explicit that it does not address disk offload or retrieval of tool outputs. Once summarized, the verbatim data is unrecoverable from the API.

### 1d. Claude Code — Auto-compaction & `/compact`
- **What:** When context nears the window (buffer reduced to ~33k tokens in early 2026, so compaction triggers around ~167k), Claude Code summarizes history, then re-reads recent files and restores the task list. `/compact` is the manual trigger.
- **Status:** **GA**, on by default.
- **Limitation vs mcp-recall:** Session-scoped, lossy, no cross-session persistence, no verbatim retrieval, no search.

### 1e. Claude Code — Microcompaction (THE key overlap)
- **What:** Proactive, granular layer that offloads **bulky tool results to disk early**, keeping only a path reference inline. Maintains a **hot tail** (recent results stay inline) + **cold storage** (older results referenced by path, re-fetchable). _(Mechanism detail per decodeclaude.com deep-dive — not fully in primary docs.)_
- **THE CRITICAL GAP:** Per that same analysis, microcompaction applies to **Read, Bash, Grep, Glob, WebSearch, WebFetch, Edit, and Write** — the built-in tools. **It does not list `mcp__*` tools.** And the official Claude Code changelog independently confirms MCP outputs are handled by **truncation**, not offload (a bugfix reads: _"Fixed a memory leak where truncated MCP tool outputs kept the full untruncated result in memory…"_). Combined with the hard 25k `MAX_MCP_OUTPUT_TOKENS` truncation ceiling (warning at 10k), the picture is clear: **Anthropic offloads-and-preserves its own tools' output, but truncates-and-discards MCP tools' output.**
- **This is mcp-recall's moat, and it is defensible today.** A 200k-token Playwright snapshot or GitHub API dump gets silently truncated to 25k by Claude Code, losing data; mcp-recall intercepts it *before* that, stores the full thing in SQLite/FTS, and hands back a summary + retrieval handle.

### Where mcp-recall still adds value over ALL natives
| Capability | Native (best case) | mcp-recall |
|---|---|---|
| **MCP tool output offload** | ❌ truncated at 25k, discarded | ✅ intercepted pre-context, stored verbatim |
| **Verbatim retrieval of originals** | ❌ (memory tool = model's summary only) | ✅ `recall__retrieve` full content by ID |
| **Full-text search over stored outputs** | ❌ none (memory tool has no FTS) | ✅ FTS5 with tool filter |
| **Automatic capture (no model effort)** | ❌ memory tool needs model to decide to write | ✅ hook fires on every MCP call |
| **Cross-session persistence, project-scoped** | Partial (memory tool, if you build backend) | ✅ per-project SQLite DB out of the box |
| **Local ownership / zero API dependency** | Context editing/compaction are server-side, tied to API beta | ✅ fully local, provider-agnostic surface |
| **Secret redaction before storage** | ❌ | ✅ denylist + secret scan pre-write |
| **Turnkey (no code)** | memory tool = SDK primitive you must implement | ✅ install command, works in Claude Code |

**Honest verdict:** For **built-in** tool output, Anthropic's microcompaction largely obsoletes a general-purpose offloader — do **not** try to compete there. For **MCP** tool output specifically, mcp-recall covers a gap the natives leave wide open (truncation + no retrieval + no search). The value prop should be sharpened to lead with "MCP" explicitly — the product name already does this, and the research validates it. The risk is temporal: if Anthropic extends microcompaction to `mcp__*` tools, the core moat narrows to retrieval/FTS/cross-session/secret-redaction. Plan for that.

---

## 2. Direct / adjacent competitors (agent memory & context tools)

**Two buckets.** (A) Claude-Code-ecosystem tools that intercept/handle tool output — the *real* competitors. (B) General agent-memory platforms — adjacent, conversational-memory-focused.

### Bucket A — Claude Code ecosystem (direct)
- **CompressMCP** — *Closest mechanical analog.* PostToolUse hook, matcher `mcp__.*`, intercepts every MCP response. Compresses via **lossless key-abbreviation (TerseJSON)**: field names → `a`,`b`,`c`; output is header + key dictionary + abbreviated JSON, byte-identical values. **Inline shrinkage only — no store, no retrieval, no FTS, no summaries.** Logs stats to `~/.compressmcp/`. Fixed 500-token threshold, ~60ms/call overhead. → *Different philosophy: keep-all-data-smaller vs mcp-recall's offload-and-summarize.* Complementary, not identical.
- **claude-mem** (~65k stars; `thedotmack/claude-mem`) — *Biggest ecosystem player.* Cross-session persistent memory. Hooks session lifecycle, captures **events** (file edits, decisions, bug fixes, commands), AI-compresses to semantic summaries, stores in **SQLite FTS5 + Chroma vector DB**. **3-layer retrieval: `search` (compact index, ~50-100 tok/result) → `timeline` (chronological context) → `get_observations` (full detail only for chosen IDs, ~500-1k tok).** Claims ~10x retrieval token savings. Works across Claude Code, Codex, Gemini, Copilot, etc. → *Targets session memory, NOT raw large-tool-output interception — but the 3-layer retrieval pattern is directly stealable.*
- **"Context Mode" (MindStudio)** — Compresses 315KB sessions → 5KB; rebuilds session snapshot from a **SQLite** DB and re-injects after compaction. Session-continuity focused.
- **am-memory / claude-memory (Korety)** — SQLite-backed knowledge stores with **BM25+vector / hybrid scoring**, plus human-memory-inspired **decay, pinning**. → Pinning + decay overlap mcp-recall's `pin`/eviction; hybrid scoring is a retrieval upgrade idea.

### Bucket B — General agent-memory platforms (adjacent)
- **mem0** — Vector-first extraction + retrieval of stable user preferences/facts. Mature SDK, broad integrations (CrewAI, LangGraph). LOCOMO ~67% LLM-judge, p95 ~0.2s, ~1.7k tokens/conv vs 26k full-context. *Conversational memory, not tool-output offload.*
- **Letta (formerly MemGPT)** — OS-style tiered memory: **core memory (RAM, in-context)** + **recall/archival (paged in via tool calls)**; the LLM manages its own paging & eviction, compressing old blocks to episodic summaries. *Runtime/framework, not a Claude Code plugin. Its virtual-memory paging model is the intellectual ancestor of what mcp-recall does.*
- **Zep / Graphiti** — Graph-native **temporal** knowledge; best for "when was this fact true." LongMemEval 63.8% (leads mem0's 49%). *Temporal fact memory, not tool-output.*
- **Cognee** — Graph-native memory engine, strong **fully-local / air-gapped** story (open source). *Overlaps mcp-recall's local-ownership pitch but for knowledge graphs.*
- **Supermemory** — Hosted memory API + MCP (`memory`/`recall`/`listProjects`/`whoAmI`), embeddings + profile extraction. *Hosted, user-memory-oriented.*
- **LangChain/LangGraph memory** — `langgraph-bigtool` (tool *selection* via retrieval, not output offload); community consensus for large tool outputs is "offload chunks to filesystem + subagent analysis" — an ad-hoc pattern, no turnkey product. **Deep Agents** provides filesystem + subagent RAG primitives.
- **Official MCP `@modelcontextprotocol/server-memory`** — Knowledge-graph memory (entities/relations/observations). *Structured facts, not verbatim tool-output archive.*

**Who actually intercepts/compresses TOOL OUTPUTS:** Only **CompressMCP** (inline, no retrieval) and **mcp-recall** (offload + retrieve). Everyone else does conversational/session/fact memory or tool *selection*. This is a narrow, mostly-unoccupied niche.

---

## 3. The niche: large-tool-output handling — how others solve it

- **Truncation (Claude Code default):** hard 25k-token cap on MCP output, data discarded. Crude; the baseline mcp-recall improves on.
- **Inline lossless compression (CompressMCP, Atlassian `mcp-compressor`):** shrink JSON keys/schemas 40–97%, keep everything in-context. Good for structured JSON; useless for prose/DOM snapshots; no retrieval.
- **Disk offload + path reference (native microcompaction; LangGraph filesystem pattern; general "context offloading"):** move observations to storage, replace with pointers, re-fetch on demand. This is mcp-recall's model — but natives don't do it for MCP.
- **RAG over tool results / RAG-MCP:** semantic retrieval layer selects/compresses only relevant slices before they hit the LLM. mcp-recall's FTS is a keyword-tier version of this; adding embeddings would close the gap.
- **MCP proxy/gateway layers:** reverse proxies between host and MCP servers (AI gateways, lazy-loading `mcp-gateway` ~95% token savings via on-demand server loading, meta-MCP proxies). These mostly attack **tool-schema/discovery bloat**, not large **result** payloads — a different token sink.
- **Hook-based interception like mcp-recall:** **CompressMCP** is the only other one found doing PostToolUse `mcp__.*` interception. So mcp-recall's architecture is validated but not unique; its *store-and-retrieve-with-FTS* twist is close to unique in this niche.

---

## 4. Concrete features worth stealing

1. **3-layer graduated retrieval (from claude-mem).** Return a compact index first (IDs + ~50-100 tokens each), then a "timeline"/context-window around chosen IDs, then full verbatim only for explicitly requested IDs. mcp-recall's `search`→`retrieve` is 2-tier; adding a cheap middle "peek/context-window" tier would cut retrieval tokens ~10x and fits the existing tool set cleanly.
2. **Hybrid FTS + semantic scoring (from am-memory / mem0 / RAG-MCP).** mcp-recall is FTS5-only. Optional local embeddings (BM25 + vector hybrid) would catch semantic matches FTS misses — valuable for DOM snapshots and prose where exact keywords are unpredictable. Keep it optional/local to preserve the zero-dependency, local-ownership pitch.
3. **Pre-clear memory handoff / native interop (from Anthropic context-editing + memory tool).** Rather than fight the natives, integrate: expose mcp-recall as a memory-tool backend, or emit "pin-worthy" hints before Claude Code compaction fires. Position mcp-recall as the **MCP-output layer that sits under** native compaction, not a replacement for it.
4. **Memory decay / access-scored eviction (from am-memory, Letta).** mcp-recall has LFU eviction + pinning; layering time-decay scoring (recency × frequency) — Letta-style — would make eviction smarter than pure LFU and is a small change to the analytics layer.
5. **Lossless structured-JSON compaction as a handler mode (from CompressMCP/TerseJSON).** For the summary that goes back to Claude, a key-abbreviation pass on structured JSON outputs could shrink the *inline summary* further while staying byte-reconstructable — a cheap complementary win for JSON-heavy MCPs (GitHub, Jira).

---

## Sources

- [Context editing — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/context-editing)
- [Memory tool — Claude Platform Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [Compaction — Claude Platform Docs](https://platform.claude.com/docs/en/build-with-claude/compaction)
- [Memory & context management with Claude Sonnet 4.6 — Claude Cookbook](https://platform.claude.com/cookbook/tool-use-memory-cookbook)
- [Context engineering: memory, compaction, and tool clearing — Claude Cookbook](https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools)
- [Effective context engineering for AI agents — Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [What Is Auto Compact in Claude Code — CometAPI](https://www.cometapi.com/what-is-auto-compact-in-claude-code/)
- [Inside Claude Code's Compaction System — Decode Claude](https://decodeclaude.com/compaction-deep-dive/)
- [Claude Code Context Buffer: The 33K-45K Token Problem — claudefast](https://claudefa.st/blog/guide/mechanics/context-buffer-management)
- [Claude Code changelog — official](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [Connect Claude Code to tools via MCP — Claude Code Docs](https://code.claude.com/docs/en/mcp)
- [Claude Code: MCP tool exceeds maximum allowed tokens (25000) — Xpoz](https://help.xpoz.ai/en/articles/12681842-claude-code-mcp-tool-exceeds-maximum-allowed-tokens-25000)
- [Truncated MCP Tool Responses issue #2638 — anthropics/claude-code](https://github.com/anthropics/claude-code/issues/2638)
- [CompressMCP: Lossless JSON Compression for Claude Code — The Decipherist](https://thedecipherist.com/articles/compressmcp/)
- [MCP server that reduces Claude Code context consumption by 98% — Hacker News](https://news.ycombinator.com/item?id=47193064)
- [claude-mem — GitHub (thedotmack)](https://github.com/thedotmack/claude-mem)
- [claude-mem hits 65.8K stars — Augment Code](https://www.augmentcode.com/learn/claude-mem-65k-stars)
- [Claude-Mem Memory Search docs](https://docs.claude-mem.ai/usage/search-tools)
- [ClaudeMem vs Full Context Dump — MindStudio](https://www.mindstudio.ai/blog/claudemem-vs-full-context-dump-token-savings-comparison)
- [Claude Code Context Mode compresses 315KB → 5KB — MindStudio](https://www.mindstudio.ai/blog/claude-code-context-mode-compresses-315kb-sessions-5kb-how-to-install)
- [am-memory — GitHub (danielwanwx)](https://github.com/danielwanwx/am-memory)
- [claude-memory — GitHub (KoretyAutomate)](https://github.com/KoretyAutomate/claude-memory)
- [AI Agent Memory Systems in 2026: Mem0, Zep, Hindsight, Memvid Compared — Dev Genius](https://blog.devgenius.io/ai-agent-memory-systems-in-2026-mem0-zep-hindsight-memvid-and-everything-in-between-compared-96e35b818da8)
- [State of AI Agent Memory 2026 — mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Mem0 vs Zep vs Letta — AgenticWire](https://www.agenticwire.news/article/mem0-zep-letta-agent-memory)
- [Virtual context management with MemGPT and Letta — Leonie Monigatti](https://www.leoniemonigatti.com/blog/memgpt.html)
- [Best Open-Source AI Memory Tools for LLMs 2026 — Cognee](https://www.cognee.ai/blog/guides/best-open-source-ai-memory-tools-for-llm-agents-and-developers)
- [Supermemory Tutorial — DataCamp](https://www.datacamp.com/tutorial/supermemory-tutorial)
- [Knowledge Graph Memory Server — modelcontextprotocol (npm)](https://www.npmjs.com/package/@modelcontextprotocol/server-memory)
- [MCP Compression: Preventing tool bloat — Atlassian](https://www.atlassian.com/blog/development/mcp-compression-preventing-tool-bloat-in-ai-agents)
- [mcp-gateway: lazy-loading proxy — GitHub (RaiAnsar)](https://github.com/RaiAnsar/mcp-gateway)
- [langgraph-bigtool — GitHub (langchain-ai)](https://github.com/langchain-ai/langgraph-bigtool)
- [RAG with Deep Agents — LangChain Docs](https://docs.langchain.com/oss/python/deepagents/rag)
