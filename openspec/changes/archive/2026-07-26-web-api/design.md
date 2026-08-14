## Context

后端能力齐备且已测(store/indicators/levels/structure/smc/risk/execution/agent/llm/memory/dlquant/orchestration)。探索已定:#9 拆为 #9a web-api(FastAPI,可 pytest)+ #9b web-frontend(React)。WS 采用定时快照(A);实盘用开关 + 每单 confirm token;策略编辑 = 参数表单(ProviderConfig/RiskConfig)+ 可编辑系统提示 + 手动规则;本地单机、绑定 127.0.0.1。

## Goals / Non-Goals

**Goals:**
- 薄 API 层,业务全在既有模块;localhost 绑定。
- 覆盖行情/分析/回测/Agent/组合/日志端点。
- 配置(provider/risk/prompt/rules)读写与持久化。
- 实盘 confirm-token 两步流 + kill-switch/实盘开关。
- 定时快照 WebSocket。
- httpx + pytest 覆盖。

**Non-Goals:**
- 不做 React UI(#9b)。
- 不接 Bitget 原生 WS 逐笔(后续增强)。
- 不做多用户/认证/公网部署(本地自用)。
- 不改已归档模块的既有行为(仅向后兼容扩展)。

## Decisions

### D1:薄层 + 直接调用
FastAPI 端点只做校验/编排,调用 `market_data` 模块。应用工厂 `create_app()` 便于 TestClient 测试。绑定 `127.0.0.1`。

### D2:长任务(backtest/pull)后台化
用 FastAPI `BackgroundTasks` + 内存任务表:`POST /backtest` 返回 `job_id`,`GET /jobs/{id}` 查进度/结果。`pull`(MCP 子进程,慢)同法。

### D3:配置持久化 `ConfigStore`
`appconfig.py`:JSON 存 `data_dir/config/app.json`,字段:provider(ProviderConfig)、risk(RiskConfig)、system_prompt(str|null)、manual_rules(list[str])。`GET/PUT /config`。校验复用各 dataclass 的构造校验。

### D4:可编辑系统提示 & 手动规则(策略编辑 b)
- 向后兼容扩展 `LLMTextProvider(__init__ 增加 system_prompt=None)`,None 时用原常量——**不改既有调用行为**。
- 决策时:`rules = manual_rules + distill_rules(journal)`,经 `augment_context` 注入;system_prompt 从配置取。

### D5:实盘 confirm-token 流
- `POST /order`:构造 `OrderRequest`,先做 **dry 风控预检**(`RiskEngine.check_order`);通过则生成一次性 `token` 存入待确认表,返回 {token, decision 预览};不下单。
- `POST /order/confirm {token}`:取出订单 → 若实盘开关开,用 `LiveBroker`(enabled+confirm=lambda:True 由本步代表用户确认)否则 `PaperBroker` → 经 #4/#3 执行 → 返回结果;token 一次性失效。
- `PUT /control`:kill-switch、live_enabled(默认关)。kill 时拒绝一切下单。

### D6:WebSocket 快照
`/ws`:客户端连上后,服务端按间隔(可配)推送快照:最新若干 K 线、指标末值、Top-N S/R、当前 portfolio/PnL。用 `asyncio` 定时循环 + 连接管理。快照数据来自 store/indicators/execution(定时刷新,非逐笔)。

### D7:错误与安全
统一异常 → JSON 错误响应;凭据只从环境变量;不把密钥回传前端;所有下单必过 #3/#4。

## Risks / Trade-offs

- **扩展已归档 `llm.py`** → 仅加可选参数、默认行为不变;既有测试应仍通过(回归验证)。
- **内存任务表/待确认表** → 进程内、重启丢失;本地自用可接受,后续可持久化。
- **WS 快照有延迟** → 明确为准实时;真逐笔后续接 Bitget WS。
- **实盘经浏览器** → 多闸门 + localhost + 每单 token;仍属高危,默认纸面、live_enabled 默认关。
- **MCP 子进程在请求中** → 仅 `pull` 用,后台化避免阻塞。

## Open Questions

- 快照推送间隔默认值(5s?)与推送内容裁剪——给默认,可配。
- backtest 大数据的进度粒度——先粗粒度(pending/running/done),后续细化。
- confirm-token 有效期/单次性策略——先一次性、无过期(本地);后续可加 TTL。
