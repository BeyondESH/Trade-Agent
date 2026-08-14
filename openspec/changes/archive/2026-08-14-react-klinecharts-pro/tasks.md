## 0. 基线提交

- [x] 0.1 `git add -A && git commit` 当前 Vue 工作树为基线（仓库零提交，先落盘）

## 1. React 脚手架

- [x] 1.1 更新 `frontend/package.json`：移除 vue 生态依赖；新增 react/react-dom/@types/react*/@vitejs/plugin-react/@testing-library/react/vitest-jsdom
- [x] 1.2 `vite.config.ts` 插件换 react()；`tsconfig.json` 恢复 react-jsx；`tailwind.config.js` content 含 `{ts,tsx}`
- [x] 1.3 `src/main.tsx` 挂载 React App 空壳；删除 Vue 组件（ui/layout/panels/chart/composables 中 Vue 文件）
- [x] 1.4 `npm run typecheck` + `npm run build` 建立 React 基线

## 2. clone klinecharts-pro 并二次开发

- [x] 2.1 `git clone https://github.com/klinecharts/pro` → `frontend/vendor/klinecharts-pro`；`package.json` 以 `file:vendor/klinecharts-pro` 引用，锁 `klinecharts@^9`
- [x] 2.2 改造①：`src/types.ts` 的 `ChartPro` 增加 `getChart(): Chart | null`；`ChartProOptions` 增加 `onSymbolChange/onPeriodChange`
- [x] 2.3 改造②：`src/ChartProComponent.tsx` `props.ref` 暴露 `getChart: () => widget`；symbol/period 变化触发回调
- [x] 2.4 Spike：在 React 页面实例化 Pro + klinecharts 9.8，验证渲染、改造点生效、销毁语义（结论写回设计 D1/D3）

## 3. 包装器 + datafeed

- [x] 3.1 `src/components/chart/KLineChartProView.tsx`：useRef 容器 + useEffect 实例化 + cleanup 销毁 + onChange 桥接 + ref 暴露 setSymbol/setPeriod
- [x] 3.2 `src/api/datafeed.ts`：searchSymbols（本期固定列表映射 SymbolInfo）/ getHistoryKLineData（/candles + /candles/recent 回退）/ subscribe/unsubscribe（/ws last_candle 桥接）
- [x] 3.3 `lib/transform.ts` 保留毫秒转换；`chartController.ts` 改造成接收 widget 实例（自动层逻辑复用）

## 4. 自动层与 AI 面板

- [x] 4.1 自动层控制器：S/R（priceLine）/结构（segment/rect）/SMC overlay 按 groupId 叠加与开关
- [x] 4.2 `components/ai/AnalysisPanel.tsx`：Agent 决策（/agent/decide）+ 指标摘要（/analyze）+ S/R 候选 + 交易日志（/journal）
- [x] 4.3 切币种/周期联动：onSymbolChange/onPeriodChange → 刷新 AI 面板与图表数据

## 5. React 组件树重建

- [x] 5.1 `ui/`：Button/Input/Tabs/Panel/Badge/Modal React 版（tokens 不变）
- [x] 5.2 `layout/`：AppShell/Header/MarketList/BottomTabs React 版；移除下单面板
- [x] 5.3 `App.tsx`：series 状态 + 图表 + AI 面板 + 市场列表装配

## 6. 测试与回归

- [x] 6.1 组件测试：React Testing Library 重写（布局/切币种联动/AI 面板/图层开关）
- [x] 6.2 `chartController`/`datafeed` 单测（mock widget/fetch）
- [x] 6.3 无头浏览器（puppeteer+本机 Chrome）验证：Pro 渲染、自动层、实时更新、切币种/周期联动
- [x] 6.4 全量回归：`npm run typecheck`、`npm run build`、`npm test`、后端 `pytest`
