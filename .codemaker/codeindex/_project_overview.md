---
type: "Module"
id: trade
title: "Trade-Agent 加密量化交易终端"
description: "以 Bitget 行情为数据源、由 OpenSpec 规格驱动的全栈加密货币量化研究与模拟交易终端；后端 Python/FastAPI 落地数据与风控执行，前端 React 19 呈现交易所式终端。"
kb_root: .codemaker/codeindex
repo_name: trade
last_updated: 2026-09-28
---

# trade 项目总览

## 仓库定位

Trade-Agent 是「加密货币 AI 量化交易终端」：后端把 Bitget 行情变成可持久化、可回测、可被 Agent 决策的资产，前端把它投影为 TradingView 风格单图终端；默认纸面（Paper）交易，实盘必须显式开启且二次确认，否则任何下单路径都不得触达真实账户。（来源: README.md、openspec/specs/live-safety/spec.md）

- 研发范式是 **OpenSpec 规格驱动**：`openspec/specs/**` 是行为契约权威来源，`openspec/changes/archive/**` 是变更历史；代码与规格必须同变更同步，改代码不更新 spec 属违约。（来源: openspec/config.yaml、openspec/specs/repo-hygiene/spec.md）
- 三条硬口径：① 系统主语言 Python（≥3.11）；② Bitget 能力以 npm 依赖形式消费（`@bitget-ai/bitget-agent-*`），仓库内不得出现被 fork 的上游源码副本；③ DL 量化与前端实时行情走 Bitget **直连 REST/WS**，只有 AI Agent 走 `bitget-agent-mcp` 工具通道。（来源: openspec/specs/system-architecture/spec.md）
- 建设顺序由 `change-roadmap` 固化：market-data-foundation → indicator-structure-engine → risk-position-management → execution-engine → ai-agent-core → trade-memory-reflection → dl-quant-engine → automation-orchestration → web-frontend，每个 change 独立立项与验证、不跳依赖。（来源: openspec/specs/change-roadmap/spec.md）

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python ≥3.11 · FastAPI/uvicorn · APScheduler · pandas/pyarrow · numpy · scikit-learn · vectorbt · quantstats · pydantic-settings · akshare |
| 数据接入 | Bitget Agent MCP（stdio 子进程，Node ≥20）· Bitget 公共 WS · REST v2/v3 · AKShare（4 源快讯）· BlockBeats api-pro（需 Key） |
| 前端 | React 19 · Vite 6 · TypeScript 5 · Tailwind CSS v4 · klinecharts + klinecharts-pro（vendored）· Recharts · Radix UI · motion · lucide-react · 自托管字体 |
| 测试 | pytest 三层（L1 integrity / L2 live / 离线单测）· Vitest + Testing Library · Playwright（L3，刻意不进 CI） |
| 工程 | uv + `uv.lock` · npm + `package-lock.json` · ruff · Biome · pre-commit · GPL-3.0 |

（来源: README.md 技术栈表、AGENTS.md 测试矩阵、`backend/pyproject.toml`、`frontend/package.json`）

## 顶层目录结构

- `backend/` — 后端工程根（`pyproject.toml`/`uv.lock`/`.env.example`/`.gitignore` 为契约文件组）
- `backend/src/market_data/` — 后端唯一 Python 包：数据接入、存储、分析、量化、风控执行、Agent、Web 门面
- `backend/tests/` — 三层测试金字塔的 L1 + L2 + 离线单测；`backend/scripts/` 为一次性数据修复脚本
- `frontend/` — 前端工程根（`package.json`/`vite.config.ts`/`tsconfig.json`/`playwright.config.ts`/`index.html` 为契约文件组）
- `frontend/src/` — 终端外壳与视图；`frontend/vendor/` — vendored 图表引擎与只读模板；`frontend/tests/` — Playwright L3；`frontend/scripts/` — 手工诊断脚本
- `openspec/` — 规格与变更归档（131 个 capability spec），被 Codemap 扫描显式排除，仅作知识来源
- `agent_hub-main/` — vendored 上游 Bitget Agent Hub（MIT，只读）：元安装器 + 上游契约文档 + 门户清单/素材
- `.claude/`、`.opencode/`、`.github/workflows/` — Agent 命令/技能定义与 CI 门禁，属研发流程层
- `README.md` / `README.en.md` / `AGENTS.md` / `CLAUDE.md` / `LICENSE` / `.gitignore` / `pre-commit` — 仓库治理根文件组（`__root/__files`）

## 外部知识源整合说明

- 本知识库已扫描 `openspec/`（仓库根，131 个 spec）：相关条目已按「业务规则 / 接口契约 / 边界约束」摘抄进各模块文档并标注 `（来源: openspec/specs/<capability>/spec.md）`；全局架构与接口总览见 `_architecture.md` 的「系统架构约束」与「外部接口规范」两节。
- 仓库内置 Markdown（`README.md`、`AGENTS.md`、`agent_hub-main/docs/*.md`）已并入对应模块文档；`.claude/skills/code-index-builder/SKILL.md` 为知识库本体规程，归 `.claude/skills` 模块。
