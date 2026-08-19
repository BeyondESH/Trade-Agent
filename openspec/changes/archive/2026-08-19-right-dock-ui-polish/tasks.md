## 1. 主题化滚动条基础设施

- [x] 1.1 在 `frontend/src/index.css` 的 `:root`/`[data-theme="dark"]` 与 `[data-theme="light"]` 两个块中新增滚动条专用变量（滑块常态色、滑块 hover 色、轨道色），值引用既有 `--tv-border` / `--tv-muted`，不硬编码
- [x] 1.2 在 `frontend/src/index.css` 新增全局隐式滚动条样式：`::-webkit-scrollbar` 宽度恒定 8px、`::-webkit-scrollbar-track` 透明、`::-webkit-scrollbar-thumb` 常态 `transparent` 且带 `background-color` 过渡与圆角
- [x] 1.3 新增 hover 渐显规则：容器 `:hover` 时滑块 `background-color` 变为滑块常态色，滑块自身 `:hover` 再加深为 hover 色
- [x] 1.4 补写标准属性双写：`scrollbar-width: thin` 与 `scrollbar-color: <thumb> transparent`，与伪元素规则并存
- [x] 1.5 在 `@media (prefers-reduced-motion: reduce)` 下取消滑块过渡动画并让滑块直接可见
- [x] 1.6 用 Tailwind v4 `@utility no-scrollbar { ... }` 定义完全隐藏工具类（`::-webkit-scrollbar { display: none }` + `scrollbar-width: none`）
- [ ] 1.7 启动 `npm run dev` 目视验证：长列表静置无滑块、hover 渐显、切换 dark/light 滑块配色跟随、显隐时内容无横向位移（并入第 8 组统一目视回归）

## 2. 审查并归位既有 13 处 `no-scrollbar` 引用

- [x] 2.1 保留"完全隐藏"于横向控件条：`bottom/BottomDock.tsx:92`（Tab 栏）、`desktop/DesktopTitleBar.tsx`（标签栏），确认 hover 时不再出现滚动条侵占窄条高度
- [x] 2.2 将纵向长列表改为隐式滚动条（移除 `no-scrollbar`）：`sidebar/AlertsPanel.tsx`、`sidebar/WatchlistPanel.tsx`、`sidebar/HotlistsPanel.tsx`、`sidebar/CalendarPanel.tsx`
- [x] 2.3 将纵向长列表改为隐式滚动条（移除 `no-scrollbar`）：`sidebar/CommunityIdeasPanel.tsx`、`sidebar/DataWindowPanel.tsx`、`bottom/StrategyTester.tsx`、`bottom/TradingPanel.tsx`
- [x] 2.4 将纵向长列表改为隐式滚动条（移除 `no-scrollbar`）：`bottom/ScreenerPanel.tsx`、`views/PineStudioView.tsx`；若同一元素兼具横纵滚动，仅保留纵向隐式
- [ ] 2.5 逐一目视回归上述面板，确认无滚动条侵占布局、无内容裁切（并入第 8 组统一目视回归）

## 3. 相对时间格式化

- [x] 3.1 在 `frontend/src/lib/newsfeed.ts` 新增展示层函数 `formatRelativeTime(iso: string): string`：<1 分钟"刚刚"、<60 分钟"N 分钟前"、<24 小时"N 小时前"、其余 `MM-DD HH:mm`；不修改 `parseBlockbeatsTime` / `toNewsItem` 的既有返回契约
- [x] 3.2 新增日期分组标签函数 `formatDateGroup(iso: string): string`：当天返回"今天"、前一天"昨天"、更早 `MM-DD`
- [x] 3.3 新增按日期分组的纯函数 `groupNewsByDate(items)`，返回有序分组结构，保持组内原有时间顺序
- [x] 3.4 为上述三个函数补充单元测试（边界：刚好 60 分钟、跨天、跨年），确认 `NewsCalendarView` 未受影响

## 4. 市场头条分类栏重构

- [x] 4.1 在 `frontend/src/components/sidebar/NewsPanel.tsx` 新增 `isCategoryExpanded` 状态，默认折叠
- [x] 4.2 移除分类栏的 `overflow-x-auto` 横滚，折叠态改为单行裁切（`flex-nowrap` + 溢出隐藏），展开态 `flex-wrap` 完整平铺
- [x] 4.3 在分类栏末尾常驻"展开/收起"切换控件，使用 `lucide-react` 线性图标（遵循 design-system 的图标为线性 SVG 要求），点击切换 `isCategoryExpanded`
- [x] 4.4 实现活动分类可见性保障：折叠态下若活动分类处于被裁切位置，将其重排至首位
- [x] 4.5 分类 chip 与展开控件的配色全部引用主题色/token，不新增硬编码色值
- [x] 4.6 验证切换分类仍按 key 调用 `fetchNewsflash` 并更新列表，选中态高亮正确

## 5. 市场头条新闻列表排版重构

- [x] 5.1 将列表渲染改为按 `groupNewsByDate` 分组，每组前渲染分组标题（今天 / 昨天 / `MM-DD`），标题使用弱化文字色
- [x] 5.2 条目时间由直接渲染 `item.time` 改为 `formatRelativeTime(item.time)`，消除 ISO 时间戳外泄
- [x] 5.3 标题限制为最多 2 行截断（`line-clamp-2`），摘要由 `line-clamp-3` 改为 `line-clamp-2` 并保持弱化文字色
- [x] 5.4 将"全文"链接改为条目 hover 时渐显（静置隐藏），遵循 design-system 的渐进式披露约定
- [x] 5.5 压缩条目内边距与间距以提升信息密度，保证 280px 宽面板下不出现横向溢出
- [x] 5.6 确认列表容器使用隐式滚动条（不带 `no-scrollbar`），加载态/错误态/空态样式与新排版一致
- [x] 5.7 更新 `frontend/src/components/sidebar/NewsPanel.test.tsx`：修正因折叠态导致的 `getByText("AI")` 失败，新增"展开后全部分类可见"与"时间以相对格式渲染"用例

## 6. 底部抽屉高度模型与工作区滚动

- [x] 6.1 在 `frontend/src/components/bottom/BottomDock.tsx` 将抽屉内容容器由硬编码 `h-[230px]`/`h-[420px]` 改为目标高度语义（常规/最大化两档），移除阻止内容完整呈现的 `overflow-hidden` 裁切
- [x] 6.2 通过 props 或回调向上暴露 `isOpen` 展开状态，供 `App.tsx` 决定工作区滚动模式
- [x] 6.3 在 `frontend/src/App.tsx:704` 的 chart 工作区容器上实现条件滚动：折叠态保持 `overflow-hidden`（与现状字节级一致），展开态改为 `overflow-y-auto` 并显式约束水平溢出
- [x] 6.4 在 `App.tsx:706` 的中心行上实现高度模型切换：折叠态保持 `flex-1`，展开态改为显式 `min-height`，其值等于折叠态下该行的可用高度，使图表尺寸在展开前后不变
- [x] 6.5 确认 `App.tsx:708` 图表列与 `RightDock` 在展开态仍从中心行获得确定高度，`KLineChartProView` 的 `pro.getChart()?.resize()` 能正确测量
- [x] 6.6 实现展开时自动滚动定位到底部模块（仅在 `isOpen` 由 false → true 的那一次转换触发）
- [x] 6.7 确保已展开态下切换 tab、切换最大化档位、用户手动滚动后，均不再强制滚动定位

## 7. 右侧栏滚动语义

- [x] 7.1 确认 `RightDock` 不设 sticky/fixed，随工作区一同滚动
- [x] 7.2 确认 `RightDock` 面板内部长列表保留自身 `overflow-y-auto`，且滚动到底后滚轮事件能冒泡至工作区继续滚动
- [x] 7.3 验证右侧栏内部列表与工作区滚动条使用同一套隐式滚动条样式，无双滚动条同时可见的观感问题

## 8. 验证与回归

- [x] 8.1 运行 `npm run typecheck`（`tsc --noEmit`）确认无类型错误
- [x] 8.2 运行 `npm run test`（`vitest run`）确认全部测试通过，含更新后的 `NewsPanel.test.tsx` 与新增的时间格式化测试
- [ ] 8.3 目视回归底部抽屉：折叠 → 展开 → 最大化 → 还原 → 折叠全链路，确认图表每一步均正常渲染、不塌陷、不与抽屉重叠（需在浏览器人工目视验证）
- [ ] 8.4 目视回归五个底部 tab（Screener / Pine / Strategy / Trading / Notes），确认高内容与低内容面板在新高度模型下均表现正常（需在浏览器人工目视验证）
- [ ] 8.5 目视回归折叠态布局与变更前一致，确认未引入意外的水平或垂直滚动条（需在浏览器人工目视验证）
- [ ] 8.6 在 dark 与 light 两主题下完整走查右侧栏各面板与底部抽屉，确认滚动条与新闻排版配色均随主题正确切换（需在浏览器人工目视验证）
