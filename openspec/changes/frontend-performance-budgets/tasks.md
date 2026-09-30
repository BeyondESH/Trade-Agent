## 1. 测量规程落地（不改变产品行为）

- [x] 1.1 编写 `docs/` 或 `openspec/` 下的性能测量规程文档，固化工具链选择（Chrome DevTools MCP 为基准、Playwright 为交互驱动）、节流档位（4× CPU + Fast 4G）、元数据清单与"加载期 vs 稳态"的取样要求
- [x] 1.2 记录 Chrome DevTools MCP 的 profile 锁规避方法（独立 `--isolated` 实例），并在文档中说明为何不得与日常浏览器共用 profile
- [x] 1.3 编写应用内 WebSocket 计量脚本（以 `initScript` 注入钩子），产出消息速率、字节速率与通道占比；在文档中记录该脚本可测量 WS 连接数上限（Chrome DevTools MCP 网络面板不透出 WebSocket）
- [x] 1.4 补充测量前置条件校验：后端 `/health` 可达 + 行情推送确实投递，未满足时中止测量并报告
- [x] 1.5 建立空白页对照基线（用于排除浏览器节流与测量开销），并在文档中记录对照值

## 2. 建立基线（产出数字，不含优化）

- [x] 2.1 【已修正措辞】测绘「单次页面加载」的 LCP/CLS（4× CPU + Fast 4G），以及「逐视图切换成本」。本应用为无路由 SPA，整场仅有一次页面加载，其余视图不存在各自的 LCP，故以「切换耗时 + 切换内最大帧间隔」作为等价指标，且不得表述为"某视图的 LCP"
- [x] 2.2 在稳态推送下对全部 8 个停靠栏面板逐一测量 DOM 元素数与主线程占用
- [x] 2.3 测量图表交互（缩放/平移/切周期）与列表滚动的帧耗时，标注为稳态读数。**结果（稳态，1× CPU，实时推送，3 次取中位）**：缩放/平移/切周期中位帧间隔均 **16.6 ms**、p95 ≤ 21 ms、max ≤ 28 ms；screener 长列表（142,377 px）滚动中位 **16.6 ms**、max ≤ 25.6 ms。详见 `docs/frontend-performance.md` §11「交互帧耗时（2.3，稳态读数）」
- [x] 2.4 测量搜索输入的交互延迟；如无法注入可信输入，显式标注该读数为合成输入所致。**结果**：以 Playwright **可信输入**（CDP 真实 key 事件，`locator.click()` + `pressSequentially()`）测 `[data-testid="research-symbol-filter"]`，`keydown→input` 中位 **0.5–0.6 ms** / max ≤ 1.3 ms；Event Timing `input` duration 中位 16–32 ms。**信任级别：可信（trusted）**，非合成输入
- [x] 2.5 执行浸泡测量（反复切换视图 ≥12 轮），记录堆与 DOM 的增长曲线，判定是"有界粘滞"还是"无界增长"
- [x] 2.6 汇总基线表（含元数据），作为后续预算取值与回归对照的唯一来源

## 3. 首屏体积与字体阻塞改造

- [x] 3.1 记录改造前的体积基线：初始 JS 分块体积、渲染阻塞 CSS 体积、`@font-face` 声明条数与占比
- [x] 3.2 将各视图改为按需加载（`React.lazy` + `Suspense`），为每个视图提供骨架占位
- [x] 3.3 将重型依赖（图表渲染库、可视化库）移出初始块，配置构建分块策略
- [x] 3.4 调整字体声明的组织方式，使 `@font-face` 声明块不再主导渲染阻塞 CSS 体积
- [x] 3.5 复测首屏：确认初始 JS 体积与渲染阻塞 CSS 体积下降，且 **CLS 未劣化**（与 2.1 基线对比）
- [x] 3.6 依据改造后实测体积设定初始块体积上限，并按棘轮策略取宽松侧

## 4. 数值列布局稳定性

- [x] 4.1 定位数值展示单元（涨跌幅徽标、价格列、成交量列），确认其宽度随位数变化的实际表现
- [x] 4.2 以可信输入（非合成点击）复测 CLS，确认位数增长导致的位移是否真实存在及其贡献量
- [x] 4.3 为数值单元预留稳定宽度或以等宽列对齐，使位数变化不推移相邻元素
- [x] 4.4 复测 CLS 并记录改善量；将最终值写入预算文档

## 5. 粘性 DOM 归因

- [x] 5.1 依据 2.5 的曲线，定位浏览后 DOM 从 ~701 涨至 ~1,072 且不回落的来源（逐视图/面板二分定位）
- [x] 5.2 判定其为有意的缓存设计还是卸载遗漏，并在本变更中给出结论
- [x] 5.3 若为卸载遗漏则修复订阅/监听清理；若为缓存设计则为其设定有界上限并加断言
- [x] 5.4 为"DOM 不无界增长"补充自动化断言

## 6. 性能门禁接入

- [x] 6.1 选定体积门禁实现（构建产物体积检查或可视化插件），并接入前端构建脚本
- [x] 6.2 依据第 2、3 步的实测定稿预算值（LCP / CLS / 初始 JS 体积 / DOM 上限 / 主线程占用）
- [x] 6.3 新增 CI 性能门禁作业，失败即阻断；实现"浏览器不可得时显式失败或记录跳过"，不得静默通过
- [x] 6.4 确认既有 ruff / Biome / typecheck / 单测 / 覆盖率门禁未被削弱
- [x] 6.5 为无法即时满足的预算建立豁免记录机制（含原因与收敛计划）

## 7. 文档与收尾

- [x] 7.1 记录性能非目标清单及其实测依据（字符串排序比较 0.63%、强制回流 31 ms），防止重复调查
- [x] 7.2 将基线表与棘轮策略写入仓库文档，说明预算变更需附证据
- [x] 7.3 运行完整回归（前端 `npm run test`、`npm run typecheck`、`npm run lint`、构建）
- [x] 7.4 以成品门禁复测一次全流程，确认可复现且阈值判定符合预期

## 8. community 视图切换停顿归因（测量新发现，原任务清单未覆盖）

- [x] 8.1 归因 community 视图切换时 **155 ms** 的帧停顿（其余视图为 16.8–31 ms，约为其 5–9 倍，对应约 9 帧丢失）：定位是同步重型渲染、大数据解析还是未记忆化计算。**结论：该停顿不是 community 视图的属性，未能复现**。12+ 次切换（含冷启首切、分块冷/暖）为 **18–36 ms**，反而是所测三视图中最低者（6 次中位：community 20.5、news 21.6、markets 24.2 ms）；逐阶段 CDP trace 显示 community 每次切换主线程 inclusive 耗时最低（script 136.6 / style+layout 34.5 / paint 32.3 ms）。偶发 >90 ms 尖峰的全部长任务落在 `assets/motion-*.js` 的动画帧（`rr`/`y`，单次最高 117 ms）与 `assets/react-vendor-*.js` 的 React commit（`At`），与视图无关；`prefers-reduced-motion: reduce` 对照下 **>25 ms 长任务由 6 个降为 0 个**（community 各轮 18–37 ms）。证据：`scripts/perf-community-attribution.mjs`、`scripts/perf-spike-probe.mjs`
- [x] 8.2 修复该停顿，或将无法消除的部分登记为「有界例外」并记录实测依据。**处置**：无可归因于 community 的缺陷可修，**未改动 community 代码**（其为最廉价视图）；偶发尖峰的唯一杠杆是移除/改写 framer-motion 挂载动画，而动画属设计资产、本变更 MUST NOT 改动，故按「无法消除的部分登记为有界例外」处理——登记于 `frontend/perf-budgets.json` 的 `boundedExceptions.sporadicTransitionSpike`（**非** `exemptions`，不放宽任何预算），依据见 `docs/frontend-performance.md` §11「community 视图切换停顿归因」
- [x] 8.3 为该视图的切换内最大帧间隔补充断言，防止回归。**实现**：新增预算键 `transitionMaxGapMs = 80 ms`（**新增键，未放宽任何既有预算**），`scripts/perf-gate.mjs` 运行时子集对**每个视图**断言切换最大帧间隔，估计量取 **3 轮的中位数**（单次偶发尖峰不误报，132–155 ms 级确定性回归会抬高中位数并被阻断）；门禁实测 community 三轮 18.7 / 20.5 / 19.5 ms → 中位 **19.5 ms ✓**

## 9. 图表惰性加载（实验已完成，转为正式实现）

- [x] 9.1 实测「图表也惰性加载」的权衡。**结果：推翻此前"会使 LCP 劣化"的推断**——LCP 2,037 → 1,898/2,005 ms，首屏预加载 JS 907 → 522 KB，渲染阻塞 CSS 108 KB/2 请求 → 68.3 KB/1 请求，CLS 保持 0.00，图表功能完好（canvas×10、watermark=BTCUSDT、离开返回状态一致、无页面错误）
- [x] 9.2 将实验改动转为正式实现：移除 `App.tsx` 中的 `[EXPERIMENT]` 标注，补上说明性注释，并保留围绕 `<NativeChart>` 的嵌套 `Suspense`（使停靠栏不被骨架替换）
- [x] 9.3 复核惰性图表不违反 `chart-mount-lifecycle` / `chart-shell-integrity` 规格，并在实现说明中记录依据。**依据**：`React.lazy`+`Suspense` 是组件外部包装，只改变首次挂载时机，不改变 StrictMode 对副作用的双调用语义；StrictMode 双挂载守卫是 `KLineChartProView` 自身属性，已由 `KLineChartProView.test.tsx:70` 的「creates exactly one chart instance under StrictMode double-mount」在隔离环境中断言（含在 383 个通过用例内）；preview 运行时实测为单实例、离开→0、返回→1 干净重建。**无需 dev server**（StrictMode 仅 dev 生效，但已由单测覆盖）
