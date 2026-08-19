# Design — Remove Brokers and Pine Editor Views

## Context

删除三个纯 mock 的 UI 外壳：`BrokersView`（券商账户整页视图）、`PineStudioView`（Pine 整页 IDE）、`PineEditor`（底部停靠栏 Pine tab）。这是一次纯删除型变更，不新增行为。难点不在删组件本身，而在于**收敛类型联合与清理入口的完整性**——视图入口分散在 4 个位置，视图类型是一个被多处 `switch` / 条件分支消费的联合类型。

## Goals / Non-Goals

**Goals**
- 三个组件文件及其全部可达入口彻底移除，用户无任何路径能进入这两个界面。
- 视图类型联合收敛（`DesktopViewMode` 去 2 项、`BottomTab` 去 1 项），且所有消费点同步收敛。
- 保留后端回测链路，使未来新策略界面可直接接入。

**Non-Goals**
- 不新增替代界面（策略执行界面未来单独设计，对接 DL 量化引擎而非 Pine）。
- 不删除 mock 数据源与 i18n 文案（`BROKERS_CATALOG`、`SAMPLE_PINE_SCRIPTS` 等暂留）。
- 不改动后端任何代码，不改动 `StrategyTester`（策略回测 tab 保留）。

## Decisions

### 决策 1：入口清理必须覆盖全部 4 处，不能只删路由分支

视图入口分散在四个互相独立的位置，任一处漏删都会留下死入口（点击后主区域空白，因为路由分支已删）：

```
                      ┌──────────────────────────┐
                      │  DesktopViewMode 联合类型 │
                      │  types/trading.ts        │
                      └────────────┬─────────────┘
              ┌────────────┬───────┴────┬──────────────┐
              ▼            ▼            ▼              ▼
      GlobalNavRail  DesktopTitleBar  CommandPalette  App.tsx
      导航栏图标      ①getTabIcon      ⌘K 命令项       工作区路由
                     ②新建标签菜单
```

`DesktopTitleBar` 有**两处**独立引用（`getTabIcon` 的 switch 分支 + 新建标签菜单按钮），容易只删其一。

### 决策 2：先删类型成员，让编译器定位所有残留引用

`DesktopViewMode` 与 `BottomTab` 都是字符串字面量联合。**先**从联合类型中删掉 `'pine'` / `'brokers'`，再跑 `npm run typecheck`，TypeScript 会精确报出所有仍在比较/赋值这些字面量的位置。这比手工 grep 更可靠，避免漏改。

注意 `tsconfig.json` 的 `noFallthroughCasesInSwitch: true` — `getTabIcon` 的 switch 删分支后仍有 `default` 兜底，不影响穷尽性。

### 决策 3：`BottomDock.onRunStrategy` prop 删除（方案 A）

`onRunStrategy` 唯一消费者是 `PineEditor`。删掉 Pine tab 后该 prop 变成穿过 `BottomDock` 但无人使用的悬空参数。

| 取舍 | 结论 |
|---|---|
| 保留 prop | 接口不变，但留下无消费者的死参数，后续维护者困惑 |
| **删除 prop（采纳）** | `BottomDock` 接口收敛到实际所需；`handleRunStrategy` 仍留在 `App.tsx`，未来新界面直接接线即可 |

`tsconfig` 的 `noUnusedParameters: false` 意味着保留也不会报错——所以这是纯粹的整洁性选择，不是编译约束。

### 决策 4：`handleRunStrategy` / `backtestResult` 保留，但语义变化需注释说明

删除后二者的调用图变成：

```
  触发者（全删）                            消费者（保留）
  PineStudioView ─┐                    ┌─ StrategyTester（策略回测 tab）
  PineEditor     ─┴─✗   handleRunStrategy   ▲
                          │                 │
                          ▼                 │
                     backtestResult ────────┘
```

`backtestResult` 仍有真实消费者（`StrategyTester` 展示回测指标），保留天经地义。
`handleRunStrategy` 变成**零调用方**的函数——它不会报错（`noUnusedLocals: false`），但必须加注释说明「保留为未来策略界面的后端回测接入点」，否则会被后续维护者当作死代码误删，导致未来重接时需要重写整条 `api.backtest` + `api.job` 轮询逻辑。

同理 `handleResetPaperAccount` 原先唯一调用方是 `BrokersView`，删除后也变成零调用方，同样加注释保留。

### 决策 5：图标导入需逐个核对，不能盲删

`Code`（Pine）与 `Briefcase`（Brokers）图标在多个文件中导入。但**同一图标可能被同文件的其他地方复用**——例如 `DesktopTitleBar` 的通知面板文案含「New Pine Script Update」但未用 `Code` 图标，而 `BottomDock` 的 `FileCode` 仅被 Pine tab 使用。删除导入前须确认该文件内无其他引用点。

## Risks / Trade-offs

- **风险：漏删入口导致空白视图。** 缓解：依赖决策 2 的编译器定位 + 手工核对 4 处入口清单 + `npm run typecheck`。
- **风险：保留的零调用方函数被误认为死代码。** 缓解：决策 4 的注释标注。
- **权衡：保留 mock 数据（`BROKERS_CATALOG` / `SAMPLE_PINE_SCRIPTS`）留下了未引用的数据常量。** 按用户明确要求「暂时留着」，接受这份冗余；加注释标注保留原因。
- **测试影响：零。** 已确认无任何 `*.test.tsx` 引用这三个组件。

## Migration Plan

单次变更，无需分阶段。顺序：先收敛类型 → 编译器定位残留 → 逐处清理入口 → 删组件文件 → 清理悬空 prop → 加保留注释 → `typecheck` + `test` 验证。

## Open Questions

无。范围与保留策略已确认。
