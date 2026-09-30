---
type: "Module"
id: agent_hub-main/installer
title: "Agent 生态元安装器"
description: "以 npm/pnpm 全局包为唯一真源，为 Bitget Agent Hub 的三个受管包做安装、升级、回滚，并把技能部署到 Claude Code / Codex / OpenClaw。"
module_id: agent_hub-main/installer
architectural_role: "环境装配层（外部 CLI 工具，不在本仓库运行时调用链内）"
world_model_hints:
  - "属于 vendored 上游产物（agent_hub-main 目录），零依赖单文件 CLI，由 npx 在用户机器上执行，不被本仓库任何代码 import"
  - "它是「环境/装配」层而非「业务」层：改变的是用户全局 node_modules 与各 AI 宿主的 skills 目录，不改变本仓库运行时代码"
  - "上游是终端用户/终端 AI 的一句 npx 命令，下游是 npm registry + 全局包目录 + 各宿主技能目录"
upstream_modules:
  - module: "(外部) 终端用户 / 终端 AI（Claude Code、Codex、OpenClaw）"
    note: "执行 `npx @bitget-ai/bitget-agent-installer upgrade-all --target all` 触发（来源: agent_hub-main/README.md:68）"
    confidence: extracted
  - module: agent_hub-main
    note: "package.json 的 `bin` 把 `bitget-agent-installer` 映射到本模块 cli.mjs，`files` 决定发布面，`engines` 决定 Node 下限"
    confidence: extracted
downstream_modules:
  - module: "(外部) npm 全局包 @bitget-ai/bitget-agent-cli / bitget-agent-skill / bitget-signal"
    note: "被本模块 uninstall -g / install -g pkg@version 直接改写"
    confidence: extracted
  - module: "(外部) 各包的 scripts/install.js"
    note: "deploySkills 以 `node <globalRoot>/<pkg>/scripts/install.js --target <list>` 约定式调用，路径与参数是硬契约"
    confidence: extracted
  - module: agent_hub-main/docs
    note: "docs 记录的上游能力契约（版本线 3.0.0、Node≥20）是本模块受管集合与版本口径的依据"
    confidence: inferred
retrieval_hints:
  - "Bitget Agent Hub 在用户机器上到底装了哪几个包、怎么一键装齐并升级到最新？"
  - "终端 AI（Claude Code / Codex / OpenClaw）里的 Bitget 技能是怎么被装进去的？"
  - "某个 Bitget agent 包升级坏了，怎么回滚、受管集合为什么不含 mcp 和 sdk？"
  - "⚠️ 如果你找的是本仓库后端的行情入库 / 回测 / 下单执行，不在这里——在 `backend/src`；本模块只装环境，不跑交易逻辑。"
  - "⚠️ 如果你找的是上游能力契约（可用 verb、风险等级、凭证要求）的文档说明，不在这里——在 `agent_hub-main/docs`。"
  - "本模块也叫『bitget-agent-installer』『元安装器』『meta-installer』『agent hub 安装脚本』，对应需求里的『一键装好 Bitget AI Agent 交易工具』。"
---

## Files

### 源代码路径

- `agent_hub-main/installer/`（本模块目录）
- 同级散落代码文件（已并入本模块知识库）：`agent_hub-main/installer/cli.mjs`（全模块唯一源文件，约 600 行，零运行时依赖）

### 知识库文档

- `.codemaker/codeindex/agent_hub-main/installer/_overview.md`（本文件）
- `.codemaker/codeindex/agent_hub-main/installer/agent_hub-main_installer_cli_commands.md`
- `.codemaker/codeindex/agent_hub-main/installer/agent_hub-main_installer_skill_deploy.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）。Codemap 索引到本模块 24 个符号（4 个顶层常量 + 20 个函数），无需在文档中列举。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `agent_hub-main_installer_cli_commands.md` | 命令入口与参数解析、npm/pnpm 自动探测、版本查询（latest / history / 已装版本）、`upgrade-all` / `upgrade` / `rollback` 的「先卸后装 + 版本口径」语义与退出码约定 | `TARGET_PACKAGES`（3 个包）、`SKILL_PACKAGES`（前 2 个）、`CLI_VERSION`(3.0.0，取自 `../package.json`)、`MIN_NODE_MAJOR`(20)、回滚版本列表展示上限(20) |
| `agent_hub-main_installer_skill_deploy.md` | 技能向 AI 宿主的部署：`--target` 解析、三包中只有两包含技能、各包 `scripts/install.js` 调用契约、`install` 子命令与交互菜单的行为差异 | `DEPLOY_TARGETS`(claude/codex/openclaw → `~/.<x>/skills`)、`DEFAULT_TARGET`(claude)、`TARGET_ALL_KEYWORD`(all)、`SKILL_INSTALL_SCRIPT_RELATIVE`(scripts/install.js)、`MENU_UPGRADE_ALL_TARGET`(["claude"] 硬编码) |

## 模块概述

1. **业务定位**：本模块解决「Bitget Agent Hub 生态在用户机器上到底装了什么、是不是同一版本线、技能有没有真的接进 AI 宿主」这一装配问题——它是一个零依赖的元安装器（meta-installer），把 `bitget-agent-cli`（交易 CLI）、`bitget-agent-skill`（交易推理技能）、`bitget-signal`（免凭证行情技能）三件套统一到 `@latest`，再把含技能的包一键部署进 Claude Code / Codex / OpenClaw，并提供可回滚到任一已发布版本的逃生门（来源: `agent_hub-main/README.md`「Installer · What It Manages」）。
2. **业务上游**：没有本仓库代码调用它。触发方式是终端（或终端 AI）直接执行 `npx @bitget-ai/bitget-agent-installer <command>`——README 把 `upgrade-all --target all` 写成"让终端 AI 一键装好交易工具"的标准前缀指令（来源: agent_hub-main/README.md:68）；`--target` 缺省时只装 CLI/技能包而不部署，只有显式给 target 才触发技能部署。
3. **业务下游**：改动它会直接改变用户机器的全局 npm 状态与各宿主的 `skills/` 目录内容，进而影响本仓库 backend 赖以运行的 MCP/skill 环境：受管包集合写错会让 `upgrade-all` 装错包（例如误把设计上不归它管的 `bitget-agent-mcp` 纳入全局安装），`install.js --target` 约定变了会让技能静默不生效——用户表现为"AI 里看不到 Bitget 工具"，而本仓库代码路径不会报任何错。

## 架构简析

**分层结构（单行）：**
CLI 入口 `installer/cli.mjs:main`（命令分发）→ 领域层 `cmdUpgradeAll / cmdUpgrade / cmdRollback / cmdInstall`（版本决策）→ 执行层 `exec / execCapture`（`spawn shell:false` 调 npm|pnpm）→ 装配层 `deploySkills`（调各包 `scripts/install.js`）→ 外部真源（npm registry、全局包根、`~/.<host>/skills`）

模块是"一个文件、四个职责块"的扁平脚本：`Constants`（受管集合与 target 表）→ `Arg Parsing + PM Detection + Shell Helpers`（环境与解析）→ `Registry / Global Queries`（只读查询：`list -g --json`、`view version`、`view versions --json`、`root -g`）→ `Commands + interactive Menu`（写操作编排）。**读查询与写执行被刻意分成 `execCapture`（捕获、可解析 JSON）与 `exec`（继承 stdio、受 `--dry-run` 门控）两个原语**：因此 `--dry-run` 只抑制写操作，所有版本/路径查询照样真实访问 registry。

关键数据流（升级一次）：`main` → `detectPM` → `parseTargets` → `cmdUpgradeAll` → `getInstalledVersions`(`pm list -g --depth=0 --json`) → 逐包 `getLatestVersion`(`pm view pkg version`) → 版本不同则 `pm uninstall -g pkg` + `pm install -g pkg@latest` → 全绿且给了 target 才 `deploySkills` → `getGlobalRoot`(`pm root -g`) → `node <root>/<pkg>/scripts/install.js --target claude,codex`。

生命周期/状态：本模块无持久化状态，"状态"完全外置在 npm 全局目录；每次运行都是"查询→比对→改写→重部署"的幂等尝试（已是最新则跳过，见 `Already at latest (…) — skipping`）。

## 上下游关系

> `extracted` = 静态分析可信；`inferred` = Agent 推断待复核

| 方向 | 对端 | 关系 | confidence |
|------|------|------|------------|
| 上游 | 终端用户 / 终端 AI（Claude Code、Codex、OpenClaw） | 唯一的调用入口：一句 npx 命令或交互菜单选择；非 TTY 且无参数时只打印 HELP 退出 | extracted |
| 上游 | `agent_hub-main/package.json` | `bin` 注册可执行名、`files` 只发布 `installer/cli.mjs`、`engines.node >= 20.0.0`、`version` 即 `CLI_VERSION` | extracted |
| 上游 | `openspec/specs/system-architecture/spec.md` | 规定本仓库"以依赖形式消费 bitget-agent-hub、不得 fork 修改其源码"，从而把本模块定位成"只维护上游包的安装/版本"，禁止为跑通而改包内逻辑 | extracted |
| 平级 | `agent_hub-main/docs`（architecture.md / getting-started.md） | 上游能力与前置契约（版本线 3.0.0、Node≥20、MCP 走宿主按需 npx 拉起）是本模块受管集合与版本口径的依据 | inferred |
| 下游 | 全局包 `@bitget-ai/bitget-agent-cli` / `bitget-agent-skill` / `bitget-signal` | 被 `uninstall -g` + `install -g pkg@<ver>` 直接改写；`upgrade-all` 靠 `@latest` 无 pin 地整体拉到 3.0.0 UTA v3 线（来源: agent_hub-main/CHANGELOG.md 3.0.0 节） | extracted |
| 下游 | 各包的 `scripts/install.js` | 由 `deploySkills` 以固定路径+固定参数调用，负责把 markdown 技能写进 `~/.claude/skills` 等目录 | extracted |
| 下游（间接） | `backend/src/market_data/mcp_client.py` | backend 自己用 `npx @bitget-ai/bitget-agent-mcp`（`MD_MCP_COMMAND`/`MD_MCP_ARGS`，见根 README.md:168）拉起 MCP，**不经本模块**；但技能没部署好会让 AI 侧看不到 Bitget 工具面 | inferred |

## 本模块的边界约束（一览）

- ✅ **可做**：调整受管包集合、target 白名单、命令与 flag 的解析、版本比对与提示文案；`--dry-run` 行为扩展（新增写操作必须同时受 dryRun 门控）。
- ❌ **禁止**：把 `@bitget-ai/bitget-agent-mcp` 或 `@bitget-ai/bitget-agent-sdk` 加进 `TARGET_PACKAGES` —— MCP 由宿主按需 `npx` 拉起、没有全局安装可升级/回滚，SDK 是库依赖（来源: `agent_hub-main/CHANGELOG.md`「Unchanged — Managed package set」段）。
- ❌ **禁止**：修改 `agent_hub-main/**` 下任何源文件以"适配本地环境"，或在仓库内维护上游包源码副本/补丁 —— 违反 `openspec/specs/system-architecture/spec.md` 的"以依赖形式消费、不得 fork 修改其源码；仓库内不包含被 fork 的源码副本"（来源: openspec/specs/system-architecture/spec.md）；本目录是上游镜像，能力问题一律回到 npm 包解决。
- ❌ **禁止**：给受管包 pin 具体版本号或引入 lock 逻辑（设计要点是"永不 pin，统一 @latest"，见 `getLatestVersion` 与 CHANGELOG"no flag changes"）；也**禁止**在 cli.mjs 中新增 npm 依赖——`files` 只发布这一个 `.mjs`，加依赖会让 npx 路径直接崩。
- ⚠️ **口径**：包名必须写全 `@bitget-ai/` scope（README 示例用简称，但 `validatePkg`/`parseTargets` 以常量表为准），版本号解析依赖 `pm view` 输出的原样字符串（仅剥外层引号）。
- ⚠️ **定位提醒**：本模块不做交易、不下单、不读写仓库内任何文件，副作用全在用户机器（全局 node_modules + `~/.claude|~/.codex|~/.openclaw/skills`）；默认纸面交易、凭证仅从环境变量读取等安全基线由 openspec 规定，属于上游包与 backend 的职责，**禁止**在本模块新增任何写凭证/写 `.env` 的步骤（来源: openspec/specs/system-architecture/spec.md）。
