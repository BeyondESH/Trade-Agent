## Why

TradingView 1:1 重建的第二个 change：在 `bitget-connectivity`（连通地基）之上，把终端外壳的**外观保真度**推到 1:1，并按探索阶段拍板的决策**删除全部范围外功能**。当前外壳骨架已有（TVTopBar/TVRightSidebar/TVBottomDock/TVStatusBar），但存在三处与 TradingView 观感的明显差距：

1. **图标体系**：顶栏/图标条大量使用 emoji 与 ASCII 字形（🔍 ▼ ▃▂ ▦ 👤），而非 TradingView 的 1.2px 线性 SVG 图标。
2. **品种搜索**：顶栏是 320px 小下拉，TradingView 是全屏弹窗（含市场类型 tab、收藏、精度列）。
3. **范围外内容残留**：News 面板（无数据源）、截图/发布按钮属拍板排除范围，需移除。

同时把 Screener 从纯行情列升级为含 **Bitget 维度"基本面"列**（资金费率/标记价/24h 量额/振幅波动率，零外部依赖，为拍板方案 A），并补齐底部抽屉展开高度的规范表述（刚修复的 heightVh 未应用问题）。

## What Changes

- **线性 SVG 图标体系**：新增 `ui/icons.tsx`（24 视框、1.2–1.5px 描边、颜色取 token），替换顶栏、右图标条、tab 栏全部 emoji/ASCII 字形；组件 MUST NOT 再引入 emoji 字符图标。
- **全屏品种搜索弹窗**：替换顶栏小下拉为居中 modal：搜索输入 + 市场类型 tab（全部/现货/U合约/USDC/币本位/杠杆）+ 结果表（symbol/品类/最新价/精度）；数据源为 datafeed `searchSymbols`（`/instruments`，单一入口，bitget-connectivity 已建）；快捷键 `,` 保持打开，Esc 关闭。
- **删除范围外功能**：移除 News 面板与右栏 News tab；移除顶栏"截图"按钮及对应弹窗桥接入口（`openScreenshotModal` 调用）。
- **Screener 基本面列**：MarketList 增加资金费率、标记价、24h 振幅（波动率代理）列并可排序；数据全部取自行情 hub 已有字段（`fundingRate/markPrice/high24h/low24h/change24h/成交量额`），无新增外部依赖。
- **底部抽屉高度规范**：展开时 dock 高度 SHALL 显式为 `heightVh`（20–40vh，默认 32），不得由内容撑开（将已落地的修复固化为规范）。

## Capabilities

### New Capabilities
- `symbol-search-modal`: 全屏品种搜索弹窗（品类 tab、结果表、精度展示、键盘操作）。
- `tv-icon-system`: 线性 SVG 图标体系（规格、token 着色、禁 emoji 字形图标）。

### Modified Capabilities
- `topbar-controls`: 品种搜索从小下拉升级为全屏弹窗；顶栏分组移除"截图"入口。
- `right-sidebar`: 右栏 tab 集合移除 News；News 相关空态要求删除。
- `bottom-dock`: 筛选器面板增加 Bitget 维度基本面列；底部抽屉展开高度显式化。
- `design-system`: 新增线性图标使用约束（高密度 UI 要求的补充）。

## Impact

- **前端**：`layout/TVTopBar.tsx`（modal）、`layout/TVRightSidebar.tsx`（tab 集合）、`components/panels/NewsPanel.tsx`（删除）、`App.tsx`（tab 配置/截图回调移除）、`ui/icons.tsx`（新增）、`components/market/MarketList.tsx` + `ScreenerPanel.tsx`（基本面列）、`lib/chartChromeBridge.ts`（截图桥接入口下线）、`lib/i18n.ts`（新增 key / 清理 news key）。
- **后端**：无改动（基本面列全部来自 hub 已有字段）；`fundingRate/markPrice` 已在 `/funding`、`/mark-price` 与 ticker 快照中。
- **依赖**：无新增依赖；图标用手写 SVG sprite（不引入图标库）。
- **非破坏性**：`searchSymbols`/`/instruments` 契约不变；仅删除范围外入口。
