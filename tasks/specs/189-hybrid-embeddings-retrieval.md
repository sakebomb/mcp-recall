# Spec: Optional local hybrid FTS + embeddings retrieval (#189)

> Status: **DRAFT — awaiting sign-off.** No code until approved.
> Decision (2026-07-23): **spec first, decide the backend before building.**
> Larger scope (L); directly touches the zero-dependency pitch.

## What

Add an **optional, local, default-off** semantic retrieval layer that combines
the existing FTS5 (BM25-ish) keyword search with vector similarity, so
`recall__search` catches matches where the query and stored content share meaning
but not exact tokens.

## Why

FTS5 is keyword-exact. For DOM snapshots, prose, and paraphrased queries, the
right item is often missed because the query words don't literally appear. mem0 /
am-memory / RAG-MCP all use hybrid keyword+vector for exactly this. Retrieval
hints (#185) and the peek tier (#186) reduce the cost of a *hit*; embeddings
increase the *hit rate*.

## Success criteria

- Hybrid (keyword + vector) scoring available behind a config flag, **off by
  default**.
- With the flag off, behavior, dependencies, and install footprint are **identical
  to today** — the zero-dependency, local-only guarantee is untouched.
- With the flag on, everything still runs **locally** (no hosted embedding API).
- A benchmark on a prose/DOM sample shows measurably higher recall than FTS-only.

## Approach — backend options to decide (the core of this spec)

Vector storage + embedding generation must both stay local. Candidates:

| Option | Vector store | Embeddings | Footprint / risk |
|---|---|---|---|
| **A. `sqlite-vec` + local ONNX model** | `sqlite-vec` extension loaded into bun:sqlite | small model (e.g. all-MiniLM) via ONNX runtime | Needs a loadable extension + a model file download on opt-in; verify bun:sqlite `loadExtension` support |
| **B. `sqlite-vec` + `transformers.js`** | `sqlite-vec` | `@huggingface/transformers` (WASM) | Pure-JS embeddings, no native ONNX; larger JS dep, slower first run |
| **C. In-table vectors + JS cosine** | plain SQLite BLOB column, brute-force cosine in JS | either of the above | No extension dependency; O(n) scan — fine at recall's corpus sizes, simplest to ship |

Leaning **C for v1** (no native extension dependency, smallest blast radius; brute-force
cosine over a project's bounded item set is cheap) with the embedding model as the
only opt-in download. A/B become an optimization if corpus sizes grow.

Hybrid score = weighted blend of normalized FTS rank and cosine similarity
(weight configurable); fuse then re-rank the top candidates.

## Risks / trade-offs

- **Dependency footprint** is the whole tension — even opt-in, adding an embedding
  model/runtime changes the project's character. Must be genuinely isolated to the
  flag-on path (lazy import, model fetched only when enabled).
- `bun:sqlite` extension-loading support for `sqlite-vec` is unverified — option C
  sidesteps it.
- Embedding model download size + first-run latency; index must be built/backfilled
  for existing items.
- Determinism: vector scores are model-dependent; tests pin a model + fixtures.

## Open questions for sign-off

1. Is any embedding-model download acceptable on opt-in, or must "local" also mean
   "no download" (which would rule embeddings out entirely)?
2. Option **C (brute-force cosine, no extension)** as the v1 target — agree?
3. Ship this at all, or is FTS + hints (#185) + peek (#186) sufficient and #189
   should be closed? (Reasonable to defer until a real recall-miss is observed.)
