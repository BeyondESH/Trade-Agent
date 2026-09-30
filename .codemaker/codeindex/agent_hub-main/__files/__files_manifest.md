---
type: "Fragment"
id: agent_hub-main/__files/manifest
title: "包清单与发布边界"
description: "这个 npm 包对外发布哪些文件、叫什么命令、要求什么 Node 版本，清单与文档之间有哪些已知不一致？"
parent: /agent_hub-main/__files/_overview.md
fragment: manifest
architectural_role: "机器可读的包契约层（npm 发布边界与运行环境下限的唯一真源）"
entity_names:
  constants:
    - name: PACKAGE_NAME
      value: "@bitget-ai/bitget-agent-installer"
      source: agent_hub-main/package.json（name）
    - name: PACKAGE_VERSION
      value: "3.0.0（package.json 与 VERSION 文件同值）"
      source: agent_hub-main/package.json（version）+ agent_hub-main/VERSION
    - name: BIN_NAME
      value: "bitget-agent-installer → ./installer/cli.mjs"
      source: agent_hub-main/package.json（bin）
    - name: PUBLISH_FILES
      value: '["installer/cli.mjs","CHANGELOG.md","README.md","LICENSE","VERSION"]（不含 docs/、assets/、llms.txt、e2e/）'
      source: agent_hub-main/package.json（files）
    - name: ENGINE_NODE_MIN
      value: ">=20.0.0（与 backend/src/market_data/mcp_client.py:MIN_NODE_MAJOR = 20 同口径）"
      source: agent_hub-main/package.json（engines.node）
    - name: PACKAGE_MANAGER
      value: "pnpm@8.14.1（本仓库其他包用 npm，此处是上游口径）"
      source: agent_hub-main/package.json（packageManager）
    - name: LOCKFILE_VERSION
      value: "6.0（pnpm 8 系列锁格式）"
      source: agent_hub-main/pnpm-lock.yaml:1
    - name: DEV_DEP_MCP_SDK
      value: "^1.26.0 → 锁定解析为 1.29.0(zod@4.4.3)；运行时零依赖"
      source: agent_hub-main/package.json（devDependencies）+ agent_hub-main/pnpm-lock.yaml
    - name: PUBLISH_CONFIG
      value: "access=public, registry=https://registry.npmjs.org/"
      source: agent_hub-main/package.json（publishConfig）
    - name: E2E_SCRIPT
      value: "node e2e/mcp-smoke-test.mjs（目标文件在本快照中不存在）"
      source: agent_hub-main/package.json（scripts.e2e）
retrieval_hints:
  - "这个上游包会发布哪几个文件到 npm？为什么 docs 和 assets 不在包里？"
  - "安装器的命令名、版本号、Node 最低版本分别定义在哪个文件？"
  - "为什么 agent_hub-main 下有独立的 .gitignore 和 pnpm-lock，它们管不管本仓库？"
  - "⚠️ 如果你要找安装器实际怎么解析参数、怎么调 npm/pnpm 装包，不在这里——在 `agent_hub-main/installer`；这里只定义「这个包的静态契约」。"
  - "⚠️ 如果你要找本仓库前端/后端的 package.json、biome、CI 门禁，不在这里——在 `frontend`、`backend`、`.github/workflows` 模块；本模块的清单属于 vendored 上游包，与本仓库构建链路无关。"
  - "本文件组也叫「agent_hub 根清单」「upstream manifest」「包元数据」，对应需求中的「环境要求」「依赖边界」「发布产物范围」。"
  - "架构归属句：新增/调整任何上游包的发布范围、bin 名称、引擎下限的结论，一律记录在本子文档的「实现约束清单」，不要在 installer 或 docs 子文档重复定义。"
---

## 业务意图

本组文件解决的不是「这个包怎么实现」，而是「这个包对世界承诺什么」：它叫什么、装到哪个命令上、能带上哪些文件、必须跑在什么环境上、依赖被钉在哪个版本。对本仓库而言，它是判断「我们的 Python 适配层是不是在按一个真实存在的上游版本编码」的核对基准——清单和门面文件一旦失真，下游会照错误的版本/环境去装包并在线上是失败的。

`installer/cli.mjs` 全仓库唯一读取的配置文件就是本组的 `package.json`（`createRequire(import.meta.url)("../package.json")`），所以本文件束同时是安装器的**运行时数据源**，不只是仓库元信息。1.1.0 版本曾经因为安装器脚本被移入 `installer/` 子目录而让这条相对路径失效，导致 `--version`/`--help`/所有子命令全部抛 `Cannot find module './package.json'`——这就是「清单文件被当运行时资源读取」的真实事故史。（来源: agent_hub-main/CHANGELOG.md）

`pnpm-lock.yaml` 存在容易让人误读：它只锁了一个 devDependency（`@modelcontextprotocol/sdk`，仅用于跨仓冒烟测试），而安装器本体是**零运行时依赖**的单文件脚本——CHANGELOG 对此的说法是 "Lightweight — a single dependency-free script run with npx"。因此“看了 lock 有多少依赖”得不出“用户装完要拉多少东西”的结论：lock 里的传递依赖不进入安装面。这条区分对本仓库有意义，因为 `node_modules` 体积、CI 缓存策略都是基于错误推论做出来的。

## 对外接口（本组无协议，接口 = npm 包契约）

| 契约面 | 面向谁 | 关键字段 | 业务说明 |
|--------|--------|---------|---------|
| npm 全局安装面 | 安装器 / 终端用户 | `name`、`version`、`bin` | `npx @bitget-ai/bitget-agent-installer` 解析到 `installer/cli.mjs`；改名会导致所有 wrapper 脚本与文档失效（1.1.0 已发生过一次：`bitget-hub` → `bitget-agent-installer`） |
| tarball 内容 | 使用者（区分「仓库里有」与「装完还有」） | `files` | 白名单只有 5 项：`installer/cli.mjs`、`CHANGELOG.md`、`README.md`、`LICENSE`、`VERSION`。`docs/`、`assets/logo.png`、`llms.txt`、`pnpm-lock.yaml` **不随包分发**，只在 GitHub 可见 |
| 运行环境门 | 用户机器、CI | `engines.node`、`type`、`packageManager` | Node ≥20 是硬门；`type: "module"` 与 `packageManager: pnpm@8.14.1` 决定脚本解析方式和锁格式（与仓库根 `__root/__files` 的 npm 口径不同，属上游独立约定） |
| 发布通道 | 维护者 | `publishConfig.access/registry` | public scope 直发 `registry.npmjs.org`；`.npmrc`（含 token）必须不入库 |

## 实现约束清单

> 改动本组文件或据其编码前，逐条核对以下项。

### 必须保持一致的常量/字段

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `version` | `3.0.0` | `package.json` | **运行时真源**：`cli.mjs` 的 `CLI_VERSION` 从这里取，`--version` 输出它 | fix: 1.1.0 曾因路径错读崩掉 `--version`（CHANGELOG） |
| `VERSION` 文件 | `3.0.0` | `VERSION` | 纯文本镜像，供人与发布脚本读取；单独改它**没有任何运行时效果**，只会造成清单/文件不一致 | 版本线对齐决策（CHANGELOG 3.0.0） |
| `engines.node` | `>=20.0.0` | `package.json` | 与 `backend/src/market_data/mcp_client.py:MIN_NODE_MAJOR = 20`、`docs/getting-started.md`「Node.js ≥ 20」三处同口径 | Node 18 于 2025-04 EOL（CHANGELOG 1.1.0） |
| `name` | `@bitget-ai/bitget-agent-installer` | `package.json` | 安装器 `TARGET_PACKAGES` / README / llms.txt 中的命令串全部按此名拼接 | 1.1.0 由 `bitget-hub` 改名，旧名不再维护 |
| `bin` 目标路径 | `./installer/cli.mjs` | `package.json` | 与 `files` 首项必须同路径；移动脚本必须同时改这两处（1.1.0 的 monorepo split 即为此踩坑） | 反例：CHANGELOG 记录的 `--version` 崩溃 |
| `packageManager` ↔ `lockfileVersion` | `pnpm@8.14.1` ↔ `'6.0'` | `package.json` / `pnpm-lock.yaml` | 升级 pnpm 主版本会把锁重写成 9.0 格式并产生数千行 diff | — |

### 已存在的「文档 ↔ 清单」漂移（不要当作自己的改动引入）

| # | 漂移 | 证据 | 影响 |
|---|------|------|------|
| 1 | CHANGELOG 1.1.0 声称「发布产物带 provenance 证明（`publishConfig.provenance: true`）」，但当前 `package.json` 的 `publishConfig` **只有 `access` 与 `registry`**，无 `provenance` | grep `provenance`：仅命中 `CHANGELOG.md` | 供应链验证声明在清单上无凭据；若上游真的开了 provenance，说明本 vendored 快照的清单滞后 |
| 2 | `scripts.e2e` 指向 `e2e/mcp-smoke-test.mjs`，本快照中**没有 `e2e/` 目录** | `ls agent_hub-main/e2e` 不存在 | 在本目录里执行 `npm run e2e` 必然失败；跨仓冒烟测试的实际执行不在本仓库，勿把它当本仓库门禁 |
| 3 | `files` 白名单不含 `llms.txt`，但 `llms.txt` 自称是 LLM 摄取入口 | `PUBLISH_FILES` 5 项 | LLM 只能从 GitHub 原始仓库拿到它；靠 npm 包分发的场景拿不到 |

### 忽略面（`agent_hub-main/.gitignore` 的四条硬意图）

| 条目 | 内容 | 意图 | 删除后果 |
|------|------|------|---------|
| 凭据 | `.npmrc`、`.env`、`.env.*` | 上游明写注释："npm publish — decrypted token files; must never be committed" | 发布 token / API 凭据进入 git 历史，属安全事故 |
| 产物 | `node_modules/`、`dist/`、`spug-dist/`、`*.tgz` | 包构建与 `npm pack` 输出不入库 | 仓库膨胀、无意义 diff（与本仓库根 `repo-hygiene` 规格同口径） |
| 文档 portal 残留 | `docs/build/`、`docs/.docusaurus/` | 上游曾以 Docusaurus 托管文档 portal（现 `docs/` 只剩两份 md） | 缓存目录误提交（来源: agent_hub-main/.gitignore） |
| 工具本地态 | `.claude/`、`.idea/`、`.vscode/`、`.DS_Store`、`*.log`、`e2e/*-report*.json` | 用户本地与冒烟测试报告不入库 | 多人交叉噪声 diff；**且与 openspec 「`.gitignore` SHALL 覆盖本地工具与 CI 产物」的仓库级约定一致**（来源: openspec/specs/repo-hygiene/spec.md） |

> ⚠️ 本文件只约束 `agent_hub-main/**` 路径下的文件（子目录级 .gitignore）；它无法、也不应忽略 `agent_hub-main/package.json` 这类已跟踪的源文件（git 对已跟踪文件的忽略规则不生效）。修改本文件不影响本仓库根目录的忽略策略。

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 发布范围 | `files` 白名单（5 项） | `.npmrc` 式黑名单 / 全量发布 | 白名单使「装完之后本地还剩什么」可枚举；`docs/`、`assets/`、`llms.txt` 有意只在仓库可见，不是遗漏（门户仓库托管是既定事实，见 CHANGELOG 1.1.0 "Repo unchanged"） |
| 版本文件 | `package.json.version` 为真源 + `VERSION` 文本镜像 | 单一真源 | 安装器需要在无 network 时秒答版本号（读本地 JSON），而发布流水线与人类习惯读独立 `VERSION` 文件；代价是两处必须同改 |
| 依赖策略 | CLI 零运行时依赖（仅 1 个 devDependency） | 引入 semver/commander 等库 | CHANGELOG 明确「Lightweight — a single dependency-free script run with npx」；pnpm-lock 里的 683 行全部是 dev 侧 MCP SDK 及其传递依赖，**不会进入用户安装面** |
| 包管理器 | pnpm（上游仓库自用） | npm（本仓库口径） | vendored 材料保留上游口径；本仓库 `backend/frontend` 的 npm 规约不得反向套到此处 |

### 禁忌（本组文件专属）

- ❌ **禁止把 `agent_hub-main/.gitignore` 当作本仓库的忽略规约**。它是上游子目录忽略规则，只在 `agent_hub-main/` 路径下生效；本仓库根 `.gitignore` 另在 `__root/__files`。它的核心意图有两条：绝不提交 `.npmrc`（"npm publish — decrypted token files; must never be committed"）与绝不提交 `.env`/`.env.*`（与 README「No `.env` parsing」同源）；`.claude/` 是用户本地设置。删除其中任何一行都可能让凭据类文件进入版本库。
- ❌ **禁止为「让清单和本仓库对齐」而修改 `name` / `version` / `engines`**。上游快照的可改性受 openspec「不得 fork 修改其源码」约束（来源: openspec/specs/system-architecture/spec.md）；本仓库若需要不同的事实，应写在自己的适配层（后端配置 / 文档），而不是改这里。
- ❌ **禁止只改 `VERSION` 不改 `package.json.version`**（或反之）。运行时只认后者，前者失配会误导人工核对。
- ✅ 可以做的：在本知识库中记录漂移、补充与 backend 的口径映射表；同步整份上游快照（新增/替换文件，保持内容原样）。

## 为何要单独把“发布边界”当知识（而非只看代码）

本组文件的特殊之处在于：**它把一个包能被谁看到、能被怎么装的全部决定权集于一身，却没有任何一行代码对它做合法性校验**。代码可以防止传错参数，但 `files` 写错不会报错，只会静默地少给使用者一个文件。上游 CHANGELOG 已经拿这个坑验证过：脚本目录一移，所有命令包括 `--version` 直接挂掉——“元数据当资源读”是本组文件的常态风险，不是边缘情况。（来源: agent_hub-main/CHANGELOG.md 1.1.0）

因此使用本模块的正确姿势是：把它当**可核对的发布事实清单**。当外部报告“装完包后本地没有 docs”时，先看 `PUBLISH_FILES`（本来就不发）而不是怀疑安装器坏了；当后端报 Node 版本不符时，先看 `ENGINE_NODE_MIN` 与本仓库 `MIN_NODE_MAJOR` 是否同值再决定改哪边；当怀疑“e2e 测试坏了”时，先看本快照是否仍有 `e2e/` 目录。这三个最常见的误判，均在本组文件内可一次性回答。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `agent_hub-main/installer` | `bin` 与 `files` 指向它；`cli.mjs` 反向读取本组 `package.json` 取版本 | `CLI_VERSION`（`installer/cli.mjs:19`）、`MIN_NODE_MAJOR` | extracted |
| `backend/src` | Node ≥20 与 MCP 子进程命令 `npx -y @bitget-ai/bitget-agent-mcp` 的可行性口径来自本清单 | `mcp_client.py:MIN_NODE_MAJOR`、`config.py:mcp_command` / `mcp_args`（默认 `npx -y @bitget-ai/bitget-agent-mcp`） | inferred |
| `agent_hub-main/docs` | 文档记录的上游版本线（`CATALOG_SPEC_VERSION` 3.0.0）与本清单 `version` 必须同期 | — | inferred |

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `agent_hub-main/installer` | 启动/`--version` 时读 `../package.json` | `createRequire(import.meta.url)("../package.json")` |
| 终端用户 / CI（仓库外） | `npm view @bitget-ai/bitget-agent-installer version` 取包版本；安装器据 `@latest` 解析受管包 | — |

## 变更风险（改本组文件会破坏什么）

- **改 `files` 或 `bin`**：影响面不在仓库内，而在用户机器上——装完包后本地没有某个文件或命不了名，本仓库 CI 绿也无法发现。典型误判是把 `llms.txt`/`docs/` 补进白名单以“方便离线查阅”，这会直接改变发布物体积与上游意图。
- **改 `version` / `VERSION`**：与注册表已发布版本不一致时，本地快照与 `npm view` 结果会互相矛盾，导致“以为升了版其实没升”，进而让后端的 verb 假设失准。
- **改 `engines.node`**：不会报错，只会影响安装与启动判定；需与 `backend/src/market_data/mcp_client.py` 的 `MIN_NODE_MAJOR` 同步评估。
- **改 `.gitignore`**：风险不在功能而在安全，`.npmrc`/`.env` 一旦不再忽略便可能连凭据一起提交；删前必确认用途。
- **改 `pnpm-lock.yaml`**：本仓库不跑 `pnpm install`，改动无收益只造 diff；升 pnpm 主版本会整体重写锁文件（格式 6.0 → 9.0），属噪声变更。

## 典型调用链（清单文件如何被消费到用户面前）

```
用户执行 npx @bitget-ai/bitget-agent-installer --version
  → npm registry 按 package.json(name/version/bin) 解析并缓存包      ← 本模块契约
  → installer/cli.mjs: createRequire("../package.json").version      ← 本模块文件被运行时读取
    → installer/cli.mjs 打印 CLI_VERSION（3.0.0）                    ← 跨模块：agent_hub-main/installer
      → 用户据此判断是否与 docs/architecture.md 的 3.0.0 版本线同期   ← 跨模块：agent_hub-main/docs
```

---

> 📄 本节内容来源于仓库内置文档：`agent_hub-main/CHANGELOG.md`、`agent_hub-main/README.md`（漂移史与安全口径的出处）；机器可读事实直接取自 `agent_hub-main/package.json`、`agent_hub-main/VERSION`、`agent_hub-main/pnpm-lock.yaml`、`agent_hub-main/.gitignore`
> 📋 涉及 OpenSpec 的条目来源于：`openspec/specs/repo-hygiene/spec.md`（.gitignore 覆盖产物与凭据的仓库级约定）
