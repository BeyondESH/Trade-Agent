# Tasks — tv-parity-cleanup-shell

## 1. 线性 SVG 图标体系 (tv-icon-system / design-system)

- [x] 1.1 新增 `frontend/src/ui/icons.tsx`：导出线性 SVG 图标组件（search/chevronDown/candles/bars/area/layoutGrid/settings/clock/user/watchlist/alert/dataWindow/dom/orderbook/broker/fullscreen），`viewBox=0 0 24 24`、`stroke=currentColor`、`strokeWidth≈1.5`、`fill=none`，接受 `size`/`className`
- [x] 1.2 替换 `TVTopBar.tsx` 内所有 emoji/ASCII 字形（🔍/▼/▃▂/▦/👤）为 SVG 图标，着色用 `text-muted/text-text/text-accent`
- [x] 1.3 替换 `TVRightSidebar.tsx` `rightTabIcons()` 与图标条为 SVG 图标
- [x] 1.4 替换 `TVBottomDock.tsx` / 其他残留字形图标（核查无残留；底部 Tab 为文字标签，无需图标）
- [x] 1.5 单测：图标渲染为 `<svg>`、随 className 着色；审计断言无 emoji 字形

## 2. 全屏品种搜索弹窗 (symbol-search-modal / topbar-controls)

- [x] 2.1 新增 `frontend/src/layout/SearchModal.tsx`：居中 fixed modal + 遮罩，输入框、品类 tab（复用 `CategoryTab`）、结果表（symbol/品类 badge/最新价/精度）
- [x] 2.2 数据源接 datafeed `searchSymbols`（防抖）；品类 tab 对结果 `market` 过滤；选中回传 `category:instId`
- [x] 2.3 键盘：`,` 打开、方向键移动高亮、回车选中、Esc/点遮罩关闭
- [x] 2.4 `TVTopBar` 移除内联搜索下拉，`openSearch()` 改为打开 `SearchModal`；顶栏品种按钮点击也打开 modal
- [x] 2.5 迁移/更新测试：新增 `SearchModal.test.tsx`（tab 过滤、选中回传 composite、键盘导航、Esc 关闭）；更新 `TVTopBar.test.tsx` 为"点击触发打开 modal"

## 3. 删除范围外功能 (right-sidebar / topbar-controls)

- [x] 3.1 删除 `components/panels/NewsPanel.tsx`；从 `App.tsx` `renderRightPanel` 移除 news 分支
- [x] 3.2 `TVRightSidebar.tsx` / `App.tsx`：`RightTabId` 与 `TAB_LABELS` 移除 `news`，图标条不再渲染 News
- [x] 3.3 顶栏移除"截图"按钮；删除 `App.tsx` `handleOpenScreenshot` 与 `TVTopBar` 的 `onOpenScreenshot`
- [x] 3.4 `lib/chartChromeBridge.ts` 移除 `openScreenshotModal`（及其测试用例）
- [x] 3.5 `lib/i18n.ts` 删除 `sidebar.news`/`news.empty`/`topbar.screenshot` key（zh+en）
- [x] 3.6 更新受影响测试（右栏 tab 集合、顶栏按钮、chromeBridge）

## 4. Screener 基本面列 (bottom-dock)

- [x] 4.1 `api/types.ts` `TickerSortKey` 增加 `funding | amplitude`（另含 `mark` 供标记价列排序）
- [x] 4.2 `MarketList.tsx` 增加扩展列渲染（资金费率% / 标记价 / 24h振幅 / 量 / 额）与排序；振幅=`(high24h-low24h)/low24h`；缺失值显示 `--` 且排序末位
- [x] 4.3 `ScreenerPanel.tsx` 传入"扩展列"开关；Watchlist 保持精简列
- [x] 4.4 `useTickerList.ts` `sortValue` 支持 `funding/amplitude/mark` 排序键（null 值末位）
- [x] 4.5 单测：基本面列渲染与排序、缺失值处理、仅用 hub 字段

## 5. 底部抽屉高度规范化 (bottom-dock)

- [x] 5.1 确认 `TVBottomDock` 展开时 `height:${heightVh}vh`、折叠时无显式高度（已落地）
- [x] 5.2 回归测试：展开高度断言 = heightVh、内容超高时抽屉不撑开（overflow-hidden + 显式高度断言）

## 6. 校验与回归

- [x] 6.1 `openspec validate tv-parity-cleanup-shell` 通过
- [x] 6.2 前端 typecheck + vitest 全绿（117 passed）
- [ ] 6.3 手动验证：搜索弹窗品类切换/键盘选中、无 News/截图入口、Screener 基本面列排序、图表-抽屉不重叠、双主题图标着色
