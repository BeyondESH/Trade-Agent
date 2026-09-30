# Backend diagrams — `market-data` (Trade-Agent)

Two diagrams of the **actual** backend code (not the README's description). They were
derived by enumerating `backend/src/market_data/**` with the Codemap MCP graph and by
parsing the real `from market_data … import …` statements of every module, then verified
by reading the entry points (`webapi.py`, `cli.py`, `agent/runtime.py`,
`agent/execution.py`, `agent/research.py`).

| File | What it shows |
|---|---|
| `backend-architecture.svg` / `.png` | Layered component architecture + external system boundaries |
| `backend-dependencies.svg` / `.png` | Directed module dependency graph (imports) + runtime call edges |

Observed revision: **`0e83cf3`**. All counts below are computed from that tree.

---

## 1. How to read `backend-architecture`

Vertical layers (top → bottom). Each dashed band is a layer; the pale-amber column on
the right and every amber box are **outside** the backend process.

| # | Layer | Modules |
|---|---|---|
| 0 | Foundation (left rail) | `config.py`, `models.py`, `events.py` |
| 1 | Entry / API | `webapi.py` (FastAPI REST + `WS /ws` + `SSE /news/stream`), `cli.py` |
| 2 | Realtime & streaming | `realtime.py` (`BitgetWsStream`), `streamhub.py` (`MarketStream`) |
| 3 | Ingestion & backfill | `ingestion.py` (`KlineIngestor`), `mcp_client.py`, `scheduler.py`, `discover.py` |
| 4 | Storage | `store.py` (`ParquetStore`), `excel_export.py`, `chartstore.py`, `alertstore.py` |
| 5 | Analysis | `indicators.py`, `structure.py`, `smc.py`, `levels.py` |
| 6 | News pipeline | `newsfeed.py` (AKShare), `news_broker.py`, `blockbeats.py`, `blockbeats_cache.py` |
| 7 | Agent worker (separate process) | Tier‑1 research (LLM) and Tier‑2 execution (zero‑LLM) |

**External boundaries** (amber, right column): Browser (React 19 + Vite proxy), Bitget
public WebSocket, Bitget REST v2/v3, Bitget Agent MCP (stdio), the shared Parquet +
SQLite store on local disk, AKShare, the BlockBeats API, and the Anthropic LLM used by
the research tier only.

Arrow colours are explained in the in‑image legend. Solid arrows are data/request paths;
the dashed **slate** arrows are runtime wiring (the FastAPI `lifespan` constructing and
starting the realtime stream, market stream, news broker and ingest scheduler); the
dashed **blue** arrow is the single read‑only hop where `webapi.py` reads the agent
layer's projection files (it never imports the LLM graph).

### Hard boundary that the code actually enforces

The agent layer is `deepagents` + `langgraph`, and the boundary is real, not aspirational:

- `agent/research.py` is the **only** module that instantiates an LLM
  (`create_deep_agent`, default model `anthropic:claude-sonnet-4-6`). Its docstring says
  the FastAPI process must never import it.
- `agent/execution.py` is a **deterministic `langgraph.StateGraph`** with zero LLM
  imports; position size is computed from paper equity × `MD_AGENT_RISK_FRACTION`
  (`plan_position`), and any size/leverage carried by a proposal is ignored by
  construction. Every failure routes to a `fail_closed` node.
- `agent/broker.py` is a `PaperBroker` — no live order path exists.
- `webapi.py` imports only `market_data.agent.store` (projection reads), which imports
  only `agent.proposal`. No entry‑point module imports the research/LLM graph.
- `agent/runtime.py` runs the loop in the **standalone `market-data agent-worker`
  process** (`cli.py`), sharing one `SqliteSaver` between both graphs — it is the sole
  checkpointer writer.

---

## 2. How to read `backend-dependencies`

Nodes are the 32 backend modules. Nodes are placed by **longest‑path depth**, so every
imported module sits *below* the modules that import it (leaves at the bottom) — which
makes cycles impossible to hide and any layering violation immediately visible as an
edge pointing the wrong way.

- **Edge colour = the subsystem that owns the importing module** (see legend):
  entry/API, realtime & streaming, ingestion & backfill, storage, analysis, news
  pipeline, agent layer.
- **Dashed black edges** are runtime call relationships (the FastAPI `lifespan` starting
  components; the agent worker driving the research and execution graphs). These pairs
  are also static imports, so they are offset slightly and drawn on top to stay visible.
- **Amber nodes with a numeric badge** are hubs — the badge is the module's in‑degree
  (how many other backend modules import it).

### Hub modules by connectivity (fan‑in, computed from the graph)

| in‑degree | module |
|---:|---|
| 11 | `config.py` |
| 10 | `models.py` |
| 5 | `store.py` |
| 4 | `mcp_client.py`, `ingestion.py`, `indicators.py`, `structure.py`, `agent/proposal.py` |
| 3 | `blockbeats.py`, `levels.py`, `smc.py`, `agent/store.py` |
| 2 | `scheduler.py`, `newsfeed.py`, `events.py`, `agent/broker.py`, `agent/tools.py` |

Fan‑out leaders (most dependencies): `webapi.py` (18), `cli.py` (12),
`agent/runtime.py` (11), `agent/tools.py` (10). `webapi.py` and `cli.py` are the two
composition roots; `webapi.py` is the only module everybody serves and the only one
`cli.py` imports to serve the API.

---

## 3. Layering violations and cycles — the finding

**No import cycles and no layering violations were found.** The 82 import edges form a
clean DAG (verified by topological sort, not eyeballed). The 82 edge count and the
in‑degree table above come from parsing the real import statements.

Two intentional cross‑layer couplings are worth knowing about but are **not** violations:

1. `webapi.py` (entry layer) → `agent/store.py` (agent layer). This is the deliberate
   read‑only projection read documented in `agent/runtime.py`; it stops short of the LLM
   graph. If the agent package is ever split into its own distribution, this is the one
   edge that would need an interface.
2. `agent/tools.py` and `agent/runtime.py` (agent layer) import the storage/analysis/news
   layers. Expected — the agent layer sits at the top of the stack.

The `.pyc` cache under `__pycache__/` contains byte‑code for modules that no longer have
sources (`llm.py`, `factors.py`, `memory.py`, `orchestration.py`, `risk.py`,
`backtest_history.py`, `dlquant.py`, …) — stale artefacts of the removed self‑built
agent/QUANT LAB. They are ignored; only real `.py` files are represented.

---

## 4. Corrections to the root README's architecture section

These diagrams deliberately do **not** propagate the stale points:

- **Port.** The README hard‑codes `uvicorn (:8000)`. In code the port is *configurable*:
  `cli.py serve --port` defaults to `8000`, the host deployment runs **8181**, and inside
  a container `8000` is fine. The diagram labels it as configurable.
- **Agent stack.** The README's ASCII architecture predates the agent rebuild. The code
  is now `deepagents`/`langgraph` (pins in `backend/pyproject.toml`), with the
  research(LLM) ↔ execution(zero‑LLM, paper broker) split shown in Diagram 1.
- **Module list.** The README list is *mostly* accurate for the top‑level modules, but
  omits `discover.py`, `excel_export.py`, `models.py`, `events.py` and the whole
  `agent/` package; the diagrams include them.

---

## 5. Current‑state caveat (a cleanup was in flight)

At revision `0e83cf3` a concurrent change was **removing `vectorbt` and `plotly`** from
the backend and re‑implementing RSI/ATR/BBANDS/MACD in numpy/pandas inside
`indicators.py`. As observed, `indicators.py` still contains `import vectorbt as vbt`
(and `vbt.MACD/BBANDS/RSI/ATR` calls), and `backend/pyproject.toml` still lists
`vectorbt` and `plotly`. This is a **transient in‑flight state, not an architecture
finding** — the diagrams do not depend on `vectorbt`/`plotly`; `indicators.py` is drawn
as an analysis‑layer module regardless of which library backs it. No application code
was modified by this task.

---

## 6. Rendering notes

- SVG × PNG both checked in. PNGs are exported at **2× device scale** (architecture
  2860×2620, dependencies 4528×2284) using a headless Chromium renderer (the bundled
  `cairosvg` path was unavailable in this environment; the skill's browser‑renderer path
  was used instead).
- SVGs passed the `fireworks-tech-graph` validator for `xml`, `markers`, `collisions`
  (zero edge‑through‑node intersections) and `geometry`. The **composition** check's
  showcase budgets (bends / route‑stretch) are exceeded on the dependency graph by
  design: it is a dense 32‑node / 82‑edge engineering graph, which the composition
  contract permits as a "standard profile" artifact. Edges are routed through inter‑row
  lanes and outer corridors so that no edge crosses a node.
