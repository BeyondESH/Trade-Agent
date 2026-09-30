---
type: "Fragment"
id: frontend/src/terminal_panels
title: "右栏底栏交易终端面板"
description: "自选、提醒、盘口、成交、数据窗口这些右侧面板和底部抽屉（交易/筛选/回测/笔记）各自接什么数据？警报、下单、kill-switch、重置资金的规则是什么？"
parent: /frontend/src/_overview.md
fragment: terminal_panels
entity_names:
  constants:
    - name: PLACEHOLDER
      source: frontend/src/components/bottom/TradingPanel.tsx:16 / components/bottom/ScreenerPanel.tsx:33
      value: "\"—\"（交易面板，em dash）与 \"--\"（筛选面板）——无数据单元格必须走占位，MUST NOT 显示 0"
    - name: COLUMNS（交易列表列）
      source: frontend/src/components/sidebar/OrderBookPanel.tsx:7
      value: "价格 / 总量 两列（深度图用背景条而非文字色表示量能）"
    - name: COLUMNS（筛选列）
      source: frontend/src/components/bottom/ScreenerPanel.tsx:23
      value: "品种 / 最新价 / 涨跌% / 24振幅 / 成交额 / 资金费率 / 标记价；缺字段显示 PLACEHOLDER 并排到排序末尾"
    - name: CATEGORY_TABS（筛选 tab）
      source: frontend/src/components/bottom/ScreenerPanel.tsx
      value: "全部 / SPOT / USDT-FUTURES（值必须等于原始品类串，不能换成中文标签）"
    - name: BOTTOM_TABS
      source: frontend/src/components/bottom/BottomDock.tsx:10
      value: "交易 / 筛选器 / 策略回测 / 文本备注（tab 栏 MUST NOT 再加 Pine 编辑项）"
    - name: 图表状态位常量
      source: frontend/src/App.tsx:138
      value: "`isLogScale`/`isPercentScale`/`isAutoScale`/`showZero` 等由 App 持有；图表侧改动时必须走统一 setter，禁止旁路 state"
retrieval_hints:
  - "本子文档的排除句「数据层归属」只指**代码归属**（共享取数 helper 放 `lib/*.ts`），不是 SKILL 的分层架构术语；运行时时序上的「谁驱动谁」见 `_overview.md` 的「上下游关系」与「架构简析」。"
  - "行情面板/交易面板为什么显示 0 而不是 --？占位符规则是什么？"
  - "警报触发后为什么不重新计算了？重置(reset)改了什么字段？"
  - "下单按钮、确认、kill-switch 这三处分别调哪个后端接口、失败时行为是什么？"
  - "右侧图标条怎么加一个新面板？宽度、折叠、持久化规则在哪？"
  - "切换交易对的一瞬间，盘口为什么还留着上一个币的价位？价差那个数字是从哪算的？"
  - "自选列表与盘口深度的涨跌着色规则为什么不一样？"
  - "⚠️ 价格线画在图上的规则不在这里——在 `frontend/src/chart`；这里管警报**实体**与后端镜像。"
  - "⚠️ K 线数据取数/重连规则不在这里——在 `frontend/src/data_access`。"
  - "⚠️ 财经日历、热榜、社区观点、全域快讯这些属于 `frontend/src/market_views`，即使它们也从右侧图标条打开。"
  - "本模块也叫『右侧面板』『DOM 面板』『底部抽屉』『交易面板』，对应需求里的『自选列表』『订单簿深度』『成交流水』『模拟下单』。"
  - "架构归属：新的警报字段必须同时改 `lib/alertsStore.ts` 的 `Alert` 实体与 `api/client.ts` 的 `AlertRecord` 映射（`asAlert`），只改一侧会静默丢字段。"
architectural_role: "终端交互层：警报实体、下单确认、运行控制的唯一写路径；除 backend 外不接受第二数据源"
---

## 业务意图：这一层解决什么问题

右侧停靠栏与底部抽屉是交易员**动手**的地方——看盘口、盯行情列表、设提醒、下模拟单、开关风控。因此本层的业务目标不是"展示"，而是**保证每一次写操作都抵达后端并被后端状态回证**：

- 警报：本地即时可用 + 后端持久化 + 跨设备一致（断网期间以本地为准，不报错也不冒充服务器数据）。
- 下单：真实走后端风控两阶段确认，**UI 持仓只在后端 `approved` 之后才变**。
- kill-switch：状态永远来自 `GET /health`，切换后以后端返回为准。

同时本层还要处理"没数据时该显示什么"——行情面板一旦把缺失渲染成 0，交易员就会把"没有资金费率数据"读成"费率为 0"，这是会亏钱的错。

## 对外接口（写路径契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `POST /alerts` / `PUT /alerts/{id}` / `DELETE /alerts/{id}` / `GET /alerts` | 面板→后端 | `symbol`,`condition(above\|below)`,`threshold`,`enabled`,`triggered`,`triggerTime`,`createdAt`,`color` | 警报持久化（跨设备）。本地 `Alert` ↔ 后端 `AlertRecord` 的双向映射在 `asAlert` | `lib/alertsStore` + `api/client` |
| 下单两段 | 面板→后端 | `POST /order{symbol,side,price,amount?,leverage?,tp?,sl?} → {token}`；`POST /order/confirm{token} → {approved,filled,reason}` | 确认未通过/异常/离线 → **UI 一律不更新**（宁可看不见，不可看见假的） | `App.handlePlaceOrder`（`App.tsx:733`） |
| 运行控制 | 面板→后端 | `GET /health → kill_switch`,`live_enabled`；`PUT /control{kill_switch}` | 停机态须有明确视觉标识，状态切换**必须以后端响应为准**而非请求参数 | `TradingPanel:87,104` |
| 交易日志 | 面板→后端 | `GET /journal → {trades: unknown[]}` | 首次切到 History Tab 才拉一次（`historyRequestedRef` 守卫），字段宽松取值，缺字段显示占位 | `TradingPanel:112-118` |
| 组合 | 面板→后端 | `GET /portfolio → {equity, peak_equity, positions}` | 权益/持仓展示唯一来源 | `PortfolioPanel` / `TradingPanel` |
| Reset Funds | 面板→本地 | 恢复初始值 + 清空 positions/orders | **仅作用于本地模拟账户** | `App.handleResetPaperAccount`（`App.tsx:803`） |
| `subscribeAlerts(listener)` | 实体→各面板 | 完整实体数组 | 唯一警报变更通知出口：图表线、右栏列表、标题栏角标都走它 | `lib/alertsStore.ts:64` |
| `useOrderBook(symbol)` / `useTrades(symbol)` / `useDerivative(symbol)` | 面板→数据层 | 盘口档位 / 成交流水 / 资金费率·标记价 | 只允许这些 hook 提供盘口，禁止面板直连 WS | `hooks/*` |

### 面板/抽屉 DOM 契约（被 E2E 依赖）

`#global-nav-rail`、`#tradingview-right-dock`、`#right-tab-alerts`、`#right-tab-orderbook`、`#right-tab-news`、`#tradingview-bottom-dock`、`#bottom-tab-trading`、`#bottom-tab-screener`、`#screener-tab`（见 `frontend/tests/e2e/*.spec.ts`）。

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---|---|---|---|
| `frontend/src/data_access` | 全部实时镜像来源 | `useOrderBook` `useTrades` `useTickerList` `useDerivative` | extracted |
| `frontend/src/chart` | 警报线投影与右键设警（`onCreateAlertAt`） | `NativeChart` `syncPriceLineOverlays` `priceLineColor` | extracted |
| `frontend/src/app_shell`（`App.tsx`） | `priceMap`/`symbols`/`account` 等跨面板状态 | `App` 的 state 与回调 | extracted |
| `backend/src` | `/alerts`、`/order(/confirm)`、`/health`、`/control`、`/journal`、`/portfolio` | `api.client` | extracted |
| `lib/i18n` | 全部文案 | `t()` | extracted |

> 反向触发（谁调了这些面板）：图表右键 → `CreateAlertModal`；全局导航栏 `#nav-create-alert` / `#nav-open-order`；标题栏通知下拉读取已触发警报；`market_views` 里的行情列表通过点击把 symbol 交给外壳，再由右栏跟随。

## 典型调用链

### 1. 价格警报从创建到触发

```
图表右键「设置价格警报」→ onCreateAlertAt(price) → CreateAlertModal（initialPrice 预填）
  → onAddAlert → upsertAlert(Alert)                ← lib/alertsStore：立刻持久化 + 通知订阅者
                 + mirrorAlertCreate(alert)        ← 异步 POST /alerts（失败静默，本地仍有效）
  → 图上新增一条黄色线（groupId manual-price-lines）
priceMap 变化 → evaluateAlerts(loadAlerts(), priceMap) → 命中
  → updateAlert(id, {triggered: true, triggerTime})  ← 本地持久化
    → mirrorAlertUpdate(id, …)                       ← PUT /alerts/{id}
      → pushToast + notifyAlert（仅已授权时）+ 标题栏角标高亮
```

### 2. 下单到持仓变化

```
右栏/导航栏 BUY|SELL → OrderModal（价格/数量/杠杆/TP/SL）
  → onSubmitOrder → App.handlePlaceOrder
    → POST /order {symbol, side, price…}  →  {token}        ← 只登记风控意图
      → POST /order/confirm {token} → {approved, filled, reason}
        approved === true → 更新本地 positions/orders/account ← 本模块唯一"看起来成交"的时刻
        approved === false / 抛错 → 什么都不做（不弹成功 toast、不改余额）
```

## 实现约束清单（逐条核对）

### A. 警报实体（`Alert` == 价格线）

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------|
| `STORAGE_KEY` | `raibro.alerts` | `lib/alertsStore.ts:37` | 本地权威快照键 | — |
| `condition` | `above` \| `below` | `lib/alertsStore.ts:3` | 与图表线/弹窗语义必须同集合 | 只改一侧会让线变灰却不改触发方向 |
| `triggerTime` | ISO 字符串（未触发为 `undefined`） | `lib/alertsStore.ts` | 已触发只显触发时刻，MUST NOT 再显阈值 | 需求口径 |
| `ALERT_LINE_COLOR` | `#ff9800` | `lib/alertsStore.ts:24` | 警报线黄（不分高于/低于） | openspec/price-lines |
| `REFERENCE_LINE_COLOR_DARK/LIGHT` | `#787b86` / `#5d606b` | `lib/alertsStore.ts:25-26` | 参考线（`enabled:false`）随主题灰 | 同上 |

- **[单一实体] 参考线与警报线共用 `Alert`：`enabled:false` = 只画线、不参与触发判定；`enabled:true` = 画线 + 参与判定。MUST NOT 再引入"参考线"独立类型。**（来源: openspec/price-lines §统一价格线实体）
- **[触发判定短路三条件] `evalAlert` 必须在 `!enabled`、`triggered`、`!Number.isFinite(price)` 三种情况直接返回 false。**由来：已触发不重复报（`triggered`）；价格未就绪（NaN）**绝不能**被当成"跌破了"。`evalAlert` 只接受数字，别把 `undefined` 传进去。
- **[触发后必须镜像] 命中即 `updateAlert(...)` + `mirrorAlertUpdate(...)` 一对，缺一不可：只写本地会丢跨设备；只镜像会让 UI 与后端打架。`resetAlert` / `setAlertEnabled` 同理（`alertsStore.ts:170-181` 内部已含镜像，别在组件里重写裸 `updateAlert` 绕开它）。**（来源: openspec/alerts-local §价格触发）
- **[合并冲突处理] alert sync = 后端 + 本地独有，按 id 去重；**MUST NOT 整体覆盖本地**——离线创建的警报会被静默吞掉。**
- **[通知授权] `requestNotifyPermission()` 只能在用户点击事件里调用，MUST NOT 在挂载时申请（浏览器会直接拒且再难弹）。（来源: openspec/alerts-local §价格触发）**
- **[CreateAlertModal 每次干净] 每次打开必须以 `initialPrice ?? 当前价` 预填、条件/频率/备注重置。由来：沿用上次会话会让用户以为警报建在刚点的线上。**（来源: openspec/alert-modal-price-prefill）
- **[字段两处同步] 新增警报字段必须同时出现在 `Alert`、`AlertRecord` 与 `asAlert` 三处；只加 UI 会让字段过不了持久化。**

### B. 空值 / 占位显示

- **缺失字段一律占位：`null`/`NaN`/`""`/`0` 视为无数据 → `PLACEHOLDER`（`—`）MUST NOT 渲染裸 `0`。由来：真实数据 0 与"无数据"视觉相同，而资金费率、振幅是交易者用来判方向的，0 会被误读。**（来源: `TradingPanel.tsx:33-50` `formatMoney`/`formatTime` 语义 + openspec/ui-affordance-integrity「禁止无行为占位」+ 后端 `markets-overview-real-data` 的「区分空与未知」口径）
- **排序时空值一律排末尾，与升降序方向无关**（`useTickerList:151-153`）。
- **`formatTime` 对 `0` / 负数也返回占位：MUST NOT 把 epoch 0 当合法时间。**
- **空态必须区分"加载失败"与"没有数据"两种文案**（`NewsPanel.tsx:61`、`HistorySidebar` 等）；有失败态才出重试按钮，无数据只出空态，MUST NOT 用重试冒充空态。

### C. 下单与运行控制

- **下单两阶段不可绕过**：MUST NOT 直接改 `setPositions` 让 UI"看起来成交"。由来：纸面账户的价值在于复现真实风控结果。
- **kill-switch 以响应为准**（`PUT /control` 后用返回值覆盖本地状态）。
- **reset funds 只动本地模拟账户**。
- **`live_enabled` 只读展示，MUST NOT 在本轮给实盘上开提供入口。**

### D. 面板呈现契约（右栏 / DOM / 自选）

> 这一节管的是"面板上那个数字／那条颜色到底代表什么"。规则主体来自 `right-sidebar` 与 `orderbook-symbol-sync`（含 `draggable-layout`/`reskinned-panels` 两条"不要按旧字面实现"的澄清），共同红线是：**面板上不得出现任何"看起来像行情"的生成值**。

- **[切 symbol 立即清空，不等快照]** 订单簿面板在 `symbol`/`category`/`seriesKey` 变化时必须马上回到空态（由 `useOrderBook` 的 `EMPTY_BOOK` 重置），否则切换瞬间仍显示上一品种的 asks/bids，交易员会按错误的深度下单。快照到达后整体替换为新品种盘口，面板 top 档必须与 `GET /books/{cat}/{sym}` 一致。（来源: openspec/specs/orderbook-symbol-sync/spec.md §切换时立即清空 / §快照帧整体替换）
- **[价差是算出来的，不是写出来的]** `spread = best ask − best bid`（`useOrderBook.ts:79,95`），任一侧为空即 `null` → 面板渲染 `--`；MUST NOT 用硬编码占位或"看起来合理"的默认值。（来源: openspec/specs/orderbook-symbol-sync/spec.md §价差显示真实数据）
- **[涨跌着色的两种语义，别混用]** 自选列表（Watchlist）用**文字色**表达涨跌（Symbol / Last / Chg% 三列右对齐、行 hover 底色 `#2a2e39`、选中行左侧 2px 蓝条）；盘口（DOM）的深度用**背景色条**表达量能（列右对齐并 `tabular-nums` 等宽）。由来：DOM 里"量的相对大小"要靠长度读，而价格列本身要读的是方向与数值。把两条规则对调会让深度读不出来、或让自选列表变成一片色块。（来源: openspec/specs/right-sidebar/spec.md §Watchlist 自选列表 / §订单簿 DOM 面板）
- **[衍生品字段只来自 WS]** 资金费率与标记价格必须由 `funding-time` / `mark-price` 频道经 `useDerivative` 提供；未到达时显示 `--`，MUST NOT 填硬编码或静态 mock 值（面板上一个假的 0.01% 会被当成真实费率拿去算仓位与成本）。（来源: openspec/specs/right-sidebar/spec.md §订单簿 DOM 面板）
- **[Data Window 跟随十字光标]** 数据窗口的 O/H/L/C/V 必须随悬停 bar 与最新 bar 更新（`activeCandle` + 十字光标），MUST NOT 固化成"永远显示最后一根"。（来源: openspec/specs/right-sidebar/spec.md §Data Window）
- **[图标条是 8 项数据驱动]** `watchlist / alerts / news / datawindow / hotlists / calendar / orderbook / ideas`（`RightDock.tsx:135-158`），44px 常驻、不可折叠也不可拖宽；选中项左侧 2px 蓝条 + 图标变白；点当前 tab 折叠为仅图标条、图表区占满释放空间。（来源: openspec/specs/right-sidebar/spec.md §图标条面板与新闻入口）
- **[面板宽度只走钳制函数]** 拖拽必须经 `clampDockWidth` / `widthFromDrag`（260–500，越界钳制、非数值回落 280），持久化 `raibro.rightDockWidth`；MUST NOT 在组件里写固定宽度类（如 `w-[280px]`）绕过 `rightDockWidth.ts`。由来：面板内容多为长表格，宽度低于 260 会横向溢出、高于 500 会挤压中心图。（来源: `components/sidebar/rightDockWidth.ts` + openspec/specs/right-sidebar/spec.md Scenario 拖拽越界被钳制）
- **[面板拖拽重排尚未实现]** `openspec/specs/draggable-layout/spec.md`（按住头部移动面板、右下角缩放手柄、布局位置持久化 + 版本不兼容回落默认三栏）在当前 React 外壳中**没有对应实现**：唯一的可拖拽是 right-dock 左缘宽度手柄，底部抽屉高度是内容驱动。需求若写"面板可自由布局/刷新后恢复布局"，那是新需求（且 MUST NOT 借机恢复多图表网格，见 `frontend_src_app_shell.md`），不要声称已支持。（来源: openspec/specs/draggable-layout/spec.md）
- **[规格冲突：底部 Tab 里到底有没有"策略编辑器"]** 旧规格 `reskinned-panels` §底部 Tab 面板仍写着"持仓/委托、成交日志、**策略编辑器**"，而 `bottom-dock` 与源码注释（`utils/pineEngine.ts:5`「Retained (unused) … do not delete」）已明确禁止 Pine 入口，`BOTTOM_TABS` 也只有 4 项（交易/筛选器/策略回测/文本备注）。**以 `bottom-dock` + 现网代码为准**：不得因为"规格里写了"就把 Pine 编辑器加回来；被保留的是"策略参数经 `PUT /config` 持久化"这一行为（现由 QUANT LAB 承担）。（来源: openspec/specs/reskinned-panels/spec.md 与 openspec/specs/bottom-dock/spec.md 冲突，以后者为准 + `components/bottom/BottomDock.tsx:10`）
- **[重置资金与清空持仓是同一动作]** 二者共用一个 handler，且只影响本地纸面账户；只重置余额不清持仓 = 用户对着一个不存在的仓位继续操作（`ui-affordance-integrity` 的"控件必须真实驱动数据"）。（来源: openspec/specs/ui-affordance-integrity/spec.md §模拟账户重置资金）

### E. 底部抽屉 / 右侧栏交互规则

- **[MUST] 点击当前已展开项再点一次要收起；面板必须真打开且有内容**（否则 `ui-affordance-integrity` 判定为无行为占位）。
- **[MUST] 底部抽屉展开时：中心图表保留确定最小高度（等于折叠态可用高度），抽屉按目标高度完整呈现，超出部分由**工作区整体纵向滚动**继续揭示，`right-dock` 随工作区滚动；**折叠态无任何工作区滚动**。由来：抽屉里内容被压扁或被塞进内部二次滚动会让长表格只能看到头部。**（来源: openspec/bottom-dock §底部抽屉与 Tab + openspec/terminal-layout §状态栏）
- **[MUST] 底部抽屉首次展开自动滚到底部一次**，后续由用户自己决定滚动位置。
- **[FORBIDDEN] 底栏不得放 Pine 编辑器** —— 本项目真实策略执行路径是后端 DL 量化引擎，Pine 会诱导用户写不会被执行的策略。`utils/pineEngine.ts` 只是为将来策略编辑器保留的死代码（其头部注释含 `do not delete`）。（来源: openspec/bottom-dock §底部抽屉与 Tab + frontend/src/utils/pineEngine.ts:5）
- **[MUST] 回测面板 state 与其调用链必须独立于任何脚本编辑器 UI**，以便将来由别的配置界面触发。（来源: openspec/bottom-dock §回测面板）
- **[图标条宽度与面板宽度是两回事] 折叠/收起行为在本节；尺寸、钳制与持久化规则统一见 §D「面板宽度只走钳制函数」与「图标条是 8 项数据驱动」，MUST NOT 在两处各自定义 min/max（历史上宽度上限改过一次，就是只改了 E 没改 D）。由来：图标条 44px 是视觉锚定基准，面板 260–500 是可配置偏好。**（来源: `components/sidebar/rightDockWidth.ts`、`RightDock.tsx:161-184` + openspec/ui-affordance-integrity）
- **[MUST NOT 硬编码 tab 数量或列表] 面板条目由 `RightDock.tsx:186+` 数据驱动；`live_enabled` 等状态位一律来自后端。**

### F. 设计决策

| 决策点 | 选定方案 | 替代方案 | 理由 |
|--------|---------|---------|------|
| 警报数据源 | 本地 localStorage 权威 + 后端镜像 | 只走后端 | 离线可用、跨设备一致，且不因后端抖动丢用户已画的线 |
| 警报触发价来源 | 优先共享实时 `priceMap`，REST 轮询只补 WS 空白 | 全量轮询 | 避免 20s 级延迟与无意义流量 |
| 下单成交表现 | **仅在 `approved` 后**更新本地持仓 | 乐观更新 | 与后端风控一致优先；失败时界面"没反应"是可接受的，假持仓不可接受 |
| 价格线数据源 | 实体投影（`removeOverlay(groupId)` + 重建） | 图表侧存 overlay 列表 | 两份真相无法回答"拖这根线改的是哪个警报" |
| 成交/深度空值 | 占位符 `—` | 显示 0 | 缺失渲染成 0 会被当成"确实为 0"的行情读数 |

## 变更风险（改这里会破坏什么）

- 让下单 UI 在 `approved` 前更新 → 用户以为成交，实际被风控拒绝：这是纸面交易功能的定义级失败。
- 把 `evalAlert` 改成"只判 direction" → 已触发警报会被反复重报；离线触发（无价）会误触发。
- 只改 `Alert` 不改 `AlertRecord`/`asAlert` → 字段不落库，跨设备回来就丢，表现为"我设的警报没了"。
- 把占位符改成 0 / 去掉 `PLACEHOLDER` → 资金费率与振幅被误读为真实读数，直接影响方向判断。
- 在面板里自己 `new WebSocket()` 或直连 `api.candles` → 绕过 `category:symbol:timeframe` 路由与单调性守卫（属 `data_access` 的不变量），表现为盘口/成交残留上一个 symbol。
- 改 `#right-tab-*` / `#bottom-tab-*` 命名 → L3 Playwright journeys 立刻失败。
- 移除通知授权的点击来源 / 在挂载时申请 → iOS 与 Chrome 直接拒绝，之后再也无法授权。
- 图标条改成可隐藏，或面板宽度存到后端 chartstore → 用户偏好被错绑到 series 维度，切品种后栏位忽宽忽窄。
- 切 symbol 不立刻重置盘口 → 切换瞬间显示上一品种深度；配合"用旧盘口判断有无变化"的节流会让面板彻底停止更新（`orderbook-symbol-sync` 与 `ui-live-data-sync` 同条红线）。
- 给资金费率/标记价补一个"合理的默认值" → 用户按假费率算仓位与成本，是真实亏钱类错误，而不是显示瑕疵。
- 把 DOM 深度条换成文字着色、或把自选涨跌换成背景条 → 两个面板的读法互换，深度信息与方向信息同时失效。

## 术语对照

| 需求语言 | 代码 | 位置 |
|---|---|---|
| 价格线 / 参考线 / 警报线 | `Alert` 实体（`enabled` 区分） | `lib/alertsStore.ts:4` |
| 同步到服务器 | `syncAlertsFromServer` / `mirrorAlertCreate/Update/Delete` | `lib/alertsStore.ts:186-216` |
| 停止交易 / 风控总闸 | kill-switch ↔ `kill_switch`，`GET /health` + `PUT /control` | `TradingPanel.tsx:77-106` |
| 交易日志 / 历史成交 | `GET /journal` | `TradingPanel.tsx:112-129` |
| 盘口 / 深度 | `useOrderBook(symbol)`；快照整体替换、update 增量 merge、size≤0 删除 | `hooks/useOrderBook.ts:49-113` |
| 最新成交 | `useTrades` | `hooks/useTrades.ts` |
| 右侧图标条 / 停靠面板 | `#global-nav-rail` / `#tradingview-right-dock` / `#right-toolstrip` | `components/sidebar/RightDock.tsx` |
| 底部抽屉 / Pine 编辑器 | `BOTTOM_TABS`（**无 Pine**）/ `utils/pineEngine.ts` 死代码 | `components/bottom/BottomDock.tsx` |
| 重置资金 | `handleResetPaperAccount` | `App.tsx:803` |

## 文件组成与覆盖（本子文档负责的文件）

| 组 | 文件（相对 `frontend/src/`） |
|---|---|
| 右侧停靠栏 | `components/sidebar/RightDock.tsx`（图标条 + 面板宿主 + 宽度拖拽 `rightDockWidth.ts`）、`WatchlistPanel.tsx`、`AlertsPanel.tsx`、`OrderBookPanel.tsx`、`TradesTape.tsx`、`DataWindowPanel.tsx` |
| 底部抽屉 | `components/bottom/BottomDock.tsx`、`TradingPanel.tsx`、`ScreenerPanel.tsx`、`StrategyTester.tsx`、`NotesPanel.tsx` |
| 警报/通知 | `lib/alertsStore.ts`、`lib/alertNotify.ts` |
| 测试 | `components/sidebar/{RightDock,AlertsPanel,OrderBookPanel,TradesTape,WatchlistPanel}.test.tsx`、`components/bottom/{ScreenerPanel,TradingPanel}.test.tsx`、`lib/{alertsStore,alertNotify,paperAccount}.test.ts` |

> `CalendarPanel.tsx`、`NewsPanel.tsx`、`HotlistsPanel.tsx`、`CommunityIdeasPanel.tsx` 虽也从右侧图标条打开，但其取数与内容规则统一记录在 `frontend_src_market_views.md`；`DataWindowPanel.tsx` 的"当前 K 线 O/H/L/C/V"随 `activeCandle` 与十字光标更新，其悬停语义属本子文档。
