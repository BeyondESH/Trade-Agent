## Why

`backend/src/market_data/agent.py` 模块 docstring 明言"real news/`bitget-signal` wiring (only an injection point here)"：`build_agent_context(df, symbol, timeframe, news=None)` 接受 `news` 参数，但生产调用方从不传入。`webapi.py:856` 的 `_augmented_decision` 调 `build_agent_context(df, symbol, timeframe)` 无新闻；新闻环形缓冲只在 `/news/stream` 与 `/news/context` 被消费。同时 `webapi.py:879` 构造 `AgentCycle(...)` 未传 `complete=`，于是 `orchestration.py:140` 的 `self.reflector.reflect(record, self._complete)` 中 `self._complete is None` 恒成立——即使 provider 配成 `openai`/`ollama`，平仓反思也永远是启发式，"配置 LLM 却不用 LLM 复盘"。

## What Changes

- 新增纯函数 `format_news_digest(items, ...)`（`agent.py`）：把新闻环形缓冲条目按时间窗与类别过滤、截断，拼接为可注入的文本摘要；空输入返回空串。
- webapi 在 `/agent/decide`、`/agent/cycle` 及编排定时循环中，从 `news_broker.recent(hours, categories)` 拉取并注入新闻摘要。
- `AgentCycle.__init__` 新增可选 `news_provider`；`decide` 在未显式传 `news` 时自动求值，使定时循环无需改签名即可获得新闻。
- `llm.py` 新增 `make_complete(cfg) -> Complete | None`：`kind=="rule"` 返回 `None`，其余返回文本补全可调用；webapi 在 provider 支持文本补全时把它作为 `complete=` 注入 `AgentCycle`，使 `Reflector.reflect` 走 LLM（失败/缺失仍回退启发式）。
- 新闻为空时上下文仍可用（`news` 为空串），决策契约不变。
- 测试：新闻摘要过滤/截断、上下文含新闻且空新闻有效、`news_provider` 注入、mock `complete` 驱动反思。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `agent-context`: 生产端点 SHALL 从新闻管线自动注入按时间窗/类别过滤的新闻摘要；环形缓冲为空时上下文仍有效。
- `agent-cycle`: 循环 SHALL 自动注入新闻摘要；且 SHALL 在 provider 支持文本补全时以该补全生成反思（否则回退启发式）。
- `reflection-engine`: 新增"运行时可注入的 LLM 反思"要求——服务运行期在 provider 支持文本补全时注入补全，规则基线/缺失时回退启发式。
- `llm-provider`: 新增"文本补全调用可独立获取"要求——暴露独立于决策 provider 的补全工厂（规则基线返回 `None`）。

## Impact

- **代码**：`backend/src/market_data/agent.py`（摘要格式化）、`llm.py`（`make_complete`）、`orchestration.py`（`AgentCycle.news_provider`）、`webapi.py`（新闻拉取与注入、`complete=` 接线）、`backend/tests/test_agent.py`、`test_orchestration.py`、`test_webapi.py`。
- **API**：无端点变更；`/agent/decide` 与 `/agent/cycle` 的请求/响应结构不变，仅决策上下文内部新增新闻。
- **行为**：AI 决策开始纳入新闻；provider 为非规则基线时平仓反思改由 LLM 生成（网络失败回退启发式）。
- **风险**：低-中。规则基线零外部依赖不变；LLM 反思慢/失败已被 `Reflector.reflect` 的 try/except 兜底。
