## Context

三处已存在的"注入点"从未被生产接线：

- `agent.py:17` `build_agent_context(df, symbol, timeframe, news=None, top_n=8)` 把 `news or ""` 写入上下文 `news` 字段（`agent.py:42`）；`TradingAgent.run` 与 `AgentCycle.decide` 都接受 `news` 参数，但 `webapi.py:856` 的 `_augmented_decision` 与 `orchestration.py:167` 的 `run_agent_cycle` 都不传。
- 新闻已在进程内：`news_broker.NewsBroker` 维护环形缓冲（`news_broker.py:58`），`recent(hours, categories)`（`news_broker.py:182`）正是 `/news/context`（`webapi.py:543`）的取数逻辑；条目稳定形状为 `{id, source, category, title, content, url, ts}`（`newsfeed.py:127`）。
- 反思 LLM：`AgentCycle.close_position` 调 `self.reflector.reflect(record, self._complete)`（`orchestration.py:140`），而 `_complete` 来自构造参数 `complete`（`orchestration.py:64/73`）；`webapi.py:879` 与编排器构造均未传，故 `Reflector.reflect`（`memory.py:142`）恒走启发式。`llm.py` 已有 `_build_complete(cfg)`（`llm.py:152`）与 `build_openai_complete` / `build_ollama_complete`，`make_provider`（`llm.py:144`）内部使用但不对外暴露裸补全。

约束：`agent-decision` 决策契约（`{action, side, symbol, reference_price, reason, confidence}`）与 `reflection-engine` 的"LLM 失败 MUST 回退启发式"不得改变；规则基线 provider 必须保持完全离线可用。

## Goals / Non-Goals

**Goals:**
- `/agent/decide`、`/agent/cycle` 与编排定时循环的决策上下文自动包含来自新闻环形缓冲的摘要。
- 新闻按时间窗与类别过滤并截断，避免 prompt 膨胀；空缓冲时上下文仍有效。
- provider 支持文本补全时，平仓反思使用该补全；webapi 与编排器均接线。
- 规则基线/无补全时保持启发式，零外部依赖不变。

**Non-Goals:**
- 不改 `/news/stream`（SSE）与 `/news/context` 的既有行为。
- 不引入新新闻源，不做逐标的实体抽取/情绪分析（仅按类别与时间过滤）。
- 不改决策输出契约与 `Reflector` 的反思/规则提炼算法。

## Decisions

**决策 1：摘要格式化为 `agent.py` 的纯函数，broker 访问留在 webapi**

在 `agent.py` 新增：

```python
NEWS_DIGEST_CATEGORIES = ("crypto", "macro")
NEWS_DIGEST_HOURS = 24
NEWS_DIGEST_MAX_ITEMS = 10

def format_news_digest(items, *, categories=NEWS_DIGEST_CATEGORIES,
                       max_items=NEWS_DIGEST_MAX_ITEMS, max_chars=1200) -> str:
    # 过滤 category ∈ categories；按 ts 倒序取前 max_items；拼 "标题：内容" 并整体截断到 max_chars
```

webapi 负责 `news_broker.recent(hours=NEWS_DIGEST_HOURS, categories=",".join(NEWS_DIGEST_CATEGORIES))` 再交给该纯函数。

- 理由：格式化可与 broker 解耦、离线可测；`build_agent_context` 保持只接收 `str`，不绑定 NewsBroker 类型。
- 备选：把 NewsBroker 直接塞进 `agent.py`——增加耦合与测试成本，弃用。
- 备选：新增 `NewsContext` 协议注入 `create_app`——对本次范围过重，弃用。

**决策 2：默认时间窗 24h、类别 `crypto`+`macro`**

- 理由：对加密交易最相关，规避 `a-share`/`company` 个股噪声；与 `newsfeed.CATEGORY_RULES` 的既有分类对齐。
- 备选：全部类别——噪声大、prompt 长，弃用。是否做成 Settings 可配留作 Open Question。

**决策 3：`AgentCycle` 通过可选 `news_provider` 自取新闻**

```python
def __init__(self, ..., news_provider: Callable[[], str] | None = None):
    self._news_provider = news_provider

def decide(self, df, symbol, timeframe, news=None):
    if news is None and self._news_provider is not None:
        news = self._news_provider()
    ctx = build_agent_context(df, symbol, timeframe, news)
```

- 理由：`step` 与 `run_agent_cycle` 无需改签名即可让定时循环获得新闻；显式传入的 `news` 优先，向后兼容（既有测试不传 → 行为不变）。
- 备选：给 `step`/`run_agent_cycle` 加 `news` 参数逐层透传——签名扩散、易漏，弃用。

**决策 4：`llm.py` 新增 `make_complete(cfg) -> Complete | None`**

```python
def make_complete(cfg: ProviderConfig) -> Complete | None:
    return None if cfg.kind == "rule" else _build_complete(cfg)
```

webapi/编排器构造 `AgentCycle` 时注入 `complete=make_complete(cfg)`。`Reflector.reflect` 的 `if complete is None: return heuristic` 与 `try/except` 回退逻辑（`memory.py:144-153`）已覆盖全部降级路径。

- 理由：反思补全与"决策 provider"解耦；避免 webapi 重复 `build_ollama_complete` / `build_openai_complete` 分支判断。
- 备选：webapi 内联同样的 if/else——重复逻辑，弃用。
- 备选：让 `make_provider` 同时返回 `(provider, complete)`——破坏既有签名与调用方，弃用。

**决策 5：三处接线**

- `/agent/decide`：`_augmented_decision(df, category, symbol, timeframe, news=_news_digest())`，只注入新闻（不反思）。
- `/agent/cycle`：`AgentCycle(..., news_provider=_news_digest, complete=make_complete(cfg))`。
- 编排定时循环：webapi lifespan 构造的 `AgentCycle` 同样传 `news_provider=_news_digest` 与 `complete=make_complete(cfg)`（与 `wire-orchestration-runtime` 共享该构造点）。

## Risks / Trade-offs

- [LLM 反思调用慢或失败] → `Reflector.reflect` 已 try/except 回退启发式；`make_complete` 对 `rule` 返回 `None`，规则基线不受影响。
- [新闻摘要过长撑大 prompt] → `max_items` + `max_chars` 双重截断。
- [类别过滤漏掉相关宏观事件] → 默认含 `macro`；后续可做成 Settings 可配（见 Open Questions）。
- [定时循环无新闻可注入（未启动 news_broker）] → `_news_digest` 读到空缓冲返回 `""`，上下文仍有效，决策契约不变。
- [闭环安全] → 新增仅"读新闻 + 注入文本"，不改变下单/风控闸门。

## Open Questions

- 是否将新闻时间窗/类别/条数做成 Settings（`MD_AGENT_NEWS_*`）以便运维调参？当前以 `agent.py` 常量 + 函数参数覆盖。
- 是否需要把注入的新闻摘要一并回显在 `/agent/decide` 响应中以便前端展示？（会改动响应契约，本变更未纳入。）
