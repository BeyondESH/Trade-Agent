---
type: "Fragment"
id: frontend/src/chart
title: "图表渲染与叠加层"
description: "K 线实例怎么创建与销毁？周期栏的固定(pinned)级别存哪？价格线、回测信号标记这些叠加层如何绘制，右键菜单与设置弹窗走哪些规则？"
parent: /frontend/src/_overview.md
fragment: chart
entity_names:
  constants:
    - name: DEFAULT_PINNED_TIMEFRAMES
      source: frontend/src/lib/periodsStore.ts
      value: "[\"1m\",\"15m\",\"1h\",\"6h\",\"1d\",\"1w\",\"1mo\"]（无记录时的默认常驻级别）"
    - name: STORAGE_KEY（pinned）
      source: frontend/src/lib/periodsStore.ts
      value: "\"raibro.pinnedTimeframes\"（全局用户偏好，不按 symbol 分键）"
    - name: NATIVE_PERIODS / PERIOD_GROUPS
      source: frontend/src/components/chart/KLineChartProView.tsx
      value: "全 15 级 + 分组：second(1)、minute(1/3/5/15/30)、hour(1/2/4/6/12)、day(1/3)、week+month（周/月合一组）；`groupPeriods()` 过滤空组"
    - name: NATIVE_TOOL_INDEX
      source: frontend/src/components/chart/KLineChartProView.tsx
      value: "{ indicator: 0, settings: 2 } —— 点击 vendor 周期栏自带的原生按钮来打开指标选择/设置弹窗"
    - name: PRICE_LINE_GROUP_ID
      source: frontend/src/lib/chartController.ts:109
      value: "\"manual-price-lines\"（所有价格线 overlay 的共同 groupId，删除/重建按组进行）"
    - name: CANDLE_PANE / SUB_PANE_PREFIX
      source: frontend/src/lib/chartController.ts:8-9
      value: "\"candle_pane\" / \"indicator_pane\"（主图与副图 pane id 前缀，paneSeq 自增）"
    - name: LONG_COLOR / SHORT_COLOR
      source: frontend/src/lib/signalMarks.ts:11-12
      value: "`#089981` / `#f23645`（多/空标记与蜡烛涨跌同色，交易者靠色感判方向）"
    - name: BASE_INTERVAL_MS
      source: frontend/src/lib/replayEngine.ts:14
      value: "500（回放基础步进间隔；实际间隔 = BASE_INTERVAL_MS / speed，speed 只有 1/3/10）"
    - name: timezone / locale
      source: frontend/src/components/chart/KLineChartProView.tsx
      value: "\"Asia/Shanghai\" / \"zh-CN\"；主图指标默认 [\"MA\"]、副图 [\"VOL\"]、drawingBarVisible: true"
    - name: ALERT_LINE_COLOR / REFERENCE_LINE_COLOR_DARK / REFERENCE_LINE_COLOR_LIGHT
      source: frontend/src/lib/alertsStore.ts:24-26
      value: "\"#ff9800\" / \"#787b86\" / \"#5d606b\"（enabled→警报黄；disabled→随主题灰；自定义 color 优先）"
retrieval_hints:
  - "K 线是怎么被创建出来的？为什么反复切图会卡住或者出现两个图？"
  - "周期栏里我固定的级别存在哪、换浏览器为什么没了？"
  - "为什么我把周期栏的月线点成 1 分钟线了？"
  - "在 K 线上画的水平价格线、买卖点标记是怎么画上去的、按什么分组删除？"
  - "往后拖看更早历史时为什么不能返回最新数据？拖到顶（或回灌失败）时图应该怎么停下来？"
  - "左缘提前预载历史（preload）现在真的生效吗？该改哪个函数？"
  - "⚠️ K 线数据从哪个接口来、时间级别字符串规则——不在这里，在 `frontend/src/data_access`。"
  - "⚠️ 警报实体与后端镜像规则不在这里——在同仓库 `frontend/src/terminal_panels`（本子文档只负责把实体画成线）。"
  - "⚠️ QUANT LAB 内的信号 K 线自带独立实例，不与主图共享实例/订阅，见 `frontend/src/quant_lab`。"
  - "本模块也叫『主图』『图表工作区』『chart 外壳』，对应需求里的『K 线图』『周期栏』『绘图工具条』『叠加层/图层』。"
  - "架构归属：任何新 overlay 必须经 `lib/chartController.ts` 建立（`AutoLayerController.createOverlay` 登记 id / `syncPriceLineOverlays` 按 `groupId` 重建），禁止在组件里裸调 `chart.createOverlay` 让图元脱离 id 与 groupId 簿记。"
architectural_role: "表现层核心：klinecharts-pro 实例的唯一持有者 + 所有覆盖层（价格线/信号标记）的绘制与回收规则"
---

## 业务意图：这一层解决什么问题

图表层解决的是**"用户看到的这根线，和他刚才选的东西一致"**。它不做数据获取（那属于数据层），而是：在正确的时候用正确的实例创建图，把用户偏好（固定级别、主题、语言、时区）稳定地传给 vendor，并把**业务实体（价格线、回测信号）投影为 overlay 且可完整回收**。

两个失败模式是本层存在的理由：

1. **实例泄漏**——vendor 的 `KLineChartPro` 没有 `dispose()`；重复 `new` 会抢占 datafeed 订阅，被用户看见的那张图反而停止更新（症状：切了半天图不动，但不报错）。
2. **状态残留**——`applyNewData(list, false)` 的 `false` = "替换而非追加"。若数据层把 `false` 丢掉，切周期后新旧周期的 bar 混在同一条时间轴上，形成不可解释的图形。

## 对外接口（图表层暴露给外壳/面板的契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `KLineChartProHandle` | 外壳→图表 | `setSymbol` / `setPeriod` / `setTheme` / `setLocale` / `getChart` / `getRoot` / `openIndicatorPicker` / `openSettings` / `resetView` | 命令式控制；原生 chrome 与 App 状态都走这里 | `KLineChartProView`（forwardRef） |
| `NativeChart` props | 外壳→图表 | `symbol`、`timeframe`、`theme`、`onSymbolChange`、`onPeriodChange`、`onChartReady`、`onCreateAlertAt(price)` | 双向联动的声明式入口；右键告警预填价格从这里出去 | `NativeChart` |
| 原生回调 | 图表→外壳 | `onSymbolChange(proSymbol)` / `onPeriodChange(period)` | 用户在 vendor 周期栏/搜索框里改了选择，外壳必须同步 `activeSymbol`/`timeframe` | vendor → `propsRef.current.*` |
| 价格线投影 | store→图表 | `Alert[]` → `PriceLineConfig[]` → `OverlayCreate` | alertsStore 是唯一数据源，overlay 是其投影 | `syncPriceLineOverlays` / `priceLineToOverlay` |
| context menu 回调 | 图表→外壳 | `onCreateAlertAt` / `onAddIndicator` / `onCopyPrice` / `onOpenSettings` / `onResetView` | 5 个真实动作；MUST NOT 出现只改高亮不改状态的项 | `ChartContextMenu:38` |
| `window.__kline_chart__` | 图表→E2E/诊断 | 当前 `Chart` 实例 | Playwright 只读诊断钩子；MUST NOT 用它改图 | `KLineChartProView:243` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---|---|---|---|
| `frontend/src/data_access` | 取历史与实时 bar，决定周期字符串是否合法 | `BitgetDatafeed` `periodFromTimeframe` | extracted |
| `frontend/src/terminal_panels`（alertsStore） | 价格线/警报实体与其订阅 | `subscribeAlerts` `loadAlertsForSymbol` `updateAlert` `mirrorAlertUpdate` `priceLineColor` | extracted |
| `frontend/vendor`（`@klinecharts/pro`、`klinecharts`） | 图表/overlay 绘制本体；样式覆盖 `klinecharts-pro-theme.css` 必须晚于 vendor CSS 引入 | `KLineChartPro` `Chart` `OverlayCreate` | extracted |
| `frontend/src/quant_lab` | QUANT LAB 的独立图与信号标记复用本层导出 | `KLineChartProView` `signalsToOverlays` | extracted |
| `lib/fonts.ts` | Canvas 字体无法解析 CSS 变量，必须显式传字体栈 | `FONT_FAMILY_STACK` | extracted |
| `lib/periodsStore.ts` | 固定级别偏好读写（localStorage） | `loadPinnedTimeframes` `savePinnedTimeframes` `togglePinnedTimeframe` | extracted |

## 典型调用链

```
（创建）NativeChart.render → <KLineChartProView ref=... symbol=toProSymbol(...) period=periodFromTimeframe(timeframe) datafeed=bitgetDatafeed>
  → mount effect（依赖 []，只跑一次）：
      mountedRef 已 true？→ clearTimeout(disposeTimerRef) 复用实例       ← StrictMode/快重挂守门
      否则 new KLineChartPro({...}) → mountedRef = true → props.onReady(chart)
      cleanup：disposeTimerRef = setTimeout(() => { datafeed.unsubscribe(...); container.innerHTML=""; proRef=null; mountedRef=false }, 0)
  → props 变化不重建实例：由 propsRef + setSymbol/setPeriod/setTheme/setLocale 命令式跟进

（画价格线）alertsStore.saveAlerts → notifyAlertsChanged
  → NativeChart 订阅回调 → setAlerts(loadAlertsForSymbol(ticker))
    → effect [alerts, symbol.ticker, theme, chartReady]
      → syncPriceLineOverlays(chart, lines)
          → chart.removeOverlay({ groupId: "manual-price-lines" })   ← 先清组，保证幂等
            → 逐条 widget.createOverlay(priceLineToOverlay(line))，create.groupId = PRICE_LINE_GROUP_ID
              并挂 onClick（打开线设置弹窗）/ onDragEnd（updateAlert + mirrorAlertUpdate 回写阈值）

（画回测信号）QUANT LAB 回测完成 → lib/signalMarks.signalsToMarks(signals, openTime, priceByTs)
  → 只为 priceByTs 里真实存在的 bar 生成标记（缺 bar 跳过，不画到轴外）
    → groupId "backtest-signals"；重跑时先 removeOverlay({groupId}) 再画全部
```

## 实现约束清单（逐条核对）

### A. 实例与生命周期

- **[单例守卫不可拆] mount effect 的依赖数组必须是 `[]`（只建一次），props 一律经 `propsRef.current` 读——把 `symbol`/`period` 写进依赖会重建实例并重复订阅。**（来源: frontend/src/components/chart/KLineChartProView.tsx:199 注释）
- **[StrictMode/快重挂必须走复用] 首次 mount 时若 `mountedRef.current` 为真，要 `clearTimeout(disposeTimerRef)` 并复用实例；卸载清理必须**延迟到下一个 tick**（`setTimeout(..., 0)`）。理由：vendor 无 `dispose()`，双挂载各建一个实例会互相抢订阅。新增"卸载时同步 dispose"的直觉写法会让开发模式下的图表直接空白。**（来源: 同文件 :113-131）
- **[卸载必须做三件事]** `datafeed.unsubscribe(symbol, period)`、清空容器 DOM、把 `mountedRef` 复位。漏第二件 → 页面尺寸错乱 / 遗留 canvas 监听（`chart-shell-integrity` 规格：「SHALL NOT leave event listeners behind across remounts」）。
- **外壳 `main` 区域仅在 `activeView === "chart"` 时挂 `NativeChart`（`App.tsx:896`），切走即整棵卸载、切回即重建；任何"让图表常驻不卸载"的优化都必须同时保留上述卸载三件事。**（来源: openspec/chart-mount-lifecycle Scenario「卸载重挂要干净重建」）
- **[E2E 钩子与字体重绘保留] `window.__kline_chart__`（`KLineChartProView.tsx:236`）供 Playwright 只读断言当前数据列；`document.fonts.ready.then(() => getChart().resize())`（:246）是 webfont 下载完成后补一次重绘的时机。删掉任一个都会让 E2E 或文字度量类 bug 复活。**

### B. 周期栏与固定级别

- **[周期栏归属 vendor] 周期栏 MUST NOT 在应用层重写：常驻行 + 扩展弹窗必须由 vendor 的 PeriodBar 渲染，应用只传 `pinnedTimeframes` / `onPinChange` 两个参数，点击原生按钮（指标/设置）用 `.item.tools[index]` 模拟点击而非自建。由来：两套周期选择器会分别持有状态，出现"点了没反应"。**（来源: openspec/klinecharts-pro-integration 决策 + `KLineChartProView` NATIVE_TOOL_INDEX 实现）
- **[text 即标识符] `Period.text` 必须等于规范标识符（`"1mo"`/`"1m"` 等），它是固定列表存储、`groupPeriods` 分组、点击匹配的同一把键。任何归一化（`trim().toLowerCase()`）必须与解析处一致。由来：把 `1mo` 归一成 `1m` 会让用户点到月线拿到 1 分钟数据。**
- **[pinned 是全局偏好] 固定级别存 `raibro.pinnedTimeframes`，MUST NOT 按 symbol/series 分键（`periodsStore.ts:3-8` 注释显式说明：后端 chartstore 是按 `category:symbol/timeframe` 键的，而这个偏好不属于任何品种）。**（来源: `lib/periodsStore.ts:3-8`）
- **[显式空列表 ≠ 无记录] `hasPinnedRecord()` 为真且列表为空时，MUST NOT 回落默认值——这是"用户主动清空常驻栏"的语义；只有读不到/解析失败才回落 `DEFAULT_PINNED_TIMEFRAMES`。同时 localStorage 不可用（隐私模式）时保存必须静默失败但**仍要通知订阅者**。**（来源: `lib/periodsStore.ts:9-11,44-51`）
- **[listener 隔离] `notifyPinnedChanged` 对单个回调 try/catch（`:78`）——一个坏订阅者不能吃掉 store，也不能让别的组件永远收不到变更。**
- **[周/月同组] 分组规则：week 与 month 必须合入一组。**否则月级在弹窗里无处安放、用户无法固定。

### C. 数据注入与序列完整性

- **图表数据注入只允许两条：`chart.applyNewData(list, false)`（整批替换，第二参 `false` = 不保留旧序列）与 `chart.updateData(bar)`（末根更新 / 新桶追加）；二者在 `AutoLayerController.applyData/clearData/updateData` 里封装（`chartController.ts:29-40`）。由来：若 `false` 被丢掉，切周期时新周期的 bar 会追加到旧周期后面。**
- **`AutoLayerController.clearData()` 语义是 `applyNewData([], false)`；`detach()` 必须清 `overlayIds` 与 `indicatorPanes`。**由来：切 symbol 后若只清数据不清图层，旧品种的价格线结构会留在新图上（不报错）。
- **同一指标名不重复建 pane（`indicatorPanes[spec.name]`），副图 paneId 用 `indicator_pane_<paneSeq>` 自增；若 paneId 复用旧值会画到已移除面板上（点不到也不重绘）。**
- **`setIndicators` 会先 `removeIndicator` 掉自己管的所有 pane，MUST NOT 用它去清用户手建的 pane（白名单外一律不碰），否则用户自己加的指标会凭空消失。**
- **[后向加载方向性] 后向加载（拖看更早历史）返回给 `applyMoreData` 的列表必须全部 `timestamp <= to`：`normalizeBackwardList(bars, to)`（`api/datafeed.ts:152`）负责升序、按 timestamp 去重、并裁掉晚于区间终点的数据。由来：vendor 的 `applyMoreData` 不做任何去重，"区间无数据就拿最新行情兜底"会让最新 bar 被当作更早历史 prepend，同一条时间轴出现两份近期数据（表现为重复 K 线、图看似卡住）。**（来源: openspec/specs/chart-history-lazy-load/spec.md）
- **[边界用空列表干净终止] 回灌异常失败、或该 series 已 `exhausted` 时 `getHistoryKLineData` 返回 `[]`，让 klinecharts 以 `applyMoreData([], false)` 关闭后续加载，图表干净停在边界。MUST NOT 改成 `null` 或抛异常（异常进入 vendor 加载链 = 图表空白）；也 MUST NOT 在应用层再加"永久不再加载"的黑名单——切 symbol/周期或重挂载会重置加载开关，那是失败后唯一的重试入口。**（来源: openspec/specs/chart-history-lazy-load/spec.md §回灌失败或已到最早时干净终止）
- **[只有首次播种可以返回最新 bar] `prevEarliest == null`（该 series 的第一次请求）是唯一允许把 `/candles/recent` 的最新数据当历史返回的路径；其余一律"区间内数据或空"。这条区分正是"打开图表立刻画出几百根"与"向后拖不得拿未来数据"能共存的前提。**（来源: openspec/specs/chart-history-lazy-load/spec.md §初始加载与后向加载可区分）
- **[左缘预载尚未接线] `BitgetDatafeed.prefetchDeeper()`（5s 节流 + in-flight 去重 + 未知/exhausted series 直接跳过）目前只有 `api/datafeed.test.ts` 调用，生产路径没有触发点；当下"提前预载"实际由 vendor 拖到数据起点的 `loadMore` 承担。若需求要"可见区左缘进入约 0.6 个视口宽度余量即预取"，必须挂在图表可见范围变化回调上调用 `prefetchDeeper`（MUST NOT 另写一份回灌请求），并保留四条护栏：`loading` 中忽略新触发、空结果即停止直至 symbol/period 重载、拖到硬边界（`from === 0`）时原 `loadMore` 兜底仍可触发、切换 symbol/period 重置预载状态。**（来源: openspec/specs/chart-history-preload/spec.md + `api/datafeed.ts:269`）
- **[仅实时级别的空图不是错误] 切到 `1s` 时 `getHistoryKLineData` 直接返回 `[]`：图表应呈现"该级别无历史"的中性状态（由 WS 逐根填出），MUST NOT 渲染成加载失败/错误提示；周期栏还须能辨识地标示"仅实时"。**（来源: openspec/specs/realtime-only-timeframe/spec.md §仅实时级别的界面标示）
- **[轴/图形类型只改样式] 价格轴 `normal|percentage|log` 与 K线/OHLC/面积 的切换一律走底层 `setStyles`（现状入口在 `components/timebar/BottomTimebar.tsx`），MUST NOT 借"切换"之名改 datafeed 数据或重放历史；`topbar-controls` 的图表类型菜单与 `1/5/15` 快捷键切周期目前未接线，实现时同样只允许动样式或走 `onPeriodChange`。**（来源: openspec/specs/charting/spec.md §坐标轴与十字光标 + openspec/specs/topbar-controls/spec.md）
- **[撤销上一笔]** vendor 无原生 undo，`AutoLayerController.undoLastDrawing()` 从自维的 overlay id 列表末尾逐个移除（`chartController.ts:41-96`：`createOverlay` / `recordOverlayId` 负责录入，`removeOverlay({id})` 负责删）。MUST NOT 改成"按 symbol 整组清除"——会误删用户在手画的其他图层。

### D. 叠加层（价格线 / 信号标记）

- **[单一数据源] 价格线只能由 Alert 实体投影（参考线 = `enabled:false`，警报线 = `enabled:true`），MUST NOT 引入第二份"图表自己的线"列表。由来：两套真相无法回答"拖这根线改的是哪个警报"。**（来源: openspec/price-lines §统一价格线实体）
- **[重绘幂等] 每次 store/theme/symbol/chartReady 变化，都按 `removeOverlay({groupId}) → 逐条 createOverlay` 重建；MUST NOT 增量 diff。来源：增量 diff 与 drag/undo 并发会让线重复出现。**
- **[按 symbol 过滤] `alertLinesToDraw(alerts, symbol, theme)` 必须过滤 `symbol`；漏过滤会把别的品种的线画到当前图上 = 错误的支撑阻力位。**
- **[拖动即写回] `onDragEnd` 必须回写实体（`updateAlert` + `mirrorAlertUpdate`）；只改视觉不改实体是违规（`ui-affordance-integrity`：选中态/控件 MUST 真实驱动数据）。注意：**拖动改变的是 `threshold`，不会重新判定触发**——已触发要变须走 reset。**
- **[信号标记只在真实 bar 上] `signalsToMarks` 必须用 `timestamp → close` 映射跳过图表没有的那根 bar（`sliceCount` 截断 + `skip missing ts`）；直接按 index 对齐会在历史与信号长度不等时把标记画到轴外/错位。**
- **[颜色语义固定] 警报黄 `#ff9800`（不区分高于/低于）、参考线随主题取 `#787b86`(dark)/`#5d606b`(light)、自定义 `color` 优先；多/空标记用 `#089981`/`#f23645` 且与蜡烛涨跌同色，因为交易者靠色感区分方向。**（来源: openspec/price-lines §价格线颜色）
- **[菜单动作要落地] 右键菜单每一项必须做真实动作：`A:创建警报（带光标价预填）`、`I:添加指标（原生选择器）`、`C:复制价格`、`S:设置`、`R:重置视图`；菜单打开时禁止向 `INPUT/TEXTAREA/contenteditable` 派发；`Escape` 关菜单，其它单键 `a/i/c/s/r`；位置要夹到视口内（窗口宽-220/高-240）。MUST NOT 出现"多图表布局"类未实现项。**（来源: openspec/chart-context-menu + `ChartContextMenu.tsx:37-50`）
- **[预填价每次生效] `onCreateAlertAt(price)` 传出的价格必须成为弹窗初值；弹窗每次打开都要重置为全新表单。来源：复用上次会话会让用户以为设在了刚点的那条线上。**（来源: openspec/alert-modal-price-prefill）

### E. 样式与主题

- **[图表配色必须与外壳同族] 蜡烛/网格/坐标轴等样式在 `KLineChartProView` **构造参数**里写死（涨跌 `#089981`/`#f23645`、网格 `#2a2e39`、文字 11px `FONT_FAMILY_STACK`），而**面板**配色走 `--tv-*`。改设计 token 时这两处都查，只改 CSS 会出现"面板变了、图没变"。**
- **[主题只走 API] 主题/语言切换必须用 `setTheme(theme)` / `setLocale(locale)` 命令式切换，MUST NOT 重建实例；构造时传入的 `styles`（网格/涨跌/坐标轴）**不随主题重算**——需要随主题变的文字色必须单独处理（当前 `tickText.color: "#d1d4dc"` 为深色主题硬编码）。**（来源: openspec/chart-theming）
- **[CSS 引入顺序] `klinecharts-pro-theme.css` MUST 在 vendor `klinecharts-pro.css` 之后导入；它靠同名选择器后置生效，改导入顺序即覆盖失效。**
- **[overlay DOM 清理] 关闭的 overlay 其 DOM 必须由本层移除（框架无自动清理）——遗留节点会在下次重绘时叠影。**
- **[回放 / 纸面账户（已实现未接线）] `lib/replayEngine.ts`（`BASE_INTERVAL_MS 500`，速度只允许 `1|3|10`，`load()` 游标钳制 `1..len-1`，到末尾自动 pause；MUST NOT 为"留到最后"开边界特例）、`lib/paperAccount.ts`（注释明确「纯前端，MUST NOT 触达真实 /order 接口」——纸面账户是训练用，不得接进真实下单通路）、`utils/{indicators,pineEngine}.ts`（文件头注释：为将来的策略编辑器保留，do not delete）。** 需求若要把回放接上，第一步是 `bitgetDatafeed.suspendUpdates(true)`——数据层的这个接口就是为此留的，禁止另挂一个暂停位。

### 设计决策

| 决策点 | 选定方案 | 替代方案 | 理由 |
|---|---|---|---|
| overlay 重绘 | 按 `groupId` 整组「清空后重建」投影 | 增量 diff + 单独 update | 投影函数幂等，重绘成本可忽略；增量 diff 与 drag/undo 并发会产生重复线 |
| 周期条 | 完全用原生（pin + 扩展），只模拟点原生按钮 | 应用层自建周期栏 | 两套周期选择器是历史上最难诊断的状态不一致；原生才有"拖宽/滚动/固定"一致性 |
| strict 兼容 | 延迟销毁 + `mountedRef` 复用 | 给 vendor 加 `dispose()`（fork bundle） | 不改 vendor 就不承担升级成本 |

## 变更风险（改这里会破坏什么）

| 改动 | 破坏的规则 | 后果 |
|---|---|---|
| 给 mount effect 加 `[symbol]`/`[period]` 依赖 | 实例单例 | 每次切换新建实例，两个图抢同一 datafeed 订阅 → 用户看到的停止更新，诊断困难 |
| 卸载改为同步清理 | 单例守卫 | 开发模式白屏（双挂载后清理掉刚建好的实例） |
| 周期栏改成应用自建 | `klinecharts-pro-integration` 决策 + `period-selector-pinning` | 两套周期状态，点了不切换或切成另一个级别 |
| 价格线不过滤 symbol | 叠加层语义 | 别的品种的线出现在当前图上 = 错误的支撑阻力位 |
| 只用 `applyNewData` 不带 `false` | 替换语义 | 切周期后新旧周期 bar 混一轴，图形不可解释 |
| 拖动 end 不回写实体 | 控件必须驱动数据 | 线会"弹回去"，用户以为功能坏了 |
| 裸调 `chart.createOverlay` | overlay 生命周期 | 该线撤不掉、也不会随 symbol 切换消失 |
| `text` 写回显示文案 | text 即标识符 | 点击与固定错乱 |
| 改 `PRICE_LINE_GROUP_ID` 字符串 | 分组删除契约 | 旧线永远删不掉 |
| 给后向加载兜底最新数据 | 后向结果必须 `<= to` 且 vendor 不去重 | 最新 bar 被 prepend 成"更早历史"：重复 K 线 + 时间轴倒挂 |
| 到顶/失败改成 throw 或 null | 空列表是 vendor 的停止信号 | 反复触发加载（请求风暴）或图表整块空白 |
| 以为 `prefetchDeeper` 已生效而去改它的算法 | 生产路径无调用方 | 结论是"预载没效果"，实际改在了没人调的函数上、真正该有的触发点仍缺失 |
| 借轴类型切换重放/改写数据 | 类型切换只改 `setStyles` | 数据被二次改写，与 datafeed 的序列守卫冲突，出现凭空多出的 bar |
| 删 `window.__kline_chart__` | E2E 诊断钩子 | Playwright 断言直接失败 |
| 改 `styles` 里涨跌色而不同步 token | 同族配色 | 蜡烛与自选列表涨跌色不一致，用户判读方向出错 |

## 术语对照

| 需求语言 | 代码 | 位置 |
|---|---|---|
| 周期栏 / 常驻级别 | `pinnedTimeframes` / `raibro.pinnedTimeframes` / `loadPinnedTimeframes` | `lib/periodsStore.ts` |
| 扩展弹窗 / 分组 | `groupPeriods` / `PERIOD_GROUPS` | `components/chart/KLineChartProView.tsx` |
| 指标选择弹窗 | `openIndicatorPicker` → `clickNativeTool(0)` | 同上 |
| 固定列表 | `togglePinnedTimeframe` / `hasPinnedRecord` | `lib/periodsStore.ts` |
| 价格线 / 参考线 | `syncPriceLineOverlays` / `PRICE_LINE_GROUP_ID` / `priceLineColor` | `lib/chartController.ts` |
| 买卖点标记 | `signalsToMarks` / `groupId "backtest-signals"` | `lib/signalMarks.ts` |
| 撤销上一笔 | `undoLastDrawing` / `recordOverlayId` | `lib/chartController.ts` |
| 主图 / 副图 pane | `CANDLE_PANE` / `SUB_PANE_PREFIX` | `lib/chartController.ts:8` |
| 右键动作 | `ChartContextMenu` 5 项 | `components/chart/ChartContextMenu.tsx:32,135` |

## 附：内置文档摘要

> 📋 本节内容来源于 openspec（`openspec/specs/klinecharts-pro-integration/spec.md`、`chart-theming/spec.md`、`chart-history-lazy-load/spec.md`、`chart-history-preload/spec.md`、`realtime-only-timeframe/spec.md`、`charting/spec.md`）与 vendor 自带文档 `frontend/vendor/klinecharts-pro/docs/{en-US,zh-CN}/`（后者是第三方文档，未纳入本模块权威规则）。

- **二次开发扩展点**（`klinecharts-pro-integration`）：对 vendor 的改动保持最小——只暴露底层实例与 symbol/period 变更回调；vendor 加载竞态修复集中在 `frontend/vite.config.ts` 的 alias 指向的 dist bundle 里（**不要**在应用层做补偿，也不要再引第二份 klinecharts）。
- **图表 TV 风格配色**（`chart-theming`）：配色改动 MUST NOT 改变既有数据流与 props 语义（只改视觉即视为安全，若顺带改了数据流则该 spec 明确禁止）；水印用文本水印并跟随品种/周期；网格亮度只比背景高一档。
- **vendor 本地化构建链**（`frontend/vite.config.ts:13-18`）：`@klinecharts/pro` 由 alias 直指 `vendor/klinecharts-pro/dist`，原因是 `file:` 引用在 Windows 不稳；若 `dist` 缺失会直接报「未找到 klinecharts-pro dist 文件，请先在 vendor/klinecharts-pro 中执行 npm run build」——遇到该报错先跑 vendor 构建脚本，不要改 alias。

## 文件组成与覆盖（本子文档负责的文件）

| 组 | 文件（相对 `frontend/src/`） |
|---|---|
| 图表实例 | `components/chart/KLineChartProView.tsx`（实例创建/生命周期/imperative handle）、`components/chart/NativeChart.tsx`（外壳胶水：datafeed 装配、叠加层投影、右键交互） |
| 图上交互 | `components/chart/ChartContextMenu.tsx`（主图 5 项动作）、`components/chart/PriceLineSettingsModal.tsx`（线设置弹窗，`COLOR_OPTIONS`） |
| 时间栏 | `components/timebar/BottomTimebar.tsx`（`RANGES`、log/percent/auto 比例切换） |
| 叠加层控制 | `lib/chartController.ts`（`AutoLayerController`、价格线同步、像素↔价格） |
| 固定周期栏 | `lib/periodsStore.ts` |
| 信号标记 | `lib/signalMarks.ts` |
| 保留未接线 | `lib/replayEngine.ts`、`lib/paperAccount.ts`、`utils/indicators.ts`、`utils/pineEngine.ts` |
| 测试 | `components/chart/NativeChart.test.tsx`、`components/chart/KLineChartProView.test.tsx`、`components/chart/PriceLineSettingsModal.test.tsx`、`lib/chartController.test.ts`、`lib/periodsStore.test.ts`、`lib/replayEngine.test.ts`、`lib/periodWindow.test.ts`、`lib/signalMarks.test.ts` |
