# Trade-Agent · AI Quant Trading Terminal for Crypto

> An open-source cryptocurrency research & trading terminal built on Bitget real-time market data and an AI Agent decision loop — all-in-one K-line terminal, quant backtesting, factor research, global financial news feed, and AI trading assistant.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-%E2%89%A53.11-3776AB?logo=python&logoColor=white)](backend/pyproject.toml)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](frontend/package.json)
[![FastAPI](https://img.shields.io/badge/FastAPI-uvicorn-009688?logo=fastapi&logoColor=white)](backend/src/market_data/webapi.py)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](frontend/package.json)

**English** · [中文](README.md)

**DISCLAIMER: This project is for educational and research purposes only and does not constitute investment advice. It runs in a paper-trading environment by default; you trade live at your own risk.**

---

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Main API](#main-api)
- [Data & News Sources](#data--news-sources)
- [Development & Contributing](#development--contributing)
- [License](#license)

---

## Introduction

Trade-Agent is a full-stack cryptocurrency quant research and trading terminal:

- **Backend** (Python / FastAPI): pulls historical K-line data through Bitget's official MCP service and persists it to Parquet; streams real-time market data over the public WebSocket. It ships with an interactive QUANT LAB workbench (backtest / parameter sweep / walk-forward / factor research), an AI trading agent (decide → execute → reflect), risk management and paper matching, plus a financial news pipeline powered by AKShare / BlockBeats.
- **Frontend** (React 19 / Vite / TypeScript): a professional TradingView-style terminal with a market dashboard, markets overview, screener, heatmaps, community ideas, news center, and an AI Agent page (QUANT LAB quant workbench + market analysis) — fully localized in Chinese with dark/light themes.

The project is developed spec-first with [OpenSpec](https://github.com/Fission-AI/OpenSpec); every feature has corresponding specs and design docs in `openspec/`.

## Features

- **Professional K-line terminal**: rendered by `klinecharts-pro`, with multi-timeframe / multi-chart sync, technical indicators, SMC structure analysis, support/resistance, drawing tools, and price alert lines.
- **Real-time market data**: Bitget public WebSocket pushing K-line / order book / ticker, with a frontend WS subscription protocol (candle / books / ticker).
- **AI trading agent**: an LLM-driven decision loop (analyze → decide → execute → reflect), memory injection and a trade journal; the workbench includes a decision panel, positions, and run controls.
- **Quant backtesting & factor research (QUANT LAB)**: sklearn + vectorbt backtest engine, model hyperparameter sliders (lr / hgb) with 4 preset templates, parameter sweep, multi-fold walk-forward training, signal K-line (buy/sell overlay), model diagnostics (ROC / AUC · feature weights), factor IC time series & table, and backtest history archiving with visualization (equity vs benchmark · monthly return heatmap · per-trade PnL · return histogram · drawdown).
- **Paper trading & risk management**: paper matching, position sizing, stop-loss / circuit breakers, Kill Switch (one-click halt), and two-step order confirmation.
- **Global financial news**: 7x24 flashes aggregated from East Money / Sina / THS / CLS via AKShare, pushed in real time over SSE, auto topic classification, waterfall UI, and paged history.
- **BlockBeats news/data**: crypto news flash and data cache.
- **Price alerts**: local + server-persisted alerts.
- **K-line history**: deep backfill via MCP / REST v2 / v3, Parquet storage, incremental scheduling, and data-integrity checks.
- **Chinese-first UI**, dark/light themes, responsive multi-market (SPOT / USDT-FUTURES).

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python >= 3.11 · FastAPI · uvicorn · APScheduler · pandas / pyarrow · numpy · scikit-learn · vectorbt · quantstats · pydantic-settings · akshare |
| Data access | Bitget Agent MCP (stdio) · Bitget public WebSocket · REST v2/v3 |
| Frontend | React 19 · Vite 6 · TypeScript 5 · Tailwind CSS v4 · klinecharts + klinecharts-pro · Recharts · Radix UI · motion · lucide-react · self-hosted Google Sans Flex / Noto Sans SC |
| Testing | pytest (three-layer suite) · Vitest + Testing Library · Playwright (E2E) |
| Engineering | uv / pip · npm · OpenSpec spec-first development · GPL-3.0 |

## System Architecture

```
┌────────────────────── Browser · React 19 + Vite ──────────────────────┐
│  SuperCharts │ Markets │ Screener │ Heatmaps │ Community │ News       │
│  AI Agent (QUANT LAB + market analysis) · klinecharts-pro · Recharts │
│  i18n(zh-CN) · Tailwind v4 · dark/light                              │
└───────────────────────┬─────────────────────────┬──────────────────┘
                        │ /api (vite proxy)       │ /ws
┌───────────────────────▼─────────────────────────▼──────────────────┐
│                     FastAPI · uvicorn (:8000)                      │
│   REST: /candles /analyze /structure /backtest /sweep /agent /news  │
│   WS: candle / ticker / books / trade / mark-price / funding-time  │
│   SSE: /news/stream (global news live stream)                      │
├────────────────────────────────────────────────────────────────────┤
│  Bitget MCP (stdio) │ Bitget public WS │ AKShare │ BlockBeats API  │
│  K-line ingest/backfill │ realtime bars/books │ 4 news sources │ daily cache │
│  Parquet Store      │ ring buffer       │ ring buffer │ local cache │
└────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Python >= 3.11
- Node.js >= 20 (with npm)
- Windows / macOS / Linux

### 1. Start the backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -e .
cp .env.example .env   # optional; defaults work without any key
```

Start the API server (defaults to `http://127.0.0.1:8000`):

```bash
# Option 1: uvicorn (development)
uvicorn market_data.webapi:create_app --factory --port 8000

# Option 2: CLI entry point
market-data serve
```

> Public market data (K-line, real-time WebSocket) requires **no API key**. Only BlockBeats news needs `BB_API_KEY`; without it, those endpoints degrade gracefully.

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173** (`/api` and `/ws` are proxied to the backend on port 8000).

### 3. Optional: CLI data ingestion

```bash
# List available MCP tools
market-data discover
# Pull a K-line range and export to Excel
market-data pull --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-02 --export
# Incremental pull
market-data incremental --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-03
# Gap check
market-data gaps --symbol BTCUSDT --timeframe 5m
# Indicators + support/resistance analysis
market-data analyze --symbol BTCUSDT --timeframe 1h
# Run a quant backtest
market-data backtest --symbol BTCUSDT --timeframe 1h
# Run one memory-augmented AI agent cycle (paper)
market-data orchestrate
# Show trade memory / distilled rules
market-data memory
```

## Environment Variables

Backend settings use the `MD_` prefix (loaded from `backend/.env`); all are optional:

| Variable | Default | Description |
|---|---|---|
| `BB_API_KEY` | empty | BlockBeats news/data API key (news endpoints degrade without it) |
| `BITGET_API_KEY` / `SECRET` / `PASSPHRASE` | empty | Reserved; not needed for public market data |
| `MD_DATA_DIR` | `./data` | Data root (Parquet / Excel / caches) |
| `MD_SYMBOLS` | `BTCUSDT,ETHUSDT,SOLUSDT` | Default symbols to ingest |
| `MD_TIMEFRAMES` | `1m,5m,...,1d` | Default timeframes |
| `MD_CATEGORY` | `USDT-FUTURES` | Default product line |
| `MD_CATEGORIES` | `SPOT,USDT-FUTURES` | Product lines covered by the exchange market hub |
| `MD_SCHEDULE_INTERVAL_SECONDS` | `300` | Scheduled incremental pull interval |
| `MD_MCP_COMMAND` / `MD_MCP_ARGS` | `npx` / `@bitget-ai/bitget-agent-mcp` | Bitget MCP launch command |
| `MD_CANDLE_PAGE_LIMIT` | `100` | Per-request candle page size |
| `MD_REST_CANDLE_PAGE_LIMIT` | `500` | REST v2 deep-backfill page size |
| `MD_V3_CANDLE_PAGE_LIMIT` | `100` | REST v3 deep-backfill page size |
| `MD_BACKFILL_PAGE_DELAY` | `0.05` | Throttle delay between deep-backfill pages (s) |
| `MD_NEWS_POLL_SECONDS` | `60` | Global news polling interval |
| `MD_NEWS_BUFFER_SIZE` | `500` | News ring-buffer size |
| `MD_WS_PUBLIC_URL` | Bitget official | Public WebSocket URL |
| `MD_WS_HEARTBEAT_SECONDS` | `30` | WS heartbeat interval |
| `MD_WS_RECONNECT_SECONDS` | `5` | WS reconnect interval |
| `MD_BLOCKBEATS_REFRESH_HOUR` / `MINUTE` | `12` / `0` | Daily BlockBeats data-cache refresh time |
| `MD_LOG_LEVEL` | `INFO` | Log level |

## Testing

A three-layer test pyramid, all runnable locally (the `online` subset needs external network):

| Layer | Command | Scope |
|---|---|---|
| L1 data integrity | `cd backend && python -m pytest -m integrity` | Full parquet series quality (monotonic / OHLC / gap whitelists) |
| L2 live API/WS | `cd backend && python -m pytest tests/test_live_api.py tests/test_live_ws.py` | Real uvicorn process: all REST endpoints + WS channels |
| L3 browser journeys | `cd frontend && npm run test:e2e` | Playwright user journeys (auto-starts vite + backend) |

Unit regression:

```bash
cd backend && python -m pytest -q
cd frontend && npm run test && npm run typecheck
```

## Project Structure

```
├── backend/
│   └── src/market_data/
│       ├── webapi.py            # FastAPI routes (REST / WS / SSE)
│       ├── realtime.py          # Bitget public WebSocket realtime stream
│       ├── streamhub.py         # WS subscription routing & push
│       ├── ingestion.py         # MCP / REST historical ingest & backfill
│       ├── mcp_client.py        # Bitget Agent MCP client
│       ├── store.py / scheduler.py        # Parquet store / incremental-persistence scheduler
│       ├── dlquant.py / factors.py / indicators.py  # Quant engine (vectorbt) / factors / indicators
│       ├── smc.py / structure.py / levels.py   # Structure & support/resistance
│       ├── agent.py / llm.py / memory.py / orchestration.py  # AI trading agent
│       ├── execution.py / risk.py              # Execution & risk management
│       ├── newsfeed.py / news_broker.py        # Global news (AKShare → SSE)
│       ├── blockbeats.py / blockbeats_cache.py # BlockBeats news/data + daily local cache
│       ├── backtest_history.py / chartstore.py / alertstore.py  # History / chart / alert stores
│       └── cli.py               # market-data CLI
├── frontend/
│   └── src/
│       ├── components/views/    # Page views (SuperCharts/Markets/News/Agent...)
│       │   └── agent/           # QUANT LAB + AI Agent analysis (QuantLabPanel/ModelPanel/...)
│       ├── lib/                 # Data layer & utilities (globalNews/useMasonry...)
│       ├── api/client.ts        # REST client
│       ├── hooks/ types/ utils/ data/
│       └── vendor/klinecharts-pro
├── openspec/                    # OpenSpec spec-first development docs (specs + archive)
├── docs/                        # Documentation (work in progress)
├── agent_hub-main/              # Reference project (MIT, not part of this repo's codebase)
├── LICENSE                      # GNU GPL v3
└── README.md
```

## Main API

### Market data
- `GET /health`, `GET /candles`, `GET /candles/recent`, `POST /candles/backfill`
- `GET /analyze`, `GET /levels`, `GET /structure`
- `GET /tickers`, `GET /books/{symbol}`, `GET /books/{category}/{symbol}`, `GET /trades/{symbol}`, `GET /trades/{category}/{symbol}`, `GET /funding`, `GET /mark-price`, `GET /instruments`
- `WS /ws`: `candle` / `ticker` / `books` / `trade` / `mark-price` / `funding-time` subscription push

### Quant
- `POST /backtest`, `GET /jobs/{id}`, `POST /dl/features`
- `POST /backtest/sweep` (parameter sweep), `POST /backtest/walkforward` (walk-forward)
- `GET /backtest/history`, `GET /backtest/history/{id}`, `DELETE /backtest/history/{id}`

### AI agent
- `POST /agent/decide`, `POST /agent/cycle`, `GET /portfolio`, `GET /journal`
- `POST /order`, `POST /order/confirm`, `PUT /control` (Kill Switch)

### News
- `GET /news/categories`, `GET /news/history?offset=&limit=&category=`
- `GET /news/stream` (SSE: snapshot → live items → heartbeat)
- `GET /news/context?hours=&category=`, `GET /news/health`
- `GET /blockbeats/newsflash/{type}`, `GET /blockbeats/data/{endpoint}`, `POST /blockbeats/data/refresh`

### Other
- `GET/PUT /config`, `GET/PUT /chart-config`, `GET/POST/PUT/DELETE /alerts`

## Data & News Sources

| Data | Source | Notes |
|---|---|---|
| K-line history | Bitget (MCP / REST v2 / v3) | Deep history backfill, Parquet storage |
| Realtime market data | Bitget public WebSocket | K-line / order book / ticker, no auth |
| Global financial news | AKShare (East Money / Sina / THS / CLS) | 7x24 flashes, SSE push, topic classification, free & keyless |
| Crypto news | BlockBeats API | Newsflash / data, requires `BB_API_KEY` |

## Development & Contributing

- This repository is developed spec-first with **OpenSpec**: features start as `openspec/changes/<change>/` (proposal → design → specs → tasks) and are archived into `openspec/specs/` after implementation.
- Please pass the three-layer test regression before submitting (see [Testing](#testing)).
- Issues and PRs are welcome. Discuss the design before sending code.

## License

This project is open-sourced under the **GNU General Public License v3.0** (GPL-3.0). See [LICENSE](LICENSE) for the full text.

- You are free to use, modify, and redistribute the software (including commercially), but **any derivative work must also be licensed under GPL-3.0 with the source code made available**.
- This software is provided "as is" **without any warranty** (see Sections 15–17 of the LICENSE).
- The `agent_hub-main/` directory is an imported reference project under the **MIT License (Copyright (c) 2025 Bitget)** and is not covered by this repository's GPL-3.0.

---

*For educational and research purposes only. Cryptocurrency trading carries extreme risk. This project does not constitute investment advice; you trade live at your own risk.*
