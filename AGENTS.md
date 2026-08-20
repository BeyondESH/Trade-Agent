

<!-- codemap:start -->
## Codemap MCP

**[Important!!!] Whether in the parent agent or in a subagent, always use codemap MCP tools instead of Grep/Read tools. Only fall back to Grep/Read when codemap is unavailable.**

### Tools

| Tool | Use case |
|------|----------|
| `search_code` | Fuzzy keyword or concept search (FTS + vector). For exact name lookup, use find_symbol. |
| `find_symbol` | Exact/prefix/suffix name lookup. Use when you know the symbol name. |
| `get_symbol_detail` | Get a symbol's location, signature, docs, and body. |
| `get_call_chain` | Trace upstream callers and/or downstream callees. |
| `get_type_hierarchy` | Class/interface parent and child hierarchy. |
| `get_dependencies` | Find all symbols that reference a given symbol. |
| `get_graph_stats` | Graph statistics: file/symbol/edge counts. |
| `search_knowledge` | Business rules and architecture docs from codeindex. |
| `query_cypher` | Count/aggregate structural queries: "how many functions in X?", "which class has most methods?", duplicate names, cross-cutting analysis. |


**Name resolution:** Pass `symbol_name` — simple name (`parse_config`) or qualified (`ClassName.method`). No module prefix needed. **Symbol ID:** `filepath:kind:scopedName` (e.g. `player.py:method:Player.attack`, `models.py:class:Outer.Inner`)

**Slash commands:** `/codemap-exploring`, `/codemap-debugging`, `/codemap-impact-analysis`

### Rules

- **After `get_symbol_detail`: edit immediately.** Do NOT re-Read the same file.
- **Use `search_code` first**, not broad `find_symbol` prefix queries.
- **Use batch queries:** `search_code({matches: ["A", "B"]})`, `find_symbol({symbol_name: ["X", "Y"]})`.
- **For obvious single-file bugs: skip codemap.** Error → Read → Edit.
- **Counting or aggregation questions** (how many, which has most, rank by): use `query_cypher`, NOT read/grep.
- **If a subagent is needed, use `general`, not `explore`** (`explore` does not support MCP and cannot call codemap tools).

<!-- codemap:end -->

## Test Suite (three layers)

Full-stack E2E test pyramid. All layers run locally; the `online` subset is
opt-in.

| Layer | Where | Command | Scope |
|---|---|---|---|
| L1 data integrity | `backend/tests/test_data_integrity.py` | `cd backend && python -m pytest -m integrity` | full parquet series quality (monotonic, OHLC, gaps vs whitelists) |
| L2 live API/WS | `backend/tests/test_live_api.py`, `test_live_ws.py` | `cd backend && python -m pytest tests/test_live_api.py tests/test_live_ws.py` | real uvicorn process spawned by `live_server` fixture; all REST endpoints + /ws channels |
| L3 browser journeys | `frontend/tests/e2e/*.spec.ts` | `cd frontend && npm run test:e2e` | Playwright (chromium) user journeys; webServer auto-starts vite + backend |

Notes:
- L2 `live_server` fixture spawns an isolated uvicorn with a temp data dir and
  the incremental-persistence scheduler disabled (`MD_SCHEDULE_INTERVAL_SECONDS=0`).
- The `online` marker (`--run-online`) gates tests that need external network
  (Bitget REST/WS, BlockBeats). Without the flag they skip; never fail.
- L1 freshness (type-C staleness) also skips when no backend is running.
- Gap registries live in `backend/tests/data_registry.py`: `KNOWN_GAPS` (type B
  micro-gaps, hard gate) and `STRUCTURAL_EXEMPTIONS` (type A structural gaps).
- Full regression: `cd backend && python -m pytest -q` and
  `cd frontend && npm run test && npm run typecheck`.

