---
type: "Module"
id: "frontend/vendor"
title: "第三方图表引擎仓库"
description: "把外部图表引擎与 UI 模板以 vendored 形式钉在仓库内，让终端中心的图表行为不受 npm 发版与网络影响，同时把本地二次开发的改造面显式收敛在一处。"
module_id: "frontend/vendor"
architectural_role: "图表引擎与 UI 模板的 vendor 边界"
world_model_hints:
  - "属于依赖供给层：不被后端调用，也不发起网络请求，只被 frontend/src 在编译期与运行期引用"
  - "本目录同时存在两种相反的处置策略：klinecharts-pro 是可改的本地 fork（改完必须重建 dist），tradingview-pro 是保持 pristine 的只读模板"
  - "Codemap 图索引不收录 frontend/vendor 下的文件（实测 find_symbol/search_code 均无 vendor 结果），本目录的符号与契约只能靠本文档定位"
  - "运行时真身是已提交的预构建产物 dist/klinecharts-pro.js，不是 src/*.tsx"
upstream_modules:
  - module: "frontend/src"      # 唯一宿主：import @klinecharts/pro + 直接引 dist 的 CSS，并依赖 vendor chrome 的 DOM 类名
    confidence: extracted
  - module: "."                  # frontend/vite.config.ts 的 alias、frontend/tsconfig.json、frontend/biome.json 决定 vendor 是否参与构建/lint/类型检查
    confidence: extracted
  - module: "openspec"           # klinecharts-pro-integration / tv-template-shell 等 spec 把 vendor 的改造范围钉成契约
    confidence: extracted
downstream_modules:
  - module: "klinecharts (npm peer)"   # vendor bundle 把 klinecharts 声明为 external，运行时由宿主 node_modules 提供
    confidence: extracted
  - module: "frontend/tests"           # e2e 与 src/vendor/klinechartsProRace.test.ts 直接断言 vendor 产物文本与 DOM 结构
    confidence: extracted
  - module: ".github/workflows"        # CI 在全新 clone 上直接消费已提交的 dist 产物，不在 CI 内重建 vendor
    confidence: extracted
---

## Files

### 源代码路径

- `frontend/vendor/klinecharts-pro/`：可改的本地 fork。`src/` 85 个 ts/tsx（4.8k 行，其中 `widget/drawing-bar/icons/` 37 个图标组件、`extension/` 19 个文件（向 klinecharts 注册 17 种画线 overlay）、`component/` 9 个基础控件、`widget/` 8 个图表 chrome 模块）+ 20 个 less/css + `src/index.ts`（导出面）+ `src/iconfonts/`（icomoon 字体四件套 + style.css，`dist` 里已 base64 内联）+ `types.d.ts`（对外类型契约，手写）+ `dist/`（5 个预构建产物，**故意提交**）+ `docs/`（16 份上游中英文文档 + vitepress 站点）
- `frontend/vendor/tradingview-pro/`：pristine UI 模板（Google AI Studio 导出物）。`src/` 47 个 ts/tsx（10.4k 行：`components/` 41 文件 8.1k 行、`data/marketData.ts` 647 行 mock、`types/trading.ts` 277 行、`utils/` 437 行）+ 自带的 `index.html` / `vite.config.ts` / `package.json` / `bun.lock` / `metadata.json`
- `frontend/vendor/klinecharts-pro/node_modules/`：仅本地存在（vendor 自带 vite4/TS4.9/solid 工具链，用于重建 dist），未被 git 跟踪；`tradingview-pro/` 无 `node_modules`（不参与本仓库构建）

### 知识库文档

- `.codemaker/codeindex/frontend/vendor/_overview.md`（本文件）
- `.codemaker/codeindex/frontend/vendor/frontend_vendor_import_boundary.md`
- `.codemaker/codeindex/frontend/vendor/frontend_vendor_klinecharts_pro_api.md`
- `.codemaker/codeindex/frontend/vendor/frontend_vendor_klinecharts_pro_patch.md`
- `.codemaker/codeindex/frontend/vendor/frontend_vendor_tradingview_template.md`

### 符号索引

- **本目录例外**：Codemap 图索引（232 文件）不包含 `frontend/vendor`，`find_symbol` / `search_code` 对 `PeriodBar`、`ChartProComponent`、`DefaultDatafeed`、`TradingChart` 均不返回 vendor 结果。定位入口请直接用下方"分层结构"里的文件路径 + `get_symbol_detail` 不适用的说明；宿主侧符号（`KLineChartProView`、`BitgetDatafeed`、`periodsStore`）仍由 Codemap 实时提供

## 代码地图（文件归属）

> 因 Codemap 不索引本目录，下表是全目录文件→知识的唯一路由表。

| 范围 | 主要文件/目录 | 详写于 |
|------|--------------|--------|
| 解析与构建边界 | `frontend/{vite.config.ts,tsconfig.json,biome.json,.gitignore}`；`klinecharts-pro/{vite.config.ts,package.json,tsconfig*.json,.gitignore}`；`klinecharts-pro/{package-lock.json,.eslintignore,logo.svg}`；`klinecharts-pro/dist/**`；`klinecharts-pro/{.github/workflows,.vscode}/**`、`.babelrc.json`、`.eslintrc.cjs` | `frontend_vendor_import_boundary.md` |
| 引擎对外契约 | `klinecharts-pro/types.d.ts`、`src/{index.ts,types.ts,KLineChartPro.tsx}`、`src/DefaultDatafeed.ts`（禁用）、`src/i18n/index.ts`、`docs/{data-access,theme,i18n,introduction}.md` | `frontend_vendor_klinecharts_pro_api.md` |
| 本地改造面 | `src/ChartProComponent.tsx`（取数/竞态/懒取/秒级跨度）、`src/widget/period-bar/**`（pin 双区）、`src/i18n/{zh-CN,en-US}.json`（新增键）、`src/{KLineChartPro.tsx,types.ts}`（参数透传） | `frontend_vendor_klinecharts_pro_patch.md` |
| 未改动的上游资产 | `src/widget/{drawing-bar,indicator-modal,indicator-setting-modal,screenshot-modal,setting-modal,symbol-search-modal,timezone-modal}/**`、`src/component/**`（9 控件 + `component/index.tsx` 聚合导出）、`src/extension/**`（17 种 overlay）、`src/widget/index.tsx`、`src/{index.less,base.less}`、`src/iconfonts/**`——行为等同上游，改动需先补进 patch 子文档的影响清单 | 同上（patch）与 `frontend_vendor_klinecharts_pro_api.md` |
| 只读模板层 | `tradingview-pro/{src/**,index.html,metadata.json,package.json,bun.lock,tsconfig.json,vite.config.ts,.env.example,.gitignore,README.md,assets/.aistudio/}` | `frontend_vendor_tradingview_template.md` |

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `frontend_vendor_import_boundary.md` | vendor 如何被引入构建（alias/类型/lint/coverage/dist 提交策略/许可），以及"改 src 不改 dist"这类静默失效风险 | `@klinecharts/pro` alias、`klinecharts` external、`0.1.1`、`!vendor` |
| `frontend_vendor_klinecharts_pro_api.md` | 对宿主暴露的契约面：`ChartProOptions`/`Datafeed`/`ChartPro` 四方法、默认值、CSS 变量主题钩子、i18n 覆盖点 | `Datafeed.getHistoryKLineData`、`ChartProOptions.pinnedTimeframes`、`--klinecharts-pro-*`、`loadLocales` |
| `frontend_vendor_klinecharts_pro_patch.md` | 本地二开改造面：切换竞态修复、秒级时间跨度、历史懒取预载、周期条双区拖拽固定、新增 i18n 键，及重建 dist 的流程 | `loading`/`canLoadMore`、`adjustFromTo`、`500`、`0.6`、`text/period` |
| `frontend_vendor_tradingview_template.md` | 只读模板层的定位、升格（copy-in）流程、与现网前端的已知偏离（单图、无 Pine/Brokers、真实数据） | `react-example`、`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`、`DISABLE_HMR` |

## 模块概述

**业务定位**：本模块解决的是"交易终端的图表体验不能被外部发版节奏和外部数据源绑架"这个问题——它把开箱图表引擎（klinecharts-pro）与桌面 UI 模板（tradingview-pro）以源码+产物的形式钉进仓库，使本项目可以对图表 chrome 做上游没有的能力（Bitget 原生 15 档周期、拖拽固定常用周期、秒级周期、快速切币不卡旧数据），并保证任何一台机器（含 CI）clone 下来就能渲染出完全一致的图表，无需联网、无需额外构建步骤。
**业务上游（谁触发本模块）**：没有协议或定时器触发本模块；上游只有一条路径——`frontend/src` 的图表包装器 `KLineChartProView` 在组件挂载时 `new KLineChartPro({...})` 并把宿主的 `BitgetDatafeed`（REST `/candles/recent` + Bitget WS 实时）注入进来，于是 vendor 开始反向 calls 宿主的数据层；用户点击 vendor 自带周期条/品种搜索/绘图工具则是第二条触发路径，经 `onSymbolChange`/`onPeriodChange`/`onPinChange` 回调回传应用状态。
**业务下游（改动本模块会影响谁）**：改本模块会同时影响三个层面——中心图表区的可见行为（蜡烛渲染、周期切换、指标弹窗、历史左拖不空白）、宿主靠 DOM 类名桥接的三个入口（指标选择器、设置弹窗、e2e 用例选择子），以及 CI 门禁（`src/vendor/klinechartsProRace.test.ts` 直接切片断言 dist 产物文本；dist 一旦漏提交或结构变化，全新 clone 与流水线会直接红）。

## 架构简析

**双层两策略：** vendor 内没有统一的"协议→逻辑→数据"三段，而是**引擎层（可改 fork）**与**外观层（只读模板）**两套外部代码，各自带独立的构建边界与处置策略。

分层结构（单行）：宿主挂载入口 `frontend/src/components/chart/KLineChartProView.tsx` → 引擎门面 `frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx` → 图表状态与取数编排 `.../src/ChartProComponent.tsx` → chrome 组件 `.../src/widget/{period-bar,drawing-bar,indicator-modal,...}` → 画布内核 `klinecharts@9`（npm peer，vendor 不打包）；外观层独立成链：`frontend/vendor/tradingview-pro/src/App.tsx`（桌面壳参考）→ 已被 copy 升格进 `frontend/src/`。

- **核心文件**：`types.d.ts`（对外类型契约，手写维护，宿主 typecheck 只看它）、`src/ChartProComponent.tsx`（≈700 行，实例生命周期+取数+竞态+懒取的唯一编排点）、`src/widget/period-bar/index.tsx`（pin/双区拖拽/全集弹窗，本地改造最密集处）、`src/types.ts`（内部类型，需与 `types.d.ts` 手工同步）、`vite.config.ts`（决定产物文件名与 external 边界）
- **关键数据流**：宿主 `datafeed.getHistoryKLineData` → `applyNewData` → `datafeed.subscribe` → 回调 `updateData`；左拖到视口边缘 → `loadMore` / `OnVisibleRangeChange` → `getHistoryKLineData` → `applyMoreData`
- **生命周期**：`KLineChartPro` 构造函数 `render()` 挂载 Solid 树，**没有 dispose() 对外方法**——实例释放完全由宿主的卸载逻辑负责（清空容器 + 注销订阅），因此"同页仅一个实例"是宿主与 vendor 共同承担的不变量（见 `chart-mount-lifecycle`）
- **扩展点**：上游官方给出的三个合法扩展位——`Datafeed` 四方法接口、`getChart()` 暴露的底层 klinecharts 实例（叠加 S/R、结构、SMC overlay 与图层开关都走这里）、CSS 变量 + `setStyles()` 双轨主题、`loadLocales` 语言注册

## 上下游关系

> `extracted` = 静态分析/代码可验证；`inferred` = Agent 推断待复核

| 方向 | 对端 | 关系说明 | confidence |
|------|------|---------|------------|
| 上游 | `frontend/src/components/chart/KLineChartProView.tsx` | 唯一实例化点：注入 datafeed/periods/pinned/locale，并 import `dist/klinecharts-pro.css` | extracted |
| 上游 | `frontend/src/api/datafeed.ts` | 实现 vendor 的 `Datafeed` 四方法契约（`BitgetDatafeed`） | extracted |
| 上游 | `frontend/src/lib/periodsStore.ts` | 提供 `pinnedTimeframes` 初值并接收 `onPinChange`，落 `raibro.pinnedTimeframes` | extracted |
| 上游 | `frontend/src/klinecharts-pro-theme.css` | 覆盖 vendor 的 `--klinecharts-pro-*` 变量与 chrome 尺寸，必须**在 vendor CSS 之后**引入 | extracted |
| 上游 | `openspec/specs/{klinecharts-pro-integration,klinecharts-pro-chart,chart-symbol-switch-race,chart-mount-lifecycle,timeframe-identifier-scheme,tv-template-shell}` | 把 vendor 的改造范围与禁止项写成可验收契约 | extracted |
| 下游 | `frontend/src`（运行时） | vendor 的 DOM 类名是宿主点击桥接的选择子（`.klinecharts-pro-period-bar .item.tools`） | extracted |
| 下游 | `frontend/src/vendor/klinechartsProRace.test.ts` | 对 `dist/klinecharts-pro.js` 做正则切片断言，重建产物即可能改断言 | extracted |
| 下游 | `frontend/tests/e2e/kline-realtime.spec.ts`、`quant-lab.spec.ts` | 以 vendor chrome 类名/画布断言用户旅程 | extracted |
| 下游 | `.github/workflows`（CI） | 依赖已提交的 `dist/`，CI 内不重建 vendor | inferred（提交信息 `1f5784c` 记载忽略 dist 曾导致 CI 缺模块） |
| 依赖 | `klinecharts@^9` (npm) | 产物把 `init/applyNewData/applyMoreData/loadMore/registerOverlay/dispose/utils/FormatDateType/DomPosition/ActionType/TooltipIconPosition` 声明为 external | extracted |
| 依赖 | 本机 `vendor/*/node_modules`（vite4/TS4.9/solid） | 仅重建 dist 时需要，不入库 | extracted |

## 已知限制与例外

- **Codemap 未索引本目录**：`get_graph_stats` 的 232 个文件不含 `frontend/vendor`。因此本模块文档承担符号定位职责——请用上面"分层结构"给出的路径直接 Read/编辑；对 vendor 内部函数用 `search_code`/`find_symbol` 会得到空结果，不要据此判断"代码不存在"。
- **上游文档不参与本仓库 lint/类型检查**：`docs/`（16 份 md，中英双语）与 `docs/.vitepress/` 是上游资产，只作接口/主题/i18n 的释义来源。摘要见 `frontend_vendor_klinecharts_pro_api.md` 末尾的「附：内置文档摘要」。
- **`frontend/.gitignore` 对本目录是反例**：其注释显式说明 `vendor/klinecharts-pro/dist` 属"故意提交"的产物；写 ignore 规则时不得用宽 `dist/` 再把它吞掉。
- **许可合规未自动化**：klinecharts-pro 为 Apache-2.0（`LICENSE` + 每文件版权头，允许修改但要求保留声明与变更说明），而 `tradingview-pro` 是 Google AI Studio 导出物（`metadata.json` 声明 `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`，无 LICENSE 文件），仅可作内部参考，不可对外分发或声称自有版权。
