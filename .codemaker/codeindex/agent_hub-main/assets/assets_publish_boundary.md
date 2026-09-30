---
type: "Fragment"
id: agent_hub-main/assets/publish_boundary
title: "上游门户品牌素材 / 发布与上游同步边界"
description: "这个 logo 为什么不随 npm 包发布、改了它会破坏哪些约定、上游门户素材到底该由谁维护？"
parent: /agent_hub-main/assets/_overview.md
fragment: publish_boundary
architectural_role: "上游门户素材的发布边界与不 fork 约束记录点，禁止在本仓库内修改上游文件"
entity_names:
  constants:
    - name: "npm 发布白名单 files（不含 assets/）"
      source: agent_hub-main/package.json
      value: "[installer/cli.mjs, CHANGELOG.md, README.md, LICENSE, VERSION]"
    - name: "npm bin 入口"
      source: agent_hub-main/package.json
      value: "bitget-agent-installer → ./installer/cli.mjs"
    - name: "包版本 / 仓库版本"
      source: agent_hub-main/package.json, agent_hub-main/VERSION
      value: "3.0.0"
    - name: "上游仓库地址"
      source: agent_hub-main/package.json
      value: "git+https://github.com/Bitget-AI/agent_hub.git"
    - name: "portal 仓库托管范围"
      source: agent_hub-main/CHANGELOG.md
      value: "docs, assets, cross-repo e2e test, installer source(installer/cli.mjs)"
    - name: "Node 运行时下限"
      source: agent_hub-main/package.json
      value: ">=20.0.0"
retrieval_hints:
  - "为什么 npm 包里找不到 logo.png / assets 目录"
  - "能不能在本项目里直接改 agent_hub-main 下的文件来适配我们的需求"
  - "上游 Agent Hub 仓库同步后我的改动会不会被覆盖"
  - "本子模块也叫 portal 仓库素材 / 发布白名单边界 / vendored 上游资源，对应需求中的「生态素材托管」"
  - "⚠️ 如果你要找的是本系统自己的前端静态资源（favicon、K 线图例、字体 woff2），不在这里，在 frontend/src 与 frontend/dist 模块；本模块只属于上游门户仓库"
  - "新增任何随包分发的文件必须同时改 agent_hub-main/package.json 的 files 白名单，仅把文件丢进目录不会被发布"
---

## 业务意图

本子模块回答的是两个容易被混淆的问题：**这张图到底属于“执行面”还是“展示面”？谁应该为它负责？** `agent_hub-main` 在生态中的角色是「元安装器 + 文档」的**门户仓库**，用户真正执行的只有 `installer/cli.mjs`；品牌素材、文档、跨仓库 e2e 测试都留在门户仓库而不进 npm 包（来源: agent_hub-main/CHANGELOG.md）。这个切分的业务意义是：**安装包只携带“用户机器上需要跑的东西”**，展示类资产不进入用户磁盘、也不影响包的供应链可验证性（上游 1.1.0 曾在发布产物上引入 provenance 证实机制，现已不在当前 `publishConfig` 中，说明该机制本身也是发布级决策，来源: agent_hub-main/CHANGELOG.md）。

由此推出本系统（trade）应遵守的行为准则：本仓库内 `agent_hub-main/` 是上游门户的**只读快照**，不是可自由扩充的项目目录。用户问“为什么包里没有那张图”“能不能直接改它适配我们”时，答案都是同一个——**素材归属上游门户，本系统只消费 npm 包，不 fork、不改造**；需要变更就走上游仓库的发布流程。

## 变更风险（改动它会破坏什么）

本模块的变更风险不在运行时报错，而在**依赖边界与发布语义被静默破坏**，且两条都有滞后性：

1. **本地改动 = 事实上的 fork。** 只要在本仓库修改 `agent_hub-main/**`（哪怕是“把 `assets/` 加进 `files` 白名单”这种看似无害的补全），本仓库就不再是“以依赖形式引入”，而与 openspec 锁定的契约相抵触（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/specs/system-architecture/spec.md）。后果不会当场暴露：测试全绿、安装照常，直到下次从上游同步时才变成冲突或覆盖，而此时没人能分辨哪些改动是有意的。
2. **发布白名单是跨下游的公共契约。** `files` 一变，所有下游包使用者的 tarball 内容与体积同步改变，且这种变更必须走上游的语义化版本 + CHANGELOG 流程（上游已因 `cli.mjs` 路径迁移、包名从 `bitget-hub` 改名等发布级变更付出过兼容代价，来源: agent_hub-main/CHANGELOG.md）。把它当成“顺手修一下”的本地编辑，等于绕过了整套发布纪律。

实践结论：本目录的变更应当**只在上游仓库发生**；在本仓库看到关于这幅图的“修复需求”，正确处理是“输出上游 issue/PR 建议”，而不是提交本地补丁。

## 对外接口

> 本子模块无协议 / RPC / 事件；对外生效的契约是 **npm 分发白名单**与**上游仓库归属**两项声明式约定。

| 契约项 | 方向 | 关键值 | 业务说明 | 入口位置 |
|--------|------|--------|---------|---------|
| `files` 白名单 | 包 → 用户 | 5 项，**不含 `assets/`** | 决定哪些文件随 npm tarball 分发；assets 因此只存在于 GitHub 仓库 | `agent_hub-main/package.json` |
| `bin.bitget-agent-installer` | 用户 → 包 | `./installer/cli.mjs` | 唯一可执行入口，也不读取 assets | `agent_hub-main/package.json` |
| 上游仓库归属 | 本项目 → 上游 | `Bitget-AI/agent_hub` | 本仓库内 `agent_hub-main/` 是上游门户快照，修改它即 fork | `agent_hub-main/package.json:repository` |

## 跨模块依赖

> 实现本子模块功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `agent_hub-main`（file-group，含 `package.json`） | `files` 白名单决定 assets 是否随包分发；本模块的可见性完全由它决定 | `files`、`repository`、`bin` | extracted |
| `agent_hub-main/installer` | 同属上游门户，是唯一有真实代码的子目录；确认它**不**读取 assets，可排除"删素材导致安装器报错"的猜测 | `installer/cli.mjs` | extracted |
| 无（本系统侧） | `backend/src`、`frontend/src`、CI（`.github/workflows/ci.yml`）均不引用本模块 | — | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| 上游 `Bitget-AI/agent_hub` 门户仓库 | 门户侧渲染 README、托管文档与素材；真正的维护方 | `CHANGELOG.md` 1.1.0 "portal repo continues to host docs, assets, ..." |
| npm registry 发布流程 | `files` 白名单裁剪 tarball，assets 被排除在分发物之外 | `package.json.files` |

## 典型调用链

### 发布链路（assets 在何处被"过滤"）
```
维护者执行 npm publish（@bitget-ai/bitget-agent-installer）
  → npm 读取 agent_hub-main/package.json:files 白名单          ← 本子模块边界
    → 只打包 installer/cli.mjs / CHANGELOG.md / README.md / LICENSE / VERSION
      → assets/logo.png 不进入 tarball
        → 包页渲染 README 时相对路径 assets/logo.png 无对应文件  ← 已知边界（非 Bug 单可修）
```

```
本系统侧消费（openspec 锁定的方式）
  → npx @bitget-ai/bitget-agent-installer ...（或 Python 以 stdio 调 bitget-agent-mcp）
    → 仅使用上游 npm 包，不复制、不修改 agent_hub-main 源码            ← 本模块禁止改动
```

## 实现约束清单

> 实现与本模块相关需求（改素材 / 加素材 / 排查包内容）时，Agent 必须在动笔前逐条核对。

### 必须遵守的边界（禁止项）

| 约束 | 说明 | 约束由来 / 后果 |
|------|------|----------------|
| 禁止在本地修改 `agent_hub-main/**` 任何文件 | 本仓库对上游门户仓库是**只读消费**关系 | openspec 契约："以依赖形式引入、仓库内不包含被 fork 的其源码副本"（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/specs/system-architecture/spec.md）。后果：上游同步时产生冲突或静默覆盖，且本系统被视为已 fork |
| 禁止"顺手补全" `files` 白名单把 `assets/` 加进去 | 这是改变上游发布契约的行为，会影响所有下游包使用者 | 后果：包体积与分发内容变更属发布级决策，须在上游仓库走版本发布流程（CHANGELOG + 语义化版本） |
| 禁止把本系统素材寄存在 `agent_hub-main/assets/` | 该目录既不被本系统构建读取，也不随上游 npm 发布 | 后果：素材静默失效——无报错、无测试失败，只是永远不会被任何人取到 |
| 禁止以"修 README 破图"为由改写上游 README 链接 | 症状在 registry 端，根因在上游发版策略 | 后果：越界改动 + 下次上游同步冲突（真实修法在上游仓库：走 CDN 绝对地址或调整 files 白名单） |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 素材托管位置 | 上游 portal 仓库 `agent_hub-main/assets/` | 随 npm 包发布 / 放到 CDN | 门户仓库托管 docs + assets 是上游既定事实（CHANGELOG 1.1.0 明确保留），改它属发布级变更，不在本系统职责内 |
| 本系统消费方式 | npm 包依赖（不复制源码） | 复制 `agent_hub-main/` 内容进本系统再改 | openspec 明确禁 fork；复制会立刻产生"两份事实源 + 安全签名类改动无法回灌上游"的问题 |
| 素材新增的可见性检查 | 先确认引用方已存在（README 已引用）或同步加引用 | 直接把文件丢进目录 | 该目录无构建管线、无 glob 扫描，未被引用的文件不会出现在任何页面；看不到即为不可验证 |

### 存档字段索引（不可裁减）

> 本模块无持久化数据；唯一"发布索引"是 `files` 白名单，变动必须完整核对：

| 字段名 | 值 | 说明 |
|-------|----|------|
| `files[0]` | `installer/cli.mjs` | 唯一可执行入口（bin 指向它），改路径会同时破坏 `bin` |
| `files[1..4]` | `CHANGELOG.md` / `README.md` / `LICENSE` / `VERSION` | 元数据与法律文件；`README.md` 在包内是 npm 包页正文来源 |
| （缺省项） | `assets/` **不在列表** | 本模块不随包分发；任何"包里为什么没有图"的问题答案均在此 |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/`（`proposal.md` / `design.md` / `specs/system-architecture/spec.md`，仅提炼与上游素材/依赖边界相关的约束，非完整规范）

- **不 fork 上游**：系统 SHALL 以依赖形式消费 `bitget-agent-hub`（`bitget-agent-sdk` / `bitget-agent-mcp` / `bitget-signal`），**不得 fork 修改其源码**；集成 Bitget 交易/行情能力时通过 npm 包 `@bitget-ai/bitget-agent-*` 引入，**仓库内不包含被 fork 的其源码副本**。（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/specs/system-architecture/spec.md）
- **上游定位**：`agent_hub-main` 本身只是**元安装器 + 文档**，真正能力在 npm 包中；本项目在其之上构建 AI 自动交易与量化系统。（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md）
- **决策 D1（Python 主语言，消费而非改造）**：`bitget-agent-*` 为 TS/Node，以依赖形式消费而非改造——推及本模块：`agent_hub-main/assets/` 内的素材同样只读，改品牌图/加素材应回到上游仓库。（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/design.md）
- **跨层调用禁令（旁证）**：任一架构层需要另一层能力时，只能通过该层公开接口调用，不得绕过——对应本模块即"素材只通过 README 的路径引用被消费，不得被代码以其他方式硬编码路径"。（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/specs/system-architecture/spec.md）

> 未在本模块目录内发现任何 `.md` 内置文档（Step 0a-md 扫描结果：`agent_hub-main/assets/` 仅含 `logo.png`），故本模块无「附：内置文档摘要」节。
