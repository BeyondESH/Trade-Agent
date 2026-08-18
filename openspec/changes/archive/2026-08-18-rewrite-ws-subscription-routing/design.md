## Context

K 线实时链路存在真实的路由缺陷,实测证据:

- 后端 `webapi.py` `/ws` 的订阅键是 `subs[(channel, symbol)]`,**不含 category/timeframe**。同 symbol 不同周期的订阅在字典里互相覆盖;`candle_loop` 与事件驱动推送都只遍历该键。
- 后端推送帧 `{"channel","symbol","action","data"}` **缺 category/timeframe**,前端无法区分数据属于哪个 series。
- 前端 `bitgetWs.deliver()` 只按 `symbol + category` 匹配(`bitgetWs.ts:157`),**不匹配 timeframe**。当前端同时存在多个 series(如 `useCandles` 与 `NativeChart` 订阅不同周期,或切换周期时新旧订阅并存),同一 `last_candle` 会被投递给所有 symbol 相同的 series → **跨周期串流,蜡烛时间轴错乱**。
- 心跳格式 `{"event":"ping"}` 非 Bitget 官方格式,服务端实际回复 `30002 Unrecognized request`(日志实证),影响连接稳定性;`realtime.py` 与 `streamhub.py` 均受影响。
- pro 组件 `N1` 窗口计算对 hour 周期只对齐到整点(`_ % 3600000`),对 4h/12h 未对齐到周期边界,请求窗口与蜡烛边界错位。

已验证数据源本身正确:Bitget candle `ts` 是 bar 开始时间、OHLC 字段顺序正确、实时推送 ~1s 正常、chart 内部数据列表正确(200 根 1h,step=60min)。问题集中在**订阅路由与投递层**。

## Goals / Non-Goals

**Goals:**
- `/ws` 按完整 4 元组 `(channel, category, symbol, timeframe)` 路由,多 series 独立并存。
- 推送帧统一携带完整 series 标识,前端精确投递,杜绝串流。
- 前端 `bitgetWs.deliver` 精确匹配 `category:symbol:timeframe`。
- 心跳改为 Bitget 官方 `ping`/`pong` 字符串格式。
- pro 历史窗口对 hour/day 周期按 multiplier 对齐周期边界。
- 保持 `datafeed`/`useCandles` 外部接口与单例复用模式不变。

**Non-Goals:**
- 不重写数据存储、指标算法、REST 端点。
- 不改 `KLineChartProView`/`NativeChart` 的 React 接口。
- 不做多连接负载均衡(仍单 socket 复用)。
- 不改变低频指标/S-R 周期(5s)与事件驱动 ~1s 节流策略。

## Decisions

### D1: 后端订阅键升级为 4 元组,`subs` 改为嵌套结构
`subs[(channel, category, symbol, timeframe)] = args`。为兼容 `ticker` 通配订阅(`("ticker", "*")` 表示全市场),通配键保留为 `(channel, category, "*", "")` 并单独处理。
- **备选**:维持 `(channel, symbol)` 键 + 内部 series 集合。被否——无法避免同 symbol 多周期覆盖,是当前 bug 根源。
- **备选**:`category:channel:symbol:timeframe` 拼接字符串键。功能等价,但元组类型更清晰、便于事件分发时构造。

### D2: 推送帧统一携带完整 series 标识
所有 `snapshot`/`update` 帧改为 `{"channel","category","symbol","timeframe","action","data"}`。`_snapshot()` 调用点(订阅快照、低频循环、事件监听器)统一补齐字段。前端 `onmessage` 用这些字段构造 series key 投递。
- **备选**:仅 candle 帧补齐。被否——books/ticker 等前端同样需要精确路由,统一格式更符合交易所风格。

### D3: 前端 `deliver` 精确匹配 4 元组
`bitgetWs.deliver(category, symbol, timeframe, candle)` 改为同时匹配 `s.symbol === symbol && s.category === category && s.timeframe === timeframe`。`onmessage` 从帧中读取 `category`/`timeframe`(缺失则跳过而非缺省推断),杜绝串流。
- **备选**:前端按 symbol 分发后由各订阅者自行校验。被否——校验分散、易漏,且无法避免多余投递。
- 兼容性:帧格式变化是**前后端同时改**,无需过渡期;若收到旧格式帧(缺 timeframe),安全地忽略而非误投。

### D4: 心跳统一为 Bitget 官方格式
`realtime.py` 与 `streamhub.py` 的 `PING_FRAME` 改为字符串 `ping`,`PONG_FRAME` 改为字符串 `pong`;`_handle_frame` 中事件分发从 `msg.get("event")=="ping"` 改为 `raw.strip()=="ping"`。心跳发送逻辑不变(超时发送、静默计数)。
- **备选**:保持 JSON ping。被否——Bitget 服务端实证返回 `30002` 错误,心跳失效。
- 注意:`websockets` 客户端 `send("ping")` 与协议级 ping 不同,这里发送的是**应用层**字符串帧。

### D5: pro 历史窗口按周期边界对齐
修正 vendor `klinecharts-pro` 的 `N1` 窗口计算:minute 按 `multiplier` 分钟对齐、hour 按 `multiplier` 小时对齐(如 4h → `_ % 4*3600000`)、day 按 `multiplier` 天对齐。请求 `to` 对齐到周期边界,`from` 为 `to - 500*step`。
- **备选**:前端 datafeed 对 pro 传入的 from/to 二次对齐。被否——pro 内部统一修复覆盖面更全(含 loadMore),前端补偿只能修一条路径。
- 风险:vendor 是第三方代码,改动需在前端测试中固化 `N1` 行为断言。

## Risks / Trade-offs

- [帧格式变更破坏旧前端] → 前后端同步部署;前端对缺 `timeframe` 的帧安全忽略,避免误投。
- [vendor `N1` 改动被依赖升级覆盖] → 该 vendor 已 vendored(dist 内),改动可持久;测试断言固化。
- [多 series 同时订阅时事件推送负载上升] → 仍按 series 节流(~1s),低频完整帧按 5s;订阅数受前端实际使用约束。
- [心跳格式改字符串后旧代码误判] → `raw.strip()=="ping"` 明确判断,JSON 帧走原路径。
- [断连重连期间订阅丢失] → 重连后按活跃 4 元组重订阅(现有 `_channels()`/`sendOp` 逻辑保留)。

## Migration Plan

1. 后端:先改 `realtime.py`/`streamhub.py` 心跳常量与分发(低风险、独立)。
2. 后端 `webapi.py`:`subs` 键升级、帧格式补齐、事件监听器与低频循环适配;跑 `test_webapi.py`。
3. 前端 `bitgetWs.ts`:`deliver` 4 元组匹配、`onmessage` 读取完整标识;跑 `bitgetWs.test.ts`。
4. 前端 vendor `N1` 窗口对齐;新增 `datafeed`/pro 相关测试断言。
5. 联调:本地起前后端,多 symbol/多周期切换,确认无串流、蜡烛正确、~1s 刷新。
6. 回滚:改动集中 4 个文件 + vendor,单 commit 可回滚;帧格式前后端同步,无中间态。

## Open Questions

- `ticker` 通配订阅(`*`)的帧是否也需要 category 标识?(当前前端按全市场镜像消费,建议携带 category 便于多类别区分)
- 心跳字符串 `ping` 在现有 `websockets` 库版本下是否与协议级 ping 帧冲突?(应用层字符串帧与 RFC6455 ping 是不同概念,预计无冲突,联调确认)
