---
type: "Fragment"
id: agent_hub-main/__files/release
title: "版本线与发布许可"
description: "为什么安装器从 1.1.0 直接跳到 3.0.0？哪些包在同一版本线上、哪些刻意不同步，改名与升级历史会破坏什么？"
parent: /agent_hub-main/__files/_overview.md
fragment: release
architectural_role: "时间线与法务边界层（版本决策沿革 + MIT 许可，回答『这个版本号意味着什么』）"
entity_names:
  constants:
    - name: VERSION_LINE
      value: "3.0.0（2026-06-22 发布）"
      source: agent_hub-main/CHANGELOG.md + VERSION + package.json
    - name: PREV_VERSION
      value: "1.1.0（2026-05-29）"
      source: agent_hub-main/CHANGELOG.md
    - name: RENAMED_FROM
      value: "包名与二进制名均为 bitget-hub → bitget-agent-installer（仓库 Bitget-AI/agent_hub 未变）"
      source: agent_hub-main/CHANGELOG.md（1.1.0 Changed）
    - name: UTA3_FAMILY
      value: "sdk / cli / mcp / skill 同期均为 3.0.0（版本线对齐的目标）"
      source: agent_hub-main/CHANGELOG.md（3.0.0 段）
    - name: MANAGED_PACKAGES
      value: '@bitget-ai/bitget-agent-skill、@bitget-ai/bitget-signal、@bitget-ai/bitget-agent-cli（1.1.0 起由 bitget-skill/bitget-signal/bitget-client 改名而来）'
      source: agent_hub-main/CHANGELOG.md（TARGET_PACKAGES diff）
    - name: UNMANAGED_PACKAGES
      value: "agent-mcp（由 MCP 宿主按需 npx 拉起，无全局安装可升/可滚）+ agent-sdk（库依赖，无需单独安装）"
      source: agent_hub-main/CHANGELOG.md（3.0.0 Unchanged）、README.md（Installer 注记）
    - name: NODE_MIN_HISTORY
      value: "18 → 20（1.1.0 起；理由：Node 18 于 2025-04 EOL）"
      source: agent_hub-main/CHANGELOG.md（1.1.0 Changed）
    - name: CHANGELOG_FORMAT
      value: "Keep a Changelog 1.1.0 + Semantic Versioning"
      source: agent_hub-main/CHANGELOG.md（前言）
    - name: LICENSE_TYPE
      value: "MIT（Copyright (c) 2025 Bitget；可商用、无需署名，需保留版权与许可声明）"
      source: agent_hub-main/LICENSE
retrieval_hints:
  - "Bitget Agent Hub 这个包的版本线是怎么定的，3.0.0 代表什么？"
  - "安装器和它管理的包为什么必须同号？bitget-signal 为什么可以不同号？"
  - "旧名字 bitget-hub 还能用吗？升级/回滚命令要怎么写？"
  - "⚠️ 如果你要找『升级/回滚在代码里究竟怎么实现（先卸后装、退出码、交互菜单）』，不在这里——在 `agent_hub-main/installer`；这里只有决策史与理由。"
  - "⚠️ 如果你要找本仓库自身的发布/版本策略（版本号、CI 门禁、changelog），不在这里——本仓库根在 `__root/__files`；`agent_hub-main` 是 vendored 上游，不参与本仓库发版。"
  - "本文件组也叫「changelog / 发布史 / 许可与版本线」，对应需求里的『升级影响评估』『回滚可行性』『能否商用/二次分发』。"
  - "架构归属句：新的版本决策与破坏性变更说明**必须追加到 `CHANGELOG.md` 顶部并保持 Keep a Changelog 段落结构**，不得只改 README 措辞或只改 package.json 号数。"
---

## 业务意图

`agent_hub-main` 是多个 npm 包组成的生态，用户真正会问的是「我该信哪个版本号、升级会不会把交易栈搞坏」。`CHANGELOG.md` 与 `LICENSE` 解决的是**信任与责任**问题：前者回答「这一版和上游家族是什么对应关系、哪些东西刻意没变」，后者回答「我可以拿它做什么、必须保留什么」。

对本仓库（Python 侧以依赖形式消费上游）来说，这组文件的业务价值有三点：① 版本线口径决定了「我们的 MCP 客户端应该对着哪个工具面编码」；② 「哪些包纳入统一版本线、哪些不纳入」直接决定回滚与升级的破坏半径；③ MIT 许可 + openspec「不得 fork」双重约束，界定我们既能自由商用与二次分发，又不得改上游源码。当同事问“上游升级了我们要不要跟进”时，本模块给出的不是操作手册，而是“这一版到底承诺了什么不变”的判定依据。

本仓库对本文的另一类需求也存在：当后端行为与上游 verb 集对不上时，开发者需要先确认“我们到底声称在用哪个版本”——`CHANGELOG.md` 是这里唯一回答问题的地方（它记录了“同版本线”的定义及其理由）。（来源: agent_hub-main/CHANGELOG.md 3.0.0 段）

## 对外接口（本子文档无协议，接口 = 版本与许可承诺）

| 承诺 | 内容 | 消费方 |
|------|------|--------|
| 版本线一致性 | 安装器与 `sdk/cli/mcp/skill` 共享 `3.0.0`，消除「哪个版本配哪个版本」的猜测 | 使用者、CI、本仓库后端适配层 |
| 升级行为 | `upgrade-all` 以 `@latest` 解析每个受管包，因此**无需改任何 flag** 即可把 v2 装替换为 UTA v3 的 3.0.0（旧版本先卸后装，就地替换） | 使用者 |
| 回滚能力 | `rollback <pkg> --to <published-version>` 可切到任意已发布版本；前提是 registry 上历史版本未下架 | 使用者、故障处置 |
| 命令稳定性 | 3.0.0 明确「All commands and flags unchanged；installer 的 JS 未动，只动了版本与文档」 | 封装脚本（wrapper）作者 |
| 许可 | MIT：可商用、可修改、可再分发；须保留版权与许可声明；无担保 | 法务、二次分发方 |

## 实现约束清单

### 必须定义的版本/口径常量

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `VERSION_LINE` | `3.0.0` | `VERSION` / `package.json` / `CHANGELOG.md` | 三处必须同值；运行时真源是 `package.json`（见 `__files_manifest.md`） | 家族版本线对齐（CHANGELOG 3.0.0） |
| `UTAV3_FAMILY` | `sdk / cli / mcp / skill = 3.0.0` | `CHANGELOG.md` | 判断「某包是否属于同一版本线」的依据；不属于则不得要求同号 | UTA v3 API 换代 |
| `SIGNAL_INDEPENDENCE` | `bitget-signal 不参与 UTA v3 升级，保留自身版本号` | `CHANGELOG.md` | 它无 API key、无账号访问，因此与交易栈解耦；安装器仍与交易栈一起部署它 | CHANGELOG 明写 "unchanged" |
| `MCP_NOT_MANAGED` | `agent-mcp 不在受管集合内` | `CHANGELOG.md`、`README.md` | 它由 MCP 宿主按需 `npx` 拉起，**没有全局安装可升级/回滚**；误把它加进受管集合会让 `upgrade-all` 去卸装一个本不该全局存在的包 | CHANGELOG「not managed here by design」 |
| `CHANGELOG` 条目结构 | `Added / Changed / Unchanged` | `CHANGELOG.md` | `Unchanged` 段是本仓库判断「哪些行为可以假设不变」的显式契约，不得删除 | Keep a Changelog + SemVer（文件前言） |
| 安全漏洞上报路径 | `security@bitget.com`（禁止公开发帖） | `agent_hub-main/README.md（Contributing）` + `workspace.json anti_patterns: do_not` | 版本发布流程的固定要求 | README L381 |

### 破坏性变更史（改这些会再破一次）

| 变更 | 版本 | 破坏半径 |
|------|------|---------|
| 包名/二进制改名 `bitget-hub` → `bitget-agent-installer` | 1.1.0 | 所有 wrapper 脚本里的 `npx bitget-hub …` 全部失效；**仓库地址 `Bitget-AI/agent_hub` 未变**，只有 npm 名变了，容易改错对象 |
| `TARGET_PACKAGES` 换代（`bitget-skill/bitget-signal/bitget-client` → `bitget-agent-skill/bitget-signal/bitget-agent-cli`） | 1.1.0 | 旧名包不再维护；仍按旧名安装会得到僵尸包（见 `agent_hub-main/installer` 的受管集合） |
| Node 下限 `18 → 20` | 1.1.0 | 与后端 `mcp_client.py:MIN_NODE_MAJOR = 20` 同口径；再降下限会让上游包拒绝启动而后端检查通不过 |
| 脚本搬入 `installer/` 子目录（monorepo split） | 1.1.0 | 曾使 `cli.mjs` 读 `./package.json` 失败，`--version` 及所有子命令抛 `Cannot find module`；现修正为 `../package.json`。**同类路径重构必须同时改 package.json 的 `bin`+`files`** |
| e2e 报告输出路径改写（不再写 `scripts/mcp-smoke-report.*.json`） | 1.1.0 | 跨仓库冒烟测试依赖 cwd 约定；且该测试需要 `@bitget-ai/bitget-agent-mcp@3.0.0` 已发布才能全绿（当前快照内 `e2e/` 目录缺失，见 `__files_manifest.md` 漂移表） |
| `publishConfig.provenance: true` 声明 | 1.1.0 | 供应链 attestation 承诺；**当前 package.json 中该字段缺失**，属已记录的漂移，不可据此认为已启用 |

### 边界（能做 / 禁止）

- ✅ 允许：因 MIT 许可而商用、修改、二次分发；本仓库「以依赖形式消费 `bitget-agent-hub`」正建立在此之上。（来源: agent_hub-main/LICENSE）
- ❌ 禁止：在本仓库内 fork 并修改上游源码——openspec 以 MUST/不得 的表述明确禁止这一行为（来源: openspec/specs/system-architecture/spec.md）。因此即便 MIT 法律上允许，项目级契约也不允许。
- ❌ 禁止改动 `LICENSE` 文本或版权行（`Copyright (c) 2025 Bitget`）：MIT 要求在再分发副本中保留版权与许可声明，删改即违约。
- ❌ 禁止只改 `package.json.version` 而不追加 `CHANGELOG.md` 条目（反之亦然），也禁止跨线号数（如把安装器单独升到 3.1.0 而家族仍是 3.0.0），除非同时说明「脱离家族版本线」的理由——版本对齐是该文件存在的全部意义。（来源: agent_hub-main/CHANGELOG.md 3.0.0 段）
- ✅ 允许：在本仓库知识库中记录漂移与决策（本文件即此用途），不改上游。

## 为何版本线比代码更值得先读

安装器自己几乎没有逻辑可变（CHANGELOG 3.0.0 明写 “The installer is unchanged JS; only the version and docs moved”），所以它的真实风险不在代码，而在**版本号所携带的语义约定被误读**。一旦有工具或人把“安装器 3.0.0”当成“安装器代码经了一次大重写”，就会去重新验证已全部确认的行为；反过来，若把家族号对齐误当成“家族内所有包都可单独升版”，就会去推动 `bitget-signal` 或 `agent-mcp` 跟号，而这两个恰恰是**刻意不同步**的（一个无 key 独立演进，一个根本不被安装器管）。本组文件的存在价值就是把这三句话沉淀下来，避免下一位修改者在“看上去合理”的方向上动刀。（来源: agent_hub-main/CHANGELOG.md 3.0.0 段）

## 变更风险（改版本线与许可会破坏什么）

- **单独抬安装器版本号**：会直接破坏“版本线对齐”这个 3.0.0 立项的唯一理由，使使用方重新回到“哪个版本配哪个集合”的猜测；同时也让 CHANGELOG 中“same version line”表述失效。
- **把 `bitget-signal` 或 `agent-mcp` 拉进统一号数**：与 CHANGELOG 明写的“独立/不受管”相冲突，会误导使用方去 `rollback` 一个根本不被安装器安装的包。
- **删 `Unchanged` 段**：它不仅是变更日志，而是向后兼容的**显式契约**（“命令与 flag 未变”）；删后使用方无法判断升级是否需改 wrapper。
- **改 LICENSE**：并不改变上游已授予的许可，只会让本快照与上游不一致（失真）并破坏再分发时的署名义务，属高风险零收益变更。
- **在 CHANGELOG 里记本仓库自己的改动**：本文件只描述上游包；在此记录本地适配会混淆责任边界，后续同步上游时会被整块擦掉。（参 `openspec` 不得 fork 的口径：来源: openspec/specs/system-architecture/spec.md）

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `agent_hub-main/installer` | CHANGELOG 描述的 `TARGET_PACKAGES`、命令集、`--version` 路径修复都在此实现 | `TARGET_PACKAGES`、`CLI_VERSION` | extracted |
| `agent_hub-main/__files`（`__files_manifest.md`） | 版本三处真源关系（`package.json` / `VERSION` / `CHANGELOG`）与 provenance 漂移记录在清单子文档 | `PACKAGE_VERSION`、`PUBLISH_CONFIG` | extracted |
| `agent_hub-main/docs` | `CATALOG_SPEC_VERSION`(3.0.0) 与本版本线同期，是「文档描述的能力属于哪一代 API」的锚点 | `CATALOG_SPEC_VERSION` | inferred |
| `openspec` | 「不得 fork」与「AI Agent 通道走 bitget-agent-mcp」两条项目级约束 | `system-architecture` 规格 | extracted |

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `backend/src` | 判断上游 MCP 服务端版本线，决定是否可用某 verb / 是否需二次确认门控 | `mcp_client.py:check_node_version` |
| 使用者 / CI（仓库外） | 升级与回滚决策、供应链验证（provenance）预期 | — |

## 典型调用链（一条版本声明如何变成用户可执行动作）

```
CHANGELOG.md 决策「安装器与 UTA v3 家族同号 = 3.0.0」        ← 本模块（决策记录）
  → package.json.version + VERSION 同步为 3.0.0              ← 跨模块：agent_hub-main/__files/manifest
    → installer/cli.mjs 读 ../package.json 得到 CLI_VERSION    ← 跨模块：agent_hub-main/installer
      → upgrade-all 以 @latest 解析三个受管包并先卸后装         ← 跨模块：agent_hub-main/installer
        → 用户得到与本仓库 docs/architecture.md 所述一致的上游面 ← 跨模块：agent_hub-main/docs
```

---

> 📄 本节内容来源于仓库内置文档：`agent_hub-main/CHANGELOG.md`、`agent_hub-main/LICENSE`（原文已提炼，非完整转录）
> 📋 涉及 OpenSpec 的条目来源于：`openspec/specs/system-architecture/spec.md`（不得 fork 上游源码的约束方）
