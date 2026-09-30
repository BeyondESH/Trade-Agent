---
type: "Fragment"
id: agent_hub-main/assets/branding
title: "上游门户品牌素材 / logo 与 README 引用契约"
description: "README 首屏那个 logo 是什么规格、谁在引用它、改了它会出现什么后果？"
parent: /agent_hub-main/assets/_overview.md
fragment: branding
architectural_role: "上游门户品牌标识素材 + README 首屏引用契约，禁止在本仓库内替换或改写"
entity_names:
  constants:
    - name: "logo.png（唯一素材文件）"
      source: agent_hub-main/assets/logo.png
      value: "PNG 400×400, 8-bit RGB, non-interlaced, 5838 bytes"
    - name: "README 引用行号"
      source: agent_hub-main/README.md
      value: "2"
    - name: "README 引用路径（相对路径，不可改绝对）"
      source: agent_hub-main/README.md
      value: "assets/logo.png"
    - name: "README 渲染宽度"
      source: agent_hub-main/README.md
      value: "120"
    - name: "alt 文案（承载 SEO 关键词，禁止清空）"
      source: agent_hub-main/README.md
      value: "Bitget Agent Hub - Official Bitget AI Trading and Market Data Ecosystem for Claude Cursor Codex ChatGPT"
    - name: "本模块本地图片总数"
      source: agent_hub-main/assets/
      value: "1（README 其余图片均为 shields.io 外链 badge）"
retrieval_hints:
  - "仓库首页顶部那个 Bitget logo 图放在哪里、谁在引用它"
  - "想更换 Agent Hub 的品牌标识 / 仓库封面图，应该改哪个文件"
  - "README 里的 logo 图片显示不出来（破图）了，是什么原因"
  - "本模块也叫 logo / 品牌标识素材 / 仓库封面图 / README hero image，对应需求中的「门户首屏视觉」"
  - "⚠️ 如果你要找的是前端页面的图标、K 线成交标记或交易所 logo，不在这里，在 frontend/src 与 frontend/vendor 模块；本目录只有一张上游 README 用的品牌图"
  - "新增品牌素材必须放 agent_hub-main/assets/ 并同步 README 第 2 行的相对路径，不可新建独立素材目录、不可改用 CDN 外链"
---

## 业务意图

本子模块解决的是**门户第一屏的「官方身份识别」问题**：外部访客（含搜索爬虫）打开 Bitget Agent Hub 仓库首页时，需要在极短时间内判断三件事——这是不是 Bitget **官方**出品（而非社区仿制包）、覆盖的是**交易 + 行情数据**两类能力、支持哪些 AI 宿主（Claude / Cursor / Codex / ChatGPT）。`logo.png` 与其 `alt` 文案共同承担这次判断：图负责视觉可信度，`alt` 负责搜索引擎与无障碍场景下的同一句话。这也是为什么本目录只有一张图、却不允许随意替换：**它是门户门面，不是资源池**，不承担本系统任何界面渲染职责。

## 对外接口

> 本子模块无协议 / RPC / 事件，**唯一对外契约是「文件相对路径 + 文件名」**——引用方按路径取图，路径即接口。

| 契约项 | 方向 | 关键值 | 业务说明 | 引用位置 |
|--------|------|--------|---------|---------|
| `assets/logo.png` | README → 素材 | PNG 400×400 / 5.7 KB | README 首屏品牌标识，GitHub 渲染时按相对路径取图 | `agent_hub-main/README.md:2` |
| `<img width="120">` | README → 渲染器 | `120` | 首屏小图宽度，原图 400×400 靠此属性缩放 | `agent_hub-main/README.md:2` |
| `<img alt="...">` | README → 搜索引擎 | 含 "Bitget Agent Hub / Official / Trading / Market Data / Claude Cursor Codex ChatGPT" | 承载 SEO 与无障碍文案，品牌名与生态关键词在此重复一次 | `agent_hub-main/README.md:2` |

## 跨模块依赖

> 实现本子模块功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| 无 | 本模块是纯静态二进制素材，不 import 任何模块、也不被任何代码 import | — | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `agent_hub-main`（门户仓库根 file-group，含 README.md） | GitHub 仓库页渲染 README 首屏时按相对路径取图；README 顶部唯一的本地图片 | `README.md:2 <img src="assets/logo.png">` |
| `agent_hub-main/docs`（门户文档层） | 同属门户门面，被 README 的文档链接表引用；**不**引用 assets 下的图片 | `docs/architecture.md`、`docs/getting-started.md` |
| GitHub 仓库页 / npm 包页（非代码调用方） | README 在 registry 端也会被渲染（README.md 在 npm `files` 白名单内） | — |

## 典型调用链

> 本子模块无协议入口，唯一的"调用链"是渲染期取图链，它决定了改坏后的可观测后果。

### README 首屏品牌图渲染
```
访客打开 https://github.com/Bitget-AI/agent_hub
  → GitHub 渲染 agent_hub-main/README.md
    → 解析第 2 行 <img src="assets/logo.png" width="120">   ← 本模块接口
      → 按相对路径取 agent_hub-main/assets/logo.png          ← 本模块素材
        → 渲染品牌标识 + alt 文案（搜索引擎/无障碍读取 alt）
```

```
npm 包页渲染 @bitget-ai/bitget-agent-installer
  → registry 只拿到 files 白名单内文件（README.md 在、assets/ 不在）
    → 相对路径 assets/logo.png 在 registry 端无对应文件          ← 已知边界
      → 包页首屏图片位置不可解析（不产生错误页，仅缺图）
```

## 实现约束清单

> 实现本模块相关需求（换图 / 修破图 / 加素材）时，Agent 必须在动笔前逐条核对。

### 必须定义的常量/枚举

> 本模块无代码常量；以下为**渲染契约常量**，任何改动必须与 README 同步，不得在各处内联不同数值。

| 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
|-------|----|---------|------|---------------------|
| `logo 文件路径` | `assets/logo.png` | `agent_hub-main/README.md:2` | 相对门户仓库根的相对路径 | 全仓库仅此一处引用（`grep -rn "assets/\|logo.png"` 在 agent_hub-main 内仅命中 README.md:2） |
| `logo 渲染宽度` | `120` | `agent_hub-main/README.md:2` | 首屏小图渲染宽度（px）；原图 400×400，靠此属性缩放 | 删除该属性会按 400px 原尺寸撑开首屏，与居中标题抢版面 |

### 素材规格与后果对照（业务判读用）

规格类事实（原始尺寸 400×400、8-bit RGB、非隔行、5838 bytes）由 Codemap 侧无法获取，故在此一次记录，但**真正需要遵守的是它们带来的判断**：

- 原始 400×400 而渲染 120px，是**按 3 倍余量为高 DPI 屏留的清晰度冗余**。替换为非正方形图（如 512×256 横版 banner）时，`width="120"` 会把它强行压成细长条，视觉上读作「破图」——这类替换必须同时改 README 属性，否则等于改坏门面。
- 当前 5.7 KB 属**首屏可忽略体积**量级。若换为几百 KB 的透明大图或动图，体积会直接计入仓库页首屏加载；且托管侧对超大/动图类内联渲染有限制（具体阈值以平台文档为准），触发后表现为**图彻底不显示**而不是“加载慢”——这类失败方式同样无测试信号。
- 图为 **RGB 非隔行、无 alpha 通道**：意味着它在 GitHub 深浅色主题下都是一块不透明的图形本身，靠 README 的 `<p align="center">` 居中和 `alt` 文案补足语义。任何「让它适应暗色模式」的需求，正确解法是换成带透明通道的图（须在上游提 PR），而**不是**删除图片或在 README 里塞 CSS。

### 设计决策

> 实现 / 修复时存在"两种方案均可"的分歧点，记录选型理由，防止下次自动实现时选错。

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 图片引用形式 | 仓库内**相对路径** `assets/logo.png` | 外部 CDN 绝对 URL | 上游 README 现状；仓库内相对路径随仓库自包含，不依赖第三方可用性。**但**由此产生 npm 页破图的已知边界 |
| 换图落位（若确需新素材） | 放 `agent_hub-main/assets/` 并同步 README 第 2 行 | 复制到 `frontend/public/` 或新开 `assets/` 目录 | `agent_hub-main/assets/` 是门户侧既有素材归属目录，与 `docs/` 并列；复制到前端目录会造成同一品牌图两份事实源，改名/换色时必然漏改一处 |
| 修复 npm 页破图的位置 | 在**上游** `Bitget-AI/agent_hub` 仓库修复 | 在本仓库改 README 指向 CDN | openspec 契约要求以依赖形式消费、不得 fork 上游；在本地改写上游 README 属越界改动，且下次同步会被覆盖 |

> ⚠️ **变更风险（改动它会破坏什么）**：重命名、移动、删除或替换 `logo.png` **不会**让任何测试、lint、CI 失败（`.github/workflows/ci.yml` 无 markdown/素材校验步骤；本系统 L1/L2/L3 三层测试也不覆盖上游门户仓库），但会在 GitHub 仓库页首屏**立刻**呈现破图——品牌标识消失、仅剩 alt 文本，门户第一眼失去"Bitget 官方"的视觉锚点。后果的性质是**信任损失而非功能故障**：访客无从分辨官方仓库与仿冒包，而这正是本素材存在的唯一理由。
>
> 更隐蔽的一条：因为**没有任何自动化信号会报错**，此类故障只能靠人工访问页面发现，所以任何动到本目录的改动，提交前必须自己渲染一次 README 首屏确认（不能以"测试全绿"作为通过依据）。同时，本地改动会与上游 `Bitget-AI/agent_hub` 产生不可合并的 diff，下次同步时被覆盖或制造冲突——详见 `assets_publish_boundary.md`。
