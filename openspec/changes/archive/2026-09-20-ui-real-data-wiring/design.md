## Context

本 change 面对的是"规格已描述目标、实现却是模板 demo"的漂移。已核实的现状（逐文件读取）：

- `frontend/src/components/bottom/ScreenerPanel.tsx:2,18` 直接 `import { INITIAL_SCREENER_ITEMS }` 过滤渲染；`frontend/src/hooks/useTickerList.ts` 已实现品类 tab/搜索/排序（含 `funding`/`mark`/`amplitude`/`turnover` 排序键）且 `useExchangeSocket("ticker","default")` 实时增量——**零消费**（仅自身测试引用）。
- `frontend/src/components/sidebar/OrderBookPanel.tsx` 仅渲染深度+`spread`；`frontend/src/hooks/useDerivative.ts` 提供 `fundingRate`/`markPrice`（`funding-time`/`mark-price` 两通道）——**零消费**。
- `frontend/src/components/sidebar/RightDock.tsx:107` 固定 `w-[280px] sm:w-[310px]`。
- `frontend/src/components/chart/ChartContextMenu.tsx:69-90` 只有「在此添加价格线」「在此设置价格警报」两项。
- 无动作控件：`ScreenerView.tsx:54-68`（Export CSV / Auto-Refresh 无 onClick）、`CommunityIdeasView.tsx:25,62-78`（`activeFilter` 未被消费）、`:167,172`（评论/分享无 handler）、`HeatmapsView.tsx:15,121-133`（`metric` 未被消费）、`App.tsx:821`（`onAddSymbol={() => {}}`）、`DesktopTitleBar.tsx:306,315`（inert "Mark all read" + "New Pine Script Update" 假条目）、`DesktopSettingsModal.tsx:14-17,135`（4 个 inert 开关 + 只关闭的 Save）。
- mock 使用面：`INITIAL_NEWS` 无任何引用（死）；`BROKERS_CATALOG` 源码注释明确"do not delete"；`INITIAL_CALENDAR` 被 `NewsCalendarView.tsx:94`（注释"stays mock"）与 `App.tsx:201` 使用；`HEATMAP_STOCK_ASSETS` 被 `HeatmapsView.tsx:36` 使用，且 `blockbeats-data` spec 明确"其余区块(如股票)继续使用 mock"；`COMMUNITY_IDEAS_DATA` 被 `CommunityIdeasView.tsx:24` 使用，`tv-template-shell` spec 明确无源视图用 mock。

约束：`handleResetPaperAccount`（`App.tsx:651`）与 `handleRunStrategy`（`:668`）的注释说明它们属"未来 paper-trading / 策略配置 UI"并由另一 change 处理，本 change MUST NOT 触碰。

## Goals / Non-Goals

**Goals:**

- 凡存在真实数据源/hook 的表面，一律接入（+ 删除对应 mock）。
- 凡无真实行为、且移除不破坏已存档规格的控件，一律移除。
- 凡规格要求但当前无上游数据的表面，保持"文档化静态"，并在规格中显式允许，防止被误读为实时。
- 建立通用约束（新能力 `ui-affordance-integrity`），使后续实现者不再新增无动作控件或假数据。

**Non-Goals:**

- 不新增任何后端接口（`useTickerList` 排序所需字段由现有 `/tickers` hub 字段提供；若某字段缺失则显示占位而非造数）。
- 不实现财经日历上游数据源（无 API，选择保留文档化 mock）。
- 不实现社区社交后端（无 API，保留 `tv-template-shell` 允许的 mock）。
- 不触碰 `handleResetPaperAccount` / `handleRunStrategy`。
- 不重做底部抽屉/右栏整体布局（仅宽度可拖）。

## Decisions

**决策 1：筛选器（底部 `ScreenerPanel`）——接线 `useTickerList`，删除 mock**

`ScreenerPanel` 改为消费 `useTickerList()` 的 `tickers`/`setTab`/`setSearch`/`setSort`/`symbols`，列渲染 `lastPr`/`change24h`/`fundingRate`/`markPrice`/`amplitudeOf(t)`/`quoteVolume`（成交额）。选中行调用 `onSelectSymbol`，把 ticker 映射回 `SymbolInfo`（复用现有 `symbols` prop）。

- 理由：hook 已完整实现所需维度与实时通道，接线成本最低，且直接满足 `bottom-dock`「筛选器面板」。
- 备选：在 `ScreenerPanel` 内自建 WS 订阅——重复实现，弃用。
- 备选：保留 mock 仅替换价格——仍违反「MUST NOT 使用静态 mock」，弃用。
- 待确认：`useTickerList` 的 `amplitude`/`turnover` 依赖 hub 返回 `high24h`/`low24h`/`quoteVolume`；若缺失则按「缺失值排到末尾、显示占位」的既有逻辑处理，**不新增端点**。

**决策 2：DOM 面板——接线 `useDerivative`**

`OrderBookPanel` 增加 `fundingRate`/`markPrice` 行，由 `useDerivative(symbol.ticker)` 提供；缺失时显示 `--`。数值用现有主题色（资金费率为正则绿/负则红，标记价中性）并 `tabular-nums`。

- 理由：hook 已订阅两条 WS 通道，DOM 面板是唯一自然消费方。
- 备选：把 funding/mark 放进右栏单独面板——规格要求就在 DOM 面板，弃用。

**决策 3：右栏宽度可拖 260–500px**

在 `RightDock` 面板与图标条之间的左缘加拖拽手柄；`mousedown` 进入拖拽，`mousemove` 限制 `clamp(260, 500)`，`mouseup` 结束；宽度写入持久化（复用 `config-persistence` 的 `/config` 或 `localStorage`，设计倾向 `localStorage` 以避免触碰后端契约）。样式不再用固定 `w-[280px]` 类。

- 理由：`right-sidebar`「图标条面板与新闻入口」明确 260–500px 可拖。
- 备选：仅拖拽不持久化——刷新后回退，体验差，弃用。

**决策 4：右键菜单补全 5 项**

沿用 `ChartContextMenu` + `NativeChart` 现有 props：新增 `onAddIndicator`、`onCopyPrice`、`onOpenSettings`、`onResetView`。实现上通过扩展 `KLineChartProHandle`（`KLineChartProView`）暴露 Pro 原生指标弹窗/设置弹窗入口，`onResetView` 调 `chart.scrollToRealTime()`/`resetData()`，`onCopyPrice` 写 `navigator.clipboard`。

- 理由：规格要求 5 项且 Pro 原生 chrome 已具备指标/设置弹窗能力，接线而非自造弹窗。
- 备选：自建指标/设置弹窗——重复 Pro 能力，弃用。
- 依赖：需先确认 vendored `KLineChartPro` 暴露的入口（任务 4.1 先探明；若不可用则退化为"打开 Pro 原生 chrome 对应按钮"的桥接）。

**决策 5：无动作控件——分类处理**

| 控件 | 决策 | 理由 |
|---|---|---|
| `ScreenerView` Export CSV | 接线：导出当前 `filteredItems` 为 CSV | 纯前端可完成，语义真实 |
| `ScreenerView` Auto-Refresh | 移除 | 行情经 WS 已实时，轮询开关是伪需求 |
| `CommunityIdeasView` 筛选 tab | 接线：按 `activeFilter` 过滤 `ideas` | 无源视图内部过滤即可 |
| `CommunityIdeasView` 评论/分享 | 移除 | 无社交后端，无行为可接 |
| `HeatmapsView` 24h/1w/1m | 移除 | 股票区块只有单一 `changePercent`，无 1w/1m 数据 |
| `App.tsx` `onAddSymbol` | 接线：打开既有符号搜索（`SearchModal`/命令面板） | 复用单一搜索入口 |
| `DesktopTitleBar` 通知 | 接线：传入真实触发警报列表；无则空态；删除假 Pine 条目与 `Mark all read` | 不得伪造内容 |
| `DesktopSettingsModal` 4 开关 + Save | 移除无落地开关，仅保留真实主题切换 + Close | 无硬件加速/云同步/声音开关后端 |

**决策 6：mock 去留**

- 删除：`INITIAL_NEWS`（无引用）、`INITIAL_SCREENER_ITEMS`（随接线删除）。
- 保留并文档化约束：`INITIAL_CALENDAR`、`HEATMAP_STOCK_ASSETS`、`COMMUNITY_IDEAS_DATA`、`BROKERS_CATALOG`（理由见 Context）。新能力要求这些无源表面不得与实时数据混淆（例如空态/说明）。

## Risks / Trade-offs

- [移除按钮/元素破坏 e2e/单测] → 同步更新断言（`panels.spec.ts` 等），任务 9 覆盖。
- [`useTickerList` 缺少 amplitude/turnover 维度字段] → 沿用"缺失值占位 + 排末尾"，不新增端点；若确需可另立 change。
- [Pro 原生指标/设置入口不可由 handle 调用] → 决策 4 已给出降级方案（桥接 Pro 原生 chrome 按钮），写入任务 4.1。
- [移除设置开关被理解为功能回退] → 这些开关从未落地（无 state 消费方），移除不损失既有能力；在 `ui-affordance-integrity` 中记录"存在即须生效"原则。
- [右栏宽度持久化触碰后端契约] → 优先 `localStorage`，不改 `/config`。
