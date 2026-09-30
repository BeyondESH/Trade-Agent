---
type: "Fragment"
id: agent_hub-main/docs/getting-started
title: "上游接入前置与凭证契约"
description: "接入 Bitget Agent Hub 需要满足哪些前置条件、凭证从哪里取、没有凭证时还能做什么？"
parent: /agent_hub-main/docs/_overview.md
fragment: getting_started
entity_names:
  constants:
    - name: MIN_NODE_MAJOR
      source: agent_hub-main/docs/getting-started.md（前置条件）+ docs/architecture.md §7
      value: "20（Node 18 已 EOL；本仓库同名镜像常量在 backend/src/market_data/mcp_client.py）"
    - name: BITGET_API_KEY
      source: agent_hub-main/docs/getting-started.md（Set Environment Variables）
      value: "环境变量名 —— API Key"
    - name: BITGET_SECRET_KEY
      source: agent_hub-main/docs/getting-started.md（Set Environment Variables）
      value: "环境变量名 —— Secret Key（HMAC-SHA256 签名用）"
    - name: BITGET_PASSPHRASE
      source: agent_hub-main/docs/getting-started.md（Set Environment Variables）
      value: "环境变量名 —— Passphrase（private 操作三件套之一）"
    - name: MCP_SERVER_PACKAGE
      source: agent_hub-main/docs/getting-started.md（Verify Without Credentials）
      value: "@bitget-ai/bitget-agent-mcp（npx -y 免装启动）"
    - name: CLI_COMMAND
      source: agent_hub-main/docs/getting-started.md
      value: "bgc（@bitget-ai/bitget-agent-cli）"
retrieval_hints:
  - "跑通 MCP 行情通道需要装什么、什么版本？"
  - "Bitget 的三件套凭证怎么传给程序，能不能写进配置文件或 .env？"
  - "没有 API key 的情况下哪些能力仍然可用？"
  - "想在不碰真钱的前提下试下单，应该走哪条路径？"
  - "⚠️ 如果你找的是「本仓库自己的安装/启动步骤」（uvicorn、vite、pytest、playwright），不在这里——在仓库根 README.md 与 backend/tests 模块；本模块只讲外购 Bitget Agent Hub 的接入前置。"
  - "⚠️ 如果你找的是「前端本地开发环境 / Node 包管理器配置」，不在这里——在 frontend 相关模块。"
  - "本模块也叫『安装与配置指南』『凭证配置说明』『getting started』，对应需求中的「接入 Bitget 官方 AI Agent 工具」与「Demo 演练」。"
  - "架构归属：涉及上游凭证/运行时前提的新结论，只能补进本知识库文档或 openspec 规格，禁止在仓库内另建一份『上游接入说明』平行副本。"
architectural_role: "外部依赖接入契约文档，本仓库只读镜像"
---

## 业务意图（这份文档解决什么问题）

`getting-started.md` 解决"把外购交易能力接进来之前必须满足哪些硬前提"的问题：运行时下限（Node ≥ 20）、凭证的**唯一合法注入渠道**（三个环境变量）、免凭证可用范围（公共行情）、以及安全演练路径（Demo API Key + `--paper-trading`）。对本仓库而言它是 MCP 数据通道能否启动的准入清单——`backend/src/market_data/mcp_client.py` 在建立会话前先执行 `check_node_version()`，缺失/过低即抛 `McpError`，这正是本文档前置条件在代码中的落点。

## 对外接口（文档所约定的接入契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 本仓库入口符号 |
|------|------|---------|---------|---------|
| `npx -y @bitget-ai/bitget-agent-mcp` | 宿主 → MCP stdio server | 无需环境变量即可启动，仅暴露公共工具 | 公共行情免凭证通道；本仓库以此作为 `mcp_command` / `mcp_args` 默认值 | `config.py:Settings.mcp_command`、`Settings.mcp_args` |
| `bgc <verb> --action <action>` | 人/脚本 → Bitget | 例 `bgc market --action tickers --category SPOT --symbol BTCUSDT` | CLI 面用法；本仓库不依赖 `bgc`，仅作人工排障对照 | — |
| 环境变量三件套 | 运行环境 → 程序 | `BITGET_API_KEY` / `BITGET_SECRET_KEY` / `BITGET_PASSPHRASE` | **private（签名）操作要求三者齐全**，缺一即认证失败；支持行内一次性注入 | `mcp_client.py` 的 `env` 参数 |
| Demo / paper-trading 开关 | 调用方 → 上游 | `--paper-trading` + Demo API Key | 请求路由至 Bitget Demo Trading 环境，实盘前的前向验证手段 | 与 `architecture.md` §5 `paperTrading` 护栏同源 |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|------|---------|---------|------------|
| `openspec`（system-architecture、roadmap D8） | 把"凭据 MUST 仅从环境变量读取""默认纸面、实盘需显式开启 + 二次确认"固化为系统级 MUST | 安全基线 Requirements、D8 | extracted |
| `openspec/mcp-data-bridge` | 规定 MCP 桥 MUST 管理连接、超时与重连，Node 缺失时给出明确错误 | `McpDataClient`、`McpError` | extracted |
| 上游 SDK 安全模型 | 三件套凭证要求与 `paperTrading` 护栏由本文档与 `architecture.md` §5/§6 共同定义 | `safeInvoke`、`riskLevel` | inferred |
| `agent_hub-main/README.md` | 补充安全边界：工具**不解析 `.env`**（防泄漏） | — | extracted |

> 反向依赖（谁依据本子文档编码）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `backend/src/market_data` | 启动 MCP 会话前校验 Node ≥ 20，缺失即明确报错而非静默失败 | `check_node_version`、`MIN_NODE_MAJOR`、`McpError` |
| `backend/src/market_data` | 把凭证以环境变量形式传入 stdio 子进程（不落盘、不入库） | `StdioServerParameters(env=...)` |
| `backend/src/market_data` | 免凭证公共行情用于连通性自检与数据发现 | `discover.py` |
| `backend/tests` | L2 live 用例依赖 Node 环境与真实上游；`online` 标记门控外部网络 | `--run-live` / `--run-online`（见 AGENTS.md） |

## 典型调用链

### 1）MCP 通道启动前的准入校验
```
调用方 → backend/src/market_data/mcp_client.py:McpDataClient.start()
  → mcp_client.py:check_node_version(minimum_major=MIN_NODE_MAJOR)      ← 本模块（文档）约定的前置条件在此落地
    ├─ 未找到 node → McpError("Node.js >= 20 is required ... not found on PATH")
    └─ 版本过低   → McpError("Node.js >= 20 required, found vX; Please upgrade")
  → StdioServerParameters(command="npx", args=["-y","@bitget-ai/bitget-agent-mcp"], env=<三件套>)
    → stdio_client → ClientSession → 列出工具                            ← 跨进程：上游 MCP server
```

### 2）免凭证验证连通性
```
需求「不配 key 先确认行情能拿到」
  → 公共 market 面（tickers / candles）无需三件套
  → backend/src/market_data/discover.py 列出可用工具
  → 若改为下单 / 查账户：必须补齐 API_KEY + SECRET_KEY + PASSPHRASE，否则认证在鉴权阶段失败
```

## 实现约束清单

> 接入或排障上游 Agent Hub 前逐条核对。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `MIN_NODE_MAJOR` | `20` | 文档：`docs/getting-started.md`；代码镜像：`backend/src/market_data/mcp_client.py` | MCP 通道运行时下限 | Node 18 已 EOL（`architecture.md` §7）；上游 `package.json` `engines.node >= 20.0.0` |
| `BITGET_API_KEY` / `BITGET_SECRET_KEY` / `BITGET_PASSPHRASE` | 环境变量名 | `docs/getting-started.md` | private 操作三件套，**必须齐全** | 「private ops require all three credentials」（`architecture.md` §6）+ spec「凭据 MUST 仅从环境变量读取」 |
| API 权限档位 | Read Only / Trade / Withdraw | `docs/getting-started.md`（Create a new API key） | 按需最小授权；Withdraw 仅在确需提现工具时勾选 | 最小权限原则，与 `riskLevel` 门控呼应 |

### 必须遵守的接入约束

| 约束 | 说明 | 由来 |
|------|------|------|
| 凭证只走环境变量 | 行内一次性注入或进程 env，**不写 `.env`、不落配置文件、不进代码常量** | 上游工具不解析 `.env` 以防泄漏（来源: `agent_hub-main/README.md:290`，workspace anti_patterns 记为 `do_not`） |
| 默认纸面交易 | 未显式开启实盘时下单全部路由 Demo 环境；实盘需二次确认 | `openspec/specs/system-architecture/spec.md` 安全基线；roadmap D8 |
| Node 缺失不得静默 | 环境不满足须返回可识别错误（本仓库以 `McpError` 表达） | `openspec/specs/mcp-data-bridge/spec.md` |
| 先 Demo 后实盘 | Demo API Key + `--paper-trading` 排练，先纸面闭环跑通再考虑实盘 | `docs/getting-started.md` Tip + roadmap Migration Plan |
| 安全问题不公开提 issue | 邮件 `security@bitget.com` | `agent_hub-main/README.md:381`（anti_patterns `do_not`） |

### 设计决策（存在多种可行方案）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 凭证注入方式 | 环境变量（进程 env / 行内） | `.env` 文件 / 配置文件 / 代码常量 | 上游显式不解析 `.env`；spec 明文凭据仅环境变量，避免密钥进仓库与前端产物 |
| 接入面选择 | Python 以 stdio 子进程消费 `bitget-agent-mcp` | 调用 `bgc` 解析 stdout / 自建 TS 桥 | MCP 是结构化协议，工具名与返回信封稳定；解析 CLI 文本脆弱 |
| 无凭证能力边界 | 公共行情免凭证可用，私有账户/交易必须三件套 | 提供"占位凭证"骗过启动检查 | 占位凭证只会把失败推迟到首次私有调用，排障成本更高 |

### 变更风险（改这份文档 / 违反这些约束会破坏什么）

- **弱化"仅环境变量"** → 密钥被写入 `.env` 或前端可见配置：上游不解析 `.env` 会直接认证失败；更坏情况是密钥随仓库/构建产物泄漏，威胁真实资金账户。
- **降级 Node 前提**（如写成"Node 18 也行"）→ MCP 通道在 `check_node_version()` 处整体不可用，行情入库与实盘下单链路同时失效，并与 `package.json` 的 `engines` 及 spec 要求冲突。
- **漏记"private 需三件套齐全"** → 只配 KEY+SECRET 的部署在首次私有调用才暴露问题，故障从构建期转移到运行期。
- **把 Demo 说明降级为"可选演练"** → 侵蚀"默认纸面"安全基线，实盘误触达风险上升（spec 要求实盘显式开启 + 二次确认）。

## 对下游编码的业务指引（为何这些前置条件不只是“安装说明”）

- **前置条件是可执行契约，不是建议**：本仓库将 Node 下限以 `MIN_NODE_MAJOR=20` 写入代码并在建立会话前硬校验——因为行情入库、AI Agent 下单、MCP 工具发现共用同一通道，环境不足时“试试看”只会把故障延迟到子进程超时。改动本文档里的版本下限，等于改动 `check_node_version` 的业务语义，两者必须同步。
- **免凭证边界就是功能边界**：未配三件套时，只有公共 market 面可用。因此任何涉及账户、下单、持仓、划转的需求，验证前必须先确认凭证已注入；否则很容易把“没配凭证”当成“接口坏了”而误修上游适配代码。
- **环境变量的注入路径影响测试隔离**：凭证随 stdio 子进程 env 传递，不入仓、不入 parquet/temp 数据目录。L2 live 测试使用临时数据目录与独立 uvicorn 实例，若凭证换成 `.env` ，测试与开发环境会静默共享密钥，产生不可重现的泄漏风险与用例飘红色。
- **“默认纸面”不是开关而是约束**：即使本仓库提供了实盘开关，上游 `paperTrading` 护栏与 Demo 环境仍是 rehearsal 通道；新能力的验收顺序固定为“免凭证公共行情 → Demo 纸面闭环 → 实盘显式开启 + 二次确认”（见 roadmap Migration Plan）。绕过此顺序直接把新逻辑接到实盘，是本文档视为高危变更的核心原因。

## 排障判定（本文档能直接回答的四类现场问题）

- **行情/下单完全不通、且不报连接错误**：优先怀疑 Node 缺失或版本过低——准入阶段就失败了，请求根本未到达子进程。验证手段是确认 `node --version ≥ 20`，并看 `McpError` 文案是否为版本提示。
- **公共行情可用、私有工具全部失败**：几乎总是三件套不全（最常见是漏掉 `BITGET_PASSPHRASE`）。验证手段是用 `discover` 逐项列工具，再比对 `architecture.md` §6 的鉴权步骤；不要从 READ 侧改起。
- **预期存在的工具在列表里消失**：典型根因是模块未加载——默认仅 `account/trade/market`，`broker/instloan` 必须显式点名。参照 `agent_hub-main_docs_architecture.md` 的 `DEFAULT_MODULES` / `HIDDEN_MODULES` 判定，而不是新建一个“补工具”的适配层。
- **写入类操作首次返回“需确认”而非执行结果**：这是上游 `confirm` 自门控的正常行为，不是失败。正确做法是按 `{ confirmationRequired: true }` 语义显式重发；**禁止为了“跑通流程”而自行去掉确认环节**，那等于绕开实盘前的最后一道人工阀。

## 附：内置文档摘要

> 📄 本节内容来源于仓库内置文档：`agent_hub-main/docs/getting-started.md`（原文已提炼，非完整转录）

- 选型四条：连 Claude Desktop / Cursor / Copilot → `bitget-agent-mcp`；终端或脚本查询 → `bitget-agent-cli`(`bgc`)；让 Claude Code 自主调用 → `bitget-agent-skill`；自建 TS 集成 → `bitget-agent-sdk`。
- 前置：Node ≥ 20；Bitget API key（公共行情可免）。取 key 路径为 Settings → API Management，并按需勾选 Read Only / Trade / Withdraw。
- 免凭证自验：MCP server 可在无环境变量时启动并只暴露公共工具；CLI 拉公共行情（如 spot tickers）。
- 本文件与 `docs/architecture.md` 互为引接：getting-started 负责"能不能跑起来"，architecture 负责"跑起来后能调什么、有什么门控"。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/system-architecture/spec.md`、`openspec/specs/mcp-data-bridge/spec.md`、`openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md`（仅提炼约束与决策摘要，非完整规范）

- 集成形态 SHALL 为 npm 包 `@bitget-ai/bitget-agent-*`，**仓库内不得包含被 fork 的上游源码副本**——这界定了本目录（及整个 `agent_hub-main`）作为只读镜像的地位（来源: `openspec/specs/system-architecture/spec.md`）。
- 安全基线：系统 SHALL 默认运行于纸面交易，实盘 MUST 由用户显式开启并二次确认；凭据 MUST 仅从环境变量读取（来源: `openspec/specs/system-architecture/spec.md`）。
- MCP 桥 MUST 管理连接、超时与重连，并在 Node 环境缺失时给出明确错误；`bitget-agent-mcp` 子进程与 `bitget-signal` 均由 Python 官方 `mcp` SDK 以 stdio 方式拉起（来源: `openspec/specs/mcp-data-bridge/spec.md`、roadmap design D10）。
- 资金安全侧的取舍记录在 roadmap：默认 Demo、密钥轮换、凭据不入仓库（来源: `openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md` Risks 节）。
