---
type: "Fragment"
id: backend/src/agent_orchestration
title: "Agent 决策、记忆与自动编排"
description: "Agent 产出什么结构的决策、记忆如何注入与检索、哪些任务默认会跑、哪些必须显式开闸？"
parent: /backend/src/_overview.md
fragment: agent_orchestration
entity_names:
  constants:
    - name: VALID_ACTIONS / VALID_SIDES
      value: "{open, close, hold} / {long, short, None}"
      source: backend/src/market_data/llm.py
    - name: ProviderConfig.near_pct
      value: "0.005（价格距档位 0.5% 以内才算『靠近』）"
      source: backend/src/market_data/llm.py
    - name: ProviderConfig.min_strength
      value: "2.0（低于此强度的 S/R 档位不作为入场依据）"
      source: backend/src/market_data/llm.py
    - name: ProviderConfig.leverage / category
      value: "100.0 / USDT-FUTURES"
      source: backend/src/market_data/llm.py
    - name: RuleBasedProvider hold confidence
      value: "0.3（open 时为 0.6）"
      source: backend/src/market_data/llm.py
    - name: NEWS_DIGEST_CATEGORIES / HOURS / MAX_ITEMS
      value: "(crypto, macro) / 24 / 10（摘要另截到 1200 字符）"
      source: backend/src/market_data/agent.py
    - name: AgentCycle retrieve k
      value: "3（相似历史交易注入条数：`MemoryStore.retrieve(feats, k=3)`）"
      source: backend/src/market_data/orchestration.py（webapi 与 lifecycle 内均用 3）
    - name: Reflector.MIN_SAMPLES / LOW_WINRATE
      value: "5 / 0.4（胜率低于 40% 才产出参数建议）"
      source: backend/src/market_data/memory.py
    - name: distill_rules 触发阈值
      value: "同类亏损样本 ≥ 2（`losing_long_neg`/`losing_short_pos`）"
      source: backend/src/market_data/memory.py
    - name: agent_schedule_enabled
      value: "False（`MD_AGENT_SCHEDULE_ENABLED`，不注册 `agent_cycle`/`retrain`）"
      source: backend/src/market_data/config.py
    - name: retrain 任务周期
      value: "`interval * 12`（即 `MD_SCHEDULE_INTERVAL_SECONDS`×12，默认 3600s）"
      source: backend/src/market_data/orchestration.py
    - name: RunControl 默认
      value: "paper_only=True, kill_switch=False, enabled=True"
      source: backend/src/market_data/orchestration.py
retrieval_hints:
  - "Agent 一次决策的输入上下文里都有什么？新闻和记忆是怎么进去的？"
  - "为什么默认部署不会产生任何自动下单？"
  - "熔断保护性平仓为什么不受 kill-switch 控制？"
  - "换个 LLM 供应商会不会改变决策结构？解析失败会怎样？"
  - "相似交易检索用的是什么相似度？为什么不需要向量数据库？"
  - "⚠️ 如果你找的是「下单/保证金/熔断阈值判定」本身，不在这里，在 `src_risk_execution.md`"
  - "⚠️ 如果你找的是「S/R 与指标的计算」，不在这里，在 `src_analysis.md`"
  - "本模块也叫『AI 交易员 / 策略循环 / 反思与记忆 / 自动化编排』"
  - "架构归属：新的自动化任务 MUST 在 `build_orchestrator()` 注册（含是否受 kill-switch 约束），不得另起 APScheduler 实例"
architectural_role: "决策与自动化层：把分析结果 + 记忆 + 新闻组装为结构化决策，并驱动受闸门约束的循环"
---

## 业务意图

本层解决的业务问题是：**让「机器自己交易」这件事在默认情况下不可能发生，在开启时又必然带着可追溯的理由与复盘**。它承担三件事：把技术面/记忆/新闻压成一个结构化 `AgentDecision`（保证 LLM 或规则引擎给的都是同一形状，下游才能安全路由）；把每笔平仓写成带情境特征与反思的交易日志并支持检索，使下一次决策能复用历史；用编排层把「数据拉取 / Agent 循环 / DL 重训 / 熔断保护平仓」放进同一调度器，并明确区分哪些默认跑、哪些必须人工开闸。

## 对外接口（HTTP 侧契约在 `src_api_stores.md`；此处为进程内契约）

| 接口 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `agent.build_agent_context(df,symbol,timeframe,news,top_n=8)` | 内部 | `{price,indicators,levels,news,category,timeframe}` | 决策输入的唯一组装口 | `agent.py` |
| `TradingAgent.run/act(df,symbol,timeframe,news)` | 内部 | `act(decision, price)` 返回 None（`hold`）或下单结果 | `open/close` 才路由到执行引擎；`hold` 不产生订单 | `agent.py:TradingAgent` |
| `Provider.propose(context) -> AgentDecision` | 可插拔 | `action/symbol/side/reference_price/reason/confidence` | `provider.propose(ctx)`，两种实现给出同一形状 | `llm.py:RuleBasedProvider` / `LLMTextProvider` |
| `make_provider(cfg,complete=None)` / `make_complete(cfg)` | 工厂 | `cfg.kind ∈ {rule,openai,ollama,llm,custom}` | `rule` 基线可完全离线；`make_complete(cfg)` 对 `kind=="rule"` 返回 `None`，其他 kind 走 `_build_complete(cfg)`（`ollama` → `build_ollama_complete(cfg)`，其余 → `build_openai_complete(cfg)`） | `llm.py` |
| `memory.features_from_context(ctx)` | 内部 | 四特征 | 情境特征；缺失时记为中性 0，`dist_*` 无档位时为 `1.0` | `memory.py` |
| `MemoryStore.retrieve(features,k=3,side=None)` | 内部 | Top-K `TradeRecord`，降序 | 已平仓记录 + 可选方向过滤；空库返回 `[]` 而不抛错 | `memory.py` |
| `Reflector.reflect(trade, complete=None)` | 内部 | 反思文本 | LLM 不可用/返空/抛异常 → 一律回退 `_heuristic(trade)` | `memory.py` |
| `AgentCycle.decide/step/close_position/enforce` | 内部 | `step()` 返回 `trade_id` | 记忆增强决策 + 执行 + 平仓落日志；`step()` 在 `_open_meta` 中记录 `reason`/`strategy` 供平仓时回写 | `orchestration.py` |
| `RunControl.can_trade()` → `enabled AND NOT kill_switch` | 闸门 | 默认即 `True`（`enabled=True`、`kill_switch=False`，仅显式打开才拦） | 自动循环与手工下单共用的停机位 | `orchestration.py` |
| `build_orchestrator(cycle,data_pull,store,settings,run_control)` | 装配 | 注册 id：`data_pull`（仅当提供）/ `circuit_breaker`（无条件）/ `agent_cycle`、`retrain`（`agent_schedule_enabled`） | 复用 APScheduler 骨架 | `orchestration.py` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `src_analysis` | 上下文指标末值与 S/R 候选 | `indicators.compute`、`levels.build_levels` | extracted |
| `src_risk_execution` | 一切下单/平仓/熔断判定 | `ExecutionEngine`、`OrderRequest` | extracted |
| `src_data_store` | 按 series 读窗口；`<30` 行跳过该标的 | `ParquetStore.read` | extracted |
| `src_news` | 通过注入的 `news_provider`（默认 `("crypto","macro")`、`hours=24`、`max_items=10`）拉新闻摘要 | `NewsBroker.recent` | extracted（**注**：`agent.py` 模块头声明的是注入点，尚未接 `bitget-signal`） |
| `src_quant`（`dlquant`） | `run_retrain` 调 `dlquant.run_pipeline(store.read(series))` 重训 | `run_retrain` | extracted |
| `appconfig.py` | 运行期读取 `ProviderConfig` 与 `RiskConfig` | `ConfigStore.provider_config()` | extracted |

**反向调用方**

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `webapi` | `/agent/decide`、`/agent/cycle`、`/journal`、`/portfolio`、`/control` | `AgentCycle`、`build_agent_context` |
| `webapi` lifespan | 常驻编排（默认只跑熔断） + 构造 `MemoryStore(journal)`、`make_complete(cfg)`、`news_provider` | `build_orchestrator` |
| `cli` 的 `agent / orchestrate / memory` 子命令 | 本地跑一次决策/循环/查看日志与建议 | `TradingAgent`、`AgentCycle` |
| `src_risk_execution` | 保护性平仓由 `AgentCycle.enforce` / `close_position` 驱动（组合层为 `ExecutionEngine.enforce_circuit_breaker` 返回的应平集合） | `orchestration` ↔ `execution` |

**注**：`bitget-signal` 在当前仓库仅留有 `news_provider` 这一**注入点**，未真实接入（`src_news.md` 描述的是自建 AKShare 管线）——不要误以为已有外部情绪信号接入。

## 典型调用链

```
POST /api/agent/cycle
  → webapi 组装 AgentCycle(provider=_build_provider(cfg), engine, memory_store, journal,
                           run_control, complete=make_complete(cfg), news_provider=_news_digest)
  → AgentCycle.step(df, symbol, timeframe, price)
    → RunControl.can_trade()        ← 本模块：否则直接 {"status":"halted"}
    → _news_provider() → "crypto/macro 摘要"   ← 跨模块 src_news
    → build_agent_context(df,…,news)           ← 跨模块 src_analysis
    → features_from_context(ctx) → MemoryStore.retrieve(feats,k=3) + distill_rules(journal.all())
    → augment_context(...) → provider.propose(aug)  → AgentDecision   ← 跨模块 llm
    → ExecutionEngine.place(OrderRequest(…,intended_leverage=cfg.leverage))← 跨模块 src_risk_execution
    → 平仓：settle pnl → TradeRecord(features,reason,strategy) → reflect → journal.append  ← 跨模块 src_risk_execution
  → {"status":"open|close|hold|halted", …}（开仓含 decision/filled/memories；平仓含 pnl/memories）
```

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `VALID_ACTIONS` | `{open,close,hold}` | `llm.py` | 决策动作全集，超出即降级为 `hold` | `agent-decision` 策略 + 下游 `act()` 分支 |
| `VALID_SIDES` | `{long,short,None}` | `llm.py` | 方向全集 | 同上 |
| `ProviderConfig.kind` | `rule`（默认） | `llm.py` | 保证无外部依赖即可产出决策，离线/测试用 | `llm-provider` |
| `near_pct` / `min_strength` / `leverage` | `0.005` / `2.0` / `100.0` | `llm.py` | 左侧入场三条件 | 可经 `Reflector.LOW_WINRATE=0.4` 阈值下由 `suggest_param_adjustments()` 给出 `min_strength:"+1"` / `near_pct:"narrow"`（`_rationale`） |
| `NEWS_DIGEST_*` / `max_chars` | `(crypto,macro) / 24h / 10 条 / 1200 字` | `agent.py` | 注入 prompt 的新闻预算，MUST 有界 | `agent-cycle` 要求「新闻为空时上下文仍可用」 |
| `RunControl` 默认三字段 | paper_only=True, kill_switch=False, enabled=True | `orchestration.py` | 默认纸面、默认允许交易 | `run-control` |
| `ReTrain 周期倍数 / analyze 下限` | `interval*12` / 30 bars | `orchestration.py` | 重训频率与数据不足门槛 | 代码定义（重训周期倍数与 retrain 频率低的设计意图一致） |

### 必须实现的函数 / 不可省略的行为

| 函数 | 所在文件 | 说明 |
|---|---|---|
| `augment_context(context, memories, rules)` | `memory.py` | 决策上下文 MUST 含检索到的 `memories` 与 `rules`（`reflections` 为按需补充字段，可缺省），否则「闭合记忆回路」失效 |
| `Reflector.reflect(trade, complete=None)` | `memory.py` | LLM 失败 MUST 回退启发式；反思 MUST 落进记录 |
| `suggest_param_adjustments()` | `memory.py` | 建议是**咨询性**的：MUST NOT 自动写回 `ProviderConfig`/`RiskConfig`；样本 < 5 返回 `{}` |
| `build_orchestrator()` 的四个 job 包装 | `orchestration.py` | 每个 job MUST 单独 catch 异常并 `logger.error`，保证「后续调度不受影响」；且任务均带 `max_instances=1, coalesce=True` |

**设计决策（选型记录）**

1. **记忆检索不用向量库**：`similarity(a,b)` 在四个可解释特征上混合**类别等值 + 数值接近度归一（类别项等值记 1 / 数值项 `1-abs(av-bv)`，四项等权）**，取值 `[0,1]`，**MUST NOT 依赖外部 embedding 模型**。
2. **反思可选 LLM**：文本补全工厂 `make_complete()` 与决策 provider 解耦，`rule` kind 下返回 `None` 表示「无补全」，由调用方降级为启发式；反思与决策契约互不影响。
3. **kill-switch 不覆盖平仓**：`RunControl` 只管 `_agent_job`（新开仓）；保护性平仓位在 `orchestration._circuit_job`，MUST NOT 受 `can_trade()` 影响。
4. **熔断优先、且总是先于风控与 broker**：`ExecutionEngine.place()` 的顺序是 `risk.check_circuit_breaker → risk.check_order（含 margin/notional 与拒绝原因文案）→ broker.open`，三层闸门不可省略或换序。
5. **决策降级**：LLM provider 解析失败或动作/方向越界时 MUST 降级为 `hold` 并写 reason，不抛错。

## 边界

- ✅ 可新增 provider kind、新增启发式规则模式（`rules` 列表当前来自 `manual_rules` + `distill_rules` 合并）。
- ❌ 禁止在 `AgentCycle` 或 `TradingAgent` 里直接调用 MCP/REST 下单——一切必须经 `ExecutionEngine`（含熔断与风控），这是 `system-architecture` 的层级底线。
- ❌ 禁止让 LLM 臆造 S/R：`context.levels` 由 `src_analysis.md` 产出后注入 prompt，不得让模型「自己看价格」；解析越界 MUST 降级为 `hold`。
- ❌ 禁止默认打开自动交易/自动重训（默认 `MD_AGENT_SCHEDULE_ENABLED=false`）。
- ❌ 禁止在 `agent.py`/`orchestration.py` 里**修改已归档的 agent 行为**；记忆-反思回路在编排层闭合是显式设计决策（`orchestration.py` 注释）。

## 变更风险

| 改动 | 破坏什么 | 后果 |
|---|---|---|
| 把 `ProviderConfig` 字段改名，或动 `AgentDecision` 字段名 | `asdict()` 序列化与 `appconfig`/journal JSON 兼容；`config-persistence` 的读写契约 | 旧配置/历史日志读不出来 |
| 把 `paper_only` 默认改成 False | `run-control` 与 `live-safety` 的默认纸面承诺 | 未确认即真实下单，资损风险 |
| 让熔断任务受 kill-switch 约束 | `orchestration-jobs` 明确「熔断执行 SHALL NOT 被 kill-switch 阻断」 | 停机时敞口裸奔 |
| `run_agent_cycle`/`run_retrain` 里改成串行抛错（去掉内层 per-target catch） | 逐标的隔离：「单个失败 MUST NOT 中断其余标的平仓」 | 一个坏 series 卡住全部自动化 |
| 改 `_open_meta` 结构（reason/strategy 等） | 平仓时写入日志的字段完整性 | `/journal` 与反思/规则提炼退化（注意 `close_position()` 的 `reason` 形参默认 `""`） |
| 让 LLM 直接产出 S/R 价位或绕过 `ExecutionEngine` 下单 | `ai-agent-strategy`、`system-architecture`、live-safety | 决策价位不可追溯（违背「S/R MUST 由确定性算法产出」底线），以及绕过风控直连交易所的资损风险 |

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **决策契约是固定的结构化六字段 + 左侧策略三态**：`{action, side, symbol, reference_price, reason, confidence}`；靠近强支撑（在阈值内且强度达标）→ open long 且 `reference_price` 取该支撑位；靠近强压力 → open short；离所有强位都远 → MUST hold（不得「找理由下单」）。参考价位 MUST 来自 `src_analysis` 的确定性 S/R，MUST NOT 由 LLM 臆造。（来源: `openspec/specs/agent-decision/spec.md`、`openspec/specs/ai-agent-strategy/spec.md`）
- **落地 MUST 经执行层的两层闸门（默认纸面）**：open 走下单校验后执行、close 走平仓、hold 不动作；Agent MUST NOT 绕过风控直接下单或平仓。（来源: `openspec/specs/agent-execution/spec.md`、`openspec/specs/system-architecture/spec.md`）
- **一次循环要闭合「记忆—反思」回路**：决策上下文 MUST 含检索到的相似历史交易与经验规则；上下文 SHALL 自动注入新闻管线摘要，且**环形缓冲为空或过滤后无条目时上下文仍 MUST 可成功组装**（`news` 为空串）；显式传入的新闻 MUST 优先于自动注入（注入器不得覆盖调用方给出的文本）。（来源: `openspec/specs/agent-cycle/spec.md`、`openspec/specs/agent-context/spec.md`）
- **反思与规则的可降级性**：provider 支持文本补全时 SHALL 用补全生成反思，补全失败或 provider 为 `rule` 基线时 MUST 回退启发式反思且 MUST NOT 报错；每笔平仓 MUST 写入含盈亏与反思的记录，且该记录 MUST 可被后续检索命中（回路闭合的判定点）。（来源: `openspec/specs/agent-cycle/spec.md`、`openspec/specs/reflection-engine/spec.md`）
- **记忆三件套的业务语义**：记录每笔交易（策略、盈亏、开平仓数额/价格/杠杆）；以 RAG 检索把历史注入决策、产出策略参数自调建议、沉淀可读的经验规则集合。检索 MUST 依据情境特征做 Top-K 相似匹配并支持方向过滤，空历史返回空；相似度 MUST NOT 依赖外部嵌入模型；参数建议 MUST NOT 被自动应用（人改配置是其底线）。（来源: `openspec/specs/ai-agent-strategy/spec.md`、`openspec/specs/memory-retrieval/spec.md`、`openspec/specs/memory-integration/spec.md`、`openspec/specs/reflection-engine/spec.md`）
- **交易日志字段不可裁减**：开/平仓价、名义与保证金、杠杆、PnL、策略、理由、反思、情境特征 MUST 全部持久化并支持加载与按已平仓筛选——缺任一字段都会使反思、规则提炼与 `/journal` 展示退化。（来源: `openspec/specs/trade-journal/spec.md`）
- **默认部署 MUST NOT 自动交易**：编排调度器 SHALL 始终注册熔断执行任务，而 Agent 交易循环与 DL 重训任务 SHALL 仅在 `MD_AGENT_SCHEDULE_ENABLED` 为 true 时注册，且该开关默认 false；Agent 循环任务 MUST 受 kill-switch（`RunControl.can_trade()`）约束，而熔断任务属保护性平仓、SHALL NOT 被 kill-switch 阻断；复用既有 APScheduler 骨架与增量落盘任务。（来源: `openspec/specs/orchestration-jobs/spec.md`）
- **运行控制三开关的默认值**：kill-switch、实盘开关（默认关）与全局启用标志（默认启用）均 MUST 可经控制端点读与写；kill-switch 打开或启用标志关闭时 MUST 拒绝一切（自动化）下单，且未显式配置时默认纸面。（来源: `openspec/specs/run-control/spec.md`、`openspec/specs/live-control/spec.md`）
- **provider 抽象的三条不变式**：兼容 OpenAI 兼容端点与本地 Ollama，并 MUST 保留确定性规则基线（可离线运行）；provider 配置 MUST 校验取值；**切换 provider MUST NOT 改变决策契约**；文本补全工厂 MUST 独立于决策 provider 暴露（`rule` 返回 `None`），供反思等非决策用途复用。（来源: `openspec/specs/llm-provider/spec.md`）
- **端点侧读/write 边界**：`/agent/decide` 类端点 MUST 只出建议不下单，一次「纸面循环」端点才带执行；组合与交易日志查询端点 MUST 只读。新增自动化能力时 MUST 保持这一读写分离。（来源: `openspec/specs/agent-endpoints/spec.md`）
- **已知偏差（勿按规格误判实现）**：`ai-agent-strategy` 要求「通过 `bitget-signal` 获取新闻/宏观/情绪」，当前仓库仅保留 `news_provider` 注入点、实际新闻来源为自建 AKShare 管线；改造前 MUST NOT 假设已有外部情绪信号接入。（来源: `openspec/specs/ai-agent-strategy/spec.md`）
