---
type: "Module"
id: trade
title: "trade"
title_cn: "trade 仓库知识库全局索引"
description: "Trade-Agent（trade）仓库的知识库总入口：19 个模块的清单、kb_path 元数据与跨模块依赖关系。"
version: "2.0"
repo_name: trade
kb_root: .codemaker/codeindex
codemap: available
last_updated: 2026-09-28
total_modules: 19
---

# trade 知识库全局索引

> 检索优先级：`_concept_index.md`（业务关键词直查子文档）→ `_catalog.md`（模块导航）→ 本文件（模块清单与依赖）→ 模块 `_overview.md`。
> 符号级定位一律由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail` / `get_call_chain`），知识库不沉淀符号索引。

## 模块清单

| 模块ID | 名称 | 一句话描述 | kb_path | src_path |
|--------|------|-----------|---------|----------|
| `backend/src` | 行情数据与自动交易内核 | 唯一后端 Python 包：数据/分析/量化/风控执行/Agent/Web 门面合一 | `.codemaker/codeindex/backend/src` | `backend/src` |
| `backend/tests` | 全栈 E2E 测试门禁层 | L1 数据完整性、L2 真实进程 API+WS、离线不变式 | `.codemaker/codeindex/backend/tests` | `backend/tests` |
| `backend/scripts` | 行情缺口回填脚本 | 手工一次性回填类型 B 微缺口进 Parquet | `.codemaker/codeindex/backend/scripts` | `backend/scripts` |
| `backend/__files` | 后端根级配置契约 | 依赖锁定、环境变量面、lint/覆盖率门禁 | `.codemaker/codeindex/backend/__files` | `backend` |
| `frontend/src` | 交易终端前端 | TradingView 风格单图终端与数据接入 | `.codemaker/codeindex/frontend/src` | `frontend/src` |
| `frontend/vendor` | 第三方图表引擎仓库 | vendored klinecharts-pro + 只读外壳模板 | `.codemaker/codeindex/frontend/vendor` | `frontend/vendor` |
| `frontend/tests` | 浏览器端旅程测试 | Playwright L3 用户旅程，刻意不进 CI | `.codemaker/codeindex/frontend/tests` | `frontend/tests` |
| `frontend/scripts` | 实时K线乱序诊断脚本 | 手工端到端保序取证脚本 | `.codemaker/codeindex/frontend/scripts` | `frontend/scripts` |
| `frontend/__files` | 前端工程契约 | 构建/类型/lint 作用域、样式 token、入库边界 | `.codemaker/codeindex/frontend/__files` | `frontend` |
| `__root/__files` | 仓库治理根文件 | README/AGENTS/pre-commit/许可/忽略边界 | `.codemaker/codeindex/__root/__files` | `.` |
| `.github/workflows` | CI 质量门禁流水线 | 三个 job 的编排与阈值棘轮 | `.codemaker/codeindex/.github/workflows` | `.github/workflows` |
| `.claude/commands` | OpenSpec 命令入口 | Claude 宿主斜杠命令（冒号命名空间） | `.codemaker/codeindex/.claude/commands` | `.claude/commands` |
| `.claude/skills` | Agent 技能定义层 | 知识库构建/Codemap 检索/OpenSpec 流程技能 | `.codemaker/codeindex/.claude/skills` | `.claude/skills` |
| `.opencode/commands` | OpenCode 变更流程命令 | OpenCode 宿主 `/opsx-*` 命令 | `.codemaker/codeindex/.opencode/commands` | `.opencode/commands` |
| `.opencode/skills` | OpenSpec 规格变更工作流技能 | 六动作技能契约与禁忌边界 | `.codemaker/codeindex/.opencode/skills` | `.opencode/skills` |
| `agent_hub-main` | 上游门户元数据与门面 | vendored 上游包清单、发布边界、生态口径 | `.codemaker/codeindex/agent_hub-main/__files` | `agent_hub-main` |
| `agent_hub-main/docs` | 上游依赖契约文档 | Bitget Agent Hub 能力与凭证前置说明 | `.codemaker/codeindex/agent_hub-main/docs` | `agent_hub-main/docs` |
| `agent_hub-main/installer` | Agent 生态元安装器 | 受管包升级/回滚 + 技能宿主部署 | `.codemaker/codeindex/agent_hub-main/installer` | `agent_hub-main/installer` |
| `agent_hub-main/assets` | 上游门户品牌素材 | 品牌图与 npm 发布白名单边界 | `.codemaker/codeindex/agent_hub-main/assets` | `agent_hub-main/assets` |

## 架构位置速查

| 模块ID | 架构角色 | 世界模型提示 |
|--------|---------|-------------|
| `backend/src` | 后端运行时层（数据+分析+风控+Agent+编排合一） | 前端唯一上游；任何下单必须过 `ExecutionEngine → RiskEngine` |
| `backend/tests` | 质量门禁层（定义生产代码可接受行为） | 只产出 pass/fail/skip 与诊断明细，不得为变绿改 `backend/src` |
| `backend/scripts` | 运维/数据修复工具层（一次性 CLI） | 复用生产代码但禁止被生产代码反向 import |
| `backend/__files` | 构建与配置契约层 | Settings ↔ `.env.example` ↔ README 三处同集合，漏一处即违约 |
| `frontend/src` | 表现层（单图终端 + UI 状态所有权） | 不计算权威数值，只做投影与节流 |
| `frontend/vendor` | 依赖供给层（图表引擎 vendor 边界） | 运行时真身是已提交的 `dist/`，`tradingview-pro` 必须 pristine |
| `frontend/tests` | L3 测试层（浏览器旅程） | 只读断言层，依赖 `frontend/src` 的定位契约 |
| `frontend/scripts` | 端到端诊断工具层（bare script） | 纯观察者，禁止写数据或修补图表 |
| `frontend/__files` | 前端工程契约层 | 最易出「静默失效」：配置改了却不在生效路径上 |
| `__root/__files` | 仓库治理层（非运行时） | 不在 import 图内，却决定入库边界、门禁口径与许可 |
| `.github/workflows` | 工程基础设施层（CI 编排） | 不实现检查，只编排；被绕过即失去唯一合入关口 |
| `.claude/commands` / `.opencode/commands` | 研发流程层（命令入口） | 只写 `openspec/**`，禁止在规划命令里改实现代码 |
| `.claude/skills` / `.opencode/skills` | Agent 技能定义层（规程与护栏） | 决定代理按什么规程干活，不在运行时链路上 |
| `agent_hub-main` / `docs` / `assets` | vendored 上游元数据与门面（只读） | 口径一致性耦合，改动即与「不得 fork」契约冲突 |
| `agent_hub-main/installer` | 环境装配层（外部 CLI） | 改的是用户机器全局环境，不在本仓库调用链内 |

## 模块依赖关系

> `extracted` 表示有直接引用/配置证据；`inferred` 为 Agent 推断待复核。完整表见各模块 `_overview.md` 的「上下游关系」。

| 模块ID | 上游（依赖我的） | 下游（我依赖的） |
|--------|----------------|----------------|
| `backend/src` | `frontend/src`、`backend/tests`、`backend/scripts`、`frontend/tests` | parquet store、Bitget REST/WS、bitget-agent-mcp 子进程、AKShare/BlockBeats |
| `backend/tests` | `__root/__files`（命令口径）、`.github/workflows`、`frontend/tests` | `backend/src`（覆盖率 source=market_data）、`backend/scripts`（KNOWN_GAPS 清单） |
| `backend/scripts` | `backend/tests`（缺口注册表）、`__root/__files` | `backend/src`（`KlineIngestor` + `ParquetStore`） |
| `backend/__files` | 全部后端模块与 CI | `backend/src`、`backend/tests`、`backend/scripts` |
| `frontend/src` | `__root/__files`、`backend/src`（REST/WS 契约） | `frontend/vendor`、`frontend/tests`、`frontend/scripts` |
| `frontend/vendor` | `frontend/src`（唯一宿主）、`frontend/__files` | klinecharts（npm peer）、`frontend/tests`、`.github/workflows` |
| `frontend/tests` | `__root/__files`、`frontend/__files` | `frontend/src`（data-testid/只读句柄）、`backend/src` |
| `frontend/scripts` | `frontend/__files`（npm script） | `frontend/src`、`backend/src`（被观测方） |
| `frontend/__files` | `__root/__files`、`.github/workflows`、`frontend/tests` | `frontend/src`、`frontend/vendor`、`frontend/tests`、`frontend/scripts` |
| `__root/__files` | 全部模块（文件引用） | `.github/workflows`、`backend`、`frontend`、`openspec` |
| `.github/workflows` | `__root/__files`、`backend/tests`、`frontend/tests` | `backend/src`、`frontend/src`、`openspec/specs` |
| `.claude/commands` | `__root/__files`、openspec CLI | `.claude/skills`、`.opencode/commands`、仓库根约定 |
| `.claude/skills` | `.claude/commands`、`.opencode/skills` | `.codemaker/codeindex`、`agent_hub-main` |
| `.opencode/commands` | `__root/__files`、openspec CLI | `.opencode/skills`、`.claude/*` |
| `.opencode/skills` | `.opencode/commands`、`__root/__files` | `openspec/changes`、`openspec/specs`、`.claude/skills` |
| `agent_hub-main` | 外部 Bitget 上游仓库、`agent_hub-main/installer` | npm registry、`backend/src`（Node 版本口径）、`openspec` |
| `agent_hub-main/docs` | `backend/src`（MCP 消费方口径）、`openspec` | `backend/src/market_data`、`agent_hub-main/installer` |
| `agent_hub-main/installer` | 终端用户/AI 宿主、`agent_hub-main` 清单 | 全局 npm 包、各宿主 skills 目录、`agent_hub-main/docs` |
| `agent_hub-main/assets` | `agent_hub-main/README.md` | GitHub 仓库页/文档门户渲染（无 import 关系） |

## 使用指引

1. 先查 `_concept_index.md` 把需求关键词映射到 module_id 与子文档。
2. 读对应模块 `_overview.md` 的「子文档速览」，选定子文档。
3. 子文档中的「实现约束清单 / 跨模块依赖 / 典型调用链」是实现前的必读三节。
4. 需要精确符号、调用链、影响面时调用 Codemap MCP，不在知识库中翻找符号定义。
5. 跨层系统（行情链路、决策下单链路、量化研究链路）整体理解见 `_core_systems.md`；模块边界与禁忌见 `_architecture.md`。
