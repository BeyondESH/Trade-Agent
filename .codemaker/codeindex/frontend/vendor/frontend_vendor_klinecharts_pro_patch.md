---
type: "Fragment"
id: "frontend/vendor/klinecharts_pro_patch"
title: "引擎本地改造面"
description: "klinecharts-pro 相对上游改了哪四处？改错或漏重建会破坏哪条已验收的图表行为？"
parent: /frontend/vendor/_overview.md
fragment: klinecharts_pro_patch
entity_names:
  constants:
    - name: "首屏/每页历史根数"
      value: "500（adjustFromTo 的 count）"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
    - name: "懒取触发阈值"
      value: "range.from <= floor(viewport * 0.6)"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
    - name: "到头标志"
      value: "canLoadMore = 返回数组长度 > 0（切换 symbol/period 时重置为 true）"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
    - name: "加载锁"
      value: "loading（布尔；effect 提前返回时 return prev 保持依赖追踪）"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
    - name: "竞态收敛判据"
      value: "curSymbol.ticker !== s.ticker || curPeriod.text !== p.text → setSymbol({...curSymbol})"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
    - name: "拖拽 MIME"
      value: "'text/period'（effectAllowed/dropEffect = 'copy'）"
      source: frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx
    - name: "周期分组顺序"
      value: "['second','minute','hour','day','weekmonth']；week 与 month 合并入 weekmonth"
      source: frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx
    - name: "仅实时级别的判定"
      value: "isRealtimeOnly(p) = p.timespan === 'second'"
      source: frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx
    - name: "全集弹窗宽度"
      value: "360"
      source: frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx
    - name: "新增 i18n 键（zh-CN/en-US 各 16 个）"
      value: "expand_periods, all_periods, pin, unpin, pinned, pin_hint, pin_empty, pin_remove, realtime_only, second, minute, hour, day, week, month, weekmonth"
      source: frontend/vendor/klinecharts-pro/src/i18n/zh-CN.json
    - name: "秒级时间格式"
      value: "X 轴 'HH:mm:ss'，tooltip 'YYYY-MM-DD HH:mm:ss'"
      source: frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx
    - name: "工具按钮 DOM 契约"
      value: ".klinecharts-pro-period-bar > .item.tools ×5，顺序 = indicator, timezone, setting, screenshot, fullscreen"
      source: frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx
    - name: "周期项 DOM 契约"
      value: ".item.period（选中项额外带 .selected；展开按钮额外带 .expand）"
      source: frontend/vendor/klinecharts-pro/src/widget/period-bar/index.tsx
retrieval_hints:
  - "快速切换币种图表停在旧数据，这个竞态修在哪一段代码里？"
  - "1s/3m/2h/6h/3d/1w/1mo 这些周期在图表上是怎么被支持与分组的？"
  - "为什么改了 vendor 的 tsx 之后页面上没变化，要跑哪条命令？"
  - "左拖 K 线到空白处不加载历史，该查哪个标志位？"
  - "⚠️ 如果你要找的是「传给引擎的周期数组与 pinned 偏好读写逻辑」，不在这里，在 frontend/src 的 frontend_src_chart 子文档（`NATIVE_PERIODS` / `periodsStore`）"
  - "⚠️ 如果你要找的是后端支持的 timeframe 白名单与拒收逻辑，不在这里，在 backend/src 的 market_data 层"
  - "本模块也叫 二开 patch / vendor 补丁 / fork 差异，对应需求中的「原生周期选择器」「图表切换竞态修复」"
  - "架构归属：周期条相关的一切新交互必须写在 `src/widget/period-bar/index.tsx`（含其 less），禁止由应用层用 CSS 隐藏周期栏后自建替代（openspec 明确 MUST NOT）"
  - "架构归属：秒级/新时间跨度的支持必须同时补 `adjustFromTo` 与 `customApi.formatDate` 两处 switch 分支，缺一即静默退化"
architectural_role: "外部引擎的受控差异面（最小改造）"
---

## 业务意图

上游引擎开箱能力覆盖不了本项目的三个交易体验：Bitget 原生 15 档周期（含秒级与"1mo≠1m"）、快速切自选不卡旧数据、常用周期可拖拽常驻。本子文档记录**本地相对上游到底改了哪几处、每处改动钉住了哪条已验收行为**，让下一次改动（或日后升级上游版本时）不会把这三块体验顺手抹掉。它的价值不是"说明有哪些文件"，而是把"改动—回归"的对应关系固定下来：这几段代码是图表可信度的受力点。

## 对外接口（本项目自建的扩展点）

改造有意只开两个可选入参 + 一个可选回调，其余全部保持上游形态，这样将来同步上游代码时的冲突面最小。

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `ChartProOptions.pinnedTimeframes` | 宿主→引擎 | `string[]`，元素必须等于某个 `Period.text` | 决定常驻周期条渲染哪几档（按全集顺序过滤）；不传或传空 → 常驻栏**不显示任何周期**，只能点 `⋯` 进弹窗切换 | `src/types.ts` / `types.d.ts` / `src/widget/period-bar/index.tsx:pinned` |
| `ChartProOptions.onPinChange` | 引擎→宿主 | `(timeframes: string[]) => void` | 拖入/点击移除固定项时回传新集合，由宿主落 localStorage | `src/ChartProComponent.tsx`（`props.ref`）→ `KLineChartProView` → `periodsStore` |
| 全集弹窗（`⋯`） | 用户→引擎 | 分组列表 + pin 区两栏 | 区域一点击=切周期、拖拽=候选固定；区域二拖入=固定、点击 chip=取消固定；秒级档带"仅实时"标签 | `src/widget/period-bar/index.tsx:onDropZoneDrop / addPin / removePin` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `klinecharts`（npm） | 秒级历史要用 `applyMoreData` 前插、`subscribeAction(OnVisibleRangeChange)` 观察视口，均为内核 v9 API | `applyNewData`、`applyMoreData`、`loadMore`、`OnVisibleRangeChange`、`FormatDateType.XAxis` | extracted |
| `frontend/src/lib/periodsStore.ts` | `pinnedTimeframes` 的初值与持久化在宿主侧（`raibro.pinnedTimeframes`），vendor 只发事件不落盘 | `loadPinnedTimeframes`、`savePinnedTimeframes` | extracted |
| `frontend/src/api/datafeed.ts` | 秒级历史由宿主裁决（1s 无 REST 历史）；vendor 侧只负责把 timespan 正确折算成 from/to | `BitgetDatafeed.getHistoryKLineData` | inferred（依据 vendor 的 `isRealtimeOnly` 标签与后端 `realtime-only-timeframe` 契约对齐） |

反向依赖（谁把改造当契约用）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `frontend/src/components/chart/KLineChartProView.tsx` | 以原生工具按钮下标（0=指标、2=设置）桥接弹窗；靠 `.item.tools` 选择子 | `NATIVE_TOOL_INDEX`、`clickNativeTool` |
| `frontend/src/vendor/klinechartsProRace.test.ts` | 切片断言 dist 产物：读取依赖须在锁之前、完成后比对 ticker/text 并重载、`subscribe/updateData/applyNewData` 接线不变 | `distPath` + 5 条正则断言 |
| `frontend/tests/e2e/kline-realtime.spec.ts` | 通过 vendor 周期条点击切周期来驱动实时断言 | `.klinecharts-pro-period-bar` 系类名 |

## 典型调用链

### 快速切币（竞态修复的主路径）
```
自选列表 → KLineChartProView.setSymbol → KLineChartPro.tsx:setSymbol
  → ChartProComponent.tsx:取数 createEffect                       ← 本模块改造点
     1. 先读 symbol()/period()（保证 Solid 依赖追踪，早于锁判断）  ← 契约：chart-symbol-switch-race
     2. loading 为真则 return prev（并发加载合并，不叠加载）
     3. unsubscribe(prev) → adjustFromTo(500) → datafeed.getHistoryKLineData → applyNewData → subscribe   ← 跨模块：frontend/src
     4. 完成后比对 ticker/text，不一致则 setSymbol({...cur}) 触发重载（last-request-wins）
```

### 拖拽固定常用周期
```
点 ⋯ → 全集弹窗 → dragstart(p.text, 'text/period')
  → 投放到 pin 区 onDropZoneDrop → addPin(id) → props.onPinChange([...current, id])   ← 本模块出口
    → ChartProComponent 更新 signal → KLineChartProView 的 onPinChange
      → frontend/src/lib/periodsStore.savePinnedTimeframes → localStorage             ← 跨模块：frontend/src
```

### 左拖取更早历史
```
拖拽视口左移 → klinecharts ActionType.OnVisibleRangeChange
  → from <= floor((to-from)*0.6) → loadOlderData → datafeed.getHistoryKLineData        ← 跨模块：frontend/src
    → canLoadMore = list.length > 0 → applyMoreData(list, canLoadMore)
（硬边缘兜底仍保留：klinecharts loadMore 回调走同一 loadOlderData）
```

## 实现约束清单

### 必须同时落地的改动（缺一即回归）

| 改造点 | 位置 | 若回退会破坏什么 | 约束由来 |
|-------|------|-----------------|---------|
| 依赖读取前置于 loading 锁 + 完成后比对重载 | `ChartProComponent.tsx` 取数 effect | 连续快切 ETH→XAU→SOL 后图表停在 ETH，新选择"点了没反应" | openspec `chart-symbol-switch-race`（两个 Scenario）+ `klinecharts-pro-integration`「vendor 加载竞态防护」 |
| `adjustFromTo` 的 `second` 分支 | 同上（switch） | 秒级请求 from==to → 拉不到任何历史，1s 图恒空 | `kline-native-period-selector`：秒级为"仅实时"，但周期跨度仍须正确 |
| `customApi.formatDate` 的 `second` 分支 | 同上 `onMount` 内 | 时间轴与十字光标丢秒，1s/秒级读数不可用 | 同上 |
| 周期条 pin 双区（常驻 + 全集弹窗 + 拖拽固定） | `src/widget/period-bar/index.tsx` + `index.less` | 常驻栏退化，15 档全挤一行；且需求明确 MUST NOT 由应用层隐藏周期栏自建 | `klinecharts-pro-integration`「周期条由固定机制驱动」 |
| 新增 16 个 i18n 键（zh-CN **和** en-US） | `src/i18n/*.json` | i18n 未命中回退是"原样返回 key"，界面上会出现 `expand_periods`、`weekmonth` 这类裸键 | 代码约束：`src/i18n/index.ts` 的 `?? key` |
| `pinnedTimeframes`/`onPinChange` 三层透传 | `types.ts` + `ChartProComponent.tsx` + `KLineChartPro.tsx` + `types.d.ts` | 少改 `types.d.ts` 则宿主 typecheck 失败（宿主只看 d.ts），少改 `KLineChartPro.tsx` 则参数在门面处被吞、运行时无效 | 契约面与实现面分离（见 import_boundary） |

### 已知陷阱（改代码前先看）

- **注释与实现不一致**：`period-bar/index.tsx` 里 `pinned` 上方的注释写"absent `pinnedTimeframes` 保持旧的内联全显示行为"，但实现是 `if (!ids || ids.length === 0) return []` —— 未传/传空时**一个常驻周期都不渲染**。以实现为准：宿主必须始终显式传 pinned 列表。（若要恢复旧行为，改动点是这一行 memo，而不是宿主去隐藏 chrome。）
- **`weekmonth` 是一个分组显示名，不是 timespan**：`Period.timespan` 仍只有 `second/minute/hour/day/week/month/year`（`adjustFromTo`/`formatDate` 的 switch 键）。新增 timespan 值必须补两处 switch，否则 `adjustFromTo` 落到无分支 → `[from,to]` 都等于对齐后的 `to`。
- **改动必须重建 dist 才生效**：运行时读的是产物；`applyNewData(` 前后 1300 字符是回归测试的取样窗口，重排代码（哪怕等价）也可能让断言误报——重建后必须跑 `cd frontend && npm run test` 复核。
- **不得在 vendor 里发网络请求**：只有上游 `DefaultDatafeed`（polygon.io）走外网，本项目实例化时永远传宿主 datafeed；vendor 内新增取数逻辑一律视为越界。

### 设计决策

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 竞态修法 | 保持单一 `createEffect(prev)` + 依赖前置读取 + 末尾比对"重建对象引用"触发重载 | 引入队列/请求 id 序号做 last-wins | 后者要在 vendor 里塞一层请求管理器，改造面与上游冲突都显著变大；前者只动一个 effect，且 openspec 明确"改动 SHALL 集中在一个 vendor effect 中，不扩散" |
| "到头了"的判定 | 以"本页返回空数组"作为 `canLoadMore=false` 的唯一依据 | 由 datafeed 返回显式 has-more 标志 | 不改 `Datafeed` 接口（宿主实现与测试无需联动）；代价：后端"暂时为空"会被误判为到头，因此切换 symbol/period 时必须重置 `canLoadMore=true`（已实现） |
| 秒级周期是否显示为特殊档 | 弹窗内打"仅实时"标签，仍可被选为常驻 | 直接从可选周期里剔除 1s | 用户确实要看 1s 实时图；剔除会让后端 realtime-only 语义在产品上不可见，易被误当成"没数据" |
| 常用周期的存储位置 | 宿主 localStorage（全局偏好，不分品种） | 落后端 chartstore | chartstore 按 category/symbol/timeframe 键，固定偏好是"人"的属性而非"序列"的属性（来源: `frontend/src/lib/periodsStore.ts` 文件头注释） |

## 变更风险

1. 在 vendor 里新增第三个 modal / 调整 `.item.tools` 的顺序或数量 → `NATIVE_TOOL_INDEX={indicator:0,settings:2}` 会点到错误按钮（打开时区或截图弹窗），表现为"图表工具条的指标/设置入口点了没反应"（消费方为 `NativeChart` 的指标与设置入口），且 `KLineChartProView.test.tsx` 用 `seedPeriodBar` 人造 5 个 `.item.tools` 并断言命中下标 0/2 的用例同步红。
1b. 把周期项从 `.item.period` 改名为其他 class → `frontend/tests/e2e/kline-realtime.spec.ts` 的"timeframe switch changes bar period"无法按可见文本（15m）命中，L3 Playwright 实时周期切换旅程直接失败。
2. 把 pin 语义从"按全集顺序过滤"改成"按 pinned 数组顺序渲染" → 常驻栏顺序随拖入时间漂移，用户投诉的"周期条乱跳"由此产生；当前顺序稳定性是有意选择。
3. 让 `onPinChange` 直接落盘（在 vendor 内引 localStorage） → 破坏"vendor 不持有持久化"的边界，宿主 `subscribePinnedTimeframes` 的多处订阅者（状态栏、面板）不会收到通知，出现两处 UI 不一致。
4. 用上游 `@klinecharts/pro@0.1.1` 覆盖式升级 → 上述六处改造**全部静默消失**（类型面还在、产物行为回到上游），最坏症状是"竞态 bug 复发 + 秒级周期变空白 + 周期条回到 10 档"。升级必须走逐文件 diff + 重建 + 跑 L2/L3 回归。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/klinecharts-pro-integration/spec.md`、`openspec/specs/chart-symbol-switch-race/spec.md`、`openspec/specs/chart-mount-lifecycle/spec.md`、`openspec/specs/timeframe-identifier-scheme/spec.md`、`openspec/specs/klinecharts-pro-chart/spec.md`（仅提炼约束，非全文转录）

- **最小改造原则**：对 vendor 只允许两类改造——暴露底层 klinecharts 实例（`getChart()`）、提供 symbol/period 变更回调（`onSymbolChange`/`onPeriodChange`）；周期条 pin 机制必须在 vendor 内实现，应用层 MUST NOT 隐藏周期条后自建替代。
- **竞态契约（三条 MUST）**：加载 effect 对 symbol/period 的依赖读取 SHALL 早于加载锁判断；加载完成后 SHALL 比对当前目标与本次目标并主动重载；改动 SHALL 集中在一个 vendor effect，不扩散。
- **秒级契约**：历史区间计算与时间轴格式化 MUST 支持秒级时间跨度，秒级时间标签 SHALL 显示到秒；周期条呈现的级别 SHALL 全部为交易所原生，MUST NOT 含合成级别；周/月对象的 timespan MUST NOT 退化为 minute。
- **标识符消歧**：月级与分钟级在大小写无关比较下也不得折叠为同一标识符（`1mo` vs `1m`），两者存储路径与交易所粒度 token MUST 不同。
- **生命周期契约（vendor 侧影响）**：`KLineChartPro` 无 dispose 语义，单例、卸载清理与"实时数据只更新可见实例"由宿主包装层保证——任何让 vendor 自行 dispose/复用实例的改动都会与 `chart-mount-lifecycle` 冲突。
