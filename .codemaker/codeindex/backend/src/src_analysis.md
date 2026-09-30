---
type: "Fragment"
id: backend/src/analysis
title: "技术分析与支撑压力聚合"
description: "指标、市场结构、SMC 与统一 S/R 候选是怎么算出来的，为什么必须只用当前及之前的 bar？"
parent: /backend/src/_overview.md
fragment: analysis
entity_names:
  constants:
    - name: FIB_RATIOS
      value: "0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0"
      source: backend/src/market_data/indicators.py
    - name: swing_k（find_swings 默认窗口）
      value: "k=2（左右各 2 根确认）"
      source: backend/src/market_data/structure.py
    - name: box_window / box_max_width / box_touch_tol / box_min_touches
      value: "60 / 0.15 / 0.02 / 2"
      source: backend/src/market_data/structure.py
    - name: trendline_use_last
      value: "3（上下轨各取最近 3 个 swing 拟合）"
      source: backend/src/market_data/structure.py
    - name: levels_tol
      value: "0.001（0.1% 相对容差，聚类与触碰判定共用）"
      source: backend/src/market_data/levels.py
    - name: analyze_top_default
      value: "8（`/analyze` 与 CLI `analyze` 的 Top-N S/R 默认，可传 `top`）"
      source: backend/src/market_data/webapi.py
retrieval_hints:
  - "支撑/压力位是怎么从多个来源合成一条候选的？"
  - "为什么指标末值在某些 bar 上是 NaN 而不是报错？"
  - "强度 strength 是怎么算的、为什么同一价位被不同来源命中时更可信？"
  - "SMC 的订单块、流动性位、BOS/CHOCH 是按什么规则识别的？"
  - "⚠️ 如果你在找『因子/特征列（DL 用的那套）』，不在这里，在 `src_quant.md`"
  - "⚠️ 如果你在找指标线的**绘制与显示（图表 pane、样式、颜色）**，不在这里，在 `frontend/src`"
  - "本模块也叫『左测依据 / S/R 引擎 / 结构标注』，对应需求中的「支撑压力与技术态势」"
  - "架构归属：新增确定性价位来源 MUST 接进 `levels._collect()`，不得在 `agent.py`/`webapi.py` 里另算一套 S/R"
architectural_role: "确定性分析层（纯函数、无 I/O、无交易所依赖），为量化、Agent 决策与图表标注提供同一份真值"
---

## 业务意图

本层解决的业务问题是：**让「现在是支撑还是压力、强弱多少、趋势线在哪」这件事完全由确定性算法给出，而不是让 LLM 目测臆造**。系统的 Agent 侧策略、回测因子、图表上的标注层（S/R / structure / smc 三个可切换图层）与记忆检索的情境特征都从这一层取数。一旦这层的输出不稳定或带上了未来信息，四条消费链路会同时得到同一份错误答案，且难以察觉。因此本层被刻意写成「只读 pandas 输入、只返回 NaN 不抛错、只用当前及之前 bar」的纯函数集。

## 对外接口（全部为进程内纯函数）

| 接口 | 方向 | 关键参数 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `indicators.compute(df)` | 计算 | 输入需含 `open/high/low/close/volume` | 返回复制帧并加 `dif/dea/macd_hist`、`kdj_k/d/j`、`boll_mid/upper/lower`、`vegas_ema144/169/…` 等列 | `indicators.py:compute` |
| `indicators.rsi/atr/vol_ratio/mom/fib_levels` | 计算 | 历史不足 → **NaN，不抛错** | 供因子 DSL、`/analyze` 末值使用 | `indicators.py` |
| `structure.find_swings(df, k=2)` | 结构 | 右侧需 `k` 根确认 | 分形法摆动高低点（未确认的最近 k 根不产出） | `structure.py:find_swings` |
| `structure.fit_trendlines(df, swings, use_last=3)` | 结构 | 返回 `(slope, intercept, projection)` | 上轨/下轨趋势线并投影到当前 bar | `structure.py` |
| `structure.detect_box(df, window=60, max_width=0.15, touch_tol=0.02, min_touches=2)` | 结构 | 不满足条件返回 `None` | 近段箱体上下沿 | `structure.py` |
| `smc.liquidity_levels / order_blocks / bos_choch` | 结构 | 基于 swings + 容差 | 等高/等低流动性位、突破前反向区间订单块、BOS/CHOCH 事件 | `smc.py` |
| `levels.build_levels(df, tol=0.001, top_n=None)` | 聚合 | 返回按强度降序、已聚类去重的候选 | **S/R 唯一出口**：把 boll/vegas/fib/swing/box/liquidity/ob 七类来源聚成 `Level{price,kind,sources,strength}` | `levels.py:build_levels` |

## 跨模块依赖

| 依赖 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `src_data_store`（`models.py`/`store.py`） | 分析入口按级别读本地数据 | `store.read`、`validate_timeframe`、`timeframe_step_ms` | extracted |
| `src_realtime`（`realtime.py`） | `/analyze` 类端点在实时 snapshot 中复用 `build_levels` + `compute` | `levels.build_levels`、`indicators.compute`（snapshot 路径） | extracted |
| `src_agent_orchestration`（`agent.py`） | 决策上下文的 `levels` 与 `indicators` 字段 | `build_agent_context` → `indicators.compute` / `levels.build_levels` | extracted |
| `src_quant`（`factors.py`） | 因子 DSL 直接按名字调用指标函数 | `_w_rsi`/`_w_atr`/`_w_vol_ratio` → `indicators.atr` 等 | extracted |
| 第三方 `vectorbt`（指标后端） | RSI/ATR/MACD/BOLL 的口径按 vectorbt 为准 | `vbt.IndicatorFactory` | extracted |

**反向调用方**

| 调用方 | 调用场景 | 关键符号 |
|---|---|---|
| `webapi`（`/analyze`、`/levels`、`/structure`） | 指标末值 + Top-N 候选 + 结构标注 | `webapi.analyze`、`webapi.levels_endpoint`、`webapi.structure` |
| `cli`（`analyze`） | 打印指标末值与 Top-N S/R | `cli.py` 的 analyze 分支 |
| `agent.build_agent_context` | 决策输入的 `levels` 段 | `indicators.compute`、`levels.build_levels` |
| `memory.features_from_context` | 情境特征用支撑/压力距离与 MACD 符号/ KDJ 区间 | `macd_hist`、`kdj_j`、`levels` |
| `factors`（因子 DSL） | 表达式内 `rsi()/atr()/sma()` | `_EXPR_FUNCS` |
| `backend/tests/test_analysis.py` | 锁定「不得抛错」与列名兼容 | `test_analysis` 断言（见 anti_patterns 记录） |

## 典型调用链

```
webapi /analyze(symbol,timeframe,category,top)
  → ParquetStore.read(...)                          ← 跨模块：src_data_store
  → if len(df) < 30: HTTPException(422)             ← 接口层的数据下限门槛
  → indicators.compute(df).iloc[-1]                  ← 本模块
  → levels.build_levels(df, top_n=top)               ← 本模块
      → 7 类来源 _collect → 容差聚类 → strength = 来源数 + 0.1*触碰次数
  → {indicators, levels:[{price,kind,strength,sources}]}
```

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来 |
|-------|----|---------|------|---------------------|
| `FIB_RATIOS` | `(0.0,0.236,0.382,0.5,0.618,0.786,1.0)` | `indicators.py` | 斐波回撤位集合，图表与 S/R 共用同一组比例 | `→ openspec/specs/support-resistance/spec.md` |
| 摆动确认 `k` | `2` | `structure.py:find_swings` | swing 只有在右侧存在 `k` 根时才成立；改 `k` 会同时改变 SMC 与 S/R 的输入 | `→ openspec/specs/market-structure/spec.md` |
| 箱体四参数 | `60 / 0.15 / 0.02 / 2` | `structure.py:detect_box` | 窗口、最大相对宽度、触碰容差、最少触碰数；任一不满足返回 `None`（无箱体就是空，不许硬造） | 同上 |
| S/R 容差 `tol` | `0.001` | `levels.py:build_levels` | 聚类与「触碰」判定 MUST 使用同一个相对容差，否则同价位可能被聚为一类、触碰却按另一类计 | `→ openspec/specs/support-resistance/spec.md` |
| 指标后端选择 | RSI/ATR/MACD/BOLL/KDJ/VEGAS 的算法口径 | `indicators.py` | 指标口径以 vectorbt 为准（数值容差），列名以内部名为准 | `→ openspec/specs/quant-indicators/spec.md`「口径迁移与列名兼容」 |
| 数据下限 | `30` 根（analyze）、`1` 根（snapshot levels） | `webapi.py` | 低于此不产出 S/R，改为 422/跳过 | 代码级观察，勿改成静默返回空数组 |

### 必须遵守的不变量（不是清单，是硬约束）

| 不变量 | 说明 | 破坏后果 |
|---|---|---|
| **无前视偏差** | 所有指标/结构/SMC 只允许使用当前及之前的 bar；未确认的最近 `k` 根不得产出 swing 或投影 | 回测与策略评估「看起来很好、上线即失效」；`factors.py` 的 `shift(-n)` 被刻意禁止使用 |
| **NaN 代替抛错** | 历史不足或数据无效时必须返回 NaN/空；`test_analysis.py` 已把「`indicators.compute(df)` must not raise」当作断言 | 一个短序列请求就 500，Agent 与图表同步失效 |
| **指标列名与顺序稳定** | `dif/dea/macd_hist/kdj_j/boll_*/vegas_ema144` 等名称与列序是隐式契约：`factors.py` 的 DSL、`memory.py` 的 `_sign(macd_hist)` / `_zone(kdj_j)`、图表配置都按名字取列 | 因子静默取到错误列、`memory` 情境特征错位，回测与图表标注同时失真 |
| **确定性** | 相同的帧输入 → 完全相同的数值（不含随机源、不含墙钟读取） | 回测不可复现，L2/单测的断言不稳定 |
| **S/R 单一出口** | 所有来源经 `levels.build_levels` 聚合，并 MUST 保留 `sources` 集合与 `strength`（供图表与文档标注）；`_collect()` 内 swings 只算一次并向下传给 SMC 复用 | 多套 S/R 并存导致 Agent/图表/记忆三方依据不同价位决策；重复计算让分析变慢 |

### 设计决策（存在分歧的选型记录）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 强度定义 | `strength = distinct(来源数) + 0.1 * 触碰次数`（触碰 = 高低价在容差内的 bar 数） | 纯来源数或纯触碰数 | 只用来源会把「只出现过一次的价位」与「反复测试的价位」混同；只用触碰次数则无法体现多算法交叉验证，故双分量融合 |
| 指标算法 | 有原生实现的指标交 vectorbt，无原生对应者（KDJ-J、VEGAS、Fib）仍用 pandas 薄封装 | 全部自实现 | 口径迁移时保证数值与行为一致；`factors.py` DSL 依赖函数签名，不能整体替换 |
| SMC 与结构标注 | 视为可读且可调的**启发式，不是交易所数据、不是行业规范** | 当作标准形态定义 | 刻意保持「可迭代调参」，并要求代码内写明所用启发式，避免后续被当作不可质疑的事实 |

## 边界

- ✅ 可新增确定性价位来源（并入 `levels._collect()`）、新增指标函数（供因子 DSL 复用）。
- ❌ 禁止在本层引入网络 I/O、交易所指标接口、随机数或墙钟；❌ 禁止在 `agent`/`factors`/`dlquant`/`webapi` 另写一份 S/R 计算。
- ⚠️ 本层无「运行时开关」：所有阈值必须作为默认参数暴露，以便 CLI/测试注入（**推断**：`levels` 无运行时开关、仅以 `tol`/`top_n` 参数传值）。

## 变更风险

- **指标口径变化会同时命中四个依赖方**：指标列变化影响 `factors.py` 的 `roll_mean/roll_std/rsi/atr/vol_ratio/mom` 预设目录、`agent.build_agent_context` 的 `indicators` 块、`memory.features_from_context` 的 `macd_sign` / `kdj_zone` 分档、以及图表指标与结构图层的显示（列名兼容与 vectorbt 口径迁移要求）。 （来源: `openspec/specs/quant-indicators/spec.md`、`feature-engineering/spec.md`「前视特征」）
- **`find_swings` 的确认规则与 `k` 改动风险最高**：未确认 swing 直接流入 `structure.detect_box` / `fit_trendlines` / SMC 的流动性位与 `levels.build_levels`，进而改变 Agent 的入场价位。
- **`strength` 公式改动会让 S/R 排序与 Top-N 结果完全变化**，表现为左侧策略「忽然不做单」或「频繁做单」（Agent 以 `min_strength=2.0`、`near_pct=0.005` 判定，见 `src_agent_orchestration.md`）。
- **NaN 语义丢失会让 422 路径（`len(df)<30`）绕过**，前端收到半满结果而不知原因。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/`（仅提炼约束与边界要点，非完整转录）

- **指标 MUST 本地确定性计算且无前视**：MACD / KDJ / 布林带 / VEGAS 通道 / 斐波回撤全部由 vectorbt Indicator 体系在本地完成，MUST NOT 依赖交易所指标接口；计算 SHALL 只使用截至当前 bar 的数据；数据长度不足时 SHALL 返回空/NaN 而 MUST NOT 抛错——前端「指标可缺省」的降级渲染以此为前提。（来源: `openspec/specs/technical-indicators/spec.md`）
- **斐波比例集固定**：回撤位取 `0 / 0.236 / 0.382 / 0.5 / 0.618 / 0.786 / 1`，且基于**最近 swing** 计算——改动比例或改基准 swing 会同时改变图表画线、S/R 聚簇与 Agent 入场位。（来源: `openspec/specs/technical-indicators/spec.md`、`openspec/specs/support-resistance/spec.md`）
- **结构层三件输出的边界**：摆动点用分形法且**窗口 k 可配**（右侧确认 bar 数即滞后量）；趋势线仅在「至少 2 个 swing high 且 2 个 swing low」时输出上/下线参数与当前投影价；箱体在不满足条件（单边趋势）时 MUST 返回空——MUST NOT 为「总是有图层」而伪造箱体上下沿。（来源: `openspec/specs/market-structure/spec.md`）
- **SMC 判定口径**：流动性位 = 近期 swing 高/低 + 容差内聚簇的等高/等低位（equal highs/lows）；订单块 = 结构突破前**最后一根反向 K 线**的价格区间（向上突破→前一根阴线为看涨 OB）；BOS = 突破上一个同向 swing 极值，CHOCH = 突破反向 swing 极值导致结构反转。这些定义是图表图层与 Agent 依据的共同口径。（来源: `openspec/specs/smc-analysis/spec.md`）
- **S/R MUST 聚成单一候选集**：布林轨、VEGAS、斐波位、swing、箱体沿、订单块、流动性位七类来源 MUST 聚合为统一列表，每个候选 MUST 含**价格、类型（支撑/压力）、来源集合、强度**；容差内相近价位 MUST 合并为一个候选，强度随命中来源数与触碰次数增加，输出 MUST 按强度降序去重。（来源: `openspec/specs/support-resistance/spec.md`）
- **AI 侧底线（本模块是它的唯一实现处）**：Agent 用到的支撑/压力与技术态势 MUST 由确定性算法/开源框架产出后再输入 LLM，LLM MUST NOT 仅凭目测价格臆造 S/R 位；策略以左侧交易为主（支撑低吸 / 压力高抛），输出方向、标的、参考价位与理由后交风控执行层校验。（来源: `openspec/specs/ai-agent-strategy/spec.md`、`openspec/specs/agent-decision/spec.md`）
- **对外输出形态契约**：`/analyze` MUST 返回「指标末值 + Top-N S/R 候选」，数据不足时返回明确提示而不是 500；`/levels`、`/structure` 读的是本地存储而非交易所。（来源: `openspec/specs/market-endpoints/spec.md`）
