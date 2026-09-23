## 1. 新闻摘要与注入

- [x] 1.1 在 `backend/src/market_data/agent.py` 新增常量 `NEWS_DIGEST_CATEGORIES=("crypto","macro")`、`NEWS_DIGEST_HOURS=24`、`NEWS_DIGEST_MAX_ITEMS=10`
- [x] 1.2 新增纯函数 `format_news_digest(items, *, categories=..., max_items=..., max_chars=...)`：按类别过滤、按 `ts` 倒序取前 N、拼接 `标题：内容` 并整体截断；空输入返回 `""`
- [x] 1.3 在 `backend/src/market_data/orchestration.py` 的 `AgentCycle.__init__` 新增可选 `news_provider`；`decide` 在 `news is None` 时调用 `self._news_provider()`（显式 `news` 优先）
- [x] 1.4 在 `backend/src/market_data/webapi.py` 新增 `_news_digest()`：`news_broker.recent(hours=NEWS_DIGEST_HOURS, categories=",".join(NEWS_DIGEST_CATEGORIES))` → `format_news_digest`
- [x] 1.5 `_augmented_decision(df, category, symbol, timeframe, news)` 接收并传给 `build_agent_context`；`/agent/decide` 传入 `_news_digest()`
- [x] 1.6 `/agent/cycle` 构造 `AgentCycle(news_provider=_news_digest, ...)`；编排定时循环所用 `AgentCycle` 同样注入 `news_provider=_news_digest`

## 2. LLM 反思接线

- [x] 2.1 在 `backend/src/market_data/llm.py` 新增 `make_complete(cfg) -> Complete | None`：`cfg.kind == "rule"` 返回 `None`，否则返回 `_build_complete(cfg)`
- [x] 2.2 `/agent/cycle` 与编排定时循环构造 `AgentCycle(..., complete=make_complete(cfg))`；`cfg.kind == "rule"` 时为 `None`
- [x] 2.3 确认 `Reflector.reflect`（`memory.py`）的 `None` 回退与 try/except 回退启发式逻辑不被改动

## 3. 测试

- [x] 3.1 `backend/tests/test_agent.py`：`format_news_digest` 按类别与时间窗过滤、按最大条数截断、总长截断；空列表/无匹配返回 `""`
- [x] 3.2 `backend/tests/test_agent.py`：`build_agent_context(df, sym, tf, news="X")` 的 `news == "X"`；`news=""` 时上下文仍含 price/indicators/levels
- [x] 3.3 `backend/tests/test_orchestration.py`：`AgentCycle(news_provider=lambda: "NEWS")` 的 `decide` 上下文包含 `"NEWS"`；显式传入 `news` 时覆盖 provider
- [x] 3.4 `backend/tests/test_orchestration.py`：`AgentCycle(complete=mock)` 平仓时 `record.reflection` 来自 mock；`complete=None` 时为启发式
- [x] 3.5 `backend/tests/test_webapi.py`：fake broker 有/无条目时 `/agent/cycle` 与 `/agent/decide` 均正常返回
- [x] 3.6 运行 `backend/.venv/Scripts/python.exe -m pytest tests/test_agent.py tests/test_orchestration.py tests/test_webapi.py tests/test_memory.py -q`

## 4. 验证

- [x] 4.1 上述 pytest 全绿
