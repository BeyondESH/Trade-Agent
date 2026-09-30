---
type: "Fragment"
id: backend/tests/infra
title: "全栈 E2E 测试门禁层 / 测试基础设施与选择策略"
description: "测试跑不起来或跑得不确定时，如何隔离环境、播种数据、按 marker 分层选择用例？"
parent: /backend/tests/_overview.md
fragment: infra
entity_names:
  constants:
    - name: SEED_BASE
      value: "1700000000000"
      source: backend/tests/conftest.py
    - name: LIVE_BACKEND_ENV
      value: "MD_TEST_BACKEND"
      source: backend/tests/conftest.py
    - name: MD_TEST_SERVER_START_TIMEOUT
      value: "180（秒，环境变量可覆盖）"
      source: backend/tests/conftest.py
    - name: MD_DATA_DIR
      value: "<tmp>/（隔离数据目录）"
      source: backend/tests/conftest.py
    - name: MD_SCHEDULE_INTERVAL_SECONDS
      value: "0（关闭增量落盘调度）"
      source: backend/tests/conftest.py
    - name: MD_LOG_LEVEL
      value: "WARNING（L2 子进程日志级别）"
      source: backend/tests/conftest.py
    - name: seed_store 种子布局
      value: "BTCUSDT/1m=120 bar 无缺口；BTCUSDT/1h=72 bar 中部 3 步缺口(gap=(30,33))；ETHUSDT/1h=48；SOLUSDT/1h=48"
      source: backend/tests/conftest.py
    - name: live_server 种子布局
      value: "4 series：BTCUSDT/1m=120、BTCUSDT/1h=72(含 gap 30..33)、ETHUSDT/1h=48、SOLUSDT/1h=48；close=101+0.5*sin(idx/4)"
      source: backend/tests/conftest.py
    - name: --run-live
      value: "store_true, default False（L2 显式开关）"
      source: backend/tests/conftest.py
    - name: --run-online
      value: "store_true, default False（外网子集开关）"
      source: backend/tests/conftest.py
    - name: fail_under
      value: "80（覆盖率棘轮下界，实测基线 81%）"
      source: backend/pyproject.toml
retrieval_hints:
  - "测试为什么能在不联网的情况下跑通？fixture 是怎么隔离数据目录的？"
  - "live_server 是怎么启动 uvicorn 的，启动失败时怎么诊断？"
  - "pytest 怎么区分 L1/L2/在线用例，为什么 pytest -q 不会拉起 uvicorn？"
  - "想加一个需要真实外网的测试，该打哪个 marker？"
  - "新增的测试 fixture 逻辑必须放在 backend/tests/conftest.py，不可新建 conftest 或独立 fixture 包"
  - "⚠️ 如果你要找的是测试用例本身的行为契约，不在这里；去 tests_l1_integrity.md / tests_l2_live.md / tests_webapi_contract.md"
  - "⚠️ 如果你要找的是后端服务的 Settings 定义（MD_* 配置项），不在测试模块，在 backend/src 的 market_data.config"
  - "本模块也叫 E2E 测试套件 / test suite，对应需求中的「全流程测试体系」「三层金字塔」"
architectural_role: "测试基础设施；定义隔离与选择策略，禁止在此放置业务断言"
---

## 对外接口（测试运行契约）

| 契约 | 方向 | 关键字段 | 业务说明 | 入口符号 |
|------|------|---------|---------|---------|
| `pytest -q` | 开发者/CI → 本模块 | 无 | 单元回归：`live`/`online` 用例在收集期被 skip，且**不实例化** `live_server`（不启动 uvicorn） | `conftest.py:pytest_collection_modifyitems` |
| `pytest -m integrity` | 开发者/CI → 本模块 | `-m integrity`（marker 名） | L1 全量数据门禁；无 parquet 时整体 skip 而非失败 | `test_data_integrity.py:pytestmark` |
| `pytest -m live --run-live` | 开发者/CI → 本模块 | `--run-live` | L2 真实进程子集，全部用例共享同一个 session 级 `live_server` | `conftest.py:live_server` |
| `--run-online` | 开发者 → 本模块 | 布尔开关 | 启用需要外部网络（Bitget/BlockBeats）的用例；**CI 禁止传** | `conftest.py:pytest_addoption` |
| `MD_TEST_SERVER_START_TIMEOUT` | 环境变量 → 本模块 | 秒数（默认 `180`） | 覆盖 L2 冷启动就绪上限，用于慢机器/CI 调优 | `conftest.py:live_server` |
| `MD_TEST_BACKEND` | 环境变量 → L1 门禁 | base URL（默认 `http://127.0.0.1:8000`） | 类型 C 新鲜度断言的目标后端地址；探测不通即 skip | `test_data_integrity.py:_backend_healthy` |

## 跨模块依赖

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `backend/src`（market_data） | fixture 需要真实 `Settings` 隔离与真实 `ParquetStore` 落盘来生成确定性种子数据 | `Settings(data_dir=...)`、`ParquetStore.save`、`Series` | extracted |
| `backend/src`（webapi） | L2 fixture 以 `--factory` 方式拉起真实应用 | `market_data.webapi:create_app` | extracted |
| `httpx` | 就绪探测与健康检查（L1 无后端时依赖同一库） | `httpx.get("/health")` | extracted |
| `websockets` | L2 WS 用例的客户端库（fixture 本身不依赖） | `websockets.asyncio.client` | extracted |
| `pytest` | marker、fixture、collection hook、CLI option | `pytest_addoption`、`pytest_collection_modifyitems` | extracted |

> 反向依赖（谁使用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `test_live_api.py` | 全 REST 端点用例需要真实进程与种子数据 | `live_server`、`bitget_reachable` |
| `test_live_ws.py` | `/ws` 协议矩阵需要真实进程 | `live_server` |
| `test_data_integrity.py` | 需要 `Settings` 与 `ParquetStore`（不依赖 conftest，自建） | `Settings`、`ParquetStore` |
| `test_webapi.py` / 各离线单测 | 需要隔离 Settings（部分用例自建 tmp 目录，不共用 fixture） | `tmp_settings`（仅 `test_offline` 类用例间接复用） |
| `backend/scripts/backfill_micro_gaps.py` | 通过 `sys.path` 注入 `backend/tests` 后 import 注册表 | `data_registry.KNOWN_GAPS` |

## 典型调用链

### 普通回归（不发生重进程）
```
python -m pytest -q
  → conftest.py:pytest_addoption                      ← 注册 --run-live / --run-online
    → conftest.py:pytest_collection_modifyitems       ← 本模块入口
      → item.add_marker(skipif(...))                  ← live/online 用例在收集期被跳过
        → 仅离线用例执行（不实例化 live_server，不 spawn uvicorn）
```

### L2 真实进程
```
python -m pytest -m live --run-live
  → conftest.py:pytest_collection_modifyitems         ← marker 生效，跳过逻辑不介入
    → conftest.py:live_server                         ← 本模块入口（session 级，仅冷启动一次）
      → tmp_path_factory.mktemp("live-server-data")
        → ParquetStore.save（4 series 确定性种子）      ← 跨模块：backend/src market_data.store
          → conftest.py:_free_port → _spawn_live
            → subprocess: python -m uvicorn market_data.webapi:create_app --factory  ← 跨模块：webapi
              → conftest.py:_wait_for_ready
                → _backend_reachable(GET /health)      ← 权威就绪信号
                → _scan_log_for_bind("Uvicorn running on")  ← 加速/诊断信号
                  → yield base_url → teardown: terminate → wait(5) → kill → log_fh.close()
```

## 实现约束清单

> 实现本模块相关需求时，Agent 必须在动笔前逐条核对以下项。

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
|-------|----|---------|------|---------------------|
| `SEED_BASE` | `1700000000000` | `backend/tests/conftest.py` | 全部种子 bar 的时间基准（2023-11-14 22:13 UTC），保证跨用例可预期的 `open_time` 断言 | — |
| `LIVE_BACKEND_ENV` | `"MD_TEST_BACKEND"` | `backend/tests/conftest.py` | L1 新鲜度断言的后端地址环境变量名，与 `test_data_integrity.py` 内联读取的键必须一致 | 两处独立读取同一 env，改名会静默失配 |
| `MD_TEST_SERVER_START_TIMEOUT` | `180`（默认，可覆盖） | `backend/tests/conftest.py` | L2 就绪上限；规范要求「显著高于实测冷启动（约 38s）」，MUST NOT 使用固定 15s/45s | fix-live-test-order-flake：固定 45s 上限在 332 个前置单测后必然超时 |
| `MD_SCHEDULE_INTERVAL_SECONDS` | `"0"` | `backend/tests/conftest.py` | 关闭 L2 子进程的增量落盘调度，避免后台任务污染断言 | e2e-test-infra：调度器开启会让结果不确定 |
| `MD_LOG_LEVEL` | `"WARNING"` | `backend/tests/conftest.py` | 降低子进程日志噪声，同时保留 `Uvicorn running on` 加速信号 | e2e-test-infra「决策 1」的日志通道依赖 uvicorn 默认启动行 |
| `seed_store` 缺口参数 | `gap=(30, 33)` on `BTCUSDT/1h` | `backend/tests/conftest.py` | 唯一一段刻意制造的 3 步缺口，供 L1/L2 缺口逻辑复用；改动即改变下游断言的事实基础 | — |

> ⚠️ 上表中 `MD_*` 前缀参数是**测试进程的环境变量**，与生产 `Settings` 字段同名但语义由 fixture 决定；测试里改这些值前先确认生产侧同名配置的默认值。

### 必须实现的函数

| 函数名 | 所在文件 | 说明 |
|--------|---------|------|
| `_free_port()` | `backend/tests/conftest.py` | 以 bind(port=0) 方式获取 ephemeral 端口，**不得改为硬编码端口**（与 vite proxy 的 8000 冲突） |
| `_spawn_live(env, port)` | `backend/tests/conftest.py` | 启动 uvicorn 并显式持有日志句柄；`cwd` 必须是 `backend/`，否则 `market_data` 不可导入 |
| `_wait_for_ready(base, proc, log_path, timeout)` | `backend/tests/conftest.py` | 双通道自适应就绪判定；必须支持「子进程提前退出 → 快速失败」，禁止空等到上限 |
| `_read_log_tail(log_path, limit=3000)` | `backend/tests/conftest.py` | 失败诊断载荷；`pytest.fail` 必须包含 elapsed / `proc.poll()` / base URL / 日志尾部 |
| `pytest_collection_modifyitems(config, items)` | `backend/tests/conftest.py` | 在**收集阶段**跳过 live/online 用例；这是「普通回归不启动重型子进程」的唯一实现点 |
| `pytest_addoption(parser)` | `backend/tests/conftest.py` | 注册 `--run-online` / `--run-live`；新增开关必须与 marker 语义对称 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 就绪判定通道 | `/health` 权威信号 + 日志 `Uvicorn running on` 加速信号，任一命中即就绪 | 只轮询 `/health`（无加速、无法区分未绑定/未启动）；只解析日志（脆弱、受日志级别影响） | 双通道既快又可诊断；日志失配时退化为纯轮询，不影响正确性 |
| 就绪等待上限 | 自适应上限 + 命中即返回（默认 180s，env 可覆盖） | 固定 45s（受负载影响必然抖动）；调大固定值（失败时反馈慢）；sessionstart 预热导入（拖慢全部单测） | 冷启动本质是重型依赖导入耗时，固定值不可能稳健 |
| L2 默认行为 | `live` marker + `--run-live` 显式触发，默认在收集期跳过 | 只加 marker 不默认跳过（`pytest -q` 仍慢且不稳）；用 `addopts = -m "not live"`（命令行 `-m` 覆盖语义隐蔽） | 彻底解耦单元回归与 L2，使 `pytest -q` 快速确定可复现 |
| 端口分配 | ephemeral（`bind(port=0)`） | 固定 8000 | 与 vite proxy 的 8000 冲突；L2 直连真实端口、L3 用 8000，两者靠不同 fixture 并存 |
| 种子数据写入方式 | 直接调用 `ParquetStore.save` | 走 ingest API | 保证确定性、不触发外部网络与调度 |
| 覆盖率统计的位置 | CI 独立 step `pytest -q --cov=market_data --cov-report=term-missing` | 写成 `addopts = --cov`（每次运行都附带覆盖率） | `addopts` 会让上一步的 `pytest -m integrity` 也被同一覆盖率基线考核，L1 跑完即错；来源: `.github/workflows/ci.yml` 覆盖率步骤注释 |

## 变更风险与边界约束

### 背景与权衡（为什么只能这样组织）

L2 的真实进程测试同时面对三个互相冲突的诉求：结果确定、跑得够快、失败能解释清楚。把「等够时间」当成稳定性来源是错的——进程就绪时间由依赖导入量决定（vectorbt / sklearn / numba 是主要成本），它会随机器负载与同一会话内的执行阶段漂移。因此这里把稳定性拆成三个正交机制：**环境隔离**（数据目录、日志级别、关闭调度器，决定「测什么」不随机器变）、**分层选择**（marker + 收集期跳过，决定「什么时候测」）、**自适应等待 + 结构化诊断**（决定「失败时说什么」）。三者不能互相替代：只把超时调大并不能让 `pytest -q` 可复现，因为它仍会启动子进程、仍会与前面的用例争抢同一台机器的 IO 与端口资源；只加 marker 而不做收集期跳过也一样会实例化重型 fixture；只做跳过而不保留诊断，失败就会退化成「红了但没人知道为什么」。

同样的道理适用于失败信息的落点：诊断必须进 `pytest.fail` 的载荷，而不是只写日志——CI 上没人会去翻子进程日志文件，「日志里明明写着已启动、结果却报失败」正是这一带曾经的误导源（来源: `openspec/changes/archive/2026-09-20-fix-live-test-order-flake/design.md` 决策 1/3/4/5）。

本文件还有一处容易被无声改坏的隐含边界：**种子数据必须同时包含健康段与病态段**。完整 series 供正向读路径断言，带 3 步缺口的 `BTCUSDT/1h` 供缺口/回填路径断言。若有人为了让 L2「更干净」把种子改成全连续，被削弱的是缺口检测路径本身，而且不会有任何用例报错——这类「改完仍然全绿」的退化比红灯更危险，改动本文件时 SHALL 逐条核对每个 series 的形状与原意。

至于 `_run_all()` 式的 `python tests/test_x.py` 直跑入口：它保留下来是为了在没装 pytest 的环境里做最小冒烟，但它**不是**并行安全的（临时目录由用例自行创建，marker 门控完全失效），因此文档与 CI 的唯一推荐入口始终是 `python -m pytest ...`。



**变更风险（改动本子模块会破坏什么）**

- 删除或失效 `pytest_collection_modifyitems` 中的跳过逻辑 → `python -m pytest -q` 会隐式拉起真实 uvicorn 子进程，重现历史故障「332 passed, 47 errors，47 个 error 全是 live server failed to start」；同时单元回归从「快而确定」退化为「受机器负载与执行顺序影响」。
- 把 `_wait_for_ready` 的固定上限调回小值或移除 `MD_TEST_SERVER_START_TIMEOUT` → 慢机器上 L2 假失败，且失败信息丢失 `elapsed` / `poll()` / 日志尾部，无法区分「没启动」「启动慢」「端口被占」。
- 修改 `seed_store` 的 series 布局（如把 `BTCUSDT/1h` 改成无缺口）→ 依赖该缺口的断言（L2 的 `/candles` 与完整性语义、部分回填用例）会失去事实基础，可能出现「测试通过但不再验证缺口路径」的假绿。
- 改 `_free_port()` 为固定端口 → 与本地已运行的后端或 L3 的 8000 端口冲突，L2 变成环境依赖型测试。
- 在 fixture 里 import 重型应用模块于 collection 阶段 → 全部单测会话变慢（这是被明确拒绝的 `sessionstart` 预热方案）。

**边界约束（什么能做、什么禁止）**

- **禁止**为让测试变绿而修改 `backend/src/**`：fix-live-test-order-flake 的 Non-Goals 明确「不优化应用启动耗时」，只允许改测试基础设施与文档（来源: `openspec/changes/archive/2026-09-20-fix-live-test-order-flake/design.md`）。
- **必须**保持 fixture 的隔离性：所有落盘必须指向 `tmp_path`/`tmp_path_factory`，**禁止**在测试中写入生产 `data/parquet`（L1 只读校验）。
- **必须**保留 teardown 的确定性清理：`terminate → wait(timeout=5) → kill → wait`，并显式 `log_fh.close()`——Windows 下未关闭的文件句柄会阻止临时目录清理，kill 后不 wait 会残留孤儿进程。
- **必须**在收集期完成跳过（而非用 fixture 内 `skip`），否则重型 fixture 仍会被实例化（来源: `openspec/specs/e2e-test-infra/spec.md`「L2 用例选择策略」）。
- **禁止**在 CI 传 `--run-online`：`online` 用例在外网不可达时必须 skip 而非失败（来源: `openspec/specs/ci-quality-gates/spec.md`）。
- 覆盖率阈值**只升不降**：`fail_under` 必须基于实测基线向下取整，不得采用猜测值，也不得为了让某个改动过门禁而下调。
- 测试文件自身同受静态检查门禁：`backend/tests/**` 在 ruff（lint + format，line-length=100，select `E,F,I,UP,B`）与 `.pre-commit-config.yaml` 钩子覆盖范围内，未格式化的断言会在 CI 第一步就挂；能一次性清理的不得用规则级 `ignore` 掩盖，确需忽略须带原因注释（来源: `openspec/specs/ci-quality-gates/spec.md`「后端静态检查（ruff）」）。
- **L3 不进入 CI**：Playwright 旅程需要每次下载浏览器且远慢于单测，因此本模块的 CI 口径不包含 `npm run test:e2e`；它仍是全量回归的必要一环，必须本地执行，不得在文档里写成「CI 已覆盖」（来源: `.github/workflows/ci.yml` 顶部注释）。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/e2e-test-infra/spec.md`、`openspec/specs/ci-quality-gates/spec.md`（仅提炼接口摘要，非完整规范）

- **live_server 启动与自适应就绪**：session 级 fixture，隔离数据目录 + 关闭增量调度 + yield `http://127.0.0.1:{port}`；就绪 MUST 双通道（`/health` 权威 + 日志加速），上限 MUST 显著高于冷启动（默认 ≥120s）且可通过环境变量覆盖，命中即返回并记录 elapsed（来源: `openspec/specs/e2e-test-infra/spec.md`）。
- **失败诊断契约**：就绪超时 MUST fail 并携带 elapsed / `poll()`（含退出码）/ base URL / 日志尾部；子进程提前退出 MUST 快速失败（来源: `openspec/specs/e2e-test-infra/spec.md`）。
- **确定性清理**：`terminate → 有限时间 wait → kill → wait`，并关闭日志句柄，MUST NOT 残留孤儿进程（来源: `openspec/specs/e2e-test-infra/spec.md`）。
- **L2 选择策略**：L2 模块 SHALL 声明 `live` marker；未传 `--run-live` 时 MUST 在 collection 阶段跳过且不实例化 `live_server`；传入时全部 `live` 用例共享同一 `live_server` 实例（来源: `openspec/specs/e2e-test-infra/spec.md`）。
- **命令矩阵一致性**：`AGENTS.md`/`README.md` MUST 记录与 marker 策略一致的命令，且不得保留会隐式失败或与实现不符的 L2 命令（来源: `openspec/specs/e2e-test-infra/spec.md`）。
- **后端 CI marker 矩阵**：CI SHALL 执行 `pytest -q` 与 `pytest -m integrity`，并以独立 job 执行 `pytest -m live --run-live`；MUST NOT 传 `--run-online`；依赖安装 MUST `uv sync --frozen`（来源: `openspec/specs/ci-quality-gates/spec.md`）。
- **后端覆盖率门禁**：SHALL 生成 `pytest-cov` 报告（`source=["market_data"]`）并配置初始 `fail_under`；初始阈值 MUST NOT 高于实测基线，且文档 MUST 记录「只升不降」棘轮策略（来源: `openspec/specs/ci-quality-gates/spec.md`）。
- **后端静态检查**：ruff（lint+format）覆盖 `backend/` 源码与测试；无法一次性清理的告警 SHALL 用规则级 `ignore` 或单点 `# noqa`（附原因），MUST NOT 直接关闭整个规则而不留说明（来源: `openspec/specs/ci-quality-gates/spec.md`）——`backend/pyproject.toml` 中 `B008` 的 ignore 注释即该约束的落地样例。
- **本地与 CI 工具一致**：仓库 SHALL 提供 `.pre-commit-config.yaml`（后端 ruff + 前端 Biome），钩子所用工具与版本 SHALL 与 CI 一致，避免「本地绿、CI 红」（来源: `openspec/specs/ci-quality-gates/spec.md`「pre-commit 与 CI 一致」）。
- **CI job 结构（实测代码）**：后端主 job = ruff lint → ruff format check → `pytest -q` → `pytest -m integrity` → 覆盖率独立 step；L2 = 独立 job（`pytest -m live --run-live`）以拿到干净的进程环境；顶部注释固化了 marker 矩阵并声明 Playwright E2E 有意不入 CI（来源: `.github/workflows/ci.yml`）。

**本节逐条来源对照**

> （来源: `openspec/specs/e2e-test-infra/spec.md`）
> （来源: `openspec/specs/ci-quality-gates/spec.md`）
> （来源: `.github/workflows/ci.yml`、`.pre-commit-config.yaml`）
