---
type: "Fragment"
id: "frontend/vendor/tradingview_template"
title: "只读外壳模板参考层"
description: "TradingView 外壳模板在本仓库扮演什么角色？为什么它必须保持不被编辑？"
parent: /frontend/vendor/_overview.md
fragment: tradingview_template
entity_names:
  constants:
    - name: "模板包名/版本"
      value: "react-example / 0.0.0（private，永不发布）"
      source: frontend/vendor/tradingview-pro/package.json
    - name: "模板自带 dev 端口"
      value: "3000（--host=0.0.0.0）"
      source: frontend/vendor/tradingview-pro/package.json
    - name: "模板声明能力"
      value: "MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"
      source: frontend/vendor/tradingview-pro/metadata.json
    - name: "HMR 开关"
      value: "DISABLE_HMR=true → hmr:false + watch:null（AI Studio 侧禁文件监听防抖）"
      source: frontend/vendor/tradingview-pro/vite.config.ts
    - name: "模板 alias"
      value: "'@' → 模板自身根目录（与宿主 '@/*' → frontend/ 同键不同义）"
      source: frontend/vendor/tradingview-pro/vite.config.ts
    - name: "模板需密钥"
      value: "GEMINI_API_KEY（.env.example 要求填在 .env.local）"
      source: frontend/vendor/tradingview-pro/.env.example
    - name: "模板规模"
      value: "src 47 个 ts/tsx ≈10.4k 行（components 41 文件 8.1k / data/marketData.ts 647 / types/trading.ts 277 / utils 437）"
      source: frontend/vendor/tradingview-pro/src
retrieval_hints:
  - "TradingView 风格外壳（标题栏、导航栏、右侧停靠栏、底部抽屉、全视图、命令面板）最初是哪里来的？"
  - "想还原/对照模板原始样子（比如某个面板上游是怎么布局的）该看哪个目录？"
  - "为什么在 frontend/vendor/tradingview-pro 里改了组件，页面上没变化？"
  - "⚠️ 如果你要找的是**当前在跑的外壳实现**，不在这里，在 frontend/src（app_shell / terminal_panels / market_views 三个子文档）"
  - "⚠️ 如果你要找的是图表引擎（K 线/周期条/绘图条），不在这里，在 frontend/vendor 的 klinecharts_pro_* 子文档——模板自带的 `TradingChart`/`MultiChartGrid`/`ChartHUD` 已被渲染路径移除"
  - "⚠️ 如果你要找 Pine Script 编辑器或券商接入，本仓库**没有**这两个能力（Pine Studio 与 Brokers 视图已整体移除），不要指望模板里的 `PineEditor`/`BrokersView`/`pineEngine.ts` 可用"
  - "本模块也叫 TV 模板 / tradingview-pro / 外壳参考，对应需求中的「模板外壳升格」与「UI 外壳基于 tradingview-pro 模板」"
  - "架构归属：任何外壳级改动都写在 `frontend/src/**`，本目录只读；确需引入上游新布局时按「先拷到 frontend/src 再改」的流程走"
architectural_role: "只读参考层（模板基线快照），禁止就地修改、禁止被宿主 import"
---

## 业务意图

这一层沉淀的是**外观基线**：本项目的桌面式交易终端外观（标题栏、全局导航栏、顶部工具栏、绘图工具栏、右侧停靠栏、底部抽屉、时间栏、全视图、约 10 个弹窗）不是自研设计，而是从一份 TradingView 风格模板整体继承而来。把模板原样留一份只读副本的业务理由是：当"当前外壳改到什么样子才算对"产生争议时（例如某个面板的交互手势、某档密度、某个弹窗的字段布局），这份副本就是唯一可对照的上游事实来源，同时也是历史上定下的回滚手段——重建外壳失败时可以从它重新拷贝一遍。

## 对外接口

**本子模块没有任何对外接口。** 它不被 `frontend/src` import、不被根 `tsconfig` include（`include: ["src","vite.config.ts"]`）、不被 biome 检查（`!vendor`）、不装依赖（无本地 `node_modules`）。它的"使用方式"是一次性人工拷贝（copy-in 升格），而非引用式集成。

> 无协议、无事件、无存档字段。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| 无 | 模板自带依赖（`@google/genai`、`express`、`dotenv`、`motion`）留在它自己的 `package.json` 里，本项目从未安装 | `DefaultDatafeed` 类比项：模板的 mock 数据层 `src/data/marketData.ts` | extracted |

反向依赖（谁把模板当依据）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `frontend/src`（历史来源） | 外壳组件由本模板 copy 后独立演化：`App.tsx`、`components/{desktop,header,sidebar,bottom,timebar,modals,views}`、`types/trading.ts` | `App`、`DesktopTitleBar`、`RightDock`、`BottomDock` |
| `openspec` | `tv-template-shell` spec 把"以本模板为唯一 UI 来源 + 依赖升格 + 旧 UI 全删 + MUST NOT 多图表网格"写成契约 | spec `tv-template-shell`（含 2026-09-20 的 spec-drift 修正与 remove-brokers-pine-views 修正） |

## 升格（copy-in）流程

```
读上游参考：frontend/vendor/tradingview-pro/src/**            ← 本模块（只读）
  → 拷贝目标：frontend/src/**                                  ← 跨模块：frontend/src（已发生，随后独立演化）
    → 依赖升格：模板 package.json 的 react19/vite6/tailwind4/@vitejs/plugin-react/lucide-react/motion
      → frontend/package.json（同时保留宿主的 vitest/playwright/@testing-library 与 /api、/ws 代理）
    → 渲染路径裁决：模板自绘图表 TradingChart/ChartHUD/ActiveDrawingToolbar/MultiChartGrid 不进渲染路径，
      中心区改由 vendored 引擎渲染（见 klinecharts_pro_api）
```

## 实现约束清单

### 已知偏离（模板 ≠ 现网，不可反向参照细节）

| 项 | 模板（本目录） | 现网（`frontend/src`） | 依据 |
|----|---------------|----------------------|------|
| 中心图表 | `MultiChartGrid` 多格网格 + 自绘 canvas 图表 | 单张 `KLineChartPro`/`NativeChart`，外壳 MUST NOT 含网格视图 | `klinecharts-pro-chart`、`tv-template-shell`（spec-drift 修正后为"单一中心图表区"） |
| Pine Studio / Brokers 视图 | 存在（`PineStudioView` 262 行、`BrokersView`、`bottom/PineEditor`、`utils/pineEngine.ts`） | **已整体删除**，导航/新建标签/⌘K 均不可达，视图类型不含 `'pine'`/`'brokers'` | `openspec` 归档变更 `remove-brokers-pine-views` |
| 数据来源 | `data/marketData.ts` 全量 mock（647 行） | 同名文件裁到 464 行，且"无上游数据源的视图 SHALL 继续用 mock"，有源视图接真实后端 | `tv-template-shell`「装饰性视图保留壳」+ `ui-real-data-wiring` |
| AI/量化能力 | 依赖 Gemini 服务端能力（`metadata.json`） | 不用外部 LLM SDK，AI 页对接自建后端（DL 引擎/paper broker） | `ai-agent-page` 系列 spec |
| 文件级差异统计 | — | 模板 `src/` 共 48 个文件（47 个 ts/tsx + `index.css`）与现网 **0 个逐字节相同**：34 个已分叉、14 个在现网已不存在（包括 `chart/{TradingChart,ChartHUD,ActiveDrawingToolbar,DrawingToolbar,MultiChartGrid}`、`views/{PineStudioView,BrokersView}`、`bottom/PineEditor`、`header/{TopNavbar,ReplayBar}`、`modals/{ChartSettings,Indicators,Snapshot,SymbolSearch}Modal`） | 本次 `diff` 实测 |

### 允许 / 禁止

- ✅ **允许**：把本目录当"上游原版长什么样"的只读参考；需要时把某个组件重新拷进 `frontend/src` 再改。
- ❌ **禁止就地编辑本目录**：现网 0 个文件与模板相同，所以在本目录里的编辑既不会生效（不参与构建），又会污染回滚基线；要改的一律改 `frontend/src`。由来：归档 design.md 明确"tradingview-pro 保持 pristine，因此合并失败时可重新拷贝"。
- ❌ **禁止被宿主 import**（`frontend/src/**` 里出现 `../vendor/tradingview-pro/...`）：模板文件依赖 `@` → 模板根 的 alias，宿主 `@` → `frontend/`，同键不同义，直接引会解析到错误目录；且模板无 `node_modules`，其 `@google/genai`/`express` 依赖不可解析。由来：两侧 `vite.config.ts` 的 alias 冲突 + 覆盖率/lint 边界（`!vendor`）。
- ❌ **禁止把模板的 mock 当真实数据**：模板视图（社区观点、财经日历、热力图、精选榜）无后端数据源，现网沿用其外壳与 mock 是**有意豁免**，但界面上必须保持"示例数据"可辨识性，不得声称是实时行情。由来：`tv-template-shell`「装饰性视图保留壳」+ `frontend/src` 的豁免边界。
- ⚠️ **分发限制**：模板是 Google AI Studio 导出物，目录内**无 LICENSE 文件**（对比 klinecharts-pro 有 Apache-2.0 `LICENSE` 与逐文件版权头），因此仅在本仓库内部参考使用，不得对外再分发或声称自有。由来：核对 `frontend/vendor/tradingview-pro/` 文件清单（`README.md` 为 AI Studio 脚手架说明）。

## 变更风险

1. **在本目录做修改** → 对用户零影响（不在构建图内），但下一次"重新拷贝模板"会把现网修复整体覆盖，属于**延迟引爆**类风险；若必须保留参考值，请改为在 `frontend/src` 上加注释引用。
2. **删除本目录** → 失去与上游对照的唯一基线，`tv-template-shell` 的"以该模板为唯一 UI 来源"追溯链断裂；现网代码不受影响（无 import），但 spec 一致性核查（spec-drift-cleanup 类变更）将无对照物。删除前必须同步修 `tv-template-shell` spec。
3. **有人在此目录内跑 `npm install`/`npm run dev`** → 生成 `node_modules` 与本仓库锁文件体系无关的 `bun.lock` 变更，且模板 dev server 会占 3000 端口、要求 `GEMINI_API_KEY`，容易让人误判"项目依赖外部 LLM"；模板自带的 Pine/多图表能力也会误导需求评估（现网已移除）。

> 📄 本节内容来源于仓库内置文档：`frontend/vendor/tradingview-pro/{README.md,metadata.json,package.json,vite.config.ts,.env.example}`（README 为 AI Studio 通用运行教程，仅提取"外部密钥依赖/脚手架出处"要点，其余教程性内容按规则跳过）
