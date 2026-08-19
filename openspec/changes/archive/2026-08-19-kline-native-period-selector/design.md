## Context

K 线图由 `NativeChart` → `KLineChartProView` 包装 vendor 化的 `@klinecharts/pro`(`frontend/vendor/klinecharts-pro`,以 `file:` 依赖引入)。时间级别当前是 `KLineChartProView.tsx` 中 `NATIVE_PERIODS` 的 8 项,由 vendor 的 `PeriodBar` 平铺渲染(`period-bar/index.tsx` 的 `props.periods.map`)。

数据链路:`PeriodBar` 切换 → `onPeriodChange` → `App.tsx` 的 `timeframe` state → `periodToTimeframe` 转成后端 timeframe 字符串 → `BitgetDatafeed` 请求 `/candles` `/candles/recent` 并订阅 WS → 后端 `models.py` 把 timeframe 映射成 Bitget granularity token。

**Bitget 原生级别实测结果**(直接请求真实接口,非文档推断):

WS `wss://ws.bitget.com/v2/ws/public` 订阅 `candle{G}`,USDT-FUTURES:

| 已确认支持 | 已确认拒绝(30016 Param error) |
|---|---|
| `1s` | `3s` `5s` `10s` `15s` `30s` |
| `1m` `3m` `5m` `15m` `30m` | — |
| `1H` `2H` `4H` `6H` `12H` | — |
| `1D` `3D` `1W` `1M` | — |
| `6Hutc` `12Hutc` `1Dutc` `3Dutc` `1Wutc` `1Mutc` | — |

SPOT:`1s` `1m` `1H` `1D` `1W` `1M` 支持;`1week` `1month` 拒绝(REST 才用长名)。

REST `/api/v2/*/market/candles`:

| 品类 | 支持 | 拒绝(400) |
|---|---|---|
| 现货 | `1min` `1day` `1week` `1Mutc` | `1s` `15s` `6Mutc` `1d` |
| 合约 | `1m` `1H` `1D` `1W` `1M` `3D` | `1y` `3M` |

关键推论:
1. **`1s` 有 WS 无 REST** — 秒级只能实时,没有历史来源。
2. **`15s` 不存在** — WS/REST 双向拒绝,Bitget 秒级只有 `1s`。
3. **最长到月线 `1M`** — 无季度/年/多年原生级别。
4. **REST 名称在现货与合约不一致** — 现货用 `1min/1day/1week`,合约用 `1m/1D/1W`。

现有缺陷:
- `models.py` 的 `_TIMEFRAME_GRANULARITY` 有 `1w` 的 step 却无 granularity 映射 → 选周线抛 `ValueError`。
- `datafeed.ts:59` 正则 `/^(\d+)([mhd])$/i` 不认 `s/W/M` → 静默 fallback 5m。
- `_normalize_timeframe` 做 `.lower()` → 月线 `1M` 与分钟线 `1m` 撞车。
- vendor `ChartProComponent.tsx` 的 `adjustFromTo`(:129)与 `formatDate`(:184)有 `minute/hour/day/week/month/year` 分支但**无 `second`**。

## Goals / Non-Goals

**Goals:**
- 时间级别覆盖 Bitget 原生全集,全部为真实交易所数据。
- 周期栏由 pin 机制驱动,扩展弹窗展示全集并可增删 pin,偏好持久化。
- 从标识符层面根除月线/分钟线歧义,而非在调用点逐个打补丁。
- 秒级作为受约束的仅实时级别接入,其特殊性在契约中显式声明。

**Non-Goals:**
- 不做任何前端合成/重采样周期(`15s` `6month` `1y` `3y` 均不实现)。
- 不引入第二数据源。
- UTC 对齐变体(`6Hutc` 等)虽原生可用,本次不进选择器——与本地时区版语义重复,易致用户困惑。
- 不改动 pin 之外的 Pro 原生 chrome(绘图栏、指标/时区/设置弹窗保持现状)。

## Decisions

### D1. 月线消歧:引入显式标识符,而非依赖大小写

**决策**:后端时间级别标识符中,月线使用与分钟线在大小写无关比较下也不冲突的独立标识符;`_normalize_timeframe` 的归一化不再让二者收敛到同一个 key。前端 `periodToTimeframe` / `periodFromTimeframe` 按同一套标识符往返。

**理由**:根因是 `.lower()` 归一化让 `1M`→`1m`。若保留大小写敏感来区分,则整条链上任何一次 `.lower()`/`.upper()`/大小写不敏感比较都会重新引入 bug,且这类错误是**静默的**——用户选月线拿到分钟线数据,没有任何报错。把歧义从标识符设计上消除,比在 N 个调用点维持大小写纪律更可靠。

**考虑过的替代方案**:
- *保留 `1M`/`1m` 并全链路大小写敏感* — 拒绝:与既有 `_normalize_timeframe` 的容错设计(允许 `1H`/`1h` 混用)直接冲突,且脆弱。
- *仅在映射表查找处特判月线* — 拒绝:漏一处即静默错数据,且新增调用点无从知晓该约束。

**影响**:属 BREAKING。已落盘数据按 `category/symbol/timeframe` 建目录(`store.py`),月线目录名随之变化,需要兼容既有目录或做迁移(见 Migration Plan)。

### D2. `1s` 仅实时,历史请求短路

**决策**:秒级不请求 REST 历史、不落盘、不参与 backfill/prefetch。`getHistoryKLineData` 遇秒级直接返回空数组;后端 `_seed_candles_from_rest` 跳过秒级;定时抓取的 `timeframes` 不含秒级。UI 上标注"仅实时"。

**理由**:实测秒级 REST 返回 400,历史根本不存在。若不短路,每次切到秒级都会打一次注定失败的请求;而落盘方面秒级单日 86400 根(分钟级的 60 倍),按天分片的 parquet 存储会显著膨胀,却换不来任何历史价值(因为拉不到)。

**考虑过的替代方案**:
- *由 `1m` 拆出秒级* — 不可能:分钟 K 线内部的秒级信息已丢失,无法还原。
- *本地长期累积秒级并落盘* — 拒绝:存储成本高,且重启/换设备即断档,不足以支撑"历史"语义。

**权衡**:用户切到秒级时图表从空白开始向右生长;切走再切回,先前累积不保留(除非另设内存 buffer,本次不做)。

### D3. pin 偏好存 localStorage,不入后端 chartstore

**决策**:pin 列表存于浏览器 localStorage,沿用 `alertsStore.ts` 的 `raibro.*` 命名与「load/save + 订阅通知」范式。

**理由**:后端 `chartstore.py` 以 `category/symbol/timeframe` 为 key 存储(`_series_key`),而 pin 是**跨 symbol、跨 series 的全局偏好**,粒度不匹配——放进去会导致每个 series 各有一份 pin,语义错误。localStorage 粒度正确且零后端改动。`alertsStore` 已有「本地为准 + 可选后端镜像」的先例,未来若需跨设备同步可循此路径扩展。

**考虑过的替代方案**:
- *存后端 chartstore* — 拒绝:key 粒度错误(见上)。
- *存后端 appconfig* — 未选:需要新端点与用户维度,当前无用户体系,收益不足。

### D4. pin 允许全空

**决策**:允许用户取消所有 pin,此时常驻栏仅保留扩展按钮,全部切换通过弹窗完成。

**理由**:这是明确的产品选择(用户偏好极简栏)。强制保底会带来「哪个不能删」的隐藏规则,反而困惑。扩展按钮始终存在,故不存在无法切换级别的死锁。

**边界**:需保证 pin 为空时常驻栏布局不塌陷,扩展按钮仍可见可点。

### D5. vendor 改造范围:补 `second` 分支 + 改造 PeriodBar

**决策**:在 vendor 内新增 `second` 时间跨度分支(`adjustFromTo` 的区间计算、`formatDate` 的 `HH:mm:ss`),并将 `PeriodBar` 的平铺渲染改为 pin 驱动 + 扩展按钮 + 弹窗。弹窗复用 vendor 既有 `component/modal`。

**理由**:vendor 的 `Period.timespan` 已支持 `week/month/year`,唯独缺 `second`,不补则秒级的历史区间与 X 轴时间显示均不正确。`PeriodBar` 是周期栏唯一渲染处,pin 交互无法在应用层外挂实现。既有 spec `klinecharts-pro-integration` 已确立「对 vendor 做最小改造」的原则,本次沿用。

**考虑过的替代方案**:
- *隐藏 Pro 周期栏,在应用层自建选择器* — 拒绝:与既有 spec「采用 Pro 原生开箱 UI、周期条启用可见」的契约冲突,且要重做选中态/主题/i18n。

## Risks / Trade-offs

- **月线标识符重命名破坏既有落盘数据** → 存量目录若已有旧月线命名,需在迁移步骤中重命名目录或提供读取期兼容;上线前确认存量数据是否实际含月线序列。
- **`.lower()` 归一化的残留调用点** → 全链路检索大小写归一化处,确认月线不再被折叠;为月线与分钟线共存补回归测试。
- **前端静默 fallback 掩盖映射缺失** → `periodFromTimeframe` 当前对未知格式回落 5m。扩容后应让未知级别可被察觉(而非静默降级),避免下一次新增级别时重演同类问题。
- **新增级别推高抓取与存储** → 定时抓取 series 数随级别数线性增长。需决定哪些级别纳入 `config.timeframes` 定时抓取(非全部原生级别都必须定时落盘)。
- **秒级 WS 消息频次** → 秒级推送频率远高于分钟级,前端 `deliver` 与图表重绘压力上升;现有 `sameCandle` 去重与后端约 1s 合流可缓解,需实测确认无卡顿。
- **pin 全空的布局回归** → 常驻栏在无 pin 项时的样式需专门验证(边距/分隔线依赖相邻元素,见 `period-bar/index.less` 的 `.symbol + .period` 等选择器)。

## Migration Plan

1. 先落地标识符方案(D1)与映射表补全,附前后端往返一致性测试——此步不改 UI,可独立验证。
2. 检查存量 parquet 目录是否存在受重命名影响的月线序列;如有,执行目录迁移;如无,仅需保证新写入使用新标识符。
3. 补 vendor `second` 分支,接入秒级仅实时约束(D2)。
4. 扩展 `NATIVE_PERIODS` 至原生全集,此时周期栏仍为平铺(级别可用性可先独立验证)。
5. 引入 pin store(D3)与 PeriodBar 扩展按钮/弹窗(D5),默认 pin `1m 15m 1H 6H 1D 1W 1M`。
6. 回归:各级别切换、月线与分钟线并存、秒级进出、pin 增删与全空、pin 偏好重启后保持。

**回滚**:pin 机制(步骤 5)与级别扩容(步骤 4)可独立回滚至平铺 8 级别。标识符重命名(步骤 1-2)一旦有新数据落盘则回滚需反向迁移,故应在前置步骤充分测试。

## Open Questions

- **月线标识符已定**:采用内部标识符 `1mo`(month),与分钟 `1m` 在任何大小写比较下都不冲突。前端 `periodToTimeframe` 对月线一律输出 `1mo`(绝不输出裸 `1M`);后端 `_normalize_timeframe` 将 `1mo`/`1MO`/`1M` 规约为键 `1mo`(月),并与分钟 `1m` 分别映射。Bitget granularity token 映射为 `1M`。周线保持 `1w`(与任何级别无冲突)。
- **`config.timeframes` 定时抓取**:仍默认仅历史级级别且不含秒级;具体纳入集合见任务 2.6 结论。
- **现货与合约 REST 名称差异已查实**:现货长度名(`1min/1day/1week`)、合约短名(`1m/1D/1W`)。当前代码库里即时补种走 `_seed_candles_from_rest`,用 `timeframe_to_granularity` 生成的 token 直接作为 `granularity` 参数——对合约分类生效,对现货分类(SPOT)用了合约短名,属既有隐患,需在任务 1.7 评估并修复,至少保证新增的周/月现货级别可用。
- 秒级"仅实时"在 UI 上的具体呈现形式(角标、圆点、tooltip)未定,任务 7.4 落地。
- 切走再切回秒级是否需要内存 buffer 保留累积?本次倾向不做,待实际体验反馈。
