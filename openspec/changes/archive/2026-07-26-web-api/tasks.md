## 1. 骨架与依赖

- [x] 1.1 添加依赖 fastapi、uvicorn(pyproject);测试用 httpx
- [x] 1.2 `webapi.py`:`create_app()` 工厂、`/health`、统一异常处理
- [x] 1.3 CLI `serve`(uvicorn 绑定 127.0.0.1)

## 2. 配置持久化

- [x] 2.1 `appconfig.py`:`ConfigStore`(JSON:provider/risk/system_prompt/manual_rules)
- [x] 2.2 `GET /config`、`PUT /config`(复用 dataclass 校验,非法拒绝)

## 3. 行情/分析端点

- [x] 3.1 `GET /candles`(store.read;时间段可选)
- [x] 3.2 `GET /analyze`(indicators 末值 + levels Top-N);数据不足友好提示
- [x] 3.3 `GET /structure`(structure+smc:趋势线/箱体/OB)、`GET /levels`
- [x] 3.4 `POST /backtest`、`POST /pull` 后台任务 + `GET /jobs/{id}`

## 4. Agent 端点

- [x] 4.1 `POST /agent/decide`(只出决策,不下单;system_prompt+manual_rules 生效)
- [x] 4.2 `POST /agent/cycle`(纸面,记忆增强,经风控)
- [x] 4.3 `GET /portfolio`、`GET /journal`

## 5. 运行控制与实盘流

- [x] 5.1 `PUT /control`(kill-switch、live_enabled 默认关)
- [x] 5.2 `POST /order`:风控预检→发一次性 token(不下单);失败不发 token
- [x] 5.3 `POST /order/confirm`:校验 token→经 #4/#3 执行(纸面/实盘按开关)→token 失效
- [x] 5.4 kill-switch 打开时拒绝一切下单

## 6. WebSocket

- [x] 6.1 `/ws`:连接管理 + 定时快照广播(K线/指标/S-R/组合)
- [x] 6.2 断开清理

## 7. 向后兼容扩展

- [x] 7.1 `LLMTextProvider` 增加可选 `system_prompt`(默认原常量,不改既有行为)

## 8. 测试

- [x] 8.1 TestClient:/health、非法参数返回结构化错误
- [x] 8.2 /candles、/analyze(含数据不足)、/structure
- [x] 8.3 /config 读写往返 + 非法拒绝
- [x] 8.4 /agent/decide 不下单;/agent/cycle 纸面成交
- [x] 8.5 kill-switch 拒单;confirm-token:预检失败不发 token、确认后执行、token 不可重用
- [x] 8.6 /backtest 后台 job 完成可查
- [x] 8.7 /ws 连接收到一条快照
- [x] 8.8 回归:扩展 llm 后既有测试仍全绿
