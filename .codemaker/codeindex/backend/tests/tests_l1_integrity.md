---
type: "Fragment"
id: backend/tests/l1_integrity
title: "全栈 E2E 测试门禁层 / L1 数据完整性门禁"
description: "整条 Parquet 行情库是否仍然连续、合法且没有新增缺根？白名单该怎么登记与清空？"
parent: /backend/tests/_overview.md
fragment: l1_integrity
entity_names:
  constants:
    - name: TYPE_A_MIN_STEPS
      value: "5"
      source: backend/tests/test_data_integrity.py
    - name: KNOWN_GAPS
      value: "{}（类型 B 微缺口 0 条；2026-08-20 由 scripts/backfill_micro_gaps.py 全部回填）"
      source: backend/tests/data_registry.py
    - name: STRUCTURAL_EXEMPTIONS
      value: "17 段区间，覆盖 10 个 series 键（注：模块顶部注积写 ‘type A gaps: 14’ 已滞后，以字典实际内容为准）"
      source: backend/tests/data_registry.py
    - name: 类型 C 新鲜度阈值
      value: "2 * step_ms（now - latest_open_time <= 2*step）"
      source: backend/tests/test_data_integrity.py
    - name: is_exempt 的 min_steps
      value: "5（且区间两端必须严格相等才豁免；B 类无豁免通道）"
      source: backend/tests/data_registry.py
    - name: TYPE_A_MIN_STEPS（脚本侧独立副本）
      value: "5（与门禁同名但各自定义，改分类必须逐处同步）"
      source: backend/scripts/backfill_micro_gaps.py
    - name: MD_TEST_BACKEND
      value: "http://127.0.0.1:8000（默认，可被环境变量改写）"
      source: backend/tests/test_data_integrity.py
    - name: pytestmark
      value: "pytest.mark.integrity"
      source: backend/tests/test_data_integrity.py
retrieval_hints:
  - "怎么判断一段行情数据缺了几根 K 线？缺多少算缺陷、多少算豁免？"
  - "新增了一个 micro-gap，要登记到哪里才算通过？登记后还要做什么？"
  - "为什么 L1 门禁在我这台机器上全部 skip 了？"
  - "为什么明明把缺口加进白名单了，测试还是报 stale 条目？"
  - "数据新鲜度（类型 C）为什么平时不检查？要怎样才能被检查到？"
  - "本门禁也叫 L1 / 数据完整性 gate / integrity 子集"
  - "⚠️ 如果你要找的是缺口回填的实际执行逻辑（拉数据+落盘），不在这里，在 backend/scripts 模块的 backfill_micro_gaps"
  - "⚠️ 如果你要找的是 Parquet 读写与按日分区去重的实现，不在这里，在 backend/src 的 market_data.store"
  - "⚠️ 如果你要找的是浏览器端 K 线是否有空洞，不在这里，在 frontend/tests 的 Playwright 旅程"
architectural_role: "数据质量硬门禁；只读校验，不修数据、不拉外部源"
---

## 对外接口（测试运行契约）

| 契约 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `pytest -m integrity` | 开发者/CI → 本模块 | 无参数 | 对 `Settings().parquet_dir` 下**自动发现**的每个 series 逐个参数化校验，不允许硬编码 series 列表 | `test_data_integrity.py:pytest_generate_tests` |
| 缺口登记契约 | 本模块 ⇄ `data_registry` | `KNOWN_GAPS["cat/sym/tf"] = [(lo_ms, hi_ms), ...]` | 类型 B（1~4 步微缺口）必须逐区间登记才可豁免；登记值 MUST 与实测区间**完全相等** | `test_adjacent_spacing_equals_step`、`test_gap_classification_consistent` |
| 结构豁免契约 | 本模块 ⇄ `data_registry` | `STRUCTURAL_EXEMPTIONS["cat/sym/tf"] = [(lo_ms, hi_ms), ...]` | 类型 A（≥5 步）登记后豁免且永不自动清空 | 同上 |
| 在线新鲜度子集 | 本模块 → `--run-online` + 后端存活 | `MD_TEST_BACKEND` | 类型 C：`now - latest_open_time > 2*step` 判停滞；后端不可达时 skip | `test_data_freshness` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/src`（market_data.config） | 定位真实数据目录（`Settings().parquet_dir` = `data_dir/parquet`，`data_dir` 默认 `./data` → 必须在 `backend/` 下执行，可被 `MD_DATA_DIR` 改写） | `Settings`、`Settings.parquet_dir` | extracted |
| `backend/src`（market_data.models） | 缺口步数判定依赖 timeframe step | `Series`、`timeframe_step_ms` | extracted |
| `backend/src`（market_data.store） | 读取整段 series（含分区合并、open_time 排序） | `ParquetStore.read` | extracted |
| `backend/tests/data_registry`（同模块） | 两张注册表是唯一豁免来源 | `KNOWN_GAPS`、`STRUCTURAL_EXEMPTIONS` | extracted |
| `numpy` / `pandas` | 向量化 diff 与分类（`np.rint(d / step)` 归一化倍率） | `np.diff`、`np.rint` | extracted |
| `httpx` | 探测后端存活以决定类型 C 是否执行 | `httpx.get("/health")` | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| 开发者 / CI | 「数据是否被改坏」的唯一硬结论；L1 红即阻断合并 | `test_adjacent_spacing_equals_step` |
| `backend/scripts/backfill_micro_gaps.py` | 以 `KNOWN_GAPS` 为任务清单逐区间回填；`TYPE_A_MIN_STEPS` 的语义必须与本门禁一致 | `classify_gaps`、`remaining_b_gaps` |
| `backend/scripts` 知识库 | 回填完成后必须人工清空对应白名单条目，否则本门禁报 stale | `test_gap_classification_consistent` |

## 典型调用链

### L1 全量门禁
```
pytest -m integrity
  → test_data_integrity.py:pytest_generate_tests       ← 本模块入口（collection 期展开成 series 参数）
    → Settings() → settings.parquet_dir                 ← 跨模块：market_data.config
      → _discover_series(parquet_dir)（cat/sym/tf 三级目录枚举，仅收录含 *.parquet 者）
        → ParquetStore.read(series)                     ← 跨模块：market_data.store
          → test_open_time_strictly_ascending / test_ohlc_legal（无任何豁免通道）
          → test_adjacent_spacing_equals_step
            → _classify_gaps(t, timeframe_step_ms(tf))   ← 本模块分类核心
              → STRUCTURAL_EXEMPTIONS[key] / KNOWN_GAPS[key]（未登记即失败并打印 (lo,hi,steps)）
          → test_gap_classification_consistent（反向核对：白名单里不得有实测不存在的区间）
          → test_data_freshness（@online + needs_backend，默认 skip）
```

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
|-------|----|---------|------|---------------------|
| `TYPE_A_MIN_STEPS` | `5` | `test_data_integrity.py` | A/B 分界：`mult >= 5` 判类型 A（结构性缺失，走豁免登记），`2 <= mult <= 4` 判类型 B（硬门禁）。`mult == 1` 即正常相邻 | 规格 D4；与 `backend/scripts` 的同名常量必须一致，否则「脚本以为已修复、门禁认为未登记」互相矛盾 |
| `KNOWN_GAPS` | `{}`（当前） | `data_registry.py` | 类型 B 白名单；键为 `category/symbol/timeframe`，值为 `(lo_ms, hi_ms)` 开区间列表 | 注释记录「0 条，全部 19 处微缺口已于 2026-08-20 回填」——**清零本身也是契约** |
| `STRUCTURAL_EXEMPTIONS` | 17 段区间（10 个 series 键） | `data_registry.py` | 类型 A 豁免表，按精确区间登记（例：`BTCUSDT/1h` 的 `1577833200000→1700467200000`）；文件头注释仍写「14 段」，属注释滞后而非数据差异 | 实证侦察（全量缺口分类）；属数据工程范围，**不要求回填、永不自动清空** |
| `is_exempt(min_steps=5)` | 默认 `5` | `data_registry.py` | 豁免查询辅助：**仅当 `min_steps >= 5` 且区间两端严格相等**才判 A 类豁免（B 类无豁免通道） | 与 `_classify_gaps` 阈值同源，防止调用方传小阈值而误豁免微缺口 |
| 类型 C 阈值 | `2 * step` | `test_data_integrity.py` | 数据停滞判据：`now - latest_open_time > 2*step` 即失败 | 规格「数据停滞检测（可选在线）」 |
| `_backend_healthy()` 探测超时 | `1.5s` | `test_data_integrity.py` | `GET {MD_TEST_BACKEND}/health` 探活（默认 `http://127.0.0.1:8000`）；非 200 或异常即视为不通 → 类型 C 整批 skip；探测发生在 **collection 期**（`skipif`）| 环境条件而非数据缺陷，因此**禁止**失败 |

### 必须实现的函数

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `_discover_series(parquet_dir)` | `test_data_integrity.py` | 三级目录枚举（cat/sym/tf），仅收录存在 `*.parquet` 者；**禁止改成硬编码 series 清单**（规格要求自动发现） |
| `pytest_generate_tests(metafunc)` | `test_data_integrity.py` | collection 期把每个 series 展开为一个参数化用例；无数据时注入 `("EMPTY", None)` + skip，保证离线/空库不误红 |
| `_verify_ascending(t)` | `test_data_integrity.py` | 只检查重复与回退（`diff == 0` / `diff < 0`），**不受任何白名单影响** |
| `_verify_ohlc(df)` | `test_data_integrity.py` | `high >= max(open,close)`、`low <= min(open,close)`、`volume >= 0`、四价有限；缺列直接报缺失 |
| `_classify_gaps(t, step)` | `test_data_integrity.py` | 返回 `(type_a, type_b)`，每项 `(lo_ms, hi_ms, steps)`；倍率用 `np.rint` 归整，避免浮点误差造成误分类 |
| `is_exempt(series, lo, hi, min_steps)` | `data_registry.py` | 对外暴露的豁免查询入口（**当前仓内无调用方**）；与 `backend/scripts` 侧的 `classify_gaps`/`TYPE_A_MIN_STEPS` 必须保持同语义 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 缺口如何分级 | 三层：A（≥5 步，登记豁免）/ B（1~4 步，白名单硬门禁）/ C（停滞，在线断言） | 单一阈值（全部豁免或全部失败） | 全量侦察显示 46 处缺口中既有「2019→2023 整段未拉取」也有「单点缺两根」；两者风险等级完全不同，一刀切会让门禁要么常红要么失效 |
| 白名单条目形态 | 精确 `(lo_ms, hi_ms)` 元组（且双向核对） | 时间容差匹配 / 只记 series 级计数 | 双向核对（未登记即失败 + 登记但实测不存在即 stale 失败）防止白名单腐烂；容差匹配会让「错位的旧条目」仍然放行 |
| 无数据时的行为 | 整体 skip（不失败） | 直接 fail | L1 读的是本地数据本体（`backend/data/parquet`）；换机器/新克隆不该红，但也不能静默假绿——因此显式 skip 并说明原因 |
| 类型 C 的归属 | 仅 `online` 子集 + 需后端存活，否则 skip | 也放离线断言 | 后端未运行时尾部停滞属环境问题，不是数据缺陷 |

## 变更风险与边界约束

### 背景与权衡（为什么只能这样组织）

L1 面对的问题有一个别的层替代不了的特性：**数据本体不是一个可以用替身绕过的依赖**。它直接读 `Settings().parquet_dir`，因此它的价值恰恰来自「不隔离」——一旦为了「让测试稳定」把 L1 改成读临时种子库，它就退化成对 `ParquetStore` 的普通单测，不再能回答「生产库里现在到底好不好」这个业务问题。所以这里刻意保留了三条强度不同的通道：绝对断言（升序 / 无重复 / OHLC 合法，永不豁免）、登记式断言（缺口，允许历史遗留但必须逐区间精确匹配）、可选断言（新鲜度，需要后端在线）。三条通道的判定条件写在同一个文件里，但**语义等级不可混用**：能豁免的一律不能升级为绝对断言（否则换台机器就红），不能豁免的一律不许登记（否则数据损坏会被白名单悄悄吃掉）。

缺口分级背后的成本判断也值得记录：整段历史缺失（像 2019→2023）的补齐属数据工程的一次性拉取，把这类缺失算作缺陷只会让门禁长期红、失去信号价值；反之，一两根 K 线的缺失往往是「摄入路径正在坏」的最早症状，必须硬失败。分界点取 5 步是经验值而非推导值：它大于任何合理的网络重试与乱序窗口，又小于一次可恢复缺口的典型长度（来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` D4）。

「白名单必须双向核对」是另一处刻意付出的代价。只检查「有没有未登记的缺口」会让白名单只增不减，最后膨胀成一个能吞掉一切的集合；`test_gap_classification_consistent` 用一次额外遍历换取「白名单一旦腐烂就必然变红」。同理，登记时的键必须精确到 `(lo_ms, hi_ms)` 两端，不能带容差：容差匹配会让「错位但看起来相近」的旧条目继续放行新缺根。

最后，`TYPE_A_MIN_STEPS`、B 类判定式（`mult != 1 且 mult < 5`）以及 `STRUCTURAL_EXEMPTIONS` 的登记粒度在三处独立存在（本门禁、`data_registry.is_exempt`、`backend/scripts/backfill_micro_gaps.py`），仓内没有共享导出。这意味着**任何分级调整都是一次三文件联改**，漏改不会出现编译错误，只会在未来某一天以「回填跑完仍红」的形式回来。



**变更风险（改动本门禁会破坏什么）**

- 调整 `TYPE_A_MIN_STEPS`（例如改成 3）却没有同步 `backend/scripts/backfill_micro_gaps.py` 里**同名的独立副本**与 `data_registry.is_exempt` 的默认参数 → 同一缺口在脚本眼中是「已登记/不需回填」，在门禁眼中是「未登记的类型 B」，出现「跑完回填脚本门禁依然红」的假修复链。⚠️ 该阈值在仓内有三处定义（`test_data_integrity.py`、`data_registry.py:is_exempt` 默认参、`backend/scripts/backfill_micro_gaps.py`），**无共享导出**，改分类语义必须逐处人工同步。
- 给数值断言（升序 / 无重复 / OHLC 合法）加豁免通道 → 违反规格「数值断言 SHALL 不受任何豁免影响」；乱序或负 volume 数据会流入 `/candles`、历史预加载和回测样本，直接污染策略结论。
- 把 `KNOWN_GAPS` 当「登记即安全」，回填后不清空 → `test_gap_classification_consistent` 会以 stale 条目失败；更危险的是同区间将来再次缺根时会被旧条目掩盖。
- 把 `_discover_series` 改成硬编码列表 → 新增 series（例如新开 `UNIUSDT`、新增周期目录）不再被校验，门禁覆盖范围静默缩水。
- L1 用例数量随 series 数增长（当前 27 个 series 目录，4383 个 parquet 文件）；新增周期目录会线性放大运行时长，但**禁止**为此抽样校验——抽样等于放弃「任何新增缺根立即失败」的目标。

### 失败模式复盘（这些断言各自拦住的是哪一类真实事故）

- **未登记的新缺根**：某次改动让增量落盘在窗口边界少写一根（或上游短页被当完整页收下），库里的相邻间隔变成 2 步。没有 L1 时这类缺陷只会以「前端图上有个小空洞」「回测少算一根」的形式在几周后被偶然发现，且无法定位引入点。`test_adjacent_spacing_equals_step` 把它压回引入当天，并直接打印 `(lo_ms, hi_ms, steps)` 三元组，使「登记 → 回填 → 清空」可闭环执行。
- **白名单腐烂**：回填完成后条目没删（或删错），以及有人为了省事把整年缺失也塞进 `KNOWN_GAPS`。前者由 stale 断言兜住，后者由分类兜住——`mult >= 5` 的间隙出现在 `KNOWN_GAPS` 里时，它既不在 `actual_b` 也不该存在，会以 stale 形式报出，从而逼迫改走 `STRUCTURAL_EXEMPTIONS`。
- **数值断言被降级**：最危险的改法是「顺手把 OHLC 检查也纳入豁免」，理由是「历史脏数据太多」。一旦如此，非有限值、`high < close`、负 `volume` 都会流进指标计算与回测成本模型，产生 NaN 收益或反向成本这类无法追因的下游异常。这也是规格把「数值断言独立于缺口分类」单列一条 Requirement 的原因（来源: `openspec/specs/e2e-data-integrity/spec.md`）。
- **新鲜度误判成缺陷**：把类型 C 从在线子集搬到离线断言，会让所有没开后端的开发机与 CI 常红；反过来彻底删掉它，则「摄入停了但库看起来完整」这种最隐蔽的停滞将无人可查。正确姿势是维持 skipif：后端在则查，不在则跳过并说明原因（来源: `AGENTS.md`「L1 freshness 在无后端时跳过」）。
- **覆盖悄悄缩水**：硬编码 series 清单、给 `_discover_series` 加白名单、或者只校验每个 category 的第一个 symbol，都会让新增周期目录（如后来加入的 `1mo`/`12h`）永远不被检查——这类改动的表象是「门禁变快了」，实质是失效。

判断「该登记还是该修」的口径也应记录：只有一两根的缺失走「修」（登记 `KNOWN_GAPS` → `backend/scripts` 回填 → 清空条目）；整段区间的缺失属数据工程范畴，登记 `STRUCTURAL_EXEMPTIONS` 且**不承诺回填**。若把后者也当成待修项，就会长期挂着一个永远修不完的红。

**边界约束（什么能做、什么禁止）**

- **禁止**在本门禁内写入/修复 `backend/data/parquet`：修数据属 `backend/scripts`（回填脚本）或数据工程（类型 A）的职责，测试层只读（来源: `openspec/changes/archive/2026-08-20-full-stack-e2e-test-suite/design.md` D4「A 类属数据工程范围，不在测试体系内回填」）。
- **必须**在失败输出中给出缺失区间明细（起止毫秒 + 步数），否则无法完成「登记 → 回填 → 清空」闭环（来源: `openspec/specs/e2e-data-integrity/spec.md`「微缺口硬性判定」）。
- **必须**保持「无 parquet 即 skip」而非 fail；但**禁止**把 skip 扩散到已发现 series 的断言上（来源: `openspec/specs/e2e-data-integrity/spec.md`）。
- 新增 series 若天然存在整段历史缺失，**只能**按精确区间登记 `STRUCTURAL_EXEMPTIONS`，并在注释写出可读的 UTC 时间与步数（现有条目均带 `# 2026-08-20 02:33 -> 2026-08-20 06:42 (249 steps)` 形式的说明）。
- 类型 B 缺口处理顺序固定：先登记 `KNOWN_GAPS`（让门禁可绿）→ 跑 `backend/scripts/backfill_micro_gaps.py` 回填 → **删除已修复条目**（来源: `backend/tests/data_registry.py` 模块 docstring）。
- **规格文字与实现存在已知偏差，以代码为准**：规格与两份 docstring 都把类型 B 描述为「缺失 1~2 步」，而 `_classify_gaps` 的实际判定是 `mult != 1 且 mult < TYPE_A_MIN_STEPS(5)`——即 **2、3、4 步均属类型 B（硬门禁）**。MUST NOT 按字面描述把 3~4 步改判为类型 A（那会把真实缺根放进「不要求回填」的结构性豁免，等于静默删掉一条门禁）；若确要收窄 B 的范围，必须**一次改掉四处**：`_classify_gaps` 判定式、`data_registry.is_exempt` 默认阈值、`backend/scripts/backfill_micro_gaps.py` 的同名副本、以及规格/`test_data_integrity.py` 与 `data_registry.py` 的「1~2 步」文字（来源: `openspec/specs/e2e-data-integrity/spec.md`「缺口三层分类」、`backend/tests/data_registry.py` 头注释）。
- 同理，`STRUCTURAL_EXEMPTIONS` 头部注释写「type A gaps: 14 across series」而字典实际是 **10 个 series 键 / 17 段区间**；统计口径一律以字典内容为准，不得拿注释数字做断言或校验脚本（来源: `backend/tests/data_registry.py`）。
- **「CI 上 L1 绿」不等于「数据已验证」**：`backend/data/parquet` 从未被 git 跟踪（`git ls-files backend/data` 为空），CI checkout 里根本没有数据，`.github/workflows/ci.yml` 的 L1 步骤注释也明写「skips w/o data」——因此 CI 的 `-m integrity` 必然整体 skip。L1 的真实执行点是本地 `cd backend && python -m pytest -m integrity`；不得为此把 skip 改成 fail（新克隆会永久红），也不得在文档中声称数据质量已由 CI 把关。
- **禁止**为了跑快而限定目录层级、只抽部分 series 或只每个 category 取首个 symbol：`_discover_series` 必须是 `category/symbol/timeframe` 三级全量自动发现（来源: `openspec/specs/e2e-data-integrity/spec.md`「全量 series 数据质量门禁」——枚举 SHALL 自动发现而非硬编码）。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/e2e-data-integrity/spec.md`（仅提炼需求摘要，非完整规范）

- 全量 series 数据质量门禁：SHALL 枚举 `data/parquet` 下全部 series，且枚举 SHALL **通过扫描目录自动发现，而非硬编码列表**；校验按 series 参数化展开。
- 时间戳序列：`open_time` SHALL 严格递增且无重复（等值或回退即失败）。
- OHLC 合法性：SHALL 满足 `high >= max(open,close)`、`low <= min(open,close)`、`volume >= 0` 且四价有限，违反即报告具体 series 与索引。
- 相邻 bar 周期对齐：间隔 SHALL 等于 `step_ms`，series 首尾窗口截断予以豁免。
- 缺口三层分类：A（≥5 步）登记 `STRUCTURAL_EXEMPTIONS` 并豁免，不要求回填；B（1~2 步）登记 `KNOWN_GAPS` 且白名单之外即失败并输出缺失区间明细；C（停滞 `now - 2*step`）仅在线子集，离线 SHALL skip。
- 白名单内微缺口豁免：SHALL 通过，且「白名单条目在数据修复后逐条移除」。
- 数值断言独立于缺口分类：升序 / 无重复 / OHLC 合法性 SHALL NOT 受任何豁免影响。
- 类型 B 步数口径：规格写「1~2 步」，实现（`mult < 5`）覆盖 2~4 步；两者已漂移，**以 `_classify_gaps` 为实现基准**，改分类阈值时需同步规格与三处常量副本。
- 「无数据即 skip」在 CI 上是常态：`backend/data/parquet` 未入库，CI 的 `-m integrity` 预期整体 skip，L1 的真实执行环境是本地（来源: `openspec/specs/ci-quality-gates/spec.md`、`.github/workflows/ci.yml`「L1 data integrity」步骤）。

**本节逐条来源对照**

> （来源: `openspec/specs/e2e-data-integrity/spec.md`）
