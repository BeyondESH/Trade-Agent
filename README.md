# Trade-Agent · 加密货币 AI 量化交易终端

> 基于 Bitget 实时行情与 AI Agent 决策的开源加密货币研究与交易终端 —— K 线终端、量化回测、因子研究、全球财经快讯与 AI 交易助手一体化。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-%E2%89%A53.11-3776AB?logo=python&logoColor=white)](backend/pyproject.toml)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](frontend/package.json)
[![FastAPI](https://img.shields.io/badge/FastAPI-uvicorn-009688?logo=fastapi&logoColor=white)](backend/src/market_data/webapi.py)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](frontend/package.json)

**中文** · [English](README.en.md)

**免责声明：本项目仅用于学习与研究，不构成任何投资建议；默认运行在模拟盘（Paper）环境，实盘交易风险自负。**

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [测试](#测试)
- [项目结构](#项目结构)
- [主要 API](#主要-api)
- [数据与新闻源](#数据与新闻源)
- [开发与贡献](#开发与贡献)
- [许可证](#许可证)

---

## 项目简介

Trade-Agent 是一个全栈的加密货币量化研究与交易终端：

- **后端**（Python / FastAPI）：通过 Bitget 官方 MCP 服务抓取 K 线历史并落盘 Parquet，通过公共 WebSocket 实时推送行情；内置量化回测引擎、因子研究工作台、AI 交易智能体（决策 → 执行 → 复盘）、风控与模拟盘撮合，以及基于 AKShare / BlockBeats 的财经快讯管线。
- **前端**（React 19 / Vite / TypeScript）：类 TradingView 的专业终端界面，包含行情仪表盘、市场总览、筛币器、热力图、新闻中心、AI 智能体工作台等页面，全中文界面、支持暗/亮主题。

整个项目以 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 规格驱动开发，历史功能均有对应规格与设计文档沉淀在 `openspec/`。

## 功能特性

- **专业 K 线终端**：`klinecharts-pro` 渲染，多周期 / 多图表联动、技术指标、SMC 结构分析、支撑阻力、绘图工具、价格预警线。
- **实时行情**：Bitget 公共 WebSocket 推送 K 线 / 盘口 / Ticker，前端 WS 订阅协议（candle / books / ticker）。
- **AI 交易智能体**：LLM 驱动的决策循环（分析 → 决策 → 执行 → 复盘），支持记忆注入与交易日志，工作台含决策面板、持仓、运行控制。
- **量化回测与因子研究**：DL/ML 回测引擎（walk-forward 训练）、因子 IC 评估（`/dl/features`）、回测历史存档与可视化（月度收益 / 单笔盈亏 / 收益直方图 / 权益回撤）。
- **模拟盘与风控**：Paper 撮合、仓位管理、止损/熔断、Kill Switch（一键停机）、订单二次确认。
- **全球财经快讯**：AKShare 聚合东财 / 新浪 / 同花顺 / 财联社 7×24 快讯，SSE 实时推送，主题自动分类，瀑布流 UI，支持历史分页。
- **BlockBeats 快讯/数据**：加密货币新闻流与数据缓存。
- **价格提醒**：本地 + 服务端持久化告警。
- **K 线历史**：MCP / REST v2 / v3 深度历史回填，Parquet 存储，增量调度，数据完整性校验。
- **全中文界面**，暗/亮主题，响应式多市场（SPOT / USDT-FUTURES）。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python ≥ 3.11 · FastAPI · uvicorn · APScheduler · pandas / pyarrow · pydantic-settings · akshare |
| 数据接入 | Bitget Agent MCP（stdio）· Bitget 公共 WebSocket · REST v2/v3 |
| 前端 | React 19 · Vite 6 · TypeScript 5 · Tailwind CSS v4 · klinecharts + klinecharts-pro · Recharts · motion · lucide-react |
| 测试 | pytest（三层测试）· Vitest + Testing Library · Playwright（E2E） |
| 工程 | uv / pip · npm · OpenSpec 规格驱动开发 · GPL-3.0 |

## 系统架构

```
┌────────────────────── 浏览器 · React 19 + Vite ──────────────────────┐
│  Dashboard │ Markets │ Screener │ Heatmaps │ News │ AI Agent       │
│  klinecharts-pro · Recharts · i18n(中文) · Tailwind v4 · dark/light │
└───────────────────────┬─────────────────────────┬──────────────────┘
                        │ /api (vite proxy)       │ /ws
┌───────────────────────▼─────────────────────────▼──────────────────┐
│                     FastAPI · uvicorn (:8000)                      │
│   REST：/candles /analyze /structure /backtest /agent /news /...   │
│   WS：candle / ticker / books（行情推送）                           │
│   SSE：/news/stream（全球快讯实时流）                               │
├────────────────────────────────────────────────────────────────────┤
│  Bitget MCP (stdio) │ Bitget 公共 WS │ AKShare │ BlockBeats API    │
│  K线抓取/回填        │ 实时bar/盘口    │ 快讯4源 │ 加密快讯/数据     │
│  Parquet Store      │ 环形缓冲        │ 环形缓冲 │ 本地缓存          │
└────────────────────────────────────────────────────────────────────┘
```

## 快速开始

### 环境要求

- Python ≥ 3.11
- Node.js ≥ 20（含 npm）
- Windows / macOS / Linux 均可

### 1. 启动后端

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -e .
cp .env.example .env   # 按需修改（默认无 Key 也可启动）
```

启动 API 服务（默认 `http://127.0.0.1:8000`）：

```bash
# 方式一：uvicorn（开发）
uvicorn market_data.webapi:create_app --factory --port 8000

# 方式二：CLI 入口
market-data serve
```

> 公开行情（K 线、实时 WebSocket）**无需任何 API Key**。仅 BlockBeats 快讯需要 `BB_API_KEY`，缺失时相关接口自动降级。

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 **http://127.0.0.1:5173** 即可（`/api` 与 `/ws` 自动代理到后端 8000 端口）。

### 3. 可选：CLI 数据抓取

```bash
# 查看可用 MCP 工具
market-data discover
# 抓取一段 K 线并导出 Excel
market-data pull --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-02 --export
# 增量拉取
market-data incremental --symbol BTCUSDT --timeframe 5m --start 2024-01-01 --end 2024-01-03
# 数据缺口检查
market-data gaps --symbol BTCUSDT --timeframe 5m
# 跑一次记忆增强的 AI Agent 循环（模拟盘）
market-data orchestrate
```

## 环境变量

后端配置前缀为 `MD_`（`backend/.env` 加载），全部可选：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `BB_API_KEY` | 空 | BlockBeats 新闻/数据 API Key（缺失时快讯接口降级） |
| `BITGET_API_KEY` / `SECRET` / `PASSPHRASE` | 空 | 预留，公开行情无需 |
| `MD_DATA_DIR` | `./data` | 数据根目录（Parquet / Excel / 缓存） |
| `MD_SYMBOLS` | `BTCUSDT,ETHUSDT,SOLUSDT` | 默认抓取标的 |
| `MD_TIMEFRAMES` | `1m,5m,…,1d` | 默认周期 |
| `MD_CATEGORY` | `USDT-FUTURES` | 默认产品线 |
| `MD_SCHEDULE_INTERVAL_SECONDS` | `300` | 定时增量拉取周期 |
| `MD_MCP_COMMAND` / `MD_MCP_ARGS` | `npx` / `@bitget-ai/bitget-agent-mcp` | Bitget MCP 启动命令 |
| `MD_CANDLE_PAGE_LIMIT` | `100` | 单请求 K 线页大小 |
| `MD_REST_CANDLE_PAGE_LIMIT` | `500` | REST v2 深回填页大小 |
| `MD_V3_CANDLE_PAGE_LIMIT` | `100` | REST v3 深回填页大小 |
| `MD_NEWS_POLL_SECONDS` | `60` | 全球快讯轮询周期 |
| `MD_NEWS_BUFFER_SIZE` | `500` | 快讯环形缓冲条数 |
| `MD_WS_PUBLIC_URL` | Bitget 官方 | 公共 WebSocket 地址 |
| `MD_LOG_LEVEL` | `INFO` | 日志级别 |

## 测试

项目采用三层测试金字塔（全部可本地运行，`online` 子集需外网）：

| 层 | 命令 | 覆盖 |
|---|---|---|
| L1 数据完整性 | `cd backend && python -m pytest -m integrity` | Parquet 全序列质量（单调性 / OHLC / 缺口白名单） |
| L2 实时 API/WS | `cd backend && python -m pytest tests/test_live_api.py tests/test_live_ws.py` | 真实 uvicorn 进程的 REST + WS 全通道 |
| L3 浏览器旅程 | `cd frontend && npm run test:e2e` | Playwright 用户旅程（自动起 vite + 后端） |

单元回归：

```bash
cd backend && python -m pytest -q
cd frontend && npm run test && npm run typecheck
```

## 项目结构

```
├── backend/
│   └── src/market_data/
│       ├── webapi.py            # FastAPI 路由（REST / WS / SSE）
│       ├── realtime.py          # Bitget 公共 WebSocket 实时行情
│       ├── streamhub.py         # WS 订阅路由与推送
│       ├── ingestion.py         # MCP / REST 历史抓取与回填
│       ├── mcp_client.py        # Bitget Agent MCP 客户端
│       ├── store.py             # Parquet 存储
│       ├── dlquant.py           # 量化回测引擎
│       ├── factors.py           # 因子库
│       ├── indicators.py        # 技术指标
│       ├── smc.py / structure.py / levels.py   # 结构与支撑阻力
│       ├── agent.py / llm.py / memory.py       # AI 交易智能体
│       ├── execution.py / risk.py              # 执行与风控
│       ├── newsfeed.py / news_broker.py        # 全球快讯（AKShare → SSE）
│       ├── blockbeats.py                        # BlockBeats 快讯/数据
│       ├── backtest_history.py / chartstore.py  # 历史存档
│       └── cli.py               # market-data 命令行
├── frontend/
│   └── src/
│       ├── components/views/    # 页面视图（Dashboard/Markets/News/Agent…）
│       ├── lib/                 # 数据层与工具（globalNews/useMasonry…）
│       ├── api/client.ts        # REST 客户端
│       ├── hooks/ types/ utils/ data/
│       └── vendor/klinecharts-pro
├── openspec/                    # OpenSpec 规格驱动的开发文档（specs + 归档）
├── docs/                        # 文档（待补充）
├── agent_hub-main/              # 参考项目（MIT，非本仓库主体）
├── LICENSE                      # GNU GPL v3
└── README.md
```

## 主要 API

### 行情
- `GET /health`、`GET /candles`、`GET /candles/recent`、`POST /candles/backfill`
- `GET /analyze`、`GET /levels`、`GET /structure`
- `GET /tickers`、`GET /books/{symbol}`、`GET /trades/{symbol}`、`GET /funding`、`GET /mark-price`、`GET /instruments`
- `WS /ws`：`candle` / `ticker` / `books` 订阅推送

### 量化
- `POST /backtest`、`GET /jobs/{id}`、`POST /dl/features`
- `GET /backtest/history`、`GET /backtest/history/{id}`、`DELETE /backtest/history/{id}`

### AI 智能体
- `POST /agent/decide`、`POST /agent/cycle`、`GET /portfolio`、`GET /journal`
- `POST /order`、`POST /order/confirm`、`PUT /control`（Kill Switch）

### 新闻
- `GET /news/categories`、`GET /news/history?offset=&limit=&category=`
- `GET /news/stream`（SSE：快照 → 实时条目 → 心跳）
- `GET /news/context?hours=&category=`、`GET /news/health`
- `GET /blockbeats/newsflash/{type}`、`GET /blockbeats/data/{endpoint}`

### 其他
- `GET/PUT /config`、`GET/PUT /chart-config`、`GET/POST/PUT/DELETE /alerts`

## 数据与新闻源

| 数据 | 来源 | 说明 |
|---|---|---|
| K 线历史 | Bitget（MCP / REST v2 / v3） | 深度历史回填，Parquet 存储 |
| 实时行情 | Bitget 公共 WebSocket | K 线 / 盘口 / Ticker，无需鉴权 |
| 全球财经快讯 | AKShare（东财 / 新浪 / 同花顺 / 财联社） | 7×24 快讯，SSE 推送，主题分类，免费无 Key |
| 加密新闻 | BlockBeats API | 快讯 / 数据，需 `BB_API_KEY` |

## 开发与贡献

- 本仓库使用 **OpenSpec** 规格驱动开发：功能先写 `openspec/changes/<change>/`（proposal → design → specs → tasks），实现后归档合并到 `openspec/specs/`。
- 提交前请通过三层测试回归（见[测试](#测试)）。
- 欢迎 Issue 与 PR。建议先讨论设计再提交代码。

## 许可证

本项目以 **GNU General Public License v3.0**（GPL-3.0）开源，完整文本见 [LICENSE](LICENSE)。

- 你可以自由使用、修改与再分发本软件（含商用），但**任何基于本项目的衍生作品必须同样以 GPL-3.0 授权并开放源代码**。
- 本软件按“现状”提供，**不附带任何担保**（详见 LICENSE 第 15–17 条）。
- 仓库内的 `agent_hub-main/` 为引入的参考项目，采用 **MIT License（Copyright (c) 2025 Bitget）**，不受本仓库 GPL-3.0 约束。

---

*仅供学习研究使用。加密货币交易风险极高，本项目不构成投资建议，实盘操作风险自负。*
