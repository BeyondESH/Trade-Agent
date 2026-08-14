## Context

当前前端是 React 18 + Vite + lightweight-charts + Tailwind 的交易所终端（约 700 行 TSX，6 个测试文件），后端 FastAPI 提供 REST + `/ws` 快照。后端已计算 MACD/KDJ/BOLL、S/R、结构（swings/trendlines/box）、SMC（liquidity/order_blocks/bos_choch），但前端只渲染 K 线与 S/R 价格线。

本 change 将前端迁移到 Vue 3，并把图表升级为 klinecharts 图表终端（指标副图 + 交互作图 + 图层分级），图表状态持久化到后端。实时 K 线（Bitget WS）属独立 change `realtime-kline`，本 change 仅在图表组件上预留 `updateData` 消费点。

约束：系统主语言 Python；前端保持 localhost 自用、纸面交易语义、Tailwind 设计 tokens、`/api` 与 `/ws` 代理不变。

## Goals / Non-Goals

**Goals:**
- React 18 → Vue 3（Composition API + `<script setup>`），构建链切换为 vue-tsc + @vitejs/plugin-vue。
- lightweight-charts → klinecharts，提供币安/欧易式图表：内置指标副图（MACD/KDJ/RSI/VOL）与主图叠加（MA/BOLL），16 种交互作图工具。
- 图层分级：手绘层 / 自动识别层（S/R、结构、SMC，可整层开关）/ 指标层。
- 图表状态（指标布局、手绘图形、图层开关）按 `category/symbol/timeframe` 持久化到后端本地 JSON。
- 前端组件测试迁移到 @vue/test-utils；后端 ChartStore 与 `/chart-config` 端点有单测。
- typecheck / build / pytest / 前端单测全绿。

**Non-Goals:**
- 不做实时 K 线推送（属 `realtime-kline` change，此处仅预留接口）。
- 不引入 Pinia（现有状态规模用 ref/computed 足够）。
- 不改变后端数据管道、风控执行、AI Agent 层、`/api` 与 `/ws` 的既有语义。
- 不引入 vue-router（单页终端，无路由需求）。
- 不改动 Tailwind 设计 tokens 与配色语义（chart-theming 要求保持）。

## Decisions

### D1: 前端工程迁移到 Vue 3 + SFC

- 依赖：`vue@^3.5`、`@vitejs/plugin-vue@^5`、`vue-tsc@^2`、`@vue/test-utils@^2`、`klinecharts@^9`；移除 `react`、`react-dom`、`@types/react*`、`@testing-library/*`、`@vitejs/plugin-react`、`lightweight-charts`。
- 脚本：`typecheck` 改为 `vue-tsc --noEmit`；`vite.config.ts` 插件换 `vue()`；`tsconfig.json` 的 `jsx` 改 `"preserve"`；`index.html` 入口改 `main.ts`。
- 文件映射：
  - `main.tsx → main.ts`（`createApp(App).mount('#root')`）
  - `App.tsx → App.vue`（状态：`series`/`candles`/`analyze`/`snap`/`chartConfig` 均为 ref + computed）
  - `hooks/useSnapshot.ts → composables/useSnapshot.ts`（接收 series ref，`watch(seriesKey)` 重连）
  - `components/layout.tsx` 拆分 `components/layout/`（AppShell/Header/MarketList/OrderPanel/BottomTabs 各一 .vue）
  - `components/panels.tsx` 拆分 `components/panels/`（StrategyEditor/Controls/OrderConfirmDialog/TradingPanel）
  - `ui/index.tsx` 拆分 `ui/`（Panel/Button/Input/Tabs/Badge/Modal 各一 .vue）
  - `api/`、`lib/transform.ts`、`index.css`、Tailwind 配置原样保留（框架无关）
- 替代方案：保留 React 只加 Vue 组件（混合栈）——放弃，复杂度与双构建链不划算；逐组件渐进迁移——放弃，仓库规模小，一次性重写更干净。

### D2: klinecharts 封装为"控制器 + 组件"双层

jsdom 无 canvas，klinecharts 实例无法在组件测试中真实创建。为可测试性，图表逻辑拆两层：

- `src/lib/chartController.ts`：薄封装，持有 klinecharts 实例，暴露 `init/applyData/updateData/addIndicator/removeIndicator/createOverlay(programmatic)/removeOverlays/setDrawTool/destroy`。组件测试用 `vi.mock` 打桩控制器，验证调用序列与参数。
- `components/chart/Chart.vue`：模板 ref → `onMounted` init 控制器 → `watch(candles)` 全量 `applyData` → `watch(lastCandle)` 增量 `updateData`（B 的消费点）→ `watch(analyze/structure)` 重建自动层 overlay → `onBeforeUnmount` destroy。
- `components/chart/DrawingToolbar.vue`：工具按钮（segment/rayLine/fibonacciLine/rect/priceLine/brush/simpleAnnotation…），点击 `setDrawTool(name)`；"取消"回 `normal` 模式；"清空手绘"调 `removeOverlays('drawings')`。
- `components/chart/IndicatorPanel.vue`：指标管理（增删副图/主图叠加），emit 变更事件由父组件持有状态并持久化。

### D3: 图层分级模型

前端维护三层状态，层间互不干扰：

| 层 | 内容 | 来源 | 持久化 |
|---|---|---|---|
| 指标层 indicators | 副图（MACD/KDJ/RSI/VOL…）+ 主图（MA/BOLL…） | 用户配置 | ✅ |
| 手绘层 drawings | 交互 overlay（用户画） | 用户手绘 | ✅ |
| 自动层 auto | sr→priceLine；structure→segment/rect；smc→rect/segment | 后端数据程序化生成，随数据重算 | 仅图层开关 |

自动层以非交互 overlay 创建，随 `candles/analyze/structure` 数据变化重建；其开关状态（`{sr, structure, smc}`）持久化。手绘层独立，不与自动层混合。

### D4: 图表状态按 series 后端持久化

- 新增 `backend/src/market_data/chartstore.py`，与 `appconfig.py` 平级。文件 `data/config/chart.json`（路径经 `config.py` 加 `chart_config_path` 属性）。
- 状态按 series 键 `{category}/{symbol}/{timeframe}` 存储：

```json
{
  "USDT-FUTURES/BTCUSDT/5m": {
    "indicators": [{"name": "MACD", "pane": "sub"}, {"name": "MA", "pane": "candle"}],
    "drawings": [{"type": "segment", "points": [{"timestamp": 1730000000000, "value": 64000}], "options": {}}],
    "layers": {"sr": true, "structure": true, "smc": false}
  }
}
```

- 校验：结构形状轻校验 + **每 series 图形数上限（默认 100）**防无限膨胀；非法则 `ValueError → 400`（复用 webapi 现有 ValueError handler）。
- 端点：`GET /chart-config?category&symbol&timeframe` 返回该 series 状态（缺失返回空模板）；`PUT /chart-config` body `{category, symbol, timeframe, state}` 持久化。
- 替代方案：塞进现有 `app.json`——放弃，`ConfigStore.save` 是白名单结构且形状差异大；localStorage——放弃，用户要求存后端，且后端持久化可与多端/命令行共享。

### D5: 序列化/恢复 klinecharts 状态

**Spike 结论（klinecharts 9.8.12 实测类型）：**
- 生命周期：`init(dom, options)` / `dispose(chart)`；`applyNewData(list)` 全量、`updateData(kline)` 增量（B 实时消费点）。
- 指标：`createIndicator('MACD')` 返回副图 paneId；`createIndicator({name:'MA'}, true)` 叠主图；`removeIndicator(paneId, name?)`。
- overlay：`createOverlay('segment')` 进交互绘制并返回 id；`createOverlay({name:'priceLine', points:[...]})` 程序化；`removeOverlay()` 全清、`removeOverlay({id})` 单删；`getOverlayById(id)` 返回含 `name/points/styles/visible/lock/groupId` 的实例。
- **v9 无全局 `getOverlays()`**：控制器须自维护已创建 overlay 的 id 集（程序化与交互绘制都在 createOverlay 时拿到 id），序列化时遍历 id → `getOverlayById` 读 `name/points/styles`；已删除返回 Nullable 则跳过。
- `Point = {dataIndex, timestamp, value}`，`KLineData = {timestamp, open, high, low, close, volume?}`，时间戳均为毫秒。

- 持久化来源：读取 overlay 实例的 `name/points/styles` 字段（控制器 id 集 + `getOverlayById`）；指标布局读 pane 配置。
- 恢复：`createOverlay({name, points, styles})` 程序化重建；指标 `createIndicator` 重建（副图传 paneId，主图 isStack=true）。

### D6: UI 原子组件 Vue 化

- Panel：具名 slot（`title`/`right`）+ 默认 slot；Button/Input：attrs 透传 + variant prop；Tabs：`defineModel` 承载 active；Badge：tone prop；Modal：`<Teleport>` + `<Transition>`。
- 保持 Tailwind class 与设计 tokens 原样，视觉零变化。

## Risks / Trade-offs

- **[jsdom 无 canvas，klinecharts 组件测试跑不起来]** → D2 控制器抽象 + 组件测试打桩；App 级测试沿用现有 `vi.mock` Chart 模式。纯逻辑（transform）直接单测。
- **[klinecharts overlay 序列化 API 与预期有出入]** → D5 spike 任务前置；以 `toPersisted()` 适配函数兜底。
- **[迁移引入行为回归（下单两步确认/kill-switch/快照）]** → 测试 1:1 重写保持断言等价；typecheck/build/pytest 作为验收闸。
- **[图表状态 JSON 无限膨胀]** → D4 每 series 图形数上限 + 形状校验。
- **[Vue 3 严格类型检查（vue-tsc）暴露 SFC 类型问题]** → 全部 `<script setup lang="ts">` + `defineProps` 显式类型，迁移时即修。
- **[`candlesToSeries` 时间戳单位差异（lightweight 用秒，klinecharts 默认毫秒）]** → transform 改为毫秒直传（与 API `open_time` 对齐），函数更名并同步测试。

## Migration Plan

同目录原地重写（frontend/），无灰度：

1. 脚手架先行：依赖/配置/`main.ts`/空 `App.vue`，先过 typecheck + build 建立基线。
2. 迁移框架无关层（api/transform/css）→ 迁移 UI 原子 → 迁移 layout/panels（此时仍用 lightweight-charts 包一层 Chart.vue 保真）。
3. 换 klinecharts 建 ChartTerminal（Chart/DrawingToolbar/IndicatorPanel）。
4. 后端 ChartStore + 端点 + 单测。
5. 前端接 `/chart-config` 持久化。
6. 测试 1:1 重写；全量验证（`npm run typecheck`、`npm run build`、`npm test`、`pytest`）。
7. 回归手测：布局/下单两步/kill-switch/快照/自动层叠加/手绘/刷新恢复。

回滚：前端为原地重写，旧 `dist/` 构建产物保留可回退；无 git 历史依赖，变更全部落盘后可整体还原。后端为增量（新模块+新端点），可单独移除。

## Open Questions

- 默认指标布局：ChartTerminal 首启是否预置 `VOL + MACD` 副图？倾向预置，符合币安/欧易默认观感。
- 手绘图层删除粒度：仅"清空全部"还是支持选中单条删除？倾向先支持单条删除（klinecharts 提供 `removeOverlayById`），成本低。
- `chart.json` 是否需要 CLI 侧（`market-data` 命令）读写？本期仅 webapi 端点，CLI 不做。
