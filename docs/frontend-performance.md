# 前端性能测量规程

> 本文件是 `frontend-performance-budgets` 变更的产物，定义**前端性能如何被测量**。
> 预算数值见文末「已记录基线」。**缺少元数据的性能数字一律视为无效。**

## 1. 工具链：为什么是 Chrome DevTools MCP

| 工具 | 角色 | 能回答的问题 |
|---|---|---|
| **Chrome DevTools MCP** | **基准**（唯一可信来源） | 主线程 CPU 归因、LCP 子项拆解、渲染阻塞归因、强制回流归因、堆行为 |
| Playwright | 仅交互驱动与计量 | 消息速率、前置条件校验、脚本化点击、DOM 计数 |
| 手写计时 | **禁止用于结论** | — |

**这条边界是硬性的，不是偏好。** 实测教训：Playwright 只能测得"我手写出来的指标"（DOM 数、rAF 间隔）。本项目的核心瓶颈是**单块 975 KB JS 在慢 CPU 上的解析执行**（贡献 LCP 的 2,163 ms render delay）与**第三方图表库内部的强制回流**——这两类问题在 Playwright 里**完全不可见**。若只用 Playwright，结论会永远停留在"DOM 节点数"这一层。

## 2. 被测目标必须是生产构建

测量 SHALL 针对 `vite preview`（或等价产物服务），**MUST NOT** 对 `vite dev` 下结论。

开发服务器不压缩、不做 tree-shaking、带 HMR 运行时，其体积与主线程开销与真实产物无对应关系。报告中 SHALL 记录被测产物的入口文件名（含哈希），使测量可追溯到具体构建。

## 3. 前置条件校验（硬性闸门）

**测量开始前必须确认应用处于「数据流通」状态。** 未满足时 SHALL 中止并报告，**MUST NOT** 产出性能结论。

需要同时满足：

1. 后端可达：`GET /health` 返回 200
2. 行情确实在投递：WebSocket 在观察窗口内**收到过消息**
3. 记录实测推送速率

**为什么这是硬闸门**：本项目真实发生过一次错误结论——某轮测量把 400–700 ms 帧耗时判为"加载中假象"并排除。该判断本身正确，但**当时后端已挂**，热路径根本没有执行，结果真实的运行时成本被掩盖了。没有数据流的应用测出来的是空壳，而且**看起来更快**。

用 `npm run perf:meter` 自动完成本校验（见第 8 节）。

## 4. 节流档位

| 档位 | 用途 |
|---|---|
| **4× CPU 降速 + Fast 4G** | **预算判定基准**（唯一可用于达标判定的档位） |
| 1× CPU + 无网络限制 | **仅作对照记录**，MUST NOT 用于达标判定 |

本地服务 TTFB 仅 4 ms，未节流时会给出"性能极好"的错误安全感。实测对比：

```
未节流:            LCP  409 ms   TTFB  4 ms   render delay  405 ms
4× CPU + Fast 4G:  LCP 2178 ms   TTFB 15 ms   render delay 2163 ms
                   ↑ 5.3×
```

未节流的 409 ms 没有物理意义；节流后的 2,178 ms 才暴露真实问题（占 2,500 ms 阈值的 87%）。

## 5. 取样要求

- **区分加载期与稳态**：帧率/交互类测量 SHALL 在应用进入稳态后取样，MUST NOT 计入加载阶段读数。
- **空白页对照**：每次帧耗时类测量 SHALL 附空白页对照，用于排除浏览器节流与测量工具自身开销。已记录对照值：`0 / 0 / 9 ms`（min/median/max 帧间隔）。
- **重复取样**：结论性数字 SHALL 至少重复 3 次取中位数。
- **可信输入**：交互延迟（INP 类）与 CLS SHALL 使用浏览器认定的**可信输入**。脚本 `.click()` 派发的是**不可信事件**，Chrome 不计为用户交互，会**高估** CLS。使用合成输入时必须在报告中标注该读数可能失真。

## 6. 每次测量必须记录的元数据

```
CPU 降速档位        例: 4x
网络节流档位        例: Fast 4G
缓存状态            冷 / 暖
产物标识            例: index-C2HD96k4.js
标的数量级          例: 4197 instruments
WS 消息速率         例: 12 msg/s, 461 KB/s
WS 通道占比         例: books 131 > trade 49 > candle 11 > ticker 7
取样次数与取值方式   例: 3 次取中位数
```

## 7. 覆盖矩阵

全部用户可达界面与路径，逐项报告（**MUST NOT 只给总体平均值**）：

| 维度 | 覆盖对象 |
|---|---|
| 视图 | chart / markets / screener / heatmaps / community / news / research |
| 停靠栏面板 | watchlist / alerts / news / datawindow / hotlists / calendar / orderbook / ideas |
| 弹窗 | 设置、命令面板、价格线设置、符号搜索等 |
| 图表交互 | 缩放 / 平移 / 切周期 / 画线 |
| 列表 | 滚动（含窗口化列表滚至末尾以证明数据未被裁剪） |
| 输入 | 搜索框输入延迟 |
| 主题 | 深色 / 浅色 |

## 8. 命令

```bash
# 前置条件 + WS 计量 + 空白对照（Playwright）
cd frontend && npm run perf:meter

# 可选环境变量
#   PERF_URL   被测地址，默认 http://127.0.0.1:4173
#   PERF_BACKEND  后端地址，默认 http://127.0.0.1:8181
```

> Chrome DevTools MCP 的 trace 类操作由 MCP 工具直接驱动（`performance_start_trace` /
> `performance_analyze_insight` / `emulate` / `take_heapsnapshot`），不经 npm 脚本。

## 9. 已知工具限制

**Chrome DevTools MCP 的网络面板不透出 WebSocket 请求**（以 `resourceTypes: ["websocket"]`
查询返回 "No requests found"）。因此 **WS 连接数 MUST 通过应用内钩子计量**
（`initScript` 注入 `WebSocket` 子类），该实现位于 `scripts/perf-meter.mjs`。

**`frontend/perf-budgets.json` 含非 ASCII 文本（中文 policy / 例外说明），PowerShell 5.1 的
`Get-Content` 默认按 ANSI 读取、会解析失败。** Windows / PowerShell 侧的工具必须**显式按 UTF-8 读取**
（`Get-Content -Encoding utf8`，或直接交给 Node——`JSON.parse(readFileSync(path, "utf8"))` 与 CI 均不受影响）。
本仓库的读取方（`vite.config.ts`、`scripts/perf-gate.mjs`）均为 Node，故门禁不受此影响；
此条仅为避免本地 PowerShell 手工检查预算时踩坑。

## 10. Chrome DevTools MCP profile 锁

**症状**

```
The browser is already running for
C:\Users\<user>\.cache\chrome-devtools-mcp\chrome-profile.
Use --isolated to run multiple browser instances.
```

**成因**：MCP server 使用固定的 `userDataDir`。该 profile 已被一个 Chrome 实例占用
（例如上次会话遗留的进程），新实例无法启动。

**处置（按推荐顺序）**

1. **`--isolated`（推荐）**：为 MCP server 增加 `--isolated` 启动参数，每次使用独立
   profile。本项目无需登录态，隔离 profile 反而更适合性能测量——**干净的 cache 与零浏览器扩展**，
   避免插件污染 LCP / TBT 读数。
2. **结束占用进程**：仅结束命令行中包含 `chrome-devtools-mcp` 的进程，**不要**结束用户
   自己的浏览器窗口：

   ```powershell
   $m = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
        Where-Object { $_.CommandLine -like "*chrome-devtools-mcp*" }
   $m | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```

**为何不得与日常浏览器共用 profile**：用户 profile 携带扩展、书签、历史、
DevTools 设置与既有标签页，均会影响加载与主线程开销，使测量不可复现。

## 11. 已记录基线

> 条件：生产构建、本地后端、Windows；除注明外为**未节流**对照值。
> 节流基线为 `4× CPU + Fast 4G`。

### 首屏（chart 视图）

| 指标 | 未节流（对照） | 4× CPU + Fast 4G（**判定基准**） | 阈值 |
|---|---|---|---|
| LCP | 409 ms | **2,178 ms** | ≤ 2,500 ms |
| — TTFB | 4 ms | 15 ms | — |
| — render delay | 405 ms | **2,163 ms** | — |
| CLS | 0.00 | — | ≤ 0.1 |

### 构建产物

| 项 | 改造前 | 改造后（视图拆分 + 字体外移） |
|---|---|---|
| 入口 JS 分块 | **975 KB**（单块） | **163 KB**（-83%） |
| 首屏 `modulepreload` 集合 | — | **744 KB**（chart-core 199 + react-vendor 189 + chart-pro 172 + motion 130 + icons 27 + vendor 27） |
| 首屏 JS 实际总量 | ~975 KB | **~907 KB**（仅 -7%） |
| 渲染阻塞 CSS | **229 KB**（单文件） | **108 KB**（index 69.5 + chart-pro 38.6） |
| └ `@font-face` 声明块 | **140 KB（61%）**，112 条 | **0 KB 在关键路径**（外移为独立 `fonts-*.css` 116 KB，非阻塞） |
| 渲染阻塞请求数 | 1 | **2**（⚠️ 变差） |
| 非图表视图 | 全部打入初始块 | 6 个独立分块，共 ~70 KB 按需 |
| `dist/assets` 总计 | 6,017 KB | 6,020 KB |

**首屏效果实测**（4× CPU + Fast 4G）：

| 指标 | 改造前 | 拆分（图表 eager） | **拆分 + 图表也惰性** |
|---|---|---|---|
| LCP | 2,178 ms | 2,037 ms | **1,898 / 2,005 ms**（中位 ~1,952，**-10.4%**） |
| — render delay | 2,163 ms | 2,034 ms | 1,894 / 2,002 ms |
| CLS | 0.00 | 0.00 | **0.00** ✓ |
| 首屏 `modulepreload` 集合 | — | 744 KB（6 个） | **~374 KB（4 个）** |
| 首屏 JS 实际总量 | ~975 KB | ~907 KB | **~522 KB（-46%）** |
| 渲染阻塞 CSS | 224 KB / 1 请求 | 108 KB / **2 请求** | **68.3 KB / 1 请求** |
| RenderBlocking 估算可回收 | 116 ms | 319 ms | 128–139 ms |

### 图表惰性加载的实验结论（重要：推翻了此前的假设）

此前记录过一个推断：**"图表库无法离开首屏，因为其水印是 LCP 元素，惰性化会让 LCP 劣化"**。
该推断**已被实测推翻**——惰性图表在**所有**测量轴上都更好，且功能完好：

- LCP 由 2,037 → **1,898/2,005 ms**（两次采样），优于 eager 方案
- 首屏预加载 JS 由 ~907 KB → **~522 KB**
- 渲染阻塞 CSS 由 108 KB（2 请求）→ **68.3 KB（1 请求）**：图表自带的
  `chart-pro.css`(38.6 KB) 与 `NativeChart.css`(1.2 KB) 随动态块变为**非阻塞**
- 功能验证：`canvas×10`、`watermark="BTCUSDT"`、离开再返回状态一致、无页面错误

**机制**：eager 方案下 744 KB 被 `modulepreload` 拉回首屏并与入口块争抢主线程；
惰性化后入口块（148.6 KB）先完成解析、外壳先渲染，图表块随后按需加载，
关键路径反而更短。

**因此**：`frontend-code-splitting` 规格的"重型依赖 SHALL NOT 位于首屏初始块"
**是可实现的，且已实现**——早前"该规格不可实现、需要收窄"的判断**是错的**，
不应据此修改规格。



### 运行时（稳态、实时推送）

| 项 | 数值 |
|---|---|
| DOM 元素数 | 701（深度 18，最大子节点 21，"savings: none"） |
| WS 消息速率 | 12 msg/s，461 KB/s |
| WS 通道占比 | books 131 > trade 49 > candle 11 > ticker 7（5 秒窗口） |
| WS 连接数 | 2 |
| 主线程：字符串排序比较 | 17,773 次/秒 = 6.26 ms/秒（单核 0.63%） |
| 强制回流 | 全程 31 ms（占 12.4 s 追踪的 0.25%） |
| 空白页帧间隔对照 | 0 / 0 / 9 ms |

### 逐视图切换成本（稳态推送下，1× CPU，未节流）

> **方法学说明（重要）**：LCP / CLS / TBT 是**页面加载**指标，而本应用是
> 无逐视图 URL 的 SPA——**整场只有一次页面加载**（默认 chart 视图）。
> 因此其余视图**不存在**各自的 LCP，可测的等价指标是**切换成本**。
> 本表记录的是切换成本，SHALL NOT 被表述为"某视图的 LCP"。

| 视图 | 切换耗时 | **切换内最大帧间隔** | 稳态最大帧间隔 | DOM |
|---|---|---|---|---|
| chart | 588 ms | 18.7 ms | 12.0 ms | 710 |
| markets | 620 ms | 27.6 ms | 10.2 ms | 618 |
| screener | 620 ms | 31.0 ms | 12.7 ms | 660 |
| heatmaps | 610 ms | 25.7 ms | 12.4 ms | 439 |
| **community** | **760 ms** | **155 ms** ⚠️ | 16.4 ms | 462 |
| news | 603 ms | 26.5 ms | 14.1 ms | 858 |
| research | 600 ms | 16.8 ms | 10.2 ms | 347 |

**结论**：全部视图稳态帧间隔均为 **10–16 ms（满 60 fps）**，运行时健康。
表中 community 的 155 ms 曾标注为「待归因」。**8.1 复测（见下节）未能复现该停顿**：
community 在 12+ 次切换（含冷启首切）中为 18–36 ms，反而是所测三视图中**最低**的一个；
155 ms 属**偶发、与视图无关**的全局尖峰。详见「community 视图切换停顿归因」。

### community 视图切换停顿归因（8.1 / 8.2 / 8.3）

> **元数据**：生产 `vite build` + `vite preview`（:4173），后端 :8181 实时推送（16 msg/s，
> 227 KB/s，2 条 WS 连接），1× CPU、无网络节流，取样窗口为「点击后 1.5 s 内的最大 rAF 帧间隔」。
> 工具：Playwright（可信 CDP 点击）+ CDP `Tracing`（`scripts/perf-community-attribution.mjs`、
> `scripts/perf-spike-probe.mjs`）。空白页对照 16.7 ms。

**8.1 归因结果（实测，非假设）：该停顿不是 community 视图的属性，无法复现。**

| 场景 | community 最大帧间隔 |
|---|---|
| 冷启后第 1 次切到 community（3 次） | 19.5 / 22.2 / 25.8 ms |
| 首次切换（冷，分块未缓存） | 26.7 ms |
| 重复切换 ×10（3 组独立运行） | 全部 ≤ 35.8 ms |
| 带 trace 的单次切换 | 20.6 ms |

同条件下**其他视图反而更差**（说明尖峰是全局而非 community 专有）：

| 视图 | 每轮切换最大帧间隔 | 6 次中位 |
|---|---|---|
| markets | 37.7 / 37.6 / 19.9 / 24.2 / 19.2 / 19.2 ms | 24.2 ms |
| **community** | 30.8 / 20.5 / 19.7 / 28.4 / 18.5 / 18.0 ms | **20.5 ms** |
| news | 21.6 / 19.2 / **95.0** / 19.8 / 18.5 / 22.0 ms | 21.6 ms |

按 trace 逐阶段切分（**每次切换**的主线程 inclusive 耗时）：community **最低**
（script 136.6 / style+layout 34.5 / paint 32.3 / gc 8.2 ms），markets 170.3 / 53.1 / 56.7 / 17.8，
news 194.1 / 46.4 / 28.6 / 26.5 ms。即 community 既非同步重型渲染，也非大数据解析或未记忆化计算。

**尖峰（偶发 >90 ms）的真实来源**：CDP trace 显示，全部 >25 ms 的任务都落在

- `rr` / `y` @ `assets/motion-*.js`（framer-motion 的主线程动画帧，单次最高 117 ms，内含同步 `Layout`），
- `At` @ `assets/react-vendor-*.js`（React commit），
- `MajorGC`；

均**与哪个视图无关**，且集中在切换动作本身（挂载 `Reveal` 的 spring 动画、`layoutId` 共享布局投影、
`animate-[ta-fade]`）叠加一次 GC / React commit 时。

**对照实验（判定性证据）**：以 `prefers-reduced-motion: reduce` 运行同一脚本
（`Reveal` 退化为普通 `div`、`layoutId` 指示器 transition 归零），
**>25 ms 的长任务由 6 个降为 0 个**，community 各轮最大帧间隔 18–37 ms。
故该偶发尖峰的成因是**挂载动画的主线程开销**，而动画属于设计资产（本变更 MUST NOT 改动）。

**8.2 处置：无可归因于 community 的缺陷可修；将偶发尖峰登记为有界例外。**
未对 community 代码做任何改动——community 已是所测三视图中最廉价者，任何"修复"都只是表演。
唯一能消除尖峰的杠杆是移除/改写 framer-motion 挂载动画，而规格明令不得改动动画，
故按"无法消除的部分登记为有界例外"处理，证据即上表与对照实验，登记于
`frontend/perf-budgets.json` 的 `boundedExceptions.sporadicTransitionSpike`（**不是** `exemptions`，
不会放宽任何预算）。

**8.3 断言**：新增预算键 `transitionMaxGapMs = 80 ms`（**新增，未放宽任何既有预算**），
在 `scripts/perf-gate.mjs` 运行时子集中对**每个视图**断言其切换帧间隔。
估计量取 **3 轮最大帧间隔的中位数**：单次偶发尖峰（如门禁实测中 news 一轮 93.9 ms）不会误报，
而 155 ms 级的**确定性**回归会抬高中位数并被阻断。门禁实测中 community 三轮 18.7 / 20.5 / 19.5 ms，
中位 19.5 ms ✓。


### 停靠栏面板 DOM（chart 视图，稳态）

| 面板 | DOM 元素数 |
|---|---|
| watchlist | 709 |
| alerts | 530 |
| news | 529 |
| datawindow | 576 |
| hotlists | 652 |
| calendar | 598 |
| orderbook | 840 |
| ideas | 558 |

全部低于 1,500 预算；达标依赖窗口化（修复前 watchlist 为 35,160、hotlists 为 27,446）。

### 长时间运行（12 轮视图切换）—— 已归因

| 项 | 数值 | 判定 |
|---|---|---|
| 堆内存 | 18.3 → 30.9 → 36.6 → **11.2** → … → 42.6 MB | **锯齿形 → 无泄漏** |
| DOM 元素数 | 738 → **788**（+50）后收敛 | **有意的缓存**（见下），非卸载遗漏 |
| CLS（合成点击） | 0.0869 | ⚠️ **已确认为合成输入假象**（见下） |

**粘性 DOM 的归因结论（design.md D6「先定性、后修复」）**：逐视图二分定位显示，
残留**全部来自标题栏的标签累积**（每个视图类型开一个持久标签，约 10–11 节点/标签，
标签数 3 → 7），**工作区残留为 0，8 个停靠栏面板残留均为 0**。故这是
`handleSelectGlobalRailView` 的**有意缓存设计**，而非卸载遗漏——
`useExchangeSocket` 的引用计数退订是正确的（切换全部面板后 WS 连接数恒为 2）。
处置：**不"修复"**，改为设定有界上限并加断言。

**CLS 0.0869 已被证伪**：该读数由页内 JS `element.click()` 产生，Chrome 判定为
**不可信事件**、不计为用户交互，因而**高估**。以 Playwright 可信输入
（CDP 真实事件）复测，交互 CLS 为 **~0.0004**（分量：`+0` / `+0.0003` / `+0`），
**远低于 0.1 阈值**。

### 数值列宽度稳定性（位数增长不再推移相邻元素）

实测：修复前有 **7** 个内容自适应宽度的数值单元会随位数变化而变宽（Δ6.56–10.5 px），
表格列在 `%` 位数增长时重排（−115/+18/+98 px）。修复方式为预留稳定宽度
（`min-w-[Nch]`，1ch = 一个 tabular 数字宽，随字号缩放），未改动颜色/字体/文案/设计令牌，
`src/index.css` 未改。

修复后实测：**0** 个宽度随位数变化的数值单元，表格列宽变化 **0**，CLS **~0.0004**。

### 交互帧耗时（2.3，**稳态**读数）

> **元数据**：生产 `vite build` + `vite preview`（:4173），后端 :8181 实时推送（16 msg/s），
> 1× CPU、无网络节流，应用进入稳态后（加载期已排除，规程 §5）取样；
> rAF 帧间隔 min/median/p95/max，**3 次独立运行取中位数**。
> 脚本：`scripts/perf-interactions.mjs`。空白页对照 16.7 ms。
> **标注：以下均为稳态读数，不是加载期读数。**

| 交互 | n（帧） | min | median | p95 | max |
|---|---|---|---|---|---|
| 图表缩放（wheel 滚轮，12 步） | ~90 | 12.4–14.8 ms | **16.6 ms** | 18.1–18.7 ms | 19.2–22.2 ms |
| 图表平移（按住拖拽，双向） | ~88 | 13.0–14.4 ms | **16.6 ms** | 18.1–18.4 ms | 18.9–22.8 ms |
| 周期切换（15m/1h/5m/1h） | ~85 | 10.0–13.9 ms | **16.6 ms** | 18.2–18.6 ms | 19.3–27.9 ms |
| 长列表滚动（screener，scrollHeight≈142,377 px） | ~180 | 2.6–11.2 ms | **16.6 ms** | 19.3–20.9 ms | 24.4–25.6 ms |

**结论**：图表缩放 / 平移 / 切周期与长列表滚动在稳态下均为 **~16.6 ms 中位帧间隔（满 60 fps）**，
p95 ≤ 21 ms，最长帧 ≤ 28 ms。长列表（142k px）滚动无掉帧或数据裁剪迹象。

### 搜索输入延迟（2.4，**可信输入**）

> **元数据**：同 2.3。驱动方式为 **Playwright 可信输入**——`locator.click()` 与
> `pressSequentially()` 经 CDP 派发**真实** key 事件，Chrome 认定为用户交互；
> **未**使用页内 `element.click()` / `dispatchEvent`（不可信，规程 §5）。
> 被测元素：`[data-testid="research-symbol-filter"]`（ResearchView）。3 次独立运行。

| 指标 | 读数 |
|---|---|
| 每次按键 `keydown → input`（页内计时，排除工具往返） | median **0.5–0.6 ms**，max 1.0–1.3 ms |
| Event Timing `input` 事件 `duration`（`durationThreshold:16`） | median 16–32 ms，max 24–40 ms |
| 7 次按键的墙钟总耗时（含 70 ms 人工间隔） | 542–562 ms |

**结论**：输入**未被主线程阻塞**——`keydown` 到 `input` 处理器触发中位 0.5 ms。
Event Timing 的 `duration`（16–40 ms）是离散键盘事件到下一帧的登记时长，非输入阻塞。
**信任级别：可信（trusted CDP input）**，非合成输入。

### 最终预算（已固化为门禁，见 `frontend/perf-budgets.json`）

| 预算项 | 实测 | 预算上限 |
|---|---|---|
| 初始 JS 分块 | 152.4 KB | 180 KB |
| 首屏预加载 JS | 535.1 KB | 600 KB |
| 渲染阻塞 CSS | 70.05 KB | 90 KB |
| 渲染阻塞请求数 | 1 | 1 |
| LCP（4× CPU + Fast 4G） | 2,005 ms | 2,500 ms |
| CLS | ~0.0004 | 0.1 |
| 单界面 DOM 上限 | 875 | 1,500 |
| 三轮切换 DOM 增量 | 0 | 20 |
| 主线程占用 | 0.63% | 20% |
| **逐视图切换最大帧间隔**（8.3，3 轮中位） | **30.8 ms**（实测最差视图中位） | **80 ms** |

> 注：`frontend/perf-budgets.json` 中 `renderBlockingRequests = 1`，与门禁一致（此表此前误记为 2，已更正）。
> `transitionMaxGapMs` 为 **8.3 新增键**，未放宽任何既有预算；其取值依据与估计量见「community 视图切换停顿归因」。


## 12. 已登记的非目标（实测证伪，不得重复调查）

以下方向**已有实测证据证明不是瓶颈**。若无**新的**实测证据，MUST NOT 重复投入：

1. **`dedupeSymbols` 中的 `localeCompare` 排序**
   曾被推断为帧率杀手（假设每帧 4,197 次比较 × 60 fps）。实测：17,773 次/秒、合计
   **6.26 ms/秒 = 单核 0.63%**。
   *推断错误的根源*：ticker 帧实际只有 **1.4 次/秒**，而非假设的 60 次/秒。

2. **强制同步布局（forced reflow）**
   实测全程 31 ms（0.25%），且 top 消耗项全部位于 `klinecharts` 第三方库内部
   （`_measurePaneHeight` 12 ms 等）。insight 明确给出 "Estimated savings: none"。

## 13. 右侧停靠栏缩放：布局宽度动画 → 合成层位移 + 每帧合并（2026-09-30 实测）

### 13.1 缺陷（改前实测）

`RightDock` 用 motion spring 动画 `width`（布局属性），并按 `mousemove` 逐事件提交宽度：

- **关闭/打开**：整个 flex 行（图表列 + 停靠栏）每动画帧重排一次；图表 canvas 不随容器变化，静止在错误尺寸。
- **拖拽**：每个 mousemove 一次 React 状态提交；canvas 仅偶发更新，并停在错误的中间尺寸。

### 13.2 修复机制

- **A（布局/动画分离）**：布局宽度只在提交点离散变化一次；可视滑动改为内层轨道
  `transform: translateX`（合成器完成，零布局）。开 = 先占位、再滑入；关 = 先滑出、
  `onAnimationComplete` 后收合占位；`prefers-reduced-motion` 仍为 `duration: 0`。
- **B（拖拽路径合并）**：指针路径只做样式回写（panel / track / wrapper 同步到同一值，
  可同步读取）；React 提交合并到每帧最多一次（rAF）。拖拽结束提交与逐帧路径完全相同的
  inline `style.width`。
- **图表侧**：`KLineChartProView` 观察自身容器（`ResizeObserver`，rAF 合并 + 尺寸去重），
  容器变化即 `chart.resize()`——不再依赖 `window.resize`。

### 13.3 测量方法

- 生产构建 + `vite preview`（:4173），后端 :8181 实时推送，1920×945，默认 CPU（无节流），
  Playwright **可信输入**（CDP）。脚本：`scripts/perf-dock-resize.mjs`。
- 页面内 rAF 采样：轨道宽 / 面板宽 / 停靠栏容器宽 / 图表 widget 宽 / 首个 canvas 的
  **背板宽度**；切换与拖拽边界由页面内事件监听打点（同一时钟）。
- **"图表是否正确"的独立判据**：交互结束后强制 `window.__kline_chart__.resize()`；
  canvas 背板不动（0 px）说明图表本就等于容器应有尺寸，否则即陈旧。
- 产物标识：改前 `index-BMwW4iK9.js`，改后 `index-BUVHKgNl.js`（最终门禁产物）。

### 13.4 结果

**(i) 每次 toggle 的 canvas 背板变化（4 次取样）**

| | 改前 | 改后 |
|---|---|---|
| 变化次数 | **0**（canvas 始终 1420） | **1** |
| 关闭：相对点击的时刻 | —（结束后 canvas 1420，而容器要求 1707 → **陈旧 287 px**） | **540–546 ms**（滑出完成、占位收合的那一帧）；终值 1707 = widget 1772 − 65 ✓ |
| 打开：相对点击的时刻 | —（canvas 恰为 1420，与目标巧合一致） | **78–82 ms**（占位提交帧）；终值 1420 = 1485 − 65 ✓ |
| 强制 resize 后 canvas 位移 | 由几何差可推 **287 px** | **0 px** |

**(ii) 拖拽（61 次 paced / 241 次 burst mousemove）**

| | 改前 | 改后 |
|---|---|---|
| 拖拽期间 canvas 变化 | 0–3 次，且停在错误的中间值 | **55–59 / 160–177 次（≈每帧一次）** |
| 结束后 canvas 与容器 | 陈旧：canvas 1288 > widget 1269（比整个 widget 还宽 19 px）；burst 轮 1239 vs 1267（应约 1202） | canvas = widget − y 轴宽（61–65，y 轴宽度随价格标签自适应）；**强制 resize 位移 0 px** |
| 结束宽度（夹紧） | 500 / 260 正确 | 500 / 260 正确，且 wrapper = panel + 7 精确成立 |

**(iii) rAF 帧间隔（min / median / p95 / max，ms）**

| 交互 | 改前 | 改后 |
|---|---|---|
| toggle 关闭 | med 16.6 / p95 19.2 / max 19.9 | med 16.6–16.9 / p95 17.9–18.6 / max 18.1–22.7 |
| toggle 打开 | med 16.7 / p95 18.1 / max 18.7 | med 16.6–16.7 / p95 17.8–18.2 / max 18.1–20.9 |
| 拖拽（paced / burst） | med 16.6 / p95 18.2–18.4 / max 20.3–20.5 | med 16.6–16.9 / p95 18.7–19.5 / max 20.4–28.9 |
| long tasks（>50 ms） | **0** | **0** |

**诚实说明**：帧间隔**未测出改善**（两侧都满 60 fps）——本机有余量，且合成输入每次 move
约 30 ms 往返（≈每帧一次事件），压不出差异。本次修复的可测收益是**图表正确性**（(i)(ii)）
与**提交频率的结构性上限**（(iv)），不是帧间隔。

**(iv) 合并探针：20 次 mousemove，各自独立 task，跨 17 帧**

- 改后：**12–13 次 React 提交**（逐事件实现为 20 次），最终宽度 260 → 340 px 正确。
- 结构性保证：`setWidth` 只出现在 rAF 回调中（每帧至多一次）；指针路径只有样式写，
  无 React 提交、无 `resize()`。

### 13.5 功能检查（`scripts/perf-dock-functional-check.mjs`）

8 个面板逐个打开、关闭/打开、拖到两侧夹紧（500 / 260）、刷新恢复（260）、
`prefers-reduced-motion` 下 120 ms 内完成；"强制 resize 位移"全部为 0 px：

| 步骤 | 面板 | 轨道 | 停靠栏 | canvas | 强制 resize 位移 |
|---|---|---|---|---|---|
| 8 个面板（每个） | 280 | 287 | 331 | 1420（=1485−65） | 0 px |
| 关闭 | 280 | 0 | **44** | 1707（=1772−65） | 0 px |
| 打开 | 280 | 287 | 331 | 1420 | 0 px |
| 拖到最大 | **500** | 507 | 551 | 1200（=1265−65） | 0 px |
| 拖到最小 | **260** | 267 | 311 | 1440（=1505−65） | 0 px |
| 刷新恢复 | 260 | 267 | 311 | 1440 | 0 px |
| reduce 关闭/打开 @120 ms | 280 | 0 / 287 | 44 / 331 | 1707 / 1420 | 0 px |

`localStorage["raibro.rightDockWidth"]` 拖拽后为 500 / 260，刷新按持久值恢复。

### 13.6 门禁（本次变更全部通过）

- `npx tsc --noEmit` → 0 error；`npx vitest run` → **383 tests / 51 files passed**
  （`RightDock.test.tsx` 未修改，4/4 通过）。
- `npx biome check .` → **0 errors**，116 warnings（与基线一致，未新增）。
- `npx vite build` → 成功；`PERF_GATE_URL=http://127.0.0.1:4173 node scripts/perf-gate.mjs`
  → **通过**（切换帧间隔 19.4–26.8 ms / 80 ms、CLS ≤ 0.0124 / 0.1、DOM 上限与静态预算全部达标，
  无豁免）。

---

*本规程基于 2026-09-29 的一次全量性能测量建立。基线的棘轮策略：数值可随实测收紧，
放宽需附证据的变更。*
