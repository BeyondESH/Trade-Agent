## Context

`bitget-connectivity` 已建立单一 `/instruments` 搜索入口（datafeed `searchSymbols`）、`category:instId` 复合键与连接态 badge。本 change 在其上补外观与范围裁剪。现状：

- 顶栏 `TVTopBar` 用 emoji/ASCII（🔍/▼/▃▂/▦/👤）；品种搜索是 `w-80` 下拉（已接 `searchSymbols`），需升级为全屏 modal。
- 右栏 `TVRightSidebar` 含 News tab；`NewsPanel.tsx` 为无数据源占位。
- 顶栏有"截图"按钮 → `bridge.openScreenshotModal`。
- `MarketList` 现有列：symbol / 最新价 / 24h涨跌 / 量 / 额；缺基本面列。
- 行情 hub 字段齐备：`fundingRate`（`/funding` + ticker）、`markPrice`（`/mark-price`）、`high24h/low24h/change24h`、`baseVolume/quoteVolume`。
- 底部抽屉展开高度已在上个 hotfix 用 `height:${heightVh}vh` 修好——本 change 将其固化为规范。

## Goals / Non-Goals

**Goals:**
- 线性 SVG 图标体系替换全部 emoji/ASCII 字形。
- 全屏品种搜索弹窗（品类 tab + 结果表 + 键盘导航），单一 `/instruments` 数据源。
- 删除范围外：News 面板/tab、截图入口。
- Screener 基本面列（仅 Bitget 维度）。
- 固化底部抽屉展开高度规范。

**Non-Goals:**
- 不引入图标库或外部基本面数据源（手写 SVG；基本面列取自 hub 已有字段）。
- 不动多格联动/回放/警报（后续 change）。
- 不改后端。

## Decisions

### D1. 图标：手写 SVG 组件模块 `ui/icons.tsx`
每个图标是一个 `({size=16, className}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>…</svg>`，着色靠父级文字色 class（`text-muted`/`text-text`/`text-accent`）。不引入 lucide 等库以免打包膨胀与风格漂移。需要的图标集：search、chevron-down、candles、bars、area、layout-grid、settings、clock、user、watchlist、alert、data-window、dom、orderbook、broker、fullscreen、camera(删)。逐一替换 `TVTopBar`/`TVRightSidebar`/`TVBottomDock` 与 `rightTabIcons()`。

### D2. 搜索弹窗：新组件 `SearchModal`，顶栏只留触发
把搜索 UI 从 `TVTopBar` 抽到 `layout/SearchModal.tsx`（居中 fixed、遮罩、Esc/点遮罩关闭、方向键+回车导航）。`TVTopBarHandle.openSearch` 改为打开该 modal。结果表列：symbol / 品类 badge / 最新价（若 ticker 有）/ 精度。选中回传 `category:instId`（沿用 bitget-connectivity 的 `onSymbolChange` 语义）。品类 tab 复用 `CategoryTab` 类型；tab 过滤对 `searchSymbols` 结果的 `market` 字段做筛选。

### D3. 删除范围外：物理删除而非隐藏
删除 `NewsPanel.tsx`、`RightTabId` 中的 `news`、`TAB_LABELS.news`、i18n 的 `sidebar.news/news.empty`；删除顶栏截图按钮与 `chartChromeBridge.openScreenshotModal`（及其测试）。`App.tsx` 的 `renderRightPanel` 去掉 news 分支。保留 `handleOpenScreenshot` 相关代码一并移除，避免死代码。

### D4. Screener 基本面列：MarketList 可配置列
给 `MarketList` 增加"扩展列"渲染（fundingRate %、markPrice、24h 振幅、量、额），排序键扩展 `TickerSortKey` 增加 `funding | amplitude`。振幅 = `(high24h-low24h)/low24h`。Watchlist 仍用精简 3–5 列，Screener 传入扩展列开关，避免右栏窄面板塞不下。

### D5. 底部抽屉高度：规范化已落地修复
`TVBottomDock` 展开时 `style={{height: ${heightVh}vh}}`、折叠时无显式高度——已实现，本 change 仅补 spec 与回归测试断言。

## Risks / Trade-offs

- **图标替换面广**：涉及多组件与其快照/测试；用逐组件替换 + 保留 `data-testid` 规避测试大面积返工。
- **fundingRate 时效**：资金费率是周期结算值，ticker 快照未必每次带；缺失时列显示 `--`，不阻塞排序（缺失视为 0 或末位）。
- **振幅作为"波动率"是代理指标**：非严格统计波动率，UI 文案用"24h 振幅"避免误导。
- **搜索弹窗与现有顶栏测试**：`TVTopBar.test.tsx` 依赖旧下拉的 `topbar-search-input`；需迁移到 `SearchModal` 测试并更新顶栏测试为"点击触发打开 modal"。
