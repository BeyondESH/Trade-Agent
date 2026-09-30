---
type: "Fragment"
id: "frontend/vendor/klinecharts_pro_api"
title: "图表引擎对外契约"
description: "宿主接入 vendored 图表引擎时能调什么、必须提供什么、哪些默认值绝不能依赖？"
parent: /frontend/vendor/_overview.md
fragment: klinecharts_pro_api
entity_names:
  constants:
    - name: "Datafeed 四方法（接口契约）"
      value: "searchSymbols / getHistoryKLineData / subscribe / unsubscribe"
      source: frontend/vendor/klinecharts-pro/types.d.ts
    - name: "default theme"
      value: "'light'（宿主显式传 'dark'）"
      source: frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx
    - name: "default locale"
      value: "'zh-CN'"
      source: frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx
    - name: "default timezone"
      value: "'Asia/Shanghai'"
      source: frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx
    - name: "default drawingBarVisible"
      value: "true"
      source: frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx
    - name: "default mainIndicators / subIndicators"
      value: "['MA'] / ['VOL']"
      source: frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx
    - name: "fallback periods（上游内置周期集）"
      value: "1m,5m,15m,1H,2H,4H,D,W,M,Y（10 项，无秒级、无 3m/6h/3d/1mo）"
      source: frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx
    - name: "price/volume precision 兜底"
      value: "pricePrecision ?? 2, volumePrecision ?? 0"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
    - name: "CSS 主题变量集合"
      value: "primary / hover-background / background / popover-background / text / text-second / border / selected 共 8 个 --klinecharts-pro-*"
      source: frontend/vendor/klinecharts-pro/docs/theme.md
    - name: "亮色主题上游默认色"
      value: "primary #1677ff、text #051441、border #ebedf1"
      source: frontend/vendor/klinecharts-pro/docs/theme.md
    - name: "i18n 未命中回退"
      value: "返回 key 本身（`locales[locale]?.[key] ?? key`）"
      source: frontend/vendor/klinecharts-pro/src/i18n/index.ts
    - name: "指标 tooltip 图标 id"
      value: "visible / invisible / setting / close（fontFamily 'icomoon'）"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
retrieval_hints:
  - "接入 vendored 图表时要构造哪些参数？哪些是必填？"
  - "图表引擎能返回底层 klinecharts 实例吗？我要往上叠支撑压力线该走哪个入口？"
  - "周期条上显示哪些周期，是在哪一层决定的？"
  - "⚠️ 如果你要找的是宿主自己那套 `NATIVE_PERIODS`（Bitget 原生 15 档）与 pinned 偏好读写，不在这里，在 frontend/src 的 frontend_src_chart 子文档"
  - "⚠️ 如果你要找的是图表配色/水印具体值（#089981 涨、#f23645 跌、3-5% 文本水印），契约在 openspec，落地覆盖在 frontend/src/klinecharts-pro-theme.css，本处只给可覆盖的变量名清单"
  - "⚠️ 如果你要找 K 线数据的来源与实时推送协议，不在这里，在 backend/src 与 frontend/src 的 data_access 子文档"
  - "本模块也叫 Pro 图表 / klinecharts-pro / 开箱图表引擎，对应需求中的「图表引擎接入」与「原生 chrome」"
  - "架构归属：新增图表能力优先走 `getChart()` 暴露的内核实例（overlay/indicator/scrollToRealTime），不可在此契约外新增 vendor 私有导出；确需 vendor 改造见 klinecharts_pro_patch 子文档"
  - "架构归属：`ChartProOptions` 加字段时必须同时改 `src/types.ts` 与根级 `types.d.ts`，两者无编译期校验"
architectural_role: "契约层（宿主与外部引擎的唯一接口面）"
---

## 业务意图

本子文档回答"本项目与外部图表引擎之间的合同是什么"。vendored 引擎替宿主管住了所有图表 chrome 的交互语义（周期条、绘图工具条、指标增删与参数、时区、语言、截图、全屏、品种搜索），宿主只需要负责三件事：**喂数据**（实现 `Datafeed`）、**给周期与品种集合**（`periods`/`pinnedTimeframes`）、**接回调**（`onSymbolChange`/`onPeriodChange`/`onPinChange`）。把这条边界写清楚的业务价值是：交易终端上"看到的 K 线"与"后端存的数据"之间的责任划分不再含混——引擎只保证渲染与交互正确性，价格权威性与补历史由宿主 datafeed 负责。

## 对外接口

引擎导出面固定为 `src/index.ts` 的三项（`KLineChartPro`、`DefaultDatafeed`、`loadLocales`）+ 六个类型。导入方只有 `frontend/src`，无第二消费者。

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `KLineChartPro` 构造 | 宿主→引擎 | 必填 `container`、`symbol`、`period`、`datafeed`；可选 `theme/locale/timezone/styles/watermark/drawingBarVisible/periods/mainIndicators/subIndicators/pinnedTimeframes` | 实例化唯一图表；缺 `datafeed` 时 TS 拒绝编译 | `frontend/vendor/klinecharts-pro/src/KLineChartPro.tsx`（构造内 `render(<ChartProComponent/>)`） |
| `Datafeed.getHistoryKLineData` | 引擎→宿主（回调式拉取） | `(symbol, period, from, to) → Promise<KLineData[]>` | 首次加载与左拖取历史各调一次；**返回空数组即被引擎解释为"到头了，不再拉"** | `src/ChartProComponent.tsx:loadOlderData` / 取数 effect |
| `Datafeed.subscribe / unsubscribe` | 引擎→宿主 | `(symbol, period, callback)` / `(symbol, period)` | 切换周期/品种时先 `unsubscribe(prev)` 再 `subscribe(next)`；callback 即 `updateData` | `src/ChartProComponent.tsx` 取数 effect |
| `Datafeed.searchSymbols` | 引擎→宿主 | `(search?) → Promise<SymbolInfo[]>` | 原生品种搜索框输入时触发；本项目另有外壳搜索入口，须避免两个入口把图表留在错品种上（`chart-shell-integrity`） | `src/widget/symbol-search-modal/index.tsx` 经 `ChartProComponent` |
| `ChartPro.setSymbol/getSymbol/setPeriod/getPeriod/setTheme/setStyles/setLocale/setTimezone/getChart` | 宿主→引擎命令面 | `getChart(): Chart \| null` | 命令式驱动：外部（自选列表、命令面板、快捷键、警报跳转）改图表，以及往内核叠 overlay/指标图层 | `src/KLineChartPro.tsx` 转发 `props.ref` |
| `onSymbolChange / onPeriodChange / onPinChange` | 引擎→宿主事件 | `SymbolInfo` / `Period` / `string[]` | 用户在**原生 chrome 内**改品种、周期、固定周期时回传，驱动应用 `activeSymbol`/timeframe/右侧 dock | `src/ChartProComponent.tsx`（`props.onPinChange`） |
| `loadLocales(locale, messages)` | 宿主→引擎 | key 覆盖表 | 运行时注册/覆盖语言包（内核 locale 另需 `klinecharts.registerLocale`） | `src/i18n/index.ts:load` |

> 无自定义线协议、无存档字段（持久化在宿主侧）。

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `klinecharts@9`（npm peer） | 契约里 `KLineData`/`SymbolInfo.pricePrecision`/`Styles`/`Chart`/`overlay`、以及主副图指标 API 全部来自内核类型与内核实例 | `Chart`、`KLineData`、`Styles`、`createIndicator`、`scrollToRealTime` | extracted |
| `solid-js`（bundled） | 组件树由 Solid 渲染并已被打进产物，宿主无需安装 | `render`/`createSignal`/`createEffect`（不跨边界暴露） | extracted |

反向依赖（谁调用了本契约）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `frontend/src/components/chart/KLineChartProView.tsx` | 构造实例、`useImperativeHandle` 转发命令、桥接原生工具按钮 | `KLineChartProHandle`、`NATIVE_TOOL_INDEX` |
| `frontend/src/api/datafeed.ts` | 实现 `Datafeed` 四方法（REST 历史 + Bitget WS 实时） | `BitgetDatafeed`、`toSeries` |
| `frontend/src/components/chart/NativeChart.tsx`、`views/agent/SignalKLineChart.tsx` | 单图容器与信号 K 线小图共用同一契约类型 | `toProSymbol` |
| `frontend/src/klinecharts-pro-theme.css` | 通过 CSS 变量与 chrome 选择子做主题覆盖（必须在 vendor CSS 之后引入） | `--klinecharts-pro-*` |

## 典型调用链

### 首次挂载与取数
```
KLineChartProView useEffect → vendor KLineChartPro.tsx:constructor      ← 本模块入口
  → ChartProComponent.tsx:onMount → klinecharts.init + createIndicator(MA/VOL)  ← 跨模块：klinecharts
  → ChartProComponent.tsx:取数 effect → datafeed.getHistoryKLineData     ← 跨模块：frontend/src（BitgetDatafeed）
    → applyNewData → datafeed.subscribe → updateData                     ← 跨模块：klinecharts
```

### 外部驱动切品种 / 原生操作回传
```
自选列表点击 → KLineChartProHandle.setSymbol → KLineChartPro.tsx:setSymbol
  → 取数 effect（比较 ticker 后 unsubscribe(prev) → 重新拉数 → subscribe）      ← 本模块
原生品种搜索选中 → onSymbolChange → KLineChartProView → App 更新 activeSymbol   ← 跨模块：frontend/src
  → 右侧盘口/成交/数据窗口跟随切换
```

## 实现约束清单

### 必须显式传入的参数（不得依赖默认值）

| 参数 | 引擎默认值 | 为什么必须覆盖 | 约束由来 |
|------|-----------|---------------|---------|
| `periods` | 上游 10 档（`1m,5m,15m,1H,2H,4H,D,W,M,Y`） | 默认集含交易所不存在的合成级别，且缺 3m/6h/3d/1mo 与全部秒级 → 会展示后端无数据的周期 | `timeframe-identifier-scheme` / `kline-native-period-selector`：周期集合须为 Bitget 原生全集，MUST NOT 含合成级别 |
| `theme` | `'light'` | 终端为深色，不覆盖则 chrome 出现白底 | `chart-theming`（TV 风格配色） |
| `locale` | `'zh-CN'` | 恰好与需求一致，但宿主仍显式传，避免上游换默认值 | `klinecharts-pro-integration`：默认 `locale:'zh-CN'`，UI 中文显示 |
| `timezone` | `'Asia/Shanghai'` | 时间轴/十字光标标签基准；改动会导致多端时间读数不一致 | 代码内固化默认，宿主跟随 |
| `datafeed` | 无默认（必填） | **禁止**用 `DefaultDatafeed`（polygon.io + 需 API key + 外网） | 数据单一来源：K 线/实时一律走本仓库后端与 Bitget WS（`klinecharts-pro-chart`、`chart-shell-integrity`） |
| `watermark` | 上游 Logo SVG | 需求为 3–5% 透明度文本水印（品种·周期·交易所），随品种更新 | `chart-theming` |

### 主题/国际化的合法定制通道（只此两条）

| 通道 | 载体 | 说明 |
|------|------|------|
| CSS 变量（chrome DOM） | `.klinecharts-pro` 容器上的 8 个 `--klinecharts-pro-*` | 覆盖点：主色、hover 背景、背景、popover 背景、正文色、次级文字色、边框、选中色；暗色以 `[data-theme="dark"]` 作用域覆盖 |
| `setStyles(DeepPartial<Styles>)`（画布内容） | 内核样式树（蜡烛/网格/十字光标/指标tooltip） | 画布像素不走 CSS；配色变更 MUST NOT 改变 props 语义与数据流（`chart-theming` 的"数据流不变"场景） |
| i18n | `loadLocales` + `src/i18n/{zh-CN,en-US}.json` | 未命中的 key **原样回显 key**（英文短词），不会报错——所以漏配只在界面上被发现 |

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| chrome 由谁提供 | 全部用引擎原生 chrome（绘图条/周期条/品种搜索/四个弹窗），宿主只留 datafeed 与联动的胶水 | 宿主自建工具条 + 隐藏原生 chrome | 早期实现过"隐藏原生周期栏 + 自建"，两套 chrome 争抢同一状态导致不同步；`klinecharts-pro-integration` 现明确以原生为唯一 chrome，并禁止用 CSS 隐藏周期栏 |
| 打开原生弹窗的方式 | 宿主以 `querySelectorAll('.klinecharts-pro-period-bar .item.tools')[index].click()` 模拟点击 | 在 vendor 上开新导出函数（如 `openIndicatorModal()`） | 事实约束：Solid 实例的命令面 `ChartPro` 不含各 modal 的 opener。当前选择保留零 fork 差异但把耦合度记在 `klinecharts_pro_patch` 的脆弱点清单里 |
| 主副指标默认 | 引擎 `MA` + `VOL` 作为入参显式给定，宿主叠加自己的指标 | 依赖默认常量 | 默认值是上游语义而非本项目语义；S/R、结构、SMC 走 `getChart()` 叠加，不改 `mainIndicators` 数组 |

## 变更风险

- 在 `ChartPro` 命令面新增/删除方法 → 不同步 `types.d.ts` 就会出现"宿主 typecheck 报错但运行时其实可用"（或反向的运行时 undefined），影响面是**所有**图表命令：切周期、改主题、程序化 overlay、`resetView`。
- 把 `getHistoryKLineData` 的"空数组 = 到头"语义改成"空数组 = 这次没有，继续试" → 引擎在左拖时不再拉历史，用户在深历史场景看到白屏（该语义由 `canLoadMore` 承载，见 patch 子文档）。
- 调整主/副指标的 pane 划分（`candle_pane` 复用 vs 新 pane）→ 直接违反 `chart-shell-integrity` 的"主图与副图不得视觉重叠"，并连带底部 dock 与图表互相遮挡。
- 复用 `DefaultDatafeed` 或让 `datafeed` 可选 → 引入外网依赖与密钥依赖，破坏"离线可跑 + 数据单一来源"两条既有不变量，并令 L2/L3 测试（live/e2e）失去可重复性。

## 附：内置文档摘要

- `docs/data-access.md`：官方数据接入两步法——实现 `searchSymbols/getHistoryKLineData/subscribe/unsubscribe`，再作为 `datafeed` 传入；默认数据源为 polygon.io，需自行申请 API key（本项目不启用）。订阅与反订阅均在品种/周期变化时被触发。（来源: `frontend/vendor/klinecharts-pro/docs/data-access.md`、`docs/en-US/data-access.md`）
- `docs/theme.md`：内置 `light`/`dark` 两主题；定制主题需**同时**做两件事——`setStyles()` 定制核心图表样式，以及覆盖 `.klinecharts-pro` / `[data-theme="dark"]` 上的 8 个 CSS 变量。（来源: `frontend/vendor/klinecharts-pro/docs/theme.md`）
- `docs/i18n.md`：内置 `en-US`/`zh-CN`，默认 `zh-CN`；新增语言要分别注册内核 locale（`klinecharts.registerLocale`）与 Pro locale（`loadLocales`）。（来源: `frontend/vendor/klinecharts-pro/docs/i18n.md`）
- `docs/introduction.md`：官方定位——Pro 是"在 KLineChart 上封装一层 UI"，目标用户是不想投入精力做 UI 的人；**对自定义要求极强的用户，官方建议直接基于 KLineChart 自行封装**。这条正是本项目"fork 后只做最小定点改造，不重排其架构"的由来（与 openspec 的"最小改造"要求一致）。（来源: `frontend/vendor/klinecharts-pro/docs/introduction.md`）

> 📄 本节内容来源于仓库内置文档：`frontend/vendor/klinecharts-pro/docs/{data-access,theme,i18n,introduction}.md`（原文已提炼，非完整转录）
