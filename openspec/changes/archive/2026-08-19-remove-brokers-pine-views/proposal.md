# Remove Brokers and Pine Editor Views

## Why

券商账户界面（`BrokersView`）与 Pine 策略编辑器界面（整页 `PineStudioView` + 底部停靠栏 `PineEditor`）都是 TradingView 模板搬过来的 UI 外壳，全部跑在 mock 数据上，从未接入真实业务：

- **券商账户界面**：`BROKERS_CATALOG` 是硬编码的券商目录，"连接账户"只是 800ms `setTimeout` 假装切换状态，没有任何真实券商对接。本项目的实际执行路径是后端 paper broker + 风控闸门（`paper-broker`、`execution-core`），这个界面与之毫无关联，只会误导用户以为能连真实券商。
- **Pine 策略编辑器**：项目的策略执行走的是后端 DL 量化引擎（`ml-model`、`backtest-engine`），并非 Pine Script。两个 Pine 编辑器界面（整页 IDE 和底部停靠栏 tab）都只是把 mock 脚本文本丢给 `handleRunStrategy`，脚本内容本身被丢弃（参数名就叫 `_scriptCode`），编译日志、"Syntax OK"、控制台输出全是写死的假字符串。同一个概念还重复实现了两遍。

保留这些空壳界面的代价是：占用主导航栏 2 个入口位、维护 3 个组件文件、给用户传达错误的能力预期。策略执行的界面未来会重新设计（对接真实的 DL 量化引擎而非 Pine），届时另起界面，不复用这些外壳。

## What Changes

- **删除券商账户界面**：移除 `BrokersView` 组件及其全部入口（左侧导航栏、标题栏新建标签菜单、⌘K 命令面板）。
- **删除两个 Pine 策略编辑器界面**：移除整页 `PineStudioView` 与底部停靠栏 `PineEditor` 组件及其全部入口（左侧导航栏、标题栏菜单、⌘K 命令面板、底部停靠栏 tab）。
- **收缩视图类型**：`DesktopViewMode` 联合类型去掉 `'pine'` 与 `'brokers'`；`BottomDock` 的 `BottomTab` 联合类型去掉 `'pine'`。
- **清理失效 prop**：`BottomDock` 不再需要 `onRunStrategy`（唯一消费者 `PineEditor` 已删），从其 Props 接口与 App 侧传参中移除。
- **保留策略执行链路备用**：`App.tsx` 的 `handleRunStrategy`（调用后端 `api.backtest` + `api.job` 轮询）与 `backtestResult` state 保留——`backtestResult` 仍被底部「策略回测」tab（`StrategyTester`，不在删除范围内）消费；`handleRunStrategy` 保留为未来新策略界面的接入点，加注释标注用途。
- **保留数据与文案备用**：`BROKERS_CATALOG`、`BrokerAccount` 类型、`SAMPLE_PINE_SCRIPTS`、`handleResetPaperAccount`（原仅被 `BrokersView` 调用）及相关 i18n 文案暂不删除，加注释标注「保留待未来界面接入」。

## Capabilities

### Modified Capabilities

- `tv-template-shell`: 现行 spec 的「装饰性视图保留壳」要求明确保留 Pine Studio 与 Brokers 视图外壳，且「UI 外壳基于 tradingview-pro 模板」要求提到「8 个全视图」。需将 Pine Studio 与 Brokers 从保留清单移除、明确这两个视图不再可达，并将全视图数量修正为 6 个。
- `bottom-dock`: 现行 spec 的底部 tab 栏清单含「Pine 编辑」。需从 tab 清单中移除 Pine 编辑，保留交易面板 / 筛选器 / 策略回测 / 文本备注。

## Impact

**删除的文件**

- `frontend/src/components/views/BrokersView.tsx`
- `frontend/src/components/views/PineStudioView.tsx`
- `frontend/src/components/bottom/PineEditor.tsx`

**修改的文件**

- `frontend/src/types/trading.ts`：`DesktopViewMode` 移除 `'pine'` / `'brokers'`（L14-15）。
- `frontend/src/App.tsx`：移除两个 View 的 import（L60-61）、`handleNewTab` 中的 tab 标题分支（L340-341）、两个工作区路由分支（L831-847）、传给 `BottomDock` 的 `onRunStrategy`；保留 `handleRunStrategy` / `backtestResult` / `handleResetPaperAccount` 并加注释。
- `frontend/src/components/desktop/GlobalNavRail.tsx`：移除 Pine Studio 与 Brokers 两个导航项（L80-89）及 `Code`、`Briefcase` 图标导入。
- `frontend/src/components/desktop/DesktopTitleBar.tsx`：移除 `getTabIcon` 的 `'pine'` / `'brokers'` 分支（L84-87）、新建标签菜单中的两个按钮（L349-373）及对应图标导入。
- `frontend/src/components/modals/CommandPaletteModal.tsx`：移除 `view-pine` / `view-brokers` 两条命令（L62-63）及对应图标导入。
- `frontend/src/components/bottom/BottomDock.tsx`：移除 `PineEditor` 导入（L20）、`BottomTab` 的 `'pine'`（L42）、tab 清单中的 Pine Editor 项（L80）、渲染分支（L155-157）、Props 中的 `onRunStrategy`（L37）及 `FileCode` 图标导入。

**保留不动（加注释标注）**

- `frontend/src/data/marketData.ts`：`BROKERS_CATALOG`
- `frontend/src/types/trading.ts`：`BrokerAccount`
- `frontend/src/utils/pineEngine.ts`：`SAMPLE_PINE_SCRIPTS`
- `frontend/src/lib/i18n.ts`：Pine / Brokers 相关文案条目

**风险与验证**

- `tsconfig.json` 中 `noUnusedLocals` / `noUnusedParameters` 均为 `false`，保留的未调用函数不会导致类型检查失败。
- 删除 `DesktopViewMode` 成员后，所有 `switch` / 条件分支必须同步收敛，否则 `noFallthroughCasesInSwitch` 与穷尽性检查可能报错。
- 无测试文件引用这三个组件（已确认），不会破坏现有测试。
- 验证方式：`npm run typecheck` 与 `npm run test` 均须通过。
