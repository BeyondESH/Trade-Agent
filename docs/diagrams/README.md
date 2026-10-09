# Backend diagrams — `market-data` (Trade-Agent)

Two diagrams of the **actual** backend code (not the README's description). They were
derived by enumerating `backend/src/market_data/**` with the Codemap MCP graph and by
parsing the real `from market_data … import …` statements of every module, then verified
by reading the entry points (`webapi.py`, `cli.py`, `agent/runtime.py`,
`agent/execution.py`, `agent/research.py`, `agent/store.py`, `db.py`, `store.py`) and the
compose stack (`compose.yaml`, `Dockerfile`, `docker/entrypoint.sh`, `docs/docker-dev.md`).

| File | What it shows |
|---|---|
| `backend-architecture.svg` / `.png` | Runtime/serving architecture: the two compose containers, the FastAPI (uvicorn) + vite surfaces, the agent worker, and the single PostgreSQL persistence layer |
| `backend-dependencies.svg` / `.png` | Directed module dependency graph (imports) + runtime call edges |

Observed revision: **`40a337c`**. All counts below are computed from that tree
(`33` modules · `90` import edges).

---

## 1. How to read `backend-architecture`

This is a **runtime** view, not a code-layer view. Every store has moved onto
PostgreSQL (three migration phases), so there is exactly **one persistence layer** and
**two containers**.

### The two compose containers

| Container | Image | Role | Published ports |
|---|---|---|---|
| `dev` (`trade-dev-1`) | `trade_agent_img` | toolbox **+** resident servers: uvicorn `:8181` and vite `:5173` (supervised by `docker/entrypoint.sh`) | `8181`, `5173` |
| `postgres` (`trade-postgres-1`) | `postgres:16` | **single persistence layer** (app tables + LangGraph checkpointer tables) | `5433` → container `5432` |

`dev` declares `depends_on: postgres: {condition: service_healthy}`, so the app never
starts against an unready database. The repository is **not** bind-mounted; the container
keeps a native ext4 working copy in the `trade-workspace` volume and a read-only bind
`/src-ro` is the rsync source for `scripts/dev-sync.sh`.

### Inside the `dev` container

| Process | Modules | Notes |
|---|---|---|
| frontend | vite dev server `:5173` | React 19 · `klinecharts-pro` · Tailwind v4 · HMR; dev proxy `/api` + `/ws` → `127.0.0.1:8181` |
| backend | `webapi.py` on uvicorn `:8181` | REST (`/candles`, `/analyze`, `/structure`, `/levels`, `/tickers`, …), `WS /ws`, SSE (`/news/stream`, `/research/{thread_id}/stream`) |
| backend — lifespan wiring | `realtime.py`, `streamhub.py`, `news_broker.py` (+ `newsfeed.py`), `scheduler.py`, `blockbeats_cache.py` | constructed and started from the FastAPI `lifespan`; `scheduler.py` is disabled when `MD_SCHEDULE_INTERVAL_SECONDS=0` |
| worker (separate process) | `cli.py agent-worker` → `agent/runtime.py` | Tier‑1 research (`research.py`, the only LLM) and Tier‑2 execution (`execution.py`, zero‑LLM `langgraph.StateGraph`) sharing one `PostgresSaver` |

### Shared data access and the single PostgreSQL layer

`db.py` is the **only** place that owns the connection lifecycle and the DDL: one
`psycopg_pool.ConnectionPool` per DSN, and an idempotent `bootstrap()` guarded by
`pg_advisory_xact_lock`. Every formerly file-backed store now depends on it:

- **application tables** (`db.py` `SCHEMA_SQL`): `candles` (was 6,684 Parquet day-files →
  78,422 rows), `alerts`, `chart_config`, `blockbeats_cache`, `events`, `proposals`,
  `runs`, and `stream_events` (its global `id` **is** the SSE cursor);
- **LangGraph checkpointer tables** (created by `PostgresSaver.setup()`):
  `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`.

### Named volumes

| Volume | Mount | Contents |
|---|---|---|
| `trade-workspace` | `/workspace` | the native ext4 working copy (git / tests / servers) |
| `trade-data` | `/workspace/backend/data` | **legacy** Parquet day-files + JSON/JSONL — audit / re-run only |
| `trade-pgdata` | `postgres:/var/lib/postgresql/data` | PostgreSQL data directory |

### External boundaries (amber, bottom row)

Browser (React 19 + Vite proxy), Bitget public WebSocket, Bitget REST v2/v3, Bitget Agent
MCP (stdio), AKShare, the BlockBeats API, and the Anthropic LLM used by the research tier
only.

### Hard boundary that the code actually enforces

The agent layer is `deepagents` + `langgraph` on a `PostgresSaver`, and the boundary is
real, not aspirational:

- `agent/research.py` is the **only** module that instantiates an LLM
  (`create_deep_agent`). Its docstring says the FastAPI process must never import it.
- `agent/execution.py` is a **deterministic `langgraph.StateGraph`** with zero LLM
  imports; position size is computed from paper equity × `MD_AGENT_RISK_FRACTION`
  (`plan_position`), and any size/leverage carried by a proposal is ignored by
  construction. Every failure routes to a `fail_closed` node.
- `agent/broker.py` is a `PaperBroker` — no live order path exists.
- `webapi.py` imports only `market_data.agent.store` (projection reads over PostgreSQL),
  which imports only `agent.proposal` + `db`. No entry‑point module imports the
  research/LLM graph.
- `agent/runtime.py` runs the loop in the **standalone `market-data agent-worker`
  process** (`cli.py`), sharing one `PostgresSaver` between both compiled graphs — it is
  the sole checkpointer writer; FastAPI only reads.

---

## 2. How to read `backend-dependencies`

Nodes are the **33 backend modules**. Nodes are placed by **longest‑path depth**, so every
imported module sits *below* the modules that import it (leaves at the bottom) — which
makes cycles impossible to hide and any layering violation immediately visible as an
edge pointing the wrong way.

- **Edge colour = the subsystem that owns the importing module** (see legend):
  entry/API, realtime & streaming, ingestion & backfill, storage, analysis, news
  pipeline, agent layer.
- **`db.py` is the shared data‑access node** (drawn green): every db‑backed store imports
  it, and `db.py` alone imports `config`. This replaces the former per-store file access.
- **Dashed black edges** are runtime call relationships (the FastAPI `lifespan` starting
  components; the agent worker driving the research and execution graphs). These pairs
  are also static imports, so they are offset slightly and drawn on top to stay visible.
- **Amber nodes with a numeric badge** are hubs — the badge is the module's in‑degree
  (how many other backend modules import it). `db.py` is a hub too, drawn green.

### Hub modules by connectivity (fan‑in, computed from the graph)

| in‑degree | module |
|---:|---|
| 12 | `config.py` |
| 10 | `models.py` |
| 7 | `db.py` |
| 5 | `store.py` |
| 4 | `agent/proposal.py`, `indicators.py`, `ingestion.py`, `mcp_client.py`, `structure.py` |
| 3 | `agent/store.py`, `blockbeats.py`, `levels.py`, `smc.py` |
| 2 | `agent/broker.py`, `agent/tools.py`, `events.py`, `newsfeed.py`, `scheduler.py` |

Fan‑out leaders (most dependencies): `webapi.py` (19), `cli.py` (12),
`agent/runtime.py` (11), `agent/tools.py` (10), `agent/execution.py` (4). `webapi.py` and
`cli.py` are the two composition roots; `webapi.py` is the only module everybody serves
and the only one `cli.py` imports to serve the API.

---

## 3. Layering violations and cycles — the finding

**No import cycles and no layering violations were found.** The **90 import edges** form
a clean DAG (verified by Kahn topological sort, not eyeballed), and every edge points
from a higher longest‑path depth to a lower one. The 90 edge count and the in‑degree
table above come from parsing the real import statements.

Two intentional cross‑layer couplings are worth knowing about but are **not** violations:

1. `webapi.py` (entry layer) → `agent/store.py` (agent layer). This is the deliberate
   read‑only projection read (now over PostgreSQL) documented in `agent/runtime.py`; it
   stops short of the LLM graph. If the agent package is ever split into its own
   distribution, this is the one edge that would need an interface.
2. `agent/tools.py` and `agent/runtime.py` (agent layer) import the storage/analysis/news
   layers. Expected — the agent layer sits at the top of the stack.

The `.pyc` cache under `__pycache__/` contains byte‑code for modules that no longer have
sources (`llm.py`, `factors.py`, `memory.py`, `orchestration.py`, `risk.py`,
`backtest_history.py`, `dlquant.py`, …) — stale artefacts of the removed self‑built
agent/QUANT LAB. They are ignored; only real `.py` files are represented.

---

## 4. Corrections to the root README's architecture section

These diagrams deliberately do **not** propagate the stale points:

- **Port.** The root README's ASCII architecture shows `uvicorn (:8000)`. In code the port
  is *configurable*: `cli.py serve --port` defaults to `8000`, the compose deployment runs
  **8181**, and the E2E harness starts its own backend on `E2E_BACKEND_PORT`. The diagram
  labels it as the compose value.
- **Deployment.** The root README describes the old single-container bind-mount stack. The
  current stack is **two containers** (`dev` + `postgres`) with a native ext4 working copy
  (no repo bind-mount); the architecture diagram shows exactly that.
- **Agent stack.** The README's ASCII architecture predates the agent rebuild. The code is
  now `deepagents`/`langgraph` (`PostgresSaver`, pins in `backend/pyproject.toml`), with
  the research(LLM) ↔ execution(zero‑LLM, paper broker) split shown in Diagram 1.

---

## 5. Persistence note (files → PostgreSQL)

Three migration phases moved **every** store off files onto the `postgres` service:
the LangGraph checkpointer, the JSON stores (alerts / chart config / BlockBeats cache /
event log), the OHLCV candles (`store.py`), and the agent projections + SSE cursor
(`agent/store.py`). The former `ParquetStore` **class name is retained on purpose**
(imported/constructed at many call sites) but it is now PostgreSQL‑backed — the diagrams
show it as a storage module on the single PostgreSQL layer, never as a Parquet/SQLite
node. The old file trees (`backend/data/parquet`, the JSON/JSONL files, the
`checkpoints.sqlite`) are **legacy**: kept on disk for audit / one-shot re-import only,
never read at runtime.

---

## 6. Rendering notes

- SVG × PNG both checked in. PNGs are exported at **2× device scale** (architecture
  3000×2360, dependencies 3280×2280) using a headless Chromium renderer (the bundled
  `cairosvg` path was unavailable in this environment; the Chrome headless‑new renderer
  was used instead).
- SVGs passed XML well‑formedness and marker‑integrity checks. The dependency graph is a
  dense 33‑node / 90‑edge engineering graph, which the composition contract permits as a
  "standard profile" artifact: nodes are opaque boxes drawn **over** the edge layer, so no
  label is crossed by an edge, and edges are routed as bottom→top curves through
  inter‑row lanes so no arrowhead lands off its target node.
