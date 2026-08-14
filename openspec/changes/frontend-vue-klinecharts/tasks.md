## 1. 工程脚手架（Vue 工具链）

- [x] 1.1 更新 `frontend/package.json`：移除 react/react-dom/@vitejs/plugin-react/@testing-library/*/@types/react*/lightweight-charts；新增 vue@^3.5/@vitejs/plugin-vue@^5/vue-tsc@^2/@vue/test-utils@^2/klinecharts@^9
- [x] 1.2 更新 `frontend/vite.config.ts`：插件换 `vue()`，保留 /api 与 /ws 代理；更新 `tsconfig.json`：`jsx: "preserve"`，新增 `"types": ["vite/client"]`
- [x] 1.3 新建 `src/main.ts`（createApp 挂载）与空 `src/App.vue`，`index.html` 入口改 `main.ts`，删除 `main.tsx`
- [x] 1.4 `npm install` 后运行 `npm run typecheck` 与 `npm run build`，建立 Vue 构建基线

## 2. 迁移框架无关层与 UI 原子

- [x] 2.1 原样保留 `src/api/`（client/ws/types）与 `src/index.css`，确认无 React 依赖
- [x] 2.2 迁移 `src/ui/` 为 Vue 组件：Panel.vue（title/right 具名 slot）、Button.vue（variant + attrs 透传）、Input.vue（defineModel）、Tabs.vue（defineModel active）、Badge.vue（tone）、Modal.vue（Teleport + Transition），Tailwind class 与 tokens 不变
- [x] 2.3 删除 `src/ui/index.tsx`

## 3. 迁移布局与面板组件

- [x] 3.1 `src/composables/useSnapshot.ts`：接收 series ref，watch seriesKey 重连，返回 Snapshot ref
- [x] 3.2 `src/components/layout/`：AppShell.vue / Header.vue / MarketList.vue / OrderPanel.vue / BottomTabs.vue（slot 化替换 children 传参）
- [x] 3.3 `src/components/panels/`：StrategyEditor.vue（ref 直接改嵌套字段替代深拷贝）、Controls.vue、OrderConfirmDialog.vue（两步确认流程不变）、TradingPanel.vue
- [x] 3.4 `src/App.vue`：series/candles/analyze/snap/chartConfig 状态装配，删除 layout.tsx/panels.tsx

## 4. klinecharts ChartTerminal

- [x] 4.1 Spike：连接 klinecharts 验证蜡烛渲染、内置指标（MACD 副图/MA 主图）、交互 overlay 与程序化 overlay、overlay 序列化/恢复所需字段（`getOverlayById`/`createOverlay`/`updateData`/`removeOverlay`），结论写回设计 D5
- [x] 4.2 `src/lib/chartController.ts`：init/applyData/updateData/addIndicator/setIndicators/removeOverlaysByGroup/createOverlay/restoreOverlays/setDrawTool/destroy，klinecharts 实例收敛于控制器
- [x] 4.3 `src/lib/transform.ts` 适配：candles→`{timestamp(ms), open, high, low, close, volume}`；levels→priceLine overlay；结构→segment/rect overlay 配置
- [x] 4.4 `src/components/chart/Chart.vue`：模板 ref + onMounted 初始化控制器，watch candles 全量渲染，watch 自动层数据重建 sr/structure/smc overlay，onBeforeUnmount destroy
- [x] 4.5 `src/components/chart/DrawingToolbar.vue`：工具选择/取消绘制/清空手绘，调用控制器
- [x] 4.6 `src/components/chart/IndicatorPanel.vue`：指标增删管理（副图/主图叠加），emit 变更事件
- [x] 4.7 ChartTerminal 默认指标布局（VOL + MACD 副图）与图层开关 UI（S/R/结构/SMC）

## 5. 后端 ChartStore 与端点

- [x] 5.1 `src/market_data/chartstore.py`：ChartStore 读写 `data/config/chart.json`，按 series key 存储 indicators/drawings/layers，形状校验 + 单 series 手绘图形上限（默认 100），非法抛 ValueError
- [x] 5.2 `src/market_data/config.py`：新增 `chart_config_path` 属性（`data_dir/config/chart.json`）
- [x] 5.3 `src/market_data/webapi.py`：`GET /chart-config`（按 category/symbol/timeframe 返回，缺失返回空模板）与 `PUT /chart-config`（持久化，复用 ValueError→400 handler）
- [x] 5.4 后端单测：`tests/test_chartstore.py`（round-trip、非法形状、超限拒绝）+ `tests/test_webapi.py` 增补 `/chart-config` 端点测试

## 6. 前端持久化接线

- [x] 6.1 `src/api/client.ts` 新增 `chartConfig(s)`/`saveChartConfig(s, state)` 方法
- [x] 6.2 ChartTerminal 加载时拉取当前 series 图表状态并恢复（指标/手绘/图层开关）；变更时防抖保存
- [x] 6.3 切 series 时重新加载对应图表状态；保留增量更新（updateData）接口供后续 realtime-kline 消费

## 7. 测试重写

- [x] 7.1 保留 `src/api/client.test.ts` 与 `src/lib/transform.test.ts`（框架无关，随 transform 变更更新断言：毫秒时间戳/klinecharts 结构）
- [x] 7.2 新增/重写组件测试：App/panels 用 @vue/test-utils 断言与 React 版等价（下单两步、kill-switch、策略保存、Tab 切换、币种联动）
- [x] 7.3 useSnapshot composable 测试（@vue/test-utils 宿主组件）
- [x] 7.4 Chart.vue/控制器测试：打桩 chartController/klinecharts 验证数据/指标/图层调用；App 级沿用 Chart 打桩模式

## 8. 验证与回归

- [x] 8.1 `npm run typecheck`、`npm run build`、`npm test`、`pytest` 全绿
- [x] 8.2 回归验证：终端布局、切币种联动、指标增删、作图工具、图层开关、下单两步确认、kill-switch、图表状态持久化（自动化测试 + 后端端点冒烟）
- [x] 8.3 删除旧 React 残留（layout.tsx/panels.tsx/Chart.tsx/hooks 目录）与 `dist/` 旧产物，重新 build 确认
