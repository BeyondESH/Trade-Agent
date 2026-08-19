## Context

三项诉求分别落在样式层、组件层与布局层，彼此存在真实耦合，必须一并设计。

**当前状态（已核对代码）：**

- `frontend/src/index.css` 共 59 行，仅含字体导入、`--tv-*` 双主题变量与字体栈，**无任何滚动条样式**。
- `.no-scrollbar` 被 13 个组件引用，但 Tailwind v4（`@import "tailwindcss"` + `@tailwindcss/vite`）未定义该类，`tailwind.config.js` 的 `plugins: []` 为空 → 该类当前**完全无效**，所有滚动区暴露原生滚动条。
- `NewsPanel.tsx:52` 分类栏为 `flex ... overflow-x-auto no-scrollbar`，10 个 `NEWSFLASH_TYPES` 单行堆叠横滚；`NewsPanel.tsx:89` 直接渲染 `item.time`，而 `newsfeed.ts` 的 `parseBlockbeatsTime` 返回 **ISO 字符串**，故界面显示 `2026-01-01T00:00:00.000Z` 一类原始时间戳。
- `BottomDock.tsx:143` 抽屉高度硬编码 `isMaximized ? 'h-[420px]' : 'h-[230px]'`，外层 `overflow-hidden`。
- `App.tsx:667` 根容器 `h-screen overflow-hidden`；`App.tsx:702` `<main>` `overflow-hidden`；`App.tsx:704`、`:706`、`:708` 三层 `overflow-hidden` → **全链路禁止滚动**，这是诉求 3 必须打破的约束链。

**硬约束：**

- `KLineChartProView.tsx:216` 图表容器为 `w-full h-full min-h-0`，且 `:162` 在挂载后调用 `pro.getChart()?.resize()`。klinecharts-pro 依赖容器**确定高度**测量画布；若把图表放进 `height: auto` 的滚动流中，容器高度会塌陷或随内容漂移，图表将渲染异常。这是本设计最大的技术约束。
- `openspec/specs/design-system` 要求"组件 MUST NOT 硬编码颜色"、"次级控件 hover 才显现"、"数字 `tabular-nums`"、圆角分级 4/6/8px。滚动条与新闻排版都必须遵循。
- `openspec/specs/bottom-dock` 现行要求"抽屉高度 MUST 显式等于 heightVh、MUST NOT 撑开图表"，与诉求 3 直接冲突，需通过 delta spec 显式改写（已在 proposal 中登记为 Modified Capability）。
- `openspec/specs/right-sidebar` 现行要求"SHALL NOT 出现 News tab"，但代码 `RightDock.tsx:91` 已有 News tab 且接入 BlockBeats，spec 与实现已偏离，本次一并纠正。

## Goals / Non-Goals

**Goals:**

- 建立**单一**主题化滚动条样式源，静置隐式、hover 渐显、双主题 token 着色、宽度恒定不引起布局回流；并使既有 13 处 `.no-scrollbar` 引用产生真实效果。
- 市场头条分类栏摆脱"单行横滚堆叠"，活动分类始终可见。
- 市场头条新闻列表提升信息密度与可读性：相对时间、日期分组、行数截断、hover 渐显次级操作。
- 底部抽屉展开时，用户可通过**向下滚动工作区**看完整个底部模块，而不是在抽屉内二次滚动。
- 在打破 `overflow-hidden` 链的同时，**保证 klinecharts-pro 始终拿到确定高度**。

**Non-Goals:**

- 不引入滚动条相关的第三方库（如 OverlayScrollbars / SimpleBar）。
- 不改动 `NEWSFLASH_TYPES` 的 10 项分类集合，也不改后端与 `api.blockbeatsNews` 契约。
- 不改动 `parseBlockbeatsTime` / `toNewsItem` 的既有返回契约（`NewsCalendarView` 复用同一函数，改契约会波及全屏视图）。
- 不实现右侧栏宽度拖拽、底部抽屉上缘拖拽（`right-sidebar` / `bottom-dock` 既有需求，本次不触碰）。
- 不改动图表内部渲染、指标或数据源。

## Decisions

### D1. 滚动条实现方式：原生 CSS 伪元素 + 标准属性双写，不引入库

选择 `::-webkit-scrollbar` 系列（Chromium/Electron 生效）配合标准 `scrollbar-width` / `scrollbar-color` 双写。

- **为何不用 JS 库**：本项目是 Electron 风格桌面壳，渲染层锁定 Chromium，`::-webkit-scrollbar` 支持完整；引入库会增加包体、需包装每个滚动容器、且与 13 处既有 `overflow-*` 用法冲突。
- **为何双写**：`::-webkit-scrollbar` 是非标准且未来可能弃用，标准属性作为前向兼容兜底。二者可共存，Chromium 优先伪元素。

### D2. "隐式显示"通过滑块 `background-color` 透明度过渡实现，而非改宽度

滚动条**轨道常驻占位、宽度恒定 8px**，静置时滑块 `background-color: transparent`，容器 `:hover` / 滚动时滑块渐显为 token 色。

- **为何不用 `width: 0 → 8px`**：改变滚动条宽度会触发容器内容区重排（reflow），在包含表格与虚拟列表的面板中会造成可见抖动，违背 `design-system` 的"数值刷新时不横向抖动"精神。透明度方案零布局影响。
- **着色**：dark 用 `--tv-border`（`#2a2e39`）系，light 用其 light 值（`#e0e3eb`）系，hover 加深至 `--tv-muted`（`#787b86`）。因两主题 `--tv-border` 已分别定义，滚动条样式只需引用变量即可自动适配，无需写两套规则。

### D3. `.no-scrollbar` 用 Tailwind v4 `@utility` 定义，与隐式滚动条并存为两个层级

在 `index.css` 中以 v4 的 `@utility no-scrollbar { ... }` 定义"完全隐藏"，同时全局默认应用隐式滚动条。形成两级语义：

| 语义 | 用法 | 场景 |
|---|---|---|
| 隐式滚动条（默认） | 仅 `overflow-y-auto` | 长列表：新闻、Watchlist、持仓表 |
| 完全隐藏 | `overflow-x-auto no-scrollbar` | 横向 chip / tab 条，滚动条无信息价值 |

- **为何保留 `.no-scrollbar` 而不是全部换成隐式**：横向 tab 条（如 `BottomDock.tsx:92`、`DesktopTitleBar`）滚动条即使隐式也会在 hover 时闯入 30px 高的窄条，破坏观感。保留"完全隐藏"是必要的。
- **为何用 `@utility` 而非 `@layer utilities`**：Tailwind v4 的 `@utility` 是官方声明自定义工具类的机制，能正确参与变体（如 `hover:`）与优先级排序。

### D4. 分类栏改为"单行 + 展开"折叠模式，而非换行平铺或溢出下拉菜单

默认单行显示，超出部分被裁切，末尾常驻一个"展开/收起"切换按钮；展开后容器 `flex-wrap` 完整平铺全部 10 个分类。**活动分类若在折叠态不可见，则将其提前到首位**以保证可见性。

考虑过的替代方案：

- **纯 `flex-wrap` 常驻两行**：10 个 chip 在 280px 宽面板中约占 3 行，恒定吃掉 ~72px 垂直空间，严重压缩新闻列表——右侧栏垂直空间是最稀缺资源，否决。
- **"+N" 溢出下拉菜单**：需要浮层、定位与点击外关闭逻辑，复杂度高；且下拉中的分类不可见，用户需两步才能发现，与"不要只堆叠滚动"的诉求只是换了种隐藏方式。
- **选定方案的取胜点**：折叠态零额外占用，展开态一次性看全，活动项提前保证选中态永远可见——同时解决"堆叠"与"裁切"两个问题。

### D5. 时间显示在展示层新增格式化函数，不改 `parseBlockbeatsTime`

新增独立的相对时间格式化（如 `formatRelativeTime(iso)`）供 `NewsPanel` 使用：`< 1 分钟` → "刚刚"，`< 60 分钟` → "N 分钟前"，`< 24 小时` → "N 小时前"，其余 → `MM-DD HH:mm`。日期分组头用"今天 / 昨天 / MM-DD"。

- **为何不改 `parseBlockbeatsTime`**：它返回 ISO 字符串是 `NewsItem.time` 的既有契约，`NewsCalendarView.tsx:142,155` 也在消费；改契约会连带修改全屏视图，扩大 blast radius。展示层格式化是最小侵入。
- **为何相对时间**：新闻流的核心信息是"多新"，ISO 时间戳需要用户心算。相对时间是新闻类 UI 的标准做法。

### D6. 底部抽屉展开：让工作区成为滚动容器，中心图表行改用 `min-height` 锚定高度

这是本设计的核心结构决策。方案是在 `App.tsx` 的 chart 工作区引入**条件滚动**：

```
折叠态（isOpen = false）— 与今天完全一致，无滚动
┌─ workspace: overflow-hidden ─────────┐
│ ┌ row: flex-1 ────────┬──────────┐  │
│ │ chart (h-full)      │ RightDock│  │
│ └─────────────────────┴──────────┘  │
│  BottomDock (仅 h-8 tab 栏)          │
└──────────────────────────────────────┘

展开态（isOpen = true）— 工作区纵向滚动
┌─ workspace: overflow-y-auto ─────────┐  ↕ 整体滚动
│ ┌ row: min-h-[<chartMinH>] ──┬─────┐│
│ │ chart                      │Right││  ← 确定高度，不塌陷
│ └────────────────────────────┴─────┘│
│ ┌ BottomDock 目标高度完整呈现 ─────┐ │
│ │  panel 内容自然铺开             │ │
│ └─────────────────────────────────┘ │
└──────────────────────────────────────┘
```

关键点：

- **中心行从 `flex-1` 切到显式 `min-height`（展开态）**，图表容器因此始终有确定高度，`pro.getChart()?.resize()` 能正确测量 —— 直接消解 Context 里记录的最大约束。`min-height` 取"视口可用高度"，使折叠→展开时图表尺寸**不发生变化**，避免不必要的 resize 与视觉跳动。
- **展开时自动滚动定位到底部模块**，否则用户点了 tab 却什么都没看到（内容在视口下方），这是必须的配套行为。
- **抽屉高度仍由 `isMaximized` 提供两档目标高度**，语义从"硬裁切上限"变为"期望呈现高度"；内容超出目标高度时由工作区滚动继续揭示，而非抽屉内二次滚动。

考虑过的替代方案：

- **让整个 `<main>`（含右侧栏）进入文档流滚动**：右侧栏面板是 `h-full` 且内部已有 `overflow-y-auto`（`NewsPanel.tsx:77`），放进 auto 高度流中会高度塌陷，且产生"页面滚动 vs 面板内滚动"的双滚动歧义（滚轮落在面板上时行为不可预期）。否决。
- **只让 BottomDock 自身变成高滚动区**：等于保持"抽屉内滚动"，不满足"整体界面都可以向下滚动"的诉求。否决。
- **右侧栏保持独立定高列 + 自身内滚动（选定）**：右侧栏与中心图表同处一行，共享该行的 `min-height`，因此右侧栏拿到确定高度、内部滚动语义不变；它随整行一起被工作区滚动带走。这样三项诉求互不破坏。

### D7. 右侧栏滚动语义：随工作区滚动，但内部长列表保留自身滚动

右侧栏不设独立的 sticky 固定，而是作为中心行的一部分随工作区滚动。其内部面板（NewsPanel 等）继续使用自身 `overflow-y-auto`，并共用 D1/D2 的隐式滚动条样式。

- **为何不 sticky 固定**：sticky 会让右侧栏在滚动到底部模块时悬停覆盖，与"整体界面向下滚动显示完整底部模块"的心智模型冲突（用户期望的是整页下移）。
- **双滚动是否歧义**：不歧义。因为中心行有确定 `min-height`，右侧栏内部列表在该高度内滚动到底后，滚轮事件自然冒泡给工作区继续滚动——这是浏览器原生的嵌套滚动链行为，符合直觉。

## Risks / Trade-offs

- **klinecharts-pro 在滚动容器中高度测量异常** → 由 D6 的显式 `min-height` 保证容器始终有确定高度；且 `min-height` 值等于折叠态的图表高度，使展开动作不改变图表尺寸，理论上不触发 resize 路径。实施时需实测展开/折叠/最大化三种切换下图表渲染正常。
- **打破 `App.tsx` 四层 `overflow-hidden` 可能引发意外滚动条**（如水平溢出显形）→ 仅在展开态开启纵向滚动并显式约束水平方向；折叠态保持与今天字节级一致的行为，把回归面收窄到"展开态"这一个分支。
- **`.no-scrollbar` 由无效变有效，13 处引用行为改变** → 其中横向 tab 条（BottomDock / DesktopTitleBar / 分类栏）是符合预期的；纵向长列表（AlertsPanel / WatchlistPanel / HotlistsPanel / CalendarPanel / CommunityIdeasPanel / DataWindowPanel / StrategyTester / TradingPanel / ScreenerPanel / PineStudioView）若保留完全隐藏会丧失滚动位置感知。需逐一审查并将纵向长列表改为隐式滚动条，这是本次一个不小的审查面。
- **相对时间需要随时间推移刷新**才不会一直显示"3 分钟前" → 权衡后接受静态渲染：新闻列表本身按分类重新拉取，且面板为非常驻视图；引入定时器重渲染会带来无谓的开销与复杂度。若后续有诉求再补。
- **自动滚动定位可能与用户手动滚动打断** → 仅在 `isOpen` 由 false → true 的那一次转换时触发定位，不在每次渲染或每次 tab 切换时强制滚动，避免劫持用户滚动。
- **`NewsPanel.test.tsx` 现有 3 个用例依赖当前 DOM 结构**（`screen.getByText("市场头条")`、直接取 `Important` / `AI` 文本）→ 分类栏改折叠后，折叠态可能不渲染全部分类文本，`getByText("AI")` 会失败。需同步更新测试，并至少覆盖"展开后可见全部分类"这一新行为。
- **可访问性**：隐式滚动条降低了"此处可滚动"的可发现性 → 通过 hover 渐显与保留轨道占位缓解；`prefers-reduced-motion` 下取消过渡直接显示。
