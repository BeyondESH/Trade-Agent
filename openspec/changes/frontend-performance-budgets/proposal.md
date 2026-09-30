## Why

前端目前**没有任何性能度量与回归门禁**。现有门禁只覆盖 lint / typecheck / 单测 / 覆盖率，对"页面多快""交互多卡""内存是否泄漏"完全没有约束。

一次基于 Chrome DevTools MCP 的真实测量显示问题已经存在：

- 在**贴近真实设备**的条件下（4× CPU 降速 + Fast 4G），**LCP = 2,178 ms**，而 "Good" 阈值是 2,500 ms —— **已消耗 87% 预算，没有余量**。
- 这 2,178 ms 中 **2,163 ms 是 render delay（主线程）**，TTFB 仅 15 ms。瓶颈不是网络，是**单块 975 KB 的 JS bundle** 在慢 CPU 上的解析与执行。
- 渲染阻塞的 CSS 为 **229 KB，其中 140 KB（61%）是 112 条 `@font-face` 规则**。
- 浏览一圈后回到图表视图，DOM 节点从 701 涨到 **1,072（+51%）且不回落到基线**。

这些数字**只在被测量的那一刻存在**。没有任何机制阻止下一次重构把它们变差——正如本次测量所证明的：上一轮修复的 DOM 灾难（46,487 → 661）是被人工肉眼发现的，而非门禁拦下的。

## What Changes

- 新增**可复现的性能测量规程**：以 Chrome DevTools MCP（`performance_start_trace` / `performance_analyze_insight` / `emulate`）为基准工具，覆盖全部 7 个视图、8 个停靠栏面板、弹窗、图表交互与滚动；每次测量 MUST 记录元数据（CPU/网络节流档位、WS 消息速率、样本数、缓存冷热），否则结论不可复现。
- 新增**性能预算与门禁**：为 LCP / CLS / 初始 JS 体积 / DOM 上限 / WS 速率设定数值预算，并接入 CI，超额即失败。
- **BREAKING（构建产物形态变更）**：按视图拆分 `975 KB` 单块 bundle，图表库与各视图改为按需加载，降低首屏主线程消耗。
- 抑制**渲染阻塞 CSS 体积**：约束 `@font-face` 声明块的体积占比，使其不再主导首屏关键路径。
- 修复**数值列因位数变化引发的布局位移**：现有 `tabular-nums` 只能对齐字形宽度，无法阻止 `+0.05%` → `+12.34%` 这类位数增长撑开容器、推移邻位元素。
- 调查并修复**浏览后 DOM 不回落的"粘性 DOM"**（+51%），明确它是缓存设计还是卸载遗漏，并给出结论。

## Capabilities

### New Capabilities

- `performance-measurement-harness`: 定义性能如何被测量——工具链、测试矩阵、必录元数据、可复现性要求（预热、重复取中位数、空白对照），以及测量结论的抗反驳规则。
- `frontend-performance-budgets`: 定义各性能指标的数值预算与其强制方式（CI 门禁 vs 人工复核），含节流与非节流两档基线。
- `frontend-code-splitting`: 定义首屏 JS 的拆分契约——初始块体积上限、视图/重型库的按需加载、以及路由切换时的加载态。

### Modified Capabilities

- `ci-quality-gates`: 新增性能门禁作业；性能预算失败 SHALL 阻断 CI。现有覆盖率棘轮策略扩展为同时约束性能预算"只升不降"。
- `webfont-self-hosting`: 现有"数值刷新不抖动"仅要求 `tabular-nums`，不足以覆盖位数增长导致的位移，需补充容器宽度预留要求；并新增 `@font-face` 声明块体积对渲染阻塞 CSS 的约束。

## Impact

**受影响代码**

- `frontend/vite.config.ts`：手动 chunk 划分 / `build.rollupOptions`。
- `frontend/src/App.tsx`：视图挂载方式改为惰性（`React.lazy` + `Suspense`）。
- `frontend/index.html`：关键 CSS 内联 / 字体样式的加载策略。
- 数值展示组件（`ta-num` 消费方、涨跌幅徽标、价格列）：宽度预留。
- `frontend/src/components/views/*`、`components/sidebar/*`：粘性 DOM 的卸载路径。
- `frontend/src/hooks/useExchangeSocket.ts`：引用计数与订阅清理（粘性 DOM 的候选根因）。

**不受影响（已验证，明确排除）**

- `useRealSymbols` 的 tick 合流：`{...prev}` + 脏值检查 + `flushScheduled` 守卫设计正确。
- `dedupeSymbols` 的 `localeCompare` 排序：实测 17,773 次/秒，合计 **6.26 ms/秒 = 0.63% 单核**，**不是**瓶颈。此结论 SHALL 被记录，避免后续重复"优化"。
- 强制回流：实测全程 31 ms（占 12.4 s 的 0.25%），且全部位于 `klinecharts` 内部，无可回收收益。

**依赖与工具**

- 新增：Chrome DevTools MCP（测量）、如采用体积门禁则新增 `rollup-plugin-visualizer` 或等价体积检查。
- CI 需要能运行浏览器；若 Chromium 安装成本过高，性能门禁可退化为"体积 + 静态预算"子集，但 SHALL 明确记录该降级。

**未决风险**

- 未节流的本地基线（LCP 409 ms、TTFB 4 ms）**不是**真实用户指标，仅作对照；预算 MUST 以节流档位为基准。
- CLS 0.0869 的观测来自**不可信（合成）点击**，Chrome 不计为用户输入，可能高估；需以真实输入复测后才能定预算。
