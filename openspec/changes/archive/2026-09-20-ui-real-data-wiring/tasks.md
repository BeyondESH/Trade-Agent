## 1. 底部筛选器接入实时数据（bottom-dock）

- [x] 1.1 改造 `frontend/src/components/bottom/ScreenerPanel.tsx`：移除 `import { INITIAL_SCREENER_ITEMS }`，改消费 `useTickerList()` 的 `tickers`/`symbols`/`search`/`setSearch`/`tab`/`setTab`/`sortKey`/`sortDir`/`setSort`
- [x] 1.2 渲染基本面列：价格、涨跌幅、资金费率、标记价、24h 振幅（复用导出的 `amplitudeOf`）、24h 成交量/成交额；列头点击调用 `setSort(key)` 并可排序
- [x] 1.3 品类 tab 使用 `CategoryTab`（all/SPOT/USDT-FUTURES），搜索框绑定 `setSearch`
- [x] 1.4 选中行将 ticker 映射回 `SymbolInfo` 并调用 `onSelectSymbol`；缺失维度单元格显示 `--` 且缺失值排到排序末尾
- [x] 1.5 为筛选器新增/更新单测：mock `useTickerList` 或 `useExchangeSocket`，断言列渲染真实字段、排序切换、无 mock 数值、缺失占位

## 2. DOM 面板接入衍生品数据（right-sidebar）

- [x] 2.1 改造 `frontend/src/components/sidebar/OrderBookPanel.tsx`：内部调用 `useDerivative(symbol.ticker)` 或在 `RightDock` 调用后以 props 传入 `funding`/`markPrice`
- [x] 2.2 在面板内新增"资金费率""标记价"行，数值 `tabular-nums`，资金费率按正负着色，缺失显示 `--`
- [x] 2.3 更新 `OrderBookPanel` 单测：断言展示 fundingRate/markPrice，通道无数据时显示占位

## 3. 右栏宽度可拖拽 260–500px（right-sidebar）

- [x] 3.1 改造 `frontend/src/components/sidebar/RightDock.tsx`：移除固定 `w-[280px] sm:w-[310px]`，改为受控宽度 state（初始 280）
- [x] 3.2 面板左缘添加拖拽手柄（col-resize），`mousemove` 时 `clamp(260, 500)` 更新宽度，`mouseup` 结束
- [x] 3.3 宽度持久化（优先 `localStorage`），初始化读取并钳制在 260–500px
- [x] 3.4 新增单测：模拟拖拽边界（<260 / >500 被钳制）、重载恢复

## 4. 右键菜单补全 5 项（terminal-interactions）

- [x] 4.1 探明 vendored `KLineChartPro` 是否可通过 `KLineChartProHandle` 调用指标/设置弹窗与视图复位；确定 ≤2 个可行入口
- [x] 4.2 扩展 `KLineChartProHandle`（`KLineChartProView.tsx`）暴露 `openIndicatorPicker()`、`openSettings()`、`resetView()`（或桥接 Pro 原生 chrome 按钮）
- [x] 4.3 扩展 `ChartContextMenu.tsx` 为 5 项：创建警报 / 添加指标 / 复制价格 / 设置 / 重置视图，并加 icon + 快捷键槽
- [x] 4.4 在 `NativeChart.tsx` 接线：`onAddIndicator`/`onOpenSettings`/`onResetView` 调 handle，`onCopyPrice` 写 `navigator.clipboard`
- [x] 4.5 更新 `ChartContextMenu`/`NativeChart` 单测：断言 5 项存在、各动作回调触发、复制价格写剪贴板（mock）

## 5. ScreenerView 无动作控件

- [x] 5.1 `frontend/src/components/views/ScreenerView.tsx`：Export CSV 接真实导出（由 `filteredItems` 生成 CSV 并触发下载）
- [x] 5.2 移除 Auto-Refresh 按钮（行情经 WS 已实时，无轮询开关语义）

## 6. CommunityIdeasView 无动作控件

- [x] 6.1 `frontend/src/components/views/CommunityIdeasView.tsx`：让 `activeFilter` 真实过滤 `ideas`（按 symbol/品类）
- [x] 6.2 移除评论、分享两个无后端支撑的无响应按钮

## 7. HeatmapsView 无动作控件

- [x] 7.1 `frontend/src/components/views/HeatmapsView.tsx`：移除未被消费的 24h/1w/1m 度量切换（股票区块仅有单一 `changePercent`）
- [x] 7.2 保留 `heatmapType`（stocks/crypto）切换与 BlockBeats 净流入真实数据路径不变

## 8. 顶栏 / 设置 / 符号入口

- [x] 8.1 `frontend/src/App.tsx:821`：`onAddSymbol` 接打开既有符号搜索（`SearchModal`/命令面板），不再传空函数
- [x] 8.2 `frontend/src/components/desktop/DesktopTitleBar.tsx`：通知下拉改由真实触发警报列表驱动（新增 prop），无则空态；删除 "New Pine Script Update" 假条目与 inert "Mark all read"
- [x] 8.3 `frontend/src/components/modals/DesktopSettingsModal.tsx`：移除 `hardwareAccel`/`soundAlerts`/`autoSync`/`crosshairSync` 四个无落地开关；仅保留真实的主题切换；Save 改为明确的关闭（或接入真实持久化设置）

## 9. mock 数据清理

- [x] 9.1 删除 `frontend/src/data/marketData.ts` 中无引用的 `INITIAL_NEWS`
- [x] 9.2 删除 `INITIAL_SCREENER_ITEMS` 及其相关 `ScreenerItem` 类型（若不再被引用）
- [x] 9.3 保留 `INITIAL_CALENDAR` / `HEATMAP_STOCK_ASSETS` / `COMMUNITY_IDEAS_DATA` / `BROKERS_CATALOG`，并确认其使用处标注为文档化静态内容（不得伪装实时）
- [x] 9.4 确认未触碰 `handleResetPaperAccount` / `handleRunStrategy`（属另一 change）

## 10. 验证

- [x] 10.1 `cd frontend && npm run test` 通过全部 vitest 单测
- [x] 10.2 `cd frontend && npm run typecheck` 通过
- [x] 10.3 更新受影响的 e2e（`frontend/tests/e2e/panels.spec.ts` 等）并运行 `cd frontend && npm run test:e2e`（或至少受影响 spec）
- [x] 10.4 手动验证：筛选器/DOM 显示实时值、右栏宽度可拖并重载复原、右键菜单 5 项均可执行、通知空态、设置无 inert 开关
