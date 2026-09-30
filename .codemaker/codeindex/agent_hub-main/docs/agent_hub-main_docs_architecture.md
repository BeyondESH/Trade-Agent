---
type: "Fragment"
id: agent_hub-main/docs/architecture
title: "上游能力与安全契约（Agent Hub 架构说明）"
description: "Bitget Agent Hub 的目录规模、工具面投影方式、模块过滤与四道安全门分别是什么？"
parent: /agent_hub-main/docs/_overview.md
fragment: architecture
entity_names:
  constants:
    - name: CATALOG_SPEC_VERSION
      source: agent_hub-main/docs/architecture.md §2 / §9
      value: "3.0.0"
    - name: CATALOG_OPERATION_COUNT
      source: agent_hub-main/docs/architecture.md §2
      value: "109"
    - name: DEFAULT_MODULES
      source: agent_hub-main/docs/architecture.md §4
      value: "account, trade, market（合计 72 个操作，lean profile）"
    - name: HIDDEN_MODULES
      source: agent_hub-main/docs/architecture.md §4
      value: "broker, instloan（不在 to-C 面上，--modules all 也排除，必须显式点名）"
    - name: INTENT_VERB_COUNT
      source: agent_hub-main/docs/architecture.md §3.1
      value: "16 个 verb（lean profile 下实际暴露 14 个 to-C verb）"
    - name: MCP_TOOL_CAP
      source: agent_hub-main/docs/architecture.md §4
      value: "40（Cursor 对单个 MCP server 的工具上限，模块过滤的存在理由）"
    - name: RISK_LEVELS
      source: agent_hub-main/docs/architecture.md §5
      value: "read | write | high（源自 spec，同时映射为 MCP tool annotations）"
    - name: PAPER_TRADING_HOST
      source: agent_hub-main/docs/architecture.md §5 / §6
      value: "Bitget Demo Trading 环境（paperTrading=true 时改投 demo host）"
    - name: RESULT_ENVELOPE
      source: agent_hub-main/docs/architecture.md §5
      value: "safeInvoke → { ok: true, ... } | { ok: false, error: { type, ... } }，跨工具边界不抛异常"
retrieval_hints:
  - "本仓库能调用哪些 Bitget 交易操作？MCP 暴露的工具是怎么组织出来的？"
  - "intent surface 和 full surface 有什么区别，该选哪个？"
  - "为什么 MCP 只加载 account/trade/market 三个模块？broker 模块要怎么才能用？"
  - "写操作/高危操作的安全门控（readOnly、confirm、paperTrading、dryRun）分别拦什么？"
  - "⚠️ 如果你找的是「本仓库自己的行情入库/K 线补历史/回测引擎」，不在这里——在 backend/src 模块；本模块只描述外购的 Bitget Agent Hub 上游契约。"
  - "⚠️ 如果你找的是 AI Agent 决策循环 / LLM provider 抽象，不在这里——在 backend/src 的 agent 相关模块；本模块只到「工具面与门控」这一层。"
  - "本模块也常被称为『bitget-agent-hub 文档』『上游 SDK 说明』『agent hub 架构文档』，对应需求里的「接入 Bitget 官方 AI Agent 生态」。"
  - "架构归属：对上游能力（操作数、verb 列表、风险等级、门控行为）的任何新增认知，只能写进本知识库文档的解读，禁止在仓库内新建上游 catalog 的副本或补丁文件。"
architectural_role: "外部依赖契约文档，本仓库只读镜像"
---

## 业务意图（这份文档解决什么问题）

`architecture.md` 把"一个 109 操作的交易 API 如何在 AI 宿主有限的上下文/工具配额里被安全调用"这一难题的答案固化下来：它声明了**能力清单的唯一真相来源是 OpenAPI 规格**（不是手写工具），因此本仓库对"能调什么、调了会不会真花钱"的判断有了可对照的边界。对本仓库而言，它承担三个契约：① 工具面形状（intent verbs / full 1:1 / 常开的 `discover`+`raw`）决定了 backend 代码里能出现的工具名与 action 名；② 模块过滤规则决定了默认只加载 `account/trade/market`（72 操作），要碰 `broker/instloan` 必须显式点名；③ 安全模型（四道护栏 + 统一信封 + 永不抛异常）决定了执行层"把异常作为返回值处理"的编码风格。

## 对外接口（文档所约定的上游契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 本仓库入口符号 |
|------|------|---------|---------|---------|
| `intent` surface（默认） | 本仓库 → `bitget-agent-mcp` | verb 名（`market` / `order` / `position` / `strategy_order` / `account_overview` / `transfer_funds` / `deposit` / `withdraw` …）+ `action` | 16 个策划 verb 的 `fronts` 并集覆盖全部 catalog 操作，能力不因收敛工具面而丢失；`discover` 按**业务 domain** 分组导航 | `backend/src/market_data/mcp_client.py:McpDataClient` |
| `full` surface | 本仓库 → `bitget-agent-mcp` | `operationId` 1:1 工具 | 每个操作一个工具，受已加载 modules 约束；`readOnly` 下会整体剥离写工具 | —（本仓库未使用） |
| `discover`（常开） | Agent → MCP | domain → verbs → actions/参数契约 | 渐进披露：让 agent 在不常驻 109 个工具的前提下 Navigable；也用于运行时确认 verb/action 名 | `backend/src/market_data/discover.py` |
| `raw`（常开） | Agent → MCP | `operationId` + JSON `args` | 逃生通道，保证任何 catalog 操作都可达（`strategy` 模块操作即使 verb 未加载也可经 `raw` 调用） | —（直连 REST 承担等价角色） |
| MCP stdio 传输 | 进程边界 | command=`npx`，args=`-y @bitget-ai/bitget-agent-mcp` | 本仓库把上游当作 stdio 子进程拉起，不引入其 TS 源码 | `backend/src/market_data/config.py:Settings.mcp_command` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|------|---------|---------|------------|
| npm 包 `@bitget-ai/bitget-agent-sdk` / `-mcp` / `-signal` | 文档描述的运行时实体，本仓库经 stdio 间接依赖（不 import TS） | `CATALOG`、`safeInvoke` | inferred |
| `openspec` 架构决策 | 把"以依赖形式消费 `bitget-agent-hub`、不得 fork 修改其源码"、"默认纸面、实盘需显式开启 + 二次确认"升级为系统 MUST，约束本目录的只读地位 | `system-architecture` 各 Requirement | extracted |
| Bitget UTA v3 REST（`api.bitget.com/api/v3/...`） | 文档声明的实际后端；HMAC-SHA256 签名与限流发生在上游 SDK 内，本仓库直连时须自行满足同等要求 | `V3_HISTORY_CANDLES_URL` | extracted |

> 反向依赖（谁依据本子文档编码）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `backend/src/market_data` | 以 intent verb `market` + action `candlesHistory` 拉历史 K 线 | `MARKET_TOOL`、`CANDLES_ACTION` |
| `backend/src/market_data` | 下单经 MCP `order` verb 路由，并假定 `confirm` 门控在位（响应形状未固化 → 用候选键兜底取成交价） | `execution.py`（`McpError` 分支、fill price 提取） |
| `backend/src/market_data` | 公共行情免鉴权，但深历史绕开 MCP 直连 v3 `history-candles`（MCP 桥只给最近 90 天） | `ingestion.py` 注释与 `V2/V3` 常量 |
| `agent_hub-main/installer` | 安装/回滚上述包，版本线须与文档的 3.0.0 对齐 | `installer/cli.mjs` |

## 典型调用链

### 1）AI Agent 经 MCP 下单（文档约定的门控链）
```
本仓库执行层 → backend/src/market_data/execution.py:（路由到 MCP order verb）
  → McpDataClient.call_tool("order", action=...)          ← stdio 子进程边界
    → agent-mcp: catalog 解析 operationId + 确认 module 已加载   ← 本文档 §6 约定的第一步
      → JSON Schema 参数校验
      → readOnly / riskLevel 门（write 被剥离；high 首次返回 confirmationRequired）  ← 本文档 §5
      → 私钥三件套校验（private 操作要求 KEY+SECRET+PASSPHRASE 齐全）
      → REST client（令牌桶限流 → HMAC-SHA256 → HTTPS，paperTrading 时投 demo host）
        → safeInvoke 信封返回（永不抛异常）                ← 本文档 §5
```

### 2）K 线摄取：MCP 与直连的分叉（本仓库实际形态）
```
需求「拉 5m 历史」
  ├─ 近期（≤90 天）→ MCP `market` verb / `candlesHistory` action   ← 依赖本文档 §3.1 的工具面定义
  └─ 深历史（>90 天）→ 直连 api.bitget.com v3 `history-candles`（无鉴权、单次≤100 行、≤90 日历天）
       ← 决策依据：openspec roadmap D2「DL 量化与前端实时行情走直连 REST/WS，不经 MCP」
```

## 实现约束清单

> 实现涉及上游 Agent Hub 的能力/风控需求时，动笔前逐条核对。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `CATALOG_SPEC_VERSION` | `3.0.0` | `docs/architecture.md` §2/§9 | 目录由哪一版 OpenAPI 生成；SDK/CLI/MCP/Skill 共用同一版本线 | 与 UTA v3 API 对齐（§9） |
| `CATALOG_OPERATION_COUNT` | `109` | `docs/architecture.md` §2 | 89 可见（6 个 to-C 模块：account 39 / trade 17 / market 16 / strategy 5 / cryptoloans 11 / tax 1）+ 20 隐藏（broker 11 / instloan 9）；93 私签 + 16 公共；39 写 + 70 读 | 数字用于校验"是否已按新规格重新生成"，不得凭印象估 |
| `DEFAULT_MODULES` | `account, trade, market`（72 操作） | `docs/architecture.md` §4 | 未指定 `--modules` 时的 lean profile | Cursor 限制单 server ≤ 40 工具，每个工具描述还吃上下文 |
| `HIDDEN_MODULES` | `broker, instloan` | `docs/architecture.md` §4 | `--modules all` **也**排除这两个机构模块，须显式 `--modules broker,instloan` | 避免 to-C 面意外暴露机构能力 |
| `INTENT_VERB_COUNT` | `16`（lean 下 14 个 to-C verb） | `docs/architecture.md` §3.1 | verb 按 domain 归组，但按**主模块**门控 | `strategy_order` 挂在 `trade` 而非 `strategy`（见下方设计决策） |
| `RISK_LEVELS` | `read` / `write` / `high` | `docs/architecture.md` §5 | 源自 OpenAPI，同时映射为 MCP tool annotations 供宿主原生展示读写意图 | — |
| 四道护栏 | `readOnly` / `confirm` / `paperTrading` / `dryRun` | `docs/architecture.md` §5 | 相互独立、可叠加；`readOnly` 只剥 `full` 面的写工具，intent verb **保留**但写 action 在门控处自阻断 | 易被误读为"readOnly 会让 verb 消失"，故必须显式记录 |

### 设计决策（两种方案均可行，本仓库如何选）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 上游能力落地形态 | 以 npm 依赖 + stdio 子进程消费，**不 fork** | 在 `agent_hub-main/` 内改动 SDK/TS 源码 | 主语言 Python、DL 生态在 PyTorch；fork 会带来与规格脱节的版本漂移（`openspec/specs/system-architecture/spec.md`、roadmap design D1） |
| 包结构 | 单包 + 模块过滤 | 拆成多个小包 | 共享一套 REST client / signer / rate limiter 与一条版本线；多包会各自演化签名与限流（`architecture.md` §4） |
| 工具面 | 默认 `intent`（少量 verb + `discover`/`raw`） | `full`（109 个 1:1 工具） | 宿主工具有硬性配额（Cursor 40）；`raw` 保证"小工具面 + 全 API 可达"不矛盾 |
| `strategy_order` 门控模块 | 挂在 `trade` | 挂在 `strategy` | 只要开着交易，agent 就期望能下策略单；底层 `strategy` 操作仍可用 `raw` 触达（§3.1） |
| domain 与 module 两套轴 | `discover` 按业务 domain 分组，门控按主 module | 合并为一套轴 | domain 面向"人怎么想业务"，module 面向"配额怎么算"，二者刻意不重合（§3.1/§4） |
| 本仓库深历史通道 | 直连 v3 `history-candles` | 只用 MCP 桥 | MCP `history-candles` 桥仅覆盖最近 90 天，深历史必须绕开 MCP（`ingestion.py` 注释） |

### 变更风险（改这份文档会破坏什么）

- **把数字改小/改旧**（109、72、14、40 等）→ 下游据失真数字决定是否再加载模块、是否需要 `raw` 逃生通道，会出现"认为可达其实不可用"；这类偏差在 `discover` 实跑前无法被静态发现。
- **把 `riskLevel` / `confirm` 描述成本地可实现的行为** → 有人会在 Python 侧另写一套确认逻辑并自认为等价，结果绕过上游 `safeInvoke` 信封，出现抛异常穿透工具边界、或写操作未被门控直达实盘（真实资金后果）。
- **删掉 domain 与 module 两套轴的区分** → 后续改动会把 `strategy_order` 重新挂回 `strategy`，导致默认 profile 下交易 agent 拿不到策略单能力。
- **把 `raw`/`discover` 记成"可选工具"** → 它们与 surface 无关、常开；误记会让设计者以为小工具面必然损失能力，从而错误地扩到 `full` 面并撞宿主配额。

## 对下游编码的业务指引（为何这些契约必须被尊重）

- **工具体面不是实现细节，而是配额产物**：上游把 109 个操作收敛成 14～16 个 verb，是为了避开宿主工具数上限与上下文成本。因此本仓库新增行情/交易能力时，**默认应先问“能不能归入现有 verb 的 action”**，而不是直接扩 `full` 面或新增 MCP server——后者会满配额、抖掉其他 server 的入能力，表现为“工具突然不可见”类的难排查故障。
- **小工具体不等于能力损失**：`discover` + `raw` 常开，任何一个 catalog 操作都可达。因此“上游没这个工具”几乎总是推断错误，真实原因通常是**模块未加载**（broker/instloan）或 **action 名拼写错误**；正确排障路径是先跑 `discover.py` 看实时工具体，再决定是否需要 `--modules`，而不是先改文档/先写绕过层。
- **门控在上游、风控在本仓库，两层不可互替**：上游的 `readOnly`/`confirm` 只保证“单次工具调用不被静默执行”；而保证金比例、回撤熔断、kill switch 属于本仓库风控执行层（openspec D3/D8）。把安全完全寄托在上游门控上，会绕过风控层而直接违反“不得跨层访问 Bitget API绕过风控执行层”的系统约束。
- **错误信封决定异常处理风格**：既然上游约定“跨工具边界永不抛异常”，本仓库对 MCP 结果的判定应以 `ok` 字段为主、异常仅用于传输层（连接/超时/重连）。将业务失败当 Python 异常处理，会把可控失败变成崩溃；反之将传输失败当普通返回值，会掩盖断链。
- **文档只描述上游，不描述本仓库策略**：深历史绕开 MCP 直连 v3、前端行情走直连 WS，都是本仓库基于文档事实做出的选择（文档只说明“MCP 为 AI 工具调用优化”）。因此向上游文档里塞本仓库策略属于分类错误，应写到 `backend/src` 或 openspec 对应模块。

## 版本升级时的维护义务（改本知识库前的核对清单）

上游从 3.x 升版时，catalog 是“重新生成”而不是“手工追加”，因此以下数字会整体变：操作总数与读写比、可见/隐藏的模块划分、intent verb 清单与门控挂载模块、宿主工具上限下的余量。判定方法：先跑 `discover` 拿实时工具体，再比对本文档记录；不一致时**先改本知识库的“文档与实际不一致”注记**，再评估 `MARKET_TOOL`/`CANDLES_ACTION` 等下游硬编码是否仍有效；不得为了“看起来一致”而手改 `agent_hub-main/docs/*` 原文。

## 附：内置文档摘要

> 📄 本节内容来源于仓库内置文档：`agent_hub-main/docs/architecture.md`（Version 3.0.0 / Status Current，原文已提炼，非完整转录）

- 分层：1 个 foundation SDK（把 UTA v3 REST 包成带注解的类型化目录）+ 3 个 surface（CLI `bgc` / MCP stdio / skill markdown），外加独立的 `@bitget-ai/bitget-signal`（免 API key 的行情分析产品，不属于 UTA v3 交易面，**版本独立演进**）。
- 规格驱动：`openapi.yaml --(pnpm run gen)--> src/generated/catalog.ts` →（REST client / tool builder / mock server 同步再生）；因此**不存在**手写工具目录，也没有工具能描述 spec 未定义的操作。
- 技术栈：TypeScript 5.x + Node ≥ 20（原生 `fetch`/`crypto`/`parseArgs`；Node 18 已 EOL）+ ESM-only + **SDK 零运行时依赖** + `@modelcontextprotocol/sdk` + 产物目录 `lib/`。
- 测试：SDK 内置 mock server（`@bitget-ai/bitget-agent-sdk/testing`，确定性的 ticker/instrument/balance），使各 surface 与跨仓库 e2e 可离线跑通全部操作。
- 版本管理：语义化版本；`@bitget-ai/bitget-signal` 不随 UTA v3 升级；操作增删只能来自"换新 spec 重新生成 catalog"，逐仓库记录在 CHANGELOG。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/system-architecture/spec.md`、`openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md`、`openspec/specs/mcp-data-bridge/spec.md`（仅提炼约束与决策摘要，非完整规范）

- `agent_hub-main` 本身只是**元安装器 + 文档**，真正能力在 npm 包：`bitget-agent-sdk`（109 操作、HMAC 签名、限流、mock server）、`bitget-agent-mcp`（stdio MCP server）、`bitget-signal`（5 个免 key 行情分析 skill）（来源: `openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md`）。
- 分层架构 SHALL 为：数据层 / 分析层（指标+结构）/ 风控执行层 / AI Agent 层 / DL 量化层 / 自动化编排层 / 前端层；跨层只能通过公开接口，**不得跨层直连 Bitget API 绕过风控执行层**（来源: `openspec/specs/system-architecture/spec.md`）。
- 两条通道：DL 量化（5m 低延迟）与前端实时行情走 **Bitget 直连 REST/WS**，AI Agent（日线、低频）走 **`bitget-agent-mcp` 工具调用**——理由正是本文档 §3 所述：MCP 为 AI 工具调用优化（intent verbs + 渐进披露），而量化要毫秒~秒级与 WS 推送（来源: `openspec/.../ai-trading-system-roadmap/design.md` D2）。
- MCP 数据桥 MUST 管理连接、超时与重连，并在 **Node 环境缺失时给出明确错误而非静默失败**；Python 用官方 `mcp` SDK 以 stdio 子进程拉起（来源: `openspec/specs/mcp-data-bridge/spec.md`）。
- 工具层与 LLM 层解耦：切换 `LLMProvider`（Anthropic / OpenAI / OpenAI 兼容 / 本地 Ollama）MUST NOT 改变 MCP 工具调用逻辑（来源: `openspec/specs/system-architecture/spec.md`）。
