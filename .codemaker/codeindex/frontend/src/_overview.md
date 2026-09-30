---
type: "Module"
id: "frontend/src"
title: "交易终端前端"
description: "把 Bitget/后端行情数据、AI 量化结果与用户交易动作，收敛成一套 TradingView 风格单图终端桌面壳，并保证图表上看到的每一根 bar 与每一次下单意图都和后端权威状态一致。"
module_id: "frontend/src"
architectural_role: "表现层（交易所式单图终端 + 数据接入 + UI 状态所有权）"
world_model_hints:
  - "属于表现层：唯一持有用户输入（symbol/period/价格线/下单/回测参数），向 backend/src 的 webapi 发 REST 与 /ws 订阅"
  - "不计算任何权威数值：风险判定、撮合、回测、新闻清洗全部在后端；前端只做投影与节流"
  - "图表引擎来自 frontend/vendor（@klinecharts/pro + tradingview-pro 模板），本模块只做胶水与主题覆盖"
  - "对外行为契约被 frontend/tests/e2e 与 src 内 59 个 vitest 用例钉住，改动先跑这两层"
upstream_modules:
  - module: "."          # 浏览器用户会话 / AGENTS.md 测试金字塔约定 / vite dev proxy 配置
    confidence: extracted
  - module: "backend/src" # webapi 的 REST 端点与 /ws 帧结构是本模块的输入契约
    confidence: extracted
downstream_modules:
  - module: "frontend/vendor"
    confidence: extracted
  - module: "frontend/tests"
    confidence: extracted
  - module: "frontend/scripts"
    confidence: extracted
  - module: "backend/src"
    confidence: inferred
---

## Files

### 源代码路径

- `frontend/src/`（应用根，散文件：`App.tsx` `main.tsx` `index.css` `klinecharts-pro-theme.css` `test-setup.ts`）
- 子目录：`api/` `components/{chart,desktop,sidebar,bottom,modals,timebar,ui,views}` `data/` `hooks/` `lib/` `types/` `utils/` `vendor/`
- 规模：约 90 个非测试源文件 / 18.6k 行，另有 59 个 `*.test.ts(x)`

### 知识库文档

- `.codemaker/codeindex/frontend/src/_overview.md`（本文件）
- `.codemaker/codeindex/frontend/src/frontend_src_app_shell.md`
- `.codemaker/codeindex/frontend/src/frontend_src_data_access.md`
- `.codemaker/codeindex/frontend/src/frontend_src_chart.md`
- `.codemaker/codeindex/frontend/src/frontend_src_terminal_panels.md`
- `.codemaker/codeindex/frontend/src/frontend_src_market_views.md`
- `.codemaker/codeindex/frontend/src/frontend_src_quant_lab.md`

### 符号索引

- 由 **Codemap MCP** 实时提供（`find_symbol` / `search_code` / `get_symbol_detail` / `get_call_chain`）；本知识库不列举符号清单

## 子文档速览

| 子文档 | 覆盖内容 | 关键实体 |
|--------|---------|---------|
| `frontend_src_app_shell.md` | 桌面外壳、多标签工作区路由、主题/字体/滚动条/图标 token、品牌与中文文案契约、快捷键 | `DEFAULT_SYMBOL`、`DesktopViewMode`、`--tv-*`、`FONT_FAMILY_STACK`、`--tv-scrollbar-thumb(-hover)`、`no-scrollbar` |
| `frontend_src_data_access.md` | REST 客户端、`/ws` 订阅协议、单路多路复用 candle socket、datafeed 回填/合并、行情 hooks 与数据节流 | `BASE="/api"`、`DEFAULT_CATEGORY`、`NATIVE_TIMEFRAMES`、`INSTRUMENT_TTL_MS` |
| `frontend_src_chart.md` | klinecharts-pro 单例图、周期体系与固定(pinned)、后向加载/预载契约、价格线/信号标记叠加层、回放与纸面账户（预留） | `NATIVE_PERIODS`、`DEFAULT_PINNED_TIMEFRAMES`、`PRICE_LINE_GROUP_ID`、`normalizeBackwardList`、`prefetchDeeper` |
| `frontend_src_terminal_panels.md` | 右侧停靠栏（8 面板）与底部抽屉（交易/筛选/回测/笔记）、面板呈现契约（盘口清空 / 价差 / 涨跌着色）、警报实体与触发、下单两阶段确认、reset funds | `Alert`、`ALERT_LINE_COLOR`、`MAX_TRADES`、`RIGHT_DOCK_*_WIDTH`、`clampDockWidth`、`EMPTY_BOOK` |
| `frontend_src_market_views.md` | 市场概览、筛选器全视图、热力图、社区观点、新闻与财经日历、全域快讯 SSE 流，以及"静态示例数据"的豁免边界 | `MARKET_PULSE_ENDPOINTS`、`NEWSFLASH_TYPES`、`INITIAL_CALENDAR`、`NEWS_WINDOW_SIZE` |
| `frontend_src_quant_lab.md` | AI Agent 页：QUANT LAB 六视图（曲线/扫描/Walk-forward/因子 IC/开单/历史/信号K线）、模型预设、因子表达式校验、Agent 决策与纸面循环面板 | `DL_TIMEFRAMES`、`DEFAULT_PARAMS`、`FACTOR_CATALOG`、`EXPR_FORBIDDEN` |

## 模块概述

1. **业务定位**：本模块解决的不是"画一个图表"，而是**让交易员在一个屏幕上做出可追溯的决策**——把后端持久化的 K 线历史、Bitget 实时行情/盘口/成交、BlockBeats 资讯与 AI 量化回测结果，投影为一套 TradingView 风格的桌面终端（标题栏多标签 + 全局导航栏 + 单中心图表 + 右图标杆/停靠面板 + 底部抽屉 + 状态时间栏），并且对"哪些数字是真的"负责：凡是后端/交易所有数据源的表面必须接实时源，凡是无数据源的表面必须显式声明为示例内容。它同时是**唯一持有用户意图的地方**：改周期、换品种、拖价格线、提交订单、启动回测，全部在这里发起，且必须最终反映后端权威状态。

2. **业务上游**：无协议入口，入口是**浏览器用户 + 开发服务器代理**。生产/dev 下 `/api/*` 与 `/ws` 由 `frontend/vite.config.ts` 反向代理到 `backend/src/market_data/webapi.py`（`/api` 前缀被 rewrite 剥掉），因此上游契约完全由后端路由表定义；触发方式三种——组件挂载时的 REST 快照（`/tickers`、`/candles/recent`、`/instruments`）、`/ws` 与 SSE `/api/news/stream` 的事件推送（事件驱动，非轮询）、以及用户动作（点击/快捷键/右键/表单）。

3. **业务下游**：改动本模块会直接影响 ①**交易安全链路**——两阶段下单 `POST /order` → `POST /order/confirm` 与 kill-switch `PUT /control` 的调用形状，错了会让后端风控门被绕过或被误判；②**图表正确性**——时间级别标识符、series 四元组路由、实时 bar 单调性守卫，任一失守都会让图表"看着有数据但是是错的周期/旧 symbol"（这类都是历史上真出过的 bug）；③**后端契约消费方** `backend/tests/test_live_api.py`、`frontend/tests/e2e/*.spec.ts`（Playwright  journeys 依赖 DOM id 与文案）；④ vendored 图表包 `frontend/vendor/klinecharts-pro`（本模块通过 `vite.config.ts` 的 alias 直引其 `dist`，并对 dist 做了源码级补丁与回归断言）。

## 架构简析

> 术语提醒：部分子文档的排除句里出现的「数据层归属」指**代码归属**（共享取数 helper 放 `lib/*.ts`），不是分层架构术语。本模块的分层是"用户动作 → 本地 store → 数据接入 → 后端/交易所"，投影反向经叠加层回到画布。

模块整体是**单向四层**，且"权威在越下层越接近后端"：

`用户动作 (App.tsx / 面板组件)` → `本地可观察 store (lib/alertsStore · toastStore · periodsStore · rightDockWidth)` → `数据接入层 (api/client.ts · api/bitgetWs.ts · hooks/*)` → `后端 + Bitget (REST / /ws / SSE)`
投影反向：`store + 实时 map` → `图表叠加层 (lib/chartController 价格线 · lib/signalMarks 信号标记)` → `klinecharts-pro 画布`

- **外壳层**：`App.tsx` 是唯一状态汇聚点（tabs / activeSymbol / timeframe / alerts / paper account / modals），并把"警报触发判定"这种业务规则也放在这里跑；`components/desktop/*` 只提供壳与导航回调。
- **数据接入层**：`api/` 定义请求与帧结构，`hooks/` 把帧收敛成 React 状态。**唯一事实**：`api/bitgetWs.ts` 与 `hooks/useExchangeSocket.ts` 是两个独立 socket 客户端，所有图表 candle 流只走前者，所有非图表频道（ticker/books/trade/funding/mark-price）只走后者。
- **图表层**：`components/chart/KLineChartProView` 负责实例单例与生命周期，`NativeChart` 负责叠加层与右键交互，`api/datafeed.ts` 负责"历史 + 回填 + 实时尾"的拼接。
- **面板/视图层**：`components/sidebar`、`components/bottom`、`components/views` 消费 hooks 输出，原则上不自己发请求（例外见 `marketPulse`/`newsfeed` 直取 BlockBeats）。
- **量化层**：`components/views/agent/**` 自成一套 UI 语系（shadcn/ui + 硬编码中文文案），与终端主壳**只共享 api 客户端，不共享 store 与主题规则**。

三条贯穿性设计决策（改任何一处都要同时核对）：**① 用 localStorage 做"跨设备无关的用户偏好"（`raibro.*` 命名空间）而后端 only 做业务数据**；**② 高频帧一律先收敛再 setState，且"只有真变化才产生新引用"**；**③ 实时通路自带单调性/身份守卫，宁可不画也不画错**。

## 上下游关系

> `extracted` = 有 import/调用或配置证据；`inferred` = Agent 推断，需人工复核。

| 方向 | 模块/对象 | 关系 | confidence | 证据 |
|------|-----------|------|------------|------|
| 上游 | `backend/src`（webapi） | 提供 `/candles*`、`/tickers`、`/instruments`、`/books/{cat}/{sym}`、`/trades/*`、`/funding`、`/mark-price`、`/alerts*`、`/backtest*`、`/dl/features`、`/agent/*`、`/config`、`/portfolio`、`/journal`、`/control`、`/order(/confirm)`、`/chart-config`、`/blockbeats/*`、`/news/*` 与 `/news/stream` | extracted | `api/client.ts` 全量路径 + `vite.config.ts` proxy rewrite |
| 上游 | `.`（仓库根/AGENTS.md） | 规定 L2 live API/WS 与 L3 Playwright 两层测试必须保持绿；`frontend/vite.config.ts`、`tsconfig`、`biome` 与覆盖率棘轮构成构建约束 | extracted | AGENTS.md、`vite.config.ts` thresholds |
| 上游 | 用户（浏览器） | 键盘快捷键（Ctrl/Cmd+K/T/W/?/Space）、右键图表、拖拽价格线与面板边界 | extracted | `App.tsx` keydown handler、`NativeChart` onContextMenu |
| 上游 | `openspec/`（规格库，非代码依赖） | 131 份规格以 SHALL / MUST NOT 规定本模块的可见行为（品牌、文案语种、图标、滚动条、字体、series 路由、实时保序、深历史边界、数据源真实性、量化口径…），是验收口径本身而不是参考资料 | extracted | `openspec/specs/*/spec.md`（见下方「界面契约来源」逐条标注） |
| 下游 | `frontend/vendor` | 本模块 import `@klinecharts/pro`（alias 指向 `vendor/klinecharts-pro/dist`），并在 `vendor/klinechartsProRace.test.ts` 里以字符串字面量断言 dist 内的竞态修复仍在 | extracted | `api/datafeed.ts`、`KLineChartProView`、`vite.config.ts` alias |
| 下游 | `frontend/tests` | Playwright 以 DOM id（`#tradingview-desktop-root`、`#bottom-dock`、`#candle-chart-cell` 等）、`window.__kline_chart__` 与中文文案定位断言 | extracted | `App.tsx` id、`GlobalNewsFeed` `#news-calendar-view` |
| 下游 | `frontend/scripts` | `diagnose-kline-realtime.mjs` 复用同一 WS 协议做离线诊断 | inferred | package script `diagnose:kline` + 同 `/ws` 帧格式 |
| 下游（契约反向） | `backend/src` | 本模块对帧字段形状的容错（如缺 `timeframe` 就丢帧、`price24hPcnt` 与 `change24h` 双写、`pricePlace/pricePrecision` 双写）等于给后端设定"必须携带完整 series 标识"的义务 | inferred | `bitgetWs.deliver`、`tickerToSymbolInfo`、`datafeed.instrumentToSymbolInfo` |

## 界面契约来源（OpenSpec 规格）

> 本模块的**可见行为**由 `openspec/specs/` 下的规格钉住（规格即验收口径，不是参考资料）。以下条目跨子文档共享，每条都标了落点；改动前先确认自己没违反它。

- **[品牌]** 用户可见文本、注释、DOM id 中 MUST NOT 出现 "TradingView"/"TV" 品牌字样与徽标缩写，统一为 **BeyondEther**，缩写场景用 `BE`；中文界面直接显示品牌原名而非译名；i18n 的 key 也要一起改名且调用处同步，无引用的 key 保留改名。落点 `frontend_src_app_shell.md`。（来源: openspec/specs/beyondether-branding/spec.md）
- **[文案语种]** 所有可见文案 MUST 经 `lib/i18n.ts` 的 `t()` 查表：复用既有键优先，缺键才按「英文键 → 中文值」追加（`t()` 未命中时回退原键，不抛错）；除 symbol/ticker/专业术语（LONG/SHORT）外不得有硬编码英文。`components/views/agent/**` 的硬编码中文是**有记录的豁免**，将来做多语言须单独立项。落点 `frontend_src_app_shell.md` / `frontend_src_quant_lab.md`。（来源: openspec/specs/ui-i18n-zh/spec.md）
- **[图标]** 功能图标一律线性 SVG（现由 `lucide-react` 提供，24px 视框 / 描边 1.2–1.5px / 无填充 / `currentColor` 取主题文字 token，按钮命中区 28×28），MUST NOT 在组件内硬编码图标色，更 MUST NOT 用 emoji（🔍 👤）或 ASCII 字形（▼ ▃▂ ▦）充当功能图标。落点 `frontend_src_app_shell.md`。（来源: openspec/specs/tv-icon-system/spec.md）
- **[滚动条]** 所有可滚动区共用主题化**隐式**滚动条：静置不可见、hover 容器或滑块时渐显；着色只取 `--tv-scrollbar-thumb(-hover)` token；轨道宽度**恒定 8px**，显隐只改滑块颜色透明度（**MUST NOT** 靠改宽度实现，否则内容横向抖动）；`::-webkit-scrollbar` 与标准 `scrollbar-width/scrollbar-color` 双写，不引第三方滚动条库；`prefers-reduced-motion: reduce` 时取消过渡直接可见。`no-scrollbar` 只给窄控件条（tab 条 / 分类 chip 条），**纵向长列表（新闻、自选、持仓）必须用隐式滚动条保留滚动位置感知**。落点 `frontend_src_app_shell.md`。（来源: openspec/specs/themed-scrollbar/spec.md）
- **[字体]** 正文字体一律自托管（npm `@fontsource-variable/*`，OFL-1.1，随构建产物输出，版本由 lockfile 锁定），MUST NOT 在运行时请求任何第三方字体 CDN；中西文由每个 `@font-face` 的 `unicode-range` 逐字符分流且**西文必须排在中文字体之前**（含拉丁子集的 CJK 字体会抢走西文），且 MUST NOT 依赖 `:lang()` 切换（中英常混排于同一文本节点）；字体栈**单一真源**是 CSS 变量，Canvas 侧必须传等值字符串并在 `document.fonts.ready` 后补一次绘制/重绘（Canvas 不解析 `var()` 也不继承 CSS `font-family`，早绘会把兜底字体永久光栅化）。落点 `frontend_src_app_shell.md`。（来源: openspec/specs/webfont-self-hosting/spec.md）
- **[series 身份]** 一条序列由四元组 `(channel, category, symbol, timeframe)` 唯一确定；订阅、退订、断连清理都按完整键；帧缺任一标识即丢弃，MUST NOT 靠缺省值推断。心跳/确认类事件帧（`ping`/`pong`/`subscribed`）不是数据帧。落点 `frontend_src_data_access.md`。（来源: openspec/specs/ws-series-routing/spec.md）
- **[实时保序]** 投给图表的 bar 时间戳严格升序无重复：更旧帧丢弃、同桶（`open_time` 相等且 OHLCV 有变）**替换末根**、更大 `open_time` **追加**；水位按 series 独立持有，切换 symbol/周期后独立起算；该守卫 MUST NOT 拦截历史加载与左向回填的 prepend。落点 `frontend_src_data_access.md` + `frontend_src_chart.md`。（来源: openspec/specs/kline-realtime-order-guard/spec.md）
- **[仅实时级别]** 秒级是「仅实时级别」：MUST NOT 请求历史、MUST NOT 落盘、MUST NOT 参与回灌与后台预取；切到该级别且尚无推送时图表呈现「无历史」状态而非失败/错误提示，周期选择器要给它可辨识的标示。（来源: openspec/specs/realtime-only-timeframe/spec.md）
- **[深历史边界]** `earliest_reached` 由后端判定（v3 深历史通道对最旧窗口返回空页并重试一次后才成立）；前端 MUST NOT 以「这次返回很少 / 某渠道空页」自行认定到顶。回灌受交易所频控约束（单次 ≤100 根、单次区间 ≤90 天、约 20 req/s），因此前端的 in-flight 去重与 5s 预取节流不是可优化掉的冗余。落点 `frontend_src_data_access.md`。（来源: openspec/specs/v3-history-channel/spec.md）
- **[后向加载方向性]** 后向加载（拖看更早历史）返回的 bar MUST NOT 晚于请求区间终点，`applyMoreData` 不做去重所以裁剪/去重必须在本模块完成；回灌失败或已到最早时返回**空列表**让 vendor 干净关闭加载开关，不得用最新数据兜底。落点 `frontend_src_chart.md`。（来源: openspec/specs/chart-history-lazy-load/spec.md）
- **[真实源优先]** 有上游的表面必须接真实源；确实无上游者要么移除，要么作为**显式声明**的静态示例并在视觉上可区分。落点 `frontend_src_market_views.md`。（来源: openspec/specs/ui-affordance-integrity/spec.md）
- **[行情增量必须可续]** 通配 ticker 订阅（`symbol=default`/`*`，`category="*"` 为全品类）按 category 投递给通配订阅者，精确订阅不受通配影响；后端约每 5s 推一次镜像增量且**内容无变化不空推**——前端不得为规避抖动而把通配订阅退回一次性 REST 快照。落点 `frontend_src_data_access.md`。（来源: openspec/specs/ui-live-data-sync/spec.md、openspec/specs/realtime-ws/spec.md）
- **[断线可观测]** K 线通道断线自动重连（递增退避有上限）、重连后按原参数整体重订阅；前端主动 close（切 symbol/卸载）MUST NOT 触发重连；连接状态三态对外暴露供状态栏呈现，恢复实时后告警标识必须清除。落点 `frontend_src_data_access.md`。（来源: openspec/specs/kline-stream-resilience/spec.md）

**尚未接线/范围外的规格（不要误以为已有实现，也不要顺手"补一个假的"）**：

- `openspec/specs/draggable-layout/spec.md`（面板拖拽重排 + 位置尺寸持久化）与 `topbar-controls` 的"图表类型菜单/快捷键 1/5/15 切周期"在当前 React 外壳中**没有对应实现**（唯一的可拖拽是 right-dock 宽度与底部抽屉高度）。要做即属新需求，且 MUST NOT 借机恢复多图表网格（见 `frontend_src_app_shell.md`）。
- `openspec/specs/symbol-search-modal/spec.md` 的全屏品种搜索弹窗已被「图表原生 chrome 搜索」取代入口位置，但**数据入口约束仍然生效**：品种检索必须收敛为 `BitgetDatafeed.searchSymbols`（基于 `/instruments`）单一路径，MUST NOT 再养第二份本地硬编码列表。（来源: openspec/specs/market-symbol-search/spec.md）

## 模块级风险地图（改动前先定位到哪一节）

| 如果你改这个 | 最可能破坏的业务规则 | 去读 |
|---|---|---|
| 时间级别字符串（`1mo`/`1m`/`1s`） | 大小写无关冲突 → 拉错周期数据；秒级被当可查历史级别 | `frontend_src_data_access.md` §周期与历史、`frontend_src_chart.md` §周期体系 |
| WS 订阅路由与单调性 | 一个 symbol 串到另一周期；旧 bar 追加成新 bar | `frontend_src_data_access.md` §实时通道守卫 |
| 图表实例挂载/卸载 | vendor 无 dispose → 出现两个实例抢占 datafeed，画面永久停在旧 symbol | `frontend_src_chart.md` §实例生命周期 |
| 价格线/警报写路径 | 本地与后端镜像脱节，跨设备丢警报或重复触发 | `frontend_src_terminal_panels.md` §警报与价格线 |
| 下单控件/kill-switch | UI 显示成功但后端风控未确认 | `frontend_src_terminal_panels.md` §下单 |
| 任意颜色/字体/图标/滚动条字面量 | 双主题失同步、Canvas 文字回落系统字体、emoji 图标复活 | `frontend_src_app_shell.md` §设计 token |
| 右侧栏宽度 / 折叠实现（面板宽度 min-max 被复制成两处） | 用户偏好丢失或栏位越界，切品种后忽宽忽窄 | `frontend_src_terminal_panels.md` §D（改动只同步一处是历史回归源） |
| 静态数组（日历/热力图/社区） | 示例数据被伪装成实时数据 | `frontend_src_market_views.md` §静态内容豁免 |
| 回测/因子参数 | 因子表达式被执行、参数与后端 schema 漂移 | `frontend_src_quant_lab.md` §因子表达式校验 |
| 品牌字样 / 硬编码文案 / 图片外链字体 | 品牌契约被破（出现 TradingView/TV）、离线与内网环境字体回落、双语扫除回归 | `frontend_src_app_shell.md` §品牌、§i18n、§字体自托管 |
| 后向加载（拖看更早历史）返回值 | 用最新 bar 兜底会让 vendor 反复 prepend 重复 K 线（图"卡住不动"或叠影） | `frontend_src_chart.md` §后向加载契约 |
| 快讯分页 offset / `hasMore` 口径 | 分类下"未加载完就自称已全部加载"，用户漏看新闻 | `frontend_src_market_views.md` §快讯流 |

## 内置文档与规格扫描结论（Step 0a-md）

- **`frontend/src/` 内没有任何 `.md` 文件**（`find frontend/src -name "*.md"` 结果为空），因此本模块没有"仓库内置文档"需要合并；文档性知识一律经由代码注释与 openspec 规格进入本知识库。
- 图表引擎自带的第三方文档位于 `frontend/vendor/klinecharts-pro/docs/{zh-CN,en-US}/`，归属 `frontend/vendor` 模块；本知识库只把它当第三方参考，**不作为本模块的权威规则**（`chart-shell-integrity` / `klinecharts-pro-integration` 里已把其中的集成决策沉淀为规格条目）。
- 规格正文（英文 SHALL / MUST NOT）已转写为中文约束条目并逐条标注来源相对路径，未整份转录，避免与 `openspec/` 形成双份真相。**发现本文档与 `openspec/specs/**/spec.md` 不一致时以规格为准，并回来修订本文档。**
- 规格之间存在历史冲突，处理原则是"更新且更细的规格为准"，并显式记下三个陷阱，避免按旧字面实现：
  - `reskinned-panels` §底部 Tab 面板仍写"策略编辑器"，但 `bottom-dock` + `utils/pineEngine.ts:5` 已禁止 Pine 入口（详见 `frontend_src_terminal_panels.md` §D）。
  - `draggable-layout`（面板自由移动/缩放/布局持久化）从未在 React 外壳落地；当前唯一可拖拽是 right-dock 左缘宽度（同上）。
  - `terminal-layout` / `exchange-terminal-ui` / `chart-terminal` 属 OKX 主题与早期 React 时代，除"状态栏信息项""AI 分析占位容器"等仍被引用的条户外，不要再按其字面布局实现（另注意 `openspec/changes/` 下只有 `archive/`，无进行中变更）。
- 本模块与 `tradingview-pro` 模板的关系由 `tv-template-shell`（外壳禁多图表网格）与 `ui-i18n-zh`（agent 子树豁免）两条限定，`frontend/vendor/tradingview-pro/src/App.tsx` 只是模板参考，不参与运行时。

## 本知识库的使用方式

- 需要"X 定义在哪、谁调用了它"→ 用 Codemap（`find_symbol` / `get_call_chain`），不要在本知识库找符号清单。
- 需要"我这样改会不会违反既定规则/会不会让某类 bug 复活"→ 读本知识库对应子文档的 `## 实现约束清单` 与 `## 变更风险`。
- 需要需求语言到代码的翻译（需求写"周期栏固定"→ 代码是 `pinnedTimeframes`）→ 查 `retrieval_hints` 与各子文档「术语对照」。
- 需求里出现"实时显示 / 自动刷新 / 补个默认值 / 看起来更完整"这类措辞时，先读「界面契约来源」与「模块级风险地图」：本模块的历史 bug 绝大多数来自"为了让界面看起来更实时或更完整而引入第二数据源、兜底值或静默回退"，而不是来自缺功能。
