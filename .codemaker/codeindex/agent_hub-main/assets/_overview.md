---
type: "Module"
id: agent_hub-main/assets
title: "上游门户品牌素材"
description: "存放 Bitget Agent Hub 官方门户仓库的品牌标识素材，为 README 首屏提供 Bitget 官方身份视觉锚点，使 GitHub 仓库页与 npm 包页第一眼即可辨识为官方 AI Agent 生态入口。"
module_id: agent_hub-main/assets
architectural_role: "外部上游门户仓库的静态品牌素材层（非本系统运行时资产），只被上游 README 的图片标签引用"
world_model_hints:
  - "位于 vendored 上游门户仓库 agent_hub-main 内，不属于本系统（trade 交易终端）的运行时、构建链路或部署产物"
  - "没有任何代码 import / read 它：installer/cli.mjs 全文件无 assets 引用，frontend 的 Vite 构建也不指向此目录"
  - "它的『接口』就是文件相对路径本身——引用方按路径取图，因此重命名/移动等同于破坏接口"
  - "改动本目录属于修改上游文件，与 openspec 锁定的『消费 bitget-agent-hub、不得 fork 其源码』契约冲突"
upstream_modules:
  - module: agent_hub-main/README.md
    confidence: extracted
  - module: agent_hub-main（门户仓库归属，file-group 模块）
    confidence: extracted
downstream_modules:
  - module: "GitHub 仓库页 / 文档门户渲染（非代码，无 import 关系）"
    confidence: inferred
---

## Files

### 源代码路径

- `agent_hub-main/assets/`（本模块目录，位于上游门户仓库 agent_hub-main 内）
- 同级散落文件：`agent_hub-main/assets/logo.png`（本模块唯一文件，PNG 400×400，5.7 KB，8-bit RGB 非隔行）

### 关联配置（品牌素材的发布边界由这些文件决定，改动需联动核对）

- `agent_hub-main/package.json` — `files` 白名单为 `["installer/cli.mjs","CHANGELOG.md","README.md","LICENSE","VERSION"]`，**不含 `assets/`**：logo 只随 GitHub 仓库分发，不随 npm 包分发
- `agent_hub-main/README.md` — 第 2 行 `<img src="assets/logo.png" ... width="120">`，本素材的**唯一引用点**
- `agent_hub-main/CHANGELOG.md` — 1.1.0 条目明确 "portal repo continues to host docs, assets, ..."：素材由门户仓库托管是既定事实，不是遗留
- `agent_hub-main/docs/architecture.md` / `getting-started.md` — 同属门户文档层，与 assets 并列构成"文档 + 素材"对外门面

### 知识库文档

- `.codemaker/codeindex/agent_hub-main/assets/_overview.md`（本文件）
- `.codemaker/codeindex/agent_hub-main/assets/assets_branding.md`
- `.codemaker/codeindex/agent_hub-main/assets/assets_publish_boundary.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail`）。
- 本模块为二进制静态素材，**无任何函数/类符号**：Codemap 全库仅索引到 `agent_hub-main/installer/cli.mjs`，不含本目录。定位本模块请用 `search_knowledge` 或直接按路径阅读，不要用 `find_symbol`。

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `assets_branding.md` | logo 规格与视觉契约、README 首屏引用契约（相对路径 / width / SEO alt）、改动后的可观测后果、素材新增归属 | `logo.png`(400×400, 5.7KB)、`README.md:2`、`width="120"`、`alt` 关键词串 |
| `assets_publish_boundary.md` | 素材为何不进 npm tarball、portal repo 托管边界、上游不 fork 约束与同步风险、新增素材的落位决策 | `package.json.files`、`CHANGELOG 1.1.0`、openspec `system-architecture/spec.md`「不得 fork」 |

## 模块概述

**业务定位**：本模块承载 Bitget Agent Hub 的**官方品牌标识图**，解决"仓库第一屏如何被识别为 Bitget 官方生态入口"的问题——它不参与任何交易、行情或安装逻辑，只负责在 README 顶部把"官方身份 + 覆盖范围"一眼传达给访客与搜索引擎。

**业务上游**：唯一触发方是上游门户仓库的 `agent_hub-main/README.md` 第 2 行的 `<img src="assets/logo.png" width="120">`，由 GitHub 仓库页渲染时按相对路径读取；本系统（trade）的代码、构建、CI 均不引用它（`installer/cli.mjs` 无 assets 引用，`.github/workflows/ci.yml` 无 markdown/素材校验步骤）。

**业务下游**：没有运行时代码下游——改坏它不会让任何测试或接口失败，但会**立刻让上游仓库页首屏出现破图**（文字仍在、品牌标识消失），并影响 npm 包页展示（README.md 在白名单内会被发布，而 `assets/` 不在，相对图片路径在 registry 端无法解析，属已知边界）；同时任何本地修改都会让本仓库与上游 `Bitget-AI/agent_hub` 产生不可合并的 diff。

## 架构简析

> 本模块不是"有内部结构的代码模块"，而是一个**单文件素材锚点**：它的全部架构意义在于"被谁按什么路径引用、是否随包分发"。

**分层结构（单行格式）：** 上游门户仓库:`agent_hub-main/` → 素材层:`agent_hub-main/assets/logo.png` → 渲染消费:`agent_hub-main/README.md:2 <img>`（→ GitHub 仓库页 / npm 包页）

- **核心文件**：仅 `logo.png`。它是 400×400、8-bit RGB、非隔行 PNG（5.7 KB），尺寸与体积被刻意压小以适配 README 首屏小图（实际渲染宽度被 README 限制为 120px）。
- **关键数据流**：GitHub 渲染 `README.md` → 解析相对路径 `assets/logo.png` → 取该 PNG 渲染 → 访客/搜索爬虫看到品牌图与 `alt` 文案。无构建步骤、无缓存层、无 CDN。
- **无状态机、无扩展点**：目录内不存在配置、脚本或插件机制；新增素材也不需要改任何代码，只需保证引用路径与文件名一致。
- **素材归属语义**：`assets/` 是**门户仓库级**目录（与 `docs/` 并列），不是"本系统前端素材目录"。本系统前端素材在 `frontend/src`（Vite 构建）与 `frontend/dist/assets/`（构建产物），两者与本文档所述 `agent_hub-main/assets` 无任何关系。

## 实现约束清单

> 处理与本模块相关的任何需求（含"更新 logo""换品牌图""修 README 破图"）前，Agent 必须逐条核对。

### 必须遵守的边界（禁止项）

| 约束 | 说明 | 约束由来 / 后果 |
|------|------|----------------|
| 禁止在本仓库内修改 `agent_hub-main/**`（含 `assets/logo.png`） | 该目录是 Bitget 官方上游门户仓库的快照，本系统以依赖形式消费，不 fork 其源码 | openspec 锁定契约："以依赖形式消费 `bitget-agent-hub`，不得 fork 修改其源码"（来源: openspec/changes/archive/2026-07-26-ai-trading-system-roadmap/specs/system-architecture/spec.md）；违反后果：上游同步冲突、品牌素材被非官方版本覆盖 |
| 禁止把 logo.png 改指向外部 CDN / 绝对 URL 来"修"npm 页破图 | 这属于改写上游 README，越界且引入外链依赖 | 上游 README 与 assets 同属门户仓库，修复应在 `Bitget-AI/agent_hub` 侧进行 |
| 禁止在 `agent_hub-main/assets/` 下堆放本系统运行时素材（行情图标、K 线图片等） | 该目录不随 npm 发布、无构建管线接入，放进去的素材既不会被打包也不会被引用 | `package.json.files` 白名单不含 `assets/`；后果：素材静默失效（无报错，只是取不到） |
| 禁止重命名 / 移动 `logo.png` 而不改 README | 引用是相对路径字符串，路径即接口 | 后果：README 首屏破图，且只在人工访问 GitHub 页面时才可见，自动化测试不会报错 |

### 存档字段索引（不可裁减）

> 本模块无持久化结构；唯一"索引"是 README 引用位置，改动引用必须同步此处：

| 引用位置 | 值 | 说明 |
|---------|----|------|
| `agent_hub-main/README.md` 行号 | `2` | 正文最顶部、`<h1>` 之前；移动该 `<img>` 会改变首屏版式 |
| `<img src>` 值 | `assets/logo.png` | 相对 README 所在目录（门户仓库根）的相对路径，非 `/assets/...`，非 CDN |
| `<img width>` 值 | `120` | 渲染宽度（px），原始图为 400×400，靠该属性缩放 |
