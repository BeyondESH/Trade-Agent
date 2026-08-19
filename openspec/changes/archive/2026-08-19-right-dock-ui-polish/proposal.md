## Why

右侧栏与底部抽屉存在三类可见的体验缺陷：`no-scrollbar` 工具类在项目中被 13 个组件引用却从未定义（Tailwind v4 配置与 `index.css` 均无该类），导致所有滚动区域直接暴露操作系统原生滚动条，与 TradingView 主题割裂；市场头条（NewsPanel）把 10 个分类塞进单行横向滚动条里堆叠，常驻裁切且活动分类可能位于视口外，下方新闻卡片则直接渲染 ISO 时间戳（`parseBlockbeatsTime` 的输出）并以等高长卡片堆叠，信息密度低；底部抽屉被硬编码为 `h-[230px]` / `h-[420px]` 并挤压图表，内容超出后只能在抽屉内二次滚动，用户无法一眼看完整个底部模块。

## What Changes

- 新增全局主题化滚动条样式：细轨、透明底、token 着色滑块，静置时隐式（滑块透明），hover/滚动时渐显；同时补齐 `.no-scrollbar` 工具类的真实定义，使既有 13 处引用生效。滚动条宽度恒定以避免布局抖动。
- 重构市场头条分类横栏：取消"仅横向堆叠滚动"，改为可换行的紧凑 chip 组 + "更多"折叠开关，默认单行呈现高频分类，展开后完整平铺；活动分类 SHALL 始终可见。
- 重构市场头条新闻排版：相对时间（刚刚 / N 分钟前 / HH:mm）替代 ISO 时间戳、按日期分组分隔（今天/昨天/日期）、标题 2 行截断、摘要 2 行截断弱化、"全文"链接改为 hover 渐显，符合设计系统的渐进式披露约定。
- **BREAKING** 底部抽屉展开模型由"挤压图表 + 抽屉内滚动"改为"工作区整体纵向滚动"：抽屉展开时工作区（中心图表 + 右侧栏 + 底部抽屉）成为纵向滚动容器，上方行保留最小高度下限，底部模块以目标高度完整呈现，向下滚动即可看完整个底部模块；展开时 SHALL 自动滚动定位到底部模块。折叠态行为不变（无滚动）。
- 右侧栏面板随工作区滚动，其内部长列表仍保留自身滚动，两者共用同一套主题滚动条样式。

## Capabilities

### New Capabilities
- `themed-scrollbar`: 全局主题化隐式滚动条规范——静置隐藏、hover 渐显、token 着色、双主题适配、宽度恒定不引起布局抖动，以及 `.no-scrollbar` 完全隐藏工具类的定义。

### Modified Capabilities
- `right-sidebar`: 市场头条（News）面板的分类横栏与新闻列表排版要求；同时移除"SHALL NOT 出现 News tab"这一与现状（RightDock 已内置 News tab 且接入 BlockBeats 数据源）矛盾的约束。
- `bottom-dock`: 展开态高度模型变更——由"抽屉高度 MUST 显式等于 heightVh、内容在抽屉内滚动、MUST NOT 撑开图表"改为"抽屉以目标高度完整呈现、由工作区整体纵向滚动揭示完整内容"。
- `terminal-layout`: 布局壳的滚动语义——底部抽屉展开时工作区成为纵向滚动容器，中心图表区保留最小高度下限而非被无限压缩。

## Impact

- 样式入口：`frontend/src/index.css`（唯一注入点，新增滚动条 token 与 `@utility` 定义；`--tv-*` 双主题变量已就位）。
- 组件：`frontend/src/components/sidebar/NewsPanel.tsx`（分类栏 + 列表排版）、`frontend/src/components/bottom/BottomDock.tsx`（高度模型）、`frontend/src/App.tsx:702-767`（工作区滚动容器与图表最小高度）。
- 时间格式化：`frontend/src/lib/newsfeed.ts` 的 `parseBlockbeatsTime` 产出 ISO 字符串，需新增展示层格式化函数（不改动既有解析契约，避免影响 `NewsCalendarView`）。
- 波及但不改动数据源：`NEWSFLASH_TYPES`（10 项静态分类）保持不变，仅改变呈现方式。
- 现有 13 处 `no-scrollbar` 引用（BottomDock / ScreenerPanel / StrategyTester / TradingPanel / DesktopTitleBar / AlertsPanel / CalendarPanel / CommunityIdeasPanel / DataWindowPanel / HotlistsPanel / NewsPanel / WatchlistPanel / PineStudioView）行为将由"无效果"变为"真实隐藏"，需逐一确认是否应改用隐式滚动条。
- 测试：`frontend/src/components/sidebar/NewsPanel.test.tsx` 需随排版重构更新断言。
