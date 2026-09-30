---
type: "Module"
id: agent_hub-main/docs
title: "上游依赖契约文档"
description: "以只读文档形式固化 Bitget Agent Hub（SDK/MCP/CLI/Skill）的上游能力契约，供本仓库 Python 侧消费方对照编码。"
module_id: agent_hub-main/docs
architectural_role: "文档层（上游依赖契约，本仓库只读）"
world_model_hints:
  - "属于外购依赖说明层，不是运行时代码，不参与 import 图"
  - "agent_hub-main 整体是 vendored 上游产物（元安装器 + 文档），真正的能力在 npm 包"
  - "本仓库 backend 以 stdio 子进程方式消费 @bitget-ai/bitget-agent-mcp，文档即其唯一离线契约说明"
upstream_modules:
  - module: backend/src
    note: "market_data 的 MCP 桥接（McpDataClient / ingestion / execution）按本文档描述的工具名、verb、riskLevel 编码"
    confidence: inferred
  - module: openspec
    note: "roadmap/system-architecture 决策（不 fork、以依赖形式消费）决定了本目录的只读定位"
    confidence: extracted
downstream_modules:
  - module: backend/src/market_data
    note: "文档描述的上游契约（Node≥20、intent surface、safeInvoke 信封、paper-trading 门控）是本模块编码前提，文档失真即契约漂移"
    confidence: inferred
  - module: agent_hub-main/installer
    note: "安装器负责的包版本线（3.0.0）与本目录文档记录的版本必须一致"
    confidence: inferred
---

## Files

### 源代码路径

- `agent_hub-main/docs/`（本模块目录，仅含 Markdown 文档，无代码）
- 同级散落文件（已并入本模块知识库）：`agent_hub-main/docs/architecture.md`、`agent_hub-main/docs/getting-started.md`

### 知识库文档

- `.codemaker/codeindex/agent_hub-main/docs/_overview.md`（本文件）
- `.codemaker/codeindex/agent_hub-main/docs/agent_hub-main_docs_architecture.md`
- `.codemaker/codeindex/agent_hub-main/docs/agent_hub-main_docs_getting_started.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code`）。本模块内无可执行符号，Codemap 仅索引到 Markdown 文件本身。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `agent_hub-main_docs_architecture.md` | Bitget Agent Hub 分层架构、由 OpenAPI 生成的 109 操作目录、intent/full 工具面、模块过滤与安全门控（四道护栏 + safeInvoke 信封） | `CATALOG_SPEC_VERSION`(3.0.0)、`CATALOG_OPERATION_COUNT`(109)、`DEFAULT_MODULES`、`HIDDEN_MODULES`、`riskLevel` |
| `agent_hub-main_docs_getting_started.md` | 接入前置条件与凭证契约：Node ≥ 20、三件套环境变量、公共行情免凭证、Demo/paper-trading 演练路径、禁止 .env 解析 | `BITGET_API_KEY`、`BITGET_SECRET_KEY`、`BITGET_PASSPHRASE`、`MIN_NODE_MAJOR`(20) |

## 模块概述

1. **业务定位**：本模块解决"本仓库赖以运行的外部交易/行情能力到底长什么样、有哪些硬性契约"的问题——它是 Bitget Agent Hub（SDK / CLI / MCP / Skill 四个面 + 独立的 signal 产品）**在本仓库内唯一的离线契约说明书**，让下游不必读上游 TS 源码就能知道可调用的 verb、操作数量、风险门控与运行前置条件。
2. **业务上游**：没有代码调用它。触发方是"人 / AI Agent 的查阅行为"——当 backend 需要新增或修改 MCP 工具调用（下单、拉 K 线、账户查询）、当 installer 升级版本号、当 openspec 需要确认对 `bitget-agent-hub` 的依赖边界时，均以本目录文档为对照基准（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md）。
3. **业务下游**：改动（尤其是"本地修订"）它会直接影响本仓库对上游能力的全部假设：MCP 工具名/参数契约、Node 版本下限、凭证注入方式、readOnly/confirm/paperTrading/dryRun 四道安全门的存在位置。文档与实际 npm 包一旦漂移，下游代码会按不存在的 verb 或错误的风险等级编码，表现为运行时 `McpError`、写操作未被门控、或实盘资金被误触发。

## 架构简析

**分层结构（文档记录的契约层次，单行）：**
上游规格 `openapi.yaml` → 生成目录 `agent-sdk:catalog.ts(CATALOG)` → 工具面 `intent verbs / full 1:1 / discover + raw` → 本仓库消费方 `backend/src/market_data/mcp_client.py:McpDataClient` → Bitget `api.bitget.com /api/v3`

本模块自身采用"两份互补文档"结构：`architecture.md`（Version 3.0.0 / Status Current）是**能力与安全契约**（怎么生成的、有多少操作、有哪些门控），`getting-started.md` 是**接入前置契约**（装什么、给什么凭证、免凭证能做什么）。二者共同构成下游唯一可信的上游视图；`agent_hub-main/README.md` 与 `llms.txt`（属 `agent_hub-main/__files` 文件组）只是本目录结论的对外摘要。

关键数据流（文档描述的请求生命周期）：AI 发起 tool call（verb+action 或 raw+operationId）→ 在 CATALOG 解析操作并确认其 module 已加载 → 按 JSON Schema 校验参数 → 过 `readOnly`/`risk` 门与 `confirm` 自门控 → 私钥三件套齐全才允许 private 操作 → REST 客户端（令牌桶限流 → 构造 `/api/v3/...` → HMAC-SHA256 签名 → HTTPS，paperTrading 时改投 Demo 主机 → 解析响应并映射 Bitget 业务码）→ 统一以 `safeInvoke` 信封返回，跨工具边界**永不抛异常**。

## 上下游关系

> `extracted` = 静态分析可信；`inferred` = Agent 推断待复核

| 方向 | 对端 | 关系 | confidence |
|------|------|------|------------|
| 上游 | `openspec/`（system-architecture、roadmap design） | 规定本目录"只读、不得 fork"的地位，并把 Node≥20、默认纸面、凭证仅环境变量升级为系统级 MUST | extracted |
| 上游 | `agent_hub-main/package.json` / `VERSION`（3.0.0） | 本目录记录的版本线来源；换版本需同步重写文档要点 | inferred |
| 下游 | `backend/src/market_data/mcp_client.py` | 以 stdio 子进程拉起 `@bitget-ai/bitget-agent-mcp`，按文档记录的 surface 与信封契约编码（`MIN_NODE_MAJOR=20`、超时 60s、失败重连一次） | extracted |
| 下游 | `backend/src/market_data/ingestion.py` | 硬编码 intent 面工具/动作名 `MARKET_TOOL="market"`、`CANDLES_ACTION="candlesHistory"`，二者存在性由本文档保证 | extracted |
| 下游 | `backend/src/market_data/execution.py` | 下单经 MCP `order` verb 路由，依赖文档中的 `confirm` 门控作为最后一道人工确认；响应形状未固化，代码用候选键兜底 | extracted |
| 平级 | `agent_hub-main/installer` | 安装/回滚上述 npm 包，版本必须与本文档 3.0.0 线一致 | inferred |

## 本模块的边界约束（一览）

- ✅ **可做**：在本仓库知识库中摘抄、改写、补充对这两份文档的解读；把它们与 openspec 决策做交叉引用。
- ❌ **禁止**：修改 `agent_hub-main/**` 下任何文件（含本目录），或在仓库内 fork 一份上游源码副本 —— 违反 `openspec/specs/system-architecture/spec.md` 的"以依赖形式消费、不得 fork 修改其源码"要求。
- ❌ **禁止**：为"方便本地跑通"而在文档中把凭证写入 `.env`、配置文件或代码常量；上游明确不解析 `.env`（来源: `agent_hub-main/README.md:290`，被 workspace 的 anti_patterns 记为 `do_not`）。
- ⚠️ 本目录是**上游产物镜像**：若发现文档与实际 npm 行为不符，以上游 npm 包为权威，并在本知识库以"文档与实际不一致"的注记形式记录，不回改上游文本。
