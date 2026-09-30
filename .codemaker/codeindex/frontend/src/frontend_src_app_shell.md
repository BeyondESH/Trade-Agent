---
type: "Fragment"
id: frontend/src/app_shell
title: "桌面外壳与多标签工作区"
description: "谁决定屏幕上是图表还是市场概览？标签怎么增删/升级/固定，主题、字体、滚动条与中文文案的统一入口在哪里？"
parent: /frontend/src/_overview.md
fragment: app_shell
entity_names:
  constants:
    - name: DEFAULT_SYMBOL
      source: frontend/src/App.tsx
      value: "id/ticker=`BTCUSDT`、exchange=`USDT-FUTURES`、digits=2（占位符号：判定 `activeSymbol === DEFAULT_SYMBOL` 用于区分'还没拿到真实行情'"
    - name: DesktopViewMode
      source: frontend/src/types/trading.ts
      value: "\"chart\" | \"screener\" | \"heatmaps\" | \"markets\" | \"community\" | \"news\" | \"agent\"（+ DesktopTab.type 额外允许 \"dashboard\"）"
    - name: DEFAULT_THEME
      source: frontend/src/App.tsx
      value: "\"dark\"（theme 为组件内 state，未持久化到 localStorage）"
    - name: "--tv-accent / --tv-bg / --tv-panel / --tv-border / --tv-text / --tv-muted / --tv-up / --tv-down"
      source: frontend/src/index.css
      value: "dark: accent #2962ff, bg #131722, panel #1e222d, border #2a2e39, text #d1d4dc, muted #787b86, up #089981, down #f23645；light 只替换 bg/panel/border/text"
    - name: RIGHT_DOCK_DEFAULT_WIDTH
      source: frontend/src/components/sidebar/rightDockWidth.ts
      value: "280（min 260 / max 500；键 `raibro.rightDockWidth`）"
    - name: FONT_FAMILY_STACK
      source: frontend/src/lib/fonts.ts
      value: "\"Google Sans Flex Variable\", \"Noto Sans SC Variable\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif（必须与 index.css --font-sans 手工保持同序）"
    - name: tradingview-desktop-root
      source: frontend/src/App.tsx:836
      value: "外壳根 DOM id（品牌清理未改名，仍是 tradingview- 前缀）；index.css:101 与 E2E 都以它作布局锚点"
    - name: beyondether-desktop-titlebar
      source: frontend/src/components/desktop/DesktopTitleBar.tsx:102
      value: "标题栏 DOM id（已品牌化）。注意：与外壳根 id 的 `tradingview-` 前缀**不一致**，这是既有事实；要统一必须同一提交内同步 App.tsx / index.css / E2E"
    - name: "--tv-scrollbar-thumb / --tv-scrollbar-thumb-hover"
      source: frontend/src/index.css:20-21,32-33
      value: "滑块静置色 / hover 色：dark `#2a2e39`/`#787b86`、light `#c5c9d4`/`#787b86`；轨道透明且宽恒为 8px"
    - name: 自托管字体依赖
      source: frontend/src/index.css:3-8
      value: "`@fontsource-variable/google-sans-flex/wght.css`（拉丁/数字）+ `@fontsource-variable/noto-sans-sc`（CJK），均为 OFL-1.1；每个 @font-face 自带 unicode-range；运行时 MUST NOT 请求 fonts.googleapis.com / fonts.gstatic.com"
    - name: 功能图标来源
      source: 各组件 `import { … } from "lucide-react"`
      value: "线性 SVG 图标统一取自 lucide-react（24px 视框 / 1.2–1.5px 描边 / `currentColor`）；MUST NOT 用 emoji 或 `▼ ▃▂ ▦` 等 ASCII 字形充当功能图标"
retrieval_hints:
  - "用户点左侧导航/新建标签时，界面上'当前显示哪个视图'这段路由逻辑在哪？"
  - "为什么改了主题色，图表的周期栏还是原来的颜色？"
  - "要加一个全视图（比如'资金费率页'），需要动哪几个文件才算接进外壳？"
  - "所有中文文案能不能直接写在组件里？i18n 字典的收录规则是什么？"
  - "顶栏/图标条/底部 tab 的图标从哪来？能不能用 emoji 或 ▼ 这种字符画？"
  - "为什么离线/内网环境下字体不回落？字体能不能改回 Google Fonts CDN？滚动条的显隐能不能改成改宽度？"
  - "应用的品牌名是什么？代码里还能不能出现 TradingView / TV 字样？"
  - "⚠️ 你要找的是**品种搜索弹窗**：本模块只有 `CommandPaletteModal`（命令/动作面板）；交易品种检索的唯一入口是图表 datafeed 的 `searchSymbols`（见 `frontend_src_data_access.md`），MUST NOT 另建第二个品种搜索框或本地硬编码品种表。"
  - "⚠️ 如果你找的是 K 线画布/周期栏/价格线的渲染细节，不在这里——在 `frontend/src/chart`；本子文档只管外壳如何把图表挂进去。"
  - "⚠️ 如果你要找的是警报触发与下单的写路径规则，不在这里——在 `frontend/src/terminal_panels`；这里只保留 App 层的接线代码。"
  - "⚠️ 如果你要找 QUANT LAB / AI Agent 页面内部逻辑，在 `frontend/src/quant_lab`；外壳只提供 `activeView === \"agent\"` 这一个挂载点。"
  - "本模块也叫『桌面壳』『TV 模板外壳』『工作区路由』，对应需求里的『标签页』『左导航栏』『标题栏』『全局设置/快捷键弹窗』。"
  - "本子文档的排除句「数据层归属」只指**代码归属**（共享取数 helper 放 `lib/*.ts`），不是 SKILL 的分层架构术语；运行时时序上的「谁驱动谁」见 `_overview.md` 的「上下游关系」与「架构简析」。"
  - "架构归属：跨视图复用的取数 helper（纯函数 + 缓存 + 节流）放 `lib/*.ts`；只有要 setState 的才进 `hooks/*`；纯类型与枚举进 `types/trading.ts` 或 `api/types.ts`；MUST NOT 新建顶层目录。"
  - "架构归属：新的全视图必须走 `DesktopViewMode` 联合类型 + `handleNewTab`/`handlePromoteTab` 标题映射 + `GlobalNavRail.navItems` 三处登记，禁止另起一套 `useState` 页面切换。"
architectural_role: "表现层外壳：唯一持有 tab/activeSymbol/theme 等全局 UI 状态，禁止被面板组件反向持有副本"
---

## 业务意图：这一层到底在决策什么

外壳解决的是**"同一时刻用户在看哪个市场、哪个品种、哪套皮肤"**这三件事的唯一归属问题。它不是"页面容器"，而是**状态仲裁者**：`App.tsx` 持有 tabs 列表、activeTabId、activeSymbol、timeframe、theme、alerts、paper account、六个模态框的开关。所有面板通过 props 回调向外壳请求状态改变，不允许自己保存"当前品种"的副本——因为品种一旦有两份真相，右栏盘口、图表、警报就会各自跟着不同的 symbol 走（这是历史上盘口残留 bug 的根因）。

外壳同时是**中文界面的守门人**：`lib/i18n.ts` 的 `zh` 字典是全应用唯一的文案表，`t(key)` 未命中时回退原键（不抛错），因此新增文案的正确姿势是"英文键 → 中文值"追加，而不是在组件里写死。

## 对外接口（外壳暴露给下层的契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `onSelectSymbol(sym)` | 面板→外壳 | `SymbolInfo` | 换当前品种；外壳同时改写当前 chart 标签的 title/symbol | `App.handleSelectSymbol` |
| `onOpenChartWithTicker(ticker)` | 视图→外壳 | 纯 ticker 字符串 | 从筛选器/热力图/社区/新闻跳回图表；找不到 symbol 时**造一个 transient SymbolInfo** 并插到列表头 | `App.handleOpenChartWithTicker` |
| `onNewTab(type, ticker?)` / `onPromoteTab(type)` | 导航→外壳 | `DesktopViewMode \| "dashboard"` | 新建标签 vs 把 dashboard 标签就地升级为具体视图（同一 id，保持 active） | `App.handleNewTab` / `handlePromoteTab` |
| `onSymbolChange(proSymbol)` / `onPeriodChange(period)` | 图表→外壳 | klinecharts-pro 的 `SymbolInfo` / `Period` | 图表内部（原生搜索、周期栏）改了品种/周期，外壳必须回写 activeSymbol/timeframe，让右栏跟随 | `App.handleNativeSymbolChange` / `handleNativePeriodChange` |
| `api.order` → `api.orderConfirm` | 外壳→后端 | `token`、`side: long/short`、`leverage`、`price` | 下单两阶段：**只有 confirm 返回 `approved` 才更新本地持仓/挂单** | `App.handlePlaceOrder` |
| `KeyboardEvent`(全局) | 浏览器→外壳 | `Ctrl/Cmd+K/T/W`、`?`、`Space`、`Shift+Space` | 快捷键在 INPUT/TEXTAREA/SELECT 内一律不拦截 | `App` keydown effect |

## 典型调用链（关键数据流）

```
用户点击左导航 → GlobalNavRail.onSelectView
  → App.handleSelectGlobalRailView          ← 已有该类型 tab 就切过去，否则新建
    → activeView 派生自 tabs.find(activeTabId).type，非 dashboard 时渲染对应 View
      → activeView==="chart" 时装配：NativeChart + BottomTimebar + RightDock + BottomDock
        → NativeChart 内部换 symbol → onSymbolChange → App.setActiveSymbol
          → activeSeries 变化 → useCandles / useOrderBook / useTrades 全部重新订阅 ← 跨模块：data_access
```

## 实现约束清单

> 外壳相关改动在动笔前逐条核对。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `DesktopViewMode` | 见上 | `types/trading.ts` | 全视图枚举；新增视图**必须**同时扩这个联合类型 | `workspace.json` anti_pattern `[do_not]`（模板外壳不得自建页面切换） |
| `DEFAULT_SYMBOL` | BTCUSDT 占位 | `App.tsx` | 真实行情到达前的哨兵值，被 `activeSymbol === DEFAULT_SYMBOL` 引用 | — |
| 主题 token | `--tv-*` | `index.css` | 组件与 `klinecharts-pro-theme.css` 共用同一族变量 | openspec `design-system`：「系统 MUST NOT 在组件中硬编码颜色」 |
| `FONT_FAMILY_STACK` | 与 CSS 同序 | `lib/fonts.ts` | Canvas 专用：`ctx.font` 不解析 `var()`，必须自带字符串 | 见下条 [Canvas 字体] |

### 必须遵守的行为规则（可做 / 禁止）

- **[品牌不得回流] 任何用户可见文本、注释或 DOM id 中 MUST NOT 出现 "TradingView"/"Tradingview" 字样与 "TV" 徽标缩写，统一为 **BeyondEther**（缩写 `BE`；中文界面直接显示品牌原名，不写译名）；`lib/i18n.ts` 的 key 与值、`t()` 调用处必须同步改名，无引用的 key 保留改名而不是删除（如 `Verified BeyondEther Broker Integrations`）；`BROKERS_CATALOG` 的模拟券商条目为 `BeyondEther Paper Trading` / `logo: "BE"` / `id: "paper-be"`。** 由来：模板外壳是第三方 Tv 系设计，品牌痕迹不清理就等于对外宣称是别家产品。（来源: openspec/specs/beyondether-branding/spec.md）
- **[图标规格] 功能图标一律线性 SVG（现为 `lucide-react`）：24px 视框、描边 1.2–1.5px、无填充（选中态换描边色）、颜色只取主题文字 token（`currentColor`），按钮命中区 28×28；MUST NOT 在组件内硬编码图标色值，MUST NOT 新增 emoji / ASCII 字形图标。** 由来：emoji 在不同平台字形/基线不同，会让 44px 图标条的视觉锚定失效。（来源: openspec/specs/tv-icon-system/spec.md）
- **[滚动条：宽度不变、只改透明度] 轨道宽恒为 8px；显隐靠滑块 `background-color` 透明度过渡，MUST NOT 通过改宽度/`display` 实现——否则内容区会在 hover 时横向位移（"布局抖动"）。着色只取 `--tv-scrollbar-thumb(-hover)`，不得写裸色值，否则双主题下会退回系统原生配色。** `@media (prefers-reduced-motion: reduce)` 下必须取消过渡并直接可见。（来源: openspec/specs/themed-scrollbar/spec.md + `index.css:121-178`）
- **[`no-scrollbar` 的适用范围与层叠前提] `no-scrollbar` 由 Tailwind v4 `@utility` 定义，只用于"无信息价值"的横向控件条（tab 条 / 分类 chip 条），且 MUST NOT 占用或压缩容器可用高度（历史 bug：滑块槽位吃掉了 tab 条高度）；纵向长列表（新闻/自选/持仓）必须用隐式滚动条以保留滚动位置感知。标准属性那份基础规则必须留在 `@layer base` 内——**放到 layer 之外（未分层）会因优先级高于分层 utility 而使 `scrollbar-width: none` 失效**（`index.css:149-155` 注释即为该回归的记录）。**（来源: openspec/specs/themed-scrollbar/spec.md）
- **[字体自托管] 正文字体一律来自 npm 依赖（`@fontsource-variable/*`，OFL-1.1，随构建产物输出，版本由 lockfile 锁定），运行时 MUST NOT 向任何第三方字体 CDN 发起请求；新字体必须允许再分发且自带 `unicode-range` 分片。** 由来：交易终端可能在隔离网段运行，外链字体一旦不可达就会整体回落系统字体（中文错位/缺字方块）。（来源: openspec/specs/webfont-self-hosting/spec.md）
- **[i18n 收录规则]** `t()` 未命中时回退原键（不抛错），因此新增文案必须是"英文键 → 中文值"追加到 `lib/i18n.ts`，且优先复用既有键（`Order Book (DOM)` / `Day Range` / `24h Volume` / `Loading...` / `All Loaded` 等）；空态、失败态与按钮文案都要过 `t()`。例外：`components/views/agent/**` 的硬编码中文为已记录豁免（见 `frontend_src_quant_lab.md`）；而 tab 标题等目前仍是硬编码中文字面量的位置，需求要求可译时必须改成 `t()` 查表。（来源: openspec/specs/ui-i18n-zh/spec.md）
- **[数字列等宽] 价格/数量/时间戳等数字列必须走 `.font-mono` / `.tnum`（`font-variant-numeric: tabular-nums`，字体族仍继承 `--font-sans` 以免中文断裂）——否则行情表在刷新时会左右抖动，用户无法扫读列。**（来源: `index.css:106-111` + openspec/specs/ui-i18n-zh/spec.md §统一中文字体栈）
- **[配色必须走 token，但存量是裸 hex]** `design-system` 要求"MUST NOT 在组件中硬编码颜色"，shadcn 层由 `index.css` 的 `--background/--foreground/...` 映射到 `--tv-*` 满足。现实偏差：**`components/` 下 55 个 `.tsx` 文件仍用 `isDark ? "#2a2e39" : "#e0e3eb"` 这类裸 hex 三元分支**（`WatchlistPanel`、`RightDock`、`DesktopTitleBar` 等），只有 2 个文件走 token 类。后果：**改 `--tv-*` 不会自动传导到这些面板**，"面板变了、图没变"（或反之）就是这么产生的。因此：新增样式必须写 token 类（`bg-background` / `text-foreground` / `border-border`），MUST NOT 再加一份裸 hex 三元；每次改 token 必须按"哪些面板仍是硬编码"复查一遍。（来源: openspec/specs/design-system/spec.md + 源码统计 `grep -rl "\[#......\]" components | wc -l` = 55）
- **[前端源码内禁止残留 `.vue`]** `frontend/src` 下 MUST NOT 存在 `.vue` 单文件组件，构建配置也不得依赖 Vue SFC 扫描（React 迁移的遗留清理项）。遇到 `.vue` 视为需要删除的死文件，MUST NOT 为其补构建配置。（来源: openspec/specs/design-system/spec.md §Tailwind 内容扫描）
- **[双主题只换色]** light/dark 切换 MUST NOT 改变布局尺寸与涨跌色（`--tv-up #089981` / `--tv-down #f23645` 在两主题下相同）——避免用户切主题后交易习惯被重排。（来源: openspec/design-system）
- **[Canvas 字体不回落]** 任何写进 `ctx.font` 的字体栈都必须取 `FONT_FAMILY_STACK`，且顺序为西文在前、中文在后；两者任一改动必须同步 `index.css --font-sans`。理由：klinecharts 的坐标轴/十字光标文字是一次性光栅化，不随 `@font-face` 下载完成而重绘。（来源: frontend/src/lib/fonts.ts 注释 + openspec/design-system）
- **[快捷键要让位于输入框]** 判断 `e.target.tagName ∈ {INPUT,TEXTAREA,SELECT}` 时直接 return，不得 preventDefault 用户输入。全局单键绑定 MUST NOT 选方向键（会打断原生滚动）、MUST NOT 覆盖浏览器保留组合（Ctrl+Tab/Ctrl+Shift+T/Ctrl+PageUp）。（来源: frontend/src/App.tsx:613 anti_pattern + openspec/terminal-interactions）
- **[单图中心区]** 中心图表区必须是**单个** klinecharts-pro 终端，MUST NOT 恢复多图表网格/唯一活动格/跨格同步。（来源: openspec/tv-template-shell「外壳 MUST NOT 包含多图表网格视图」）
- **[静态标签的代价]** Tab 标题映射目前是**硬编码中文字面量**（"Markets"/"Screener"/"AI Agent" 未过 `t()`）。新增 tab 类型时若只做这一处，标题会不受主题/语言开关影响——需求要求可译时，必须改成 `t()` 查表。
- **[警报不自动申请通知权限]** 通知授权请求必须发生在用户点击告警开关的事件处理器内部；MUST NOT 在挂载时申请。（来源: openspec/alerts-local + `lib/alertNotify.ts` 注释）
- **[Reset Funds 只碰本地]** 「重置资金」清空的是模拟账户的初始值（50000 权益 / 零持仓 / 零挂单），MUST NOT 触达后端 `/account/reset` 之类接口——后端纸面账户状态是权威，UI 重置不得假装清掉它。（来源: openspec/trading-ui「该控件 SHALL 仅作用于本地模拟账户」）

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 全局 UI 状态位置 | 集中在 `App.tsx` 用 `useState` + props 下发 | 引入全局 store/context | 面板数量固定、层级浅；集中一处才能让"切 symbol 必须同时改 5 个下游"这种联动可被一个 diff 审到 |
| 从仪表盘进入具体视图（dashboard 卡片） | 复用同一 tab（`handlePromoteTab` 原地改 type/title） | 关掉 dashboard 再新建 tab | 保住 tab id 连续性，E2E 与用户已展开的面板状态不被重建；`dashboard` 视图自身必须 `overflow-y-auto`（内容超高时只在本视图内滚动），而**内容不溢出时 MUST NOT 出现任何滚动条**（`overflow-hidden` 留在外层）（来源: openspec/specs/dashboard-view/spec.md） |
| 找不到 ticker 时的跳转 | 造 transient SymbolInfo 插到列表头 | 静默失败 | 热力图/社区里的股票 ticker 本就不在 Bitget 目录；不创建就没法响应点击，但**它的价格是假的**，依赖该值的下游必须视为非实时（见「变更风险」） |

## 变更风险：动这里会破坏什么

- **把品牌字样或 emoji 图标改回来/新增**：违反 `beyondether-branding` + `tv-icon-system`，后果是"对外看起来是另一家产品"，且 emoji 的字形/基线随平台变→44px 图标条的视觉锚定与点击命中区失准。
- **把字体改回第三方 CDN 或直接写 `font-family` 字面量**：违反 `webfont-self-hosting`。后果：离线/内网部署时西文与中文一起回落系统字体（Canvas 早已把兑底字体光栅化，不会重绘）；若是"多处各自维护字体栈"，则 DOM 与图表文字会呈现不同字形。
- **用宽度变化实现滚动条显隐，或把基础滚动条规则移出 `@layer base`**：后果一——hover 时内容横向位移（视口重排）；后果二——`no-scrollbar` 失效，tab 条/分类 chip 条的清槽位又重新吃掉可用高度（`5ae72e6` 修的就是这个）。
- **给纵向长列表套 `no-scrollbar`**：用户失去滚动位置感知（列表里不知道自己在哪、还剩多少）。
- **在面板里再加一处裸 hex 三元分支**：等于把"双主题同步"的责任又复制一份；将来改 token 时这一处永远漏掉，表现为某个面板在 light 主题下仍是深色块。
- **把品牌字样或 `tradingview-desktop-root` 之类的 id 顺手改掉**：`index.css:101` 与 `frontend/tests/e2e` 直接以该 id 定位，改名必须在同一提交内三处同步（源码 / CSS / E2E），否则是端到端红灯而不是样式问题。
- **改 `handleSelectSymbol` / `handleOpenChartWithSymbol` 的判定条件**：`handleOpenChartWithSymbol` 用 `activeSymbol.id === sym.id` 短路返回，否则会把 `DEFAULT_SYMBOL` 的默认 timeframe 覆盖掉真实品种。短路写坏 → 每次点击自选列表都会重置图表周期。
- **在标签标题里塞动态值**：`handlePromoteTab` 的 `as DesktopViewMode` 断言与 `newLabels` 表必须同步，漏一个视图会导致 dashboard 切换后标题与内容不一致（不是崩溃，是静默错位，最难查）。
- **新增 transient symbol 的使用面**：它带硬编码 price/change24h。任何消费 `symbols[]` 数值的新面板都可能显示假数据，违反「有真实数据源的表面 MUST NOT 渲染硬编码模拟数值」。（来源: openspec/ui-affordance-integrity）
- **删除某个控件而不删状态**：`App.tsx` 中 `indicators` 被写成 `const [indicators] = useState([])`，`events`、`backtestResult`、`isLogScale/isPercentScale/isAutoScale`、`selectedRange` 等 state **当前只下发不被消费**——因为对应真实能力已删除。它们是"接口仍在、实现已空"的位置，改动前必须确认是否应一并清理，否则需求会误挂到已死的开关上。
- **改外壳根 id 或 `#bottom-dock` 等 id**：Playwright L3 journeys 直接按 id 定位，改名即端到端失败。

## 跨模块依赖

| 依赖模块/子文档 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `frontend/src/data_access` | 品种目录、实时 ticker、盘口、成交都来自这里 | `useRealSymbols` `useOrderBook` `useTrades` `api` | extracted |
| `frontend/src/chart` | 中心图表区挂载与主题/周期回写 | `NativeChart` `toProSymbol` `periodToTimeframe` | extracted |
| `frontend/src/terminal_panels` | 右栏/底栏容器与其宽度规则 | `RightDock` `BottomDock` | extracted |
| `frontend/src/quant_lab` 与 `market_views` | `activeView` 分支挂载点 | `AgentView` `MarketsView` `ScreenerView` … | extracted |
| `lib/alertsStore` `lib/alertNotify` `lib/toastStore` | 警报实体、触发、通知与 toast | `syncAlertsFromServer` `evaluateAlerts` `notifyAlert` `pushToast` | extracted |
| `lib/i18n` | 全部可见文案 | `t` | extracted |

> 反向：`frontend/tests/e2e/*.spec.ts` 与 `src/**/*.test.tsx` 依赖外壳的 DOM id、tab 顺序与中文文案；这些是本子文档所列契约的消费方。

## 术语对照（需求语言 → 代码）

| 需求/口语 | 代码里的名字 | 位置 |
|---|---|---|
| 工作区标签 / tab | `tabs: DesktopTab[]`、`activeTabId` | `App.tsx` |
| 左侧竖排导航 | `GlobalNavRail` | `components/desktop/GlobalNavRail.tsx` |
| 顶栏（含通知铃铛） | `DesktopTitleBar` + `triggeredAlerts` prop | `components/desktop/DesktopTitleBar.tsx` |
| 搜索面板 / 命令面板 | `CommandPaletteModal` | `components/modals/CommandPaletteModal.tsx` |
| 快捷键帮助 | `KeyboardShortcutsModal`（`KEYGROUPS`/`KEYS` 两表） | `components/modals/KeyboardShortcutsModal.tsx` |
| 颜色主题设置 | `DesktopSettingsModal` + `onToggleTheme` | `components/modals/DesktopSettingsModal.tsx` |
| 弹窗提示（右下/右上 toast） | `ToastHost` + `pushToast`/`useToasts` | `components/ToastHost.tsx`、`lib/toastStore.ts` |

## 文件组成与覆盖（本子文档负责的文件）

| 组 | 文件（相对 `frontend/src/`） |
|---|---|
| 入口 | `App.tsx`、`main.tsx`、`test-setup.ts` |
| 外壳 | `components/desktop/DesktopTitleBar.tsx`、`components/desktop/GlobalNavRail.tsx` |
| 模态 | `components/modals/CommandPaletteModal.tsx`、`components/modals/CreateAlertModal.tsx`、`components/modals/DesktopSettingsModal.tsx`、`components/modals/KeyboardShortcutsModal.tsx`、`components/modals/OrderModal.tsx` |
| 通知出口 | `components/ToastHost.tsx` |
| UI 原语 | `components/ui/badge.tsx`、`components/ui/button.tsx`、`components/ui/card.tsx`、`components/ui/popover.tsx`、`components/ui/slider.tsx`、`components/ui/table.tsx`、`components/ui/tabs.tsx`、`components/ui/tooltip.tsx`（Radix + `--tv-*` token 层，QUANT LAB 共用） |
| 样式 | `index.css`（token + 排版 + 隐式滚动条 + `no-scrollbar` utility）、`klinecharts-pro-theme.css`（图表 chrome 覆盖） |
| 共享 | `lib/i18n.ts`、`lib/toastStore.ts`、`lib/utils.ts`（`cn`）、`lib/fonts.ts`（Canvas 用字体栈字符串，必须与 `--font-sans` 同序）、`types/trading.ts` |
| 视图宿主 | `components/views/DashboardView.tsx`（dashboard 标签的卡片页，`onOpen(type)` → `handlePromoteTab`） |
| 测试 | `components/desktop/DesktopTitleBar.test.tsx`、`components/modals/DesktopSettingsModal.test.tsx`、`components/modals/CreateAlertModal.test.tsx`、`lib/i18n.test.ts`、`lib/toastStore.test.ts` |
