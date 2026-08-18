## 1. K 线实时更新修复(后端)

- [x] 1.1 修改 `webapi.py:_snapshot()`:先读 `stream.latest()`,有 bar 即组装 `last_candle`+price,parquet(`_read`)仅用于指标/支撑阻力/历史增强;parquet 为空时返回携带 `last_candle` 的帧而非 `{"error":"no data"}`
- [x] 1.2 后端测试:`tests/test_webapi.py` 或新增用例覆盖"parquet 为空 + stream 有数据 → 帧含 last_candle、无 error 字段";"stream 与 parquet 均空 → 返回 no data 错误帧"
- [x] 1.3 `candle_loop`/订阅路径确认使用新 `_snapshot`,推送间隔与 payload 结构不变

## 2. K 线 symbol 动态订阅(后端)

- [x] 2.1 `BitgetWsStream` 增加 `subscribe(category, symbol, timeframe)` / `unsubscribe(...)` 运行时接口,与启动时静态 `_channels()` 合并,重连后一并重订阅
- [x] 2.2 `webapi.py` 的 `/ws` candle 订阅分支改为调用 `stream.subscribe(...)`,退订时对称 `stream.unsubscribe(...)`(对齐 `MarketStream` 的 refcount 语义)
- [x] 2.3 后端测试:`tests/test_realtime.py` 覆盖动态增删 symbol 后 `latest()`/`recent()` 数据出现与消失;`tests/test_webapi.py` 覆盖 `/ws` 订阅非默认 symbol 后能收到其 candle 帧

## 3. BB_API_KEY 配置修复(后端)

- [x] 3.1 `config.py` Settings 增加 `bb_api_key` 字段(兼容 `BB_API_KEY` 环境变量与 `MD_BB_API_KEY` 前缀)
- [x] 3.2 `blockbeats.api_key()` 改为读 `get_settings().bb_api_key`;`.env.example` 保留 `BB_API_KEY=` 注释说明
- [x] 3.3 后端测试:`tests/test_blockbeats.py` 覆盖 `.env` 配置加载后 key 生效、未配置返回 400
- [x] 3.4 前端 `newsfeed.ts`/`NewsCalendarView`:未配置 key 时展示可见错误提示(如"未配置 BB_API_KEY"),不静默空列表

## 4. 切币种联动修复(前端)

- [x] 4.1 `MultiChartGrid` 用 `useMemo` 缓存 `toProSymbol(symbol)` 与 `periodFromTimeframe(timeframe)`(依赖 symbol.id/timeframe),消除每次渲染新建对象
- [x] 4.2 验证 `KLineChartProView` 的 `setSymbol`/`setPeriod` effect 仅在真实变化时触发,订阅退订不抖动
- [x] 4.3 前端测试:`MultiChartGrid` 渲染测试断言 symbol/period 引用在无关 re-render 间保持稳定(可选 `useMemo` 缓存测试)

## 5. 全界面中文 + 统一字体(前端)

- [x] 5.1 新建 `frontend/src/lib/i18n.ts`(`t(key)` 中文字典)并编写 `i18n.test.ts`
- [x] 5.2 替换外壳组件硬编码英文:DesktopTitleBar、GlobalNavRail、TopNavbar、DrawingToolbar、RightDock 各面板、BottomDock 各面板、BottomTimebar、ReplayBar
- [x] 5.3 替换 8 个全视图与全部弹窗(SearchModal/IndicatorsModal/AlertModal/SettingsModal/SnapshotModal/OrderModal/CommandPalette/Shortcuts/DesktopSettings)英文文案
- [x] 5.4 `index.css` 定义全局中文字体栈(`PingFang SC`/`Microsoft YaHei`/`Noto Sans CJK SC` 优先)并应用到 `html/body`;数字列保持等宽对齐(`tabular-nums`)
- [x] 5.5 清理组件级字体覆盖(散落 `font-mono`/自定义 font-family),统一走全局栈

## 6. 集成验证与收尾

- [x] 6.1 后端 pytest 全量通过(含新 snapshot/动态订阅/config 测试)
- [x] 6.2 前端 `npm run typecheck` + vitest 全量通过(含 i18n、MultiChartGrid 引用稳定测试)
- [x] 6.3 `npx vite build` 生产构建成功
- [x] 6.4 端到端冒烟:首屏后蜡烛持续更新、切换任意币种(如 XRPUSDT)图表/盘口/成交联动、配置 `.env` 的 `BB_API_KEY` 后 News Wire 10 分类可加载、全界面中文且字体统一
- [x] 6.5 `openspec validate` 通过;清理残留英文硬编码与死代码
