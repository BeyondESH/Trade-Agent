## 1. 心跳格式修复

- [x] 1.1 `realtime.py`:`PING_FRAME`/`PONG_FRAME` 改为字符串 `ping`/`pong`;`_handle_frame` 事件分发改为 `raw.strip() == "ping"` 判断
- [x] 1.2 `streamhub.py`:同样修正心跳常量与事件分发
- [x] 1.3 `test_realtime.py`:更新 ping/pong 断言(发送 `ping` 字符串、回复 `pong`、JSON 帧不受影响)
- [x] 1.4 `test_streamhub.py`:更新心跳相关断言

## 2. 后端 /ws 订阅路由

- [x] 2.1 `webapi.py`:`subs` 键升级为 4 元组 `(channel, category, symbol, timeframe)`;ticker 通配订阅单独处理
- [x] 2.2 `webapi.py`:所有推送帧(snapshot/update/低频完整帧)统一携带 `channel/category/symbol/timeframe`
- [x] 2.3 `webapi.py`:订阅/退订/断连清理按 4 元组注册与注销;candle 监听器 `candle_listener_regs` 键同步升级
- [x] 2.4 `webapi.py`:事件驱动 update 帧构造带完整 series 标识
- [x] 2.5 `test_webapi.py`:新增同 symbol 多周期并存路由、退订按完整键、断连完整注销、帧带完整标识用例

## 3. 前端 bitgetWs 路由

- [x] 3.1 `bitgetWs.ts`:`onmessage` 从帧读取 `category`/`timeframe`;缺字段的帧安全忽略
- [x] 3.2 `bitgetWs.ts`:`deliver(category, symbol, timeframe, candle)` 改为 4 元组精确匹配,杜绝跨周期串流
- [x] 3.3 `bitgetWs.ts`:订阅/退订协议携带完整 series(含 category/timeframe,已有 sendOp 结构确认/补齐)
- [x] 3.4 `bitgetWs.test.ts`:新增 deliver 按 timeframe 区分、缺 timeframe 帧忽略、多 series 并存投递用例
- [x] 3.5 `datafeed.ts`:确认 subscribe 回调与 pro 契约不变,必要时适配帧字段

## 4. pro 窗口边界对齐

- [x] 4.1 `vendor/klinecharts-pro`:修正 `N1` 窗口计算——minute 按 multiplier 分钟、hour 按 multiplier 小时、day 按 multiplier 天对齐周期边界
- [x] 4.2 前端新增 `N1` 对齐测试断言(4h/12h 请求窗口 to 落在周期边界)
- [x] 4.3 前端 `typecheck`(`tsc --noEmit`)通过

## 5. 联调与收尾

- [x] 5.1 运行 backend 全部单测(`python -m pytest tests/ -q`)通过
- [x] 5.2 运行 frontend 测试(`vitest run`)通过
- [x] 5.3 运行 `openspec validate --all` 通过
- [x] 5.4 本地起前后端联调:多 symbol/多周期(5m/1h/4h)切换,确认蜡烛无串流、时间轴正确、~1s 实时刷新、心跳无 `30002` 错误
