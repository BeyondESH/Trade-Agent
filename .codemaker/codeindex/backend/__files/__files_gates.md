---
type: "Fragment"
id: "backend/__files/gates"
title: "质量门禁与仓库卫生"
description: "这个改动会被 CI 拦下来吗？覆盖率阈值、ruff 规则、测试分层和忽略规则各自管什么？"
parent: /backend/__files/_overview.md
fragment: gates
architectural_role: "质量门禁配置层（CI 与本地的同一把尺子）+ 版本控制边界"
entity_names:
  constants:
    - name: COVERAGE_FAIL_UNDER
      value: "80"
      source: backend/pyproject.toml [tool.coverage.report]
    - name: COVERAGE_BASELINE
      value: "81%（引入时实测；356 项单测，`pytest -q -m \"not integrity and not live and not online\"`）"
      source: backend/pyproject.toml（[tool.coverage.report] 上方棘轮注释）
    - name: COVERAGE_SOURCE
      value: '["market_data"]'
      source: backend/pyproject.toml [tool.coverage.run]
    - name: COVERAGE_BRANCH
      value: "false（只测行覆盖，不测分支覆盖）"
      source: backend/pyproject.toml [tool.coverage.run]
    - name: RUFF_LINE_LENGTH
      value: "100"
      source: backend/pyproject.toml [tool.ruff]
    - name: RUFF_TARGET_VERSION
      value: "py311"
      source: backend/pyproject.toml [tool.ruff]
    - name: RUFF_SELECT
      value: '["E", "F", "I", "UP", "B"]'
      source: backend/pyproject.toml [tool.ruff.lint]
    - name: RUFF_IGNORE
      value: '["B008"]（function-call-in-default-argument，因 FastAPI Depends()/Body() 惯用法）'
      source: backend/pyproject.toml [tool.ruff.lint]
    - name: RUFF_EXTEND_EXCLUDE
      value: '["src/market_data/_vendor"]（该目录当前不存在，属预置豁免）'
      source: backend/pyproject.toml [tool.ruff]
    - name: MARKER_INTEGRITY
      value: "integrity: full parquet data quality gate (L1)"
      source: backend/pyproject.toml [tool.pytest.ini_options].markers
    - name: MARKER_LIVE
      value: "live: real-process API/WS tests against a spawned uvicorn (L2)"
      source: backend/pyproject.toml [tool.pytest.ini_options].markers
    - name: MARKER_ONLINE
      value: "online: tests that require external network (Bitget/BlockBeats), skipped when unreachable"
      source: backend/pyproject.toml [tool.pytest.ini_options].markers
    - name: PYTEST_TESTPATHS
      value: '["tests"]'
      source: backend/pyproject.toml [tool.pytest.ini_options]
    - name: GITIGNORE_BACKEND
      value: ".venv/ · data/ · __pycache__/ · *.pyc · .env"
      source: backend/.gitignore
    - name: GITIGNORE_ROOT_CARRIERS
      value: ".pytest_cache/ · .ruff_cache/ · .coverage · coverage.json · htmlcov/ · coverage/"
      source: .gitignore（仓库根，backend 下的同名产物由它兜住）
    - name: PRECOMMIT_RUFF_REV
      value: "v0.16.8（须与 uv.lock 中 ruff 版本一致）"
      source: .pre-commit-config.yaml
retrieval_hints:
  - "什么改动会被 CI 拦下？后端的 lint 规则集是哪几条？"
  - "覆盖率阈值能不能降？降到多少算违约？"
  - "为什么 `python -m pytest -q` 不会启动那个很重的 uvicorn 子进程？"
  - "L1 数据完整性门禁在全新克隆上为什么不报错？"
  - "该不该把某个生成文件提交进仓库？谁负责把它挡住？"
  - "⚠️ 如果你要找的是**测试用例本身的断言逻辑**（gap 白名单、fixture、端点断言），不在这里 → 在 `.codemaker/codeindex/backend/tests/`（`tests_infra.md`、`tests_l1_integrity.md`、`tests_l2_live.md`）；本模块只声明 marker 与阈值这些「分层口径」。"
  - "⚠️ 如果你要找的是前端门禁（Biome、vitest coverage、Playwright E2E），不在这里 → 在 `frontend/__files` 与 `frontend/tests`；两端的棘轮策略同名但阈值与工具不同。"
  - "本模块也叫「CI 门禁配置」「lint 配置」「测试分层开关」「忽略规则」，对应需求里的「加上质量门」「这个文件不要入库」。"
  - "架构归属句：后端的 lint / 格式化 / 覆盖率 / 测试分层配置一律写在 `backend/pyproject.toml`；禁止新建 `setup.cfg`、`ruff.toml`、`pytest.ini`、`.coveragerc` 等旁路配置文件，也不得用 CI 命令行参数覆盖这些阈值。"
---

## 对外接口（如有协议/RPC/事件则必填）

本子模块无运行时协议接口。它的对外契约是**门禁契约**：以下四条命令在 `backend/` 目录（或 CI）里执行时的行为，就是本模块对外承诺的全部内容。

| 契约项 | 方向 | 关键字段 | 业务说明 | 断言位置 |
|--------|------|---------|---------|---------|
| 单元回归（L0/L3 单测） | 开发者/CI→pytest | marker `live`/`online` 自动跳过 | 快速保持绿色，不拉起重型子进程、不依赖外网 | `pytest -q`（`pyproject` markers + `tests/conftest.py:addopts`） |
| L1 数据完整性门禁 | 开发者/CI→pytest | marker `integrity` | 校验 `data/parquet` 全量 series：时间戳单调、OHLC 合法、周期对齐、缺口白名单 | `pytest -m integrity` |
| L2 真实进程门禁 | CI→独立 job | marker `live` + `--run-live` | 共享单个 `live_server` 实例，跑全 REST/WS 端点 | `pytest -m live --run-live`（CI 独立 job） |
| 覆盖率棘轮 | CI→pytest-cov | `COVERAGE_FAILUNDER=80`、`COVERAGE_SOURCE=["market_data"]` | 低于阈值即非零退出码，阻断合入 | `pytest -q --cov=market_data --cov-report=term-missing` |
| 静态检查 | CI/pre-commit→ruff | line-length 100；规则族 `E,F,I,UP,B` | 未修复的 lint 错误阻断；格式化不一致阻断 | `ruff check .` + `ruff format --check .` |
| 版本控制边界 | git→工作区 | `.gitignore`（backend 层 + 仓库根层叠加） | 虚拟环境/数据/缓存/凭据不入库 | `backend/.gitignore`、`.gitignore` |

## 业务意图

这一组配置解决的业务问题是：**如何保证"能力做完了"这件事不被单方面宣称**。后端同时对外提供行情、回测、风控执行与 AI Agent 决策，任何一处静默退化（少测一条分支、 lint 错误绕过、把 300MB 的 Parquet 数据提交进仓库、把 `.env` 里的 Key 推上公开仓库）造成的损失都远大于一个功能缺陷：前者会让后续所有改动失去可比性，后者会直接泄漏凭据或让仓库不可用。因此本模块把"质量下限"和"入库边界"从口头约定变成**可执行断言**：marker 声明让三层测试各自可寻址、`fail_under` 让覆盖率只升不降、ruff 规则集让风格不再靠讨论、`.gitignore` 让凭据与产物不可能被顺手提交。

同时它必须保证**本地与 CI 是同一把尺子**：pre-commit 用的 ruff 版本与 `uv.lock` 里的 ruff 一致（当前 `v0.16.8`，配置文件注释已把这条同步义务写明），否则会出现"本地绿、CI 红"的信任损耗。（来源: openspec/specs/ci-quality-gates/spec.md）

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
|-------|----|---------|------|---------------------|
| `COVERAGE_FAIL_UNDER` | `80` | `backend/pyproject.toml` | 覆盖率闸口。**棘轮策略"只升不降"**：初始阈值 = 实测基线 81% 向下取整到 5 的倍数；未来只允许上调 | 注释明示 + spec「阈值 MUST NOT 高于实测基线、「只升不降」须写入文档」（来源: openspec/specs/ci-quality-gates/spec.md） |
| `COVERAGE_SOURCE` | `["market_data"]` | `backend/pyproject.toml` | 覆盖率统计范围只算后端包本体；CI 命令行 `--cov=market_data` 与之重复但必须一致 | CI 强制读取 pyproject 的 `fail_under`（`.github/workflows/ci.yml`） |
| `RUFF_IGNORE.B008` | `B008` 豁免 | `backend/pyproject.toml` | 因 FastAPI 惯用法 `Depends()` / `Body()` 作为默认参数值而豁免；**收敛计划：全部改为 `Annotated` 风格后重新启用** | spec「无法一次清理的告警 SHALL 以规则级 ignore 或带原因 `# noqa` 处理，配置文件 SHALL 含例外原因与收敛计划」（来源: openspec/specs/ci-quality-gates/spec.md） |
| `RUFF_SELECT` | `E,F,I,UP,B` | `backend/pyproject.toml` | pycodestyle 错误、pyflakes、import 排序、pyupgrade、bugbear 五族；未列出的规则**不受保障** | 规则集显式声明是 spec 要求 |
| `MARKER_LIVE` | `live` | `backend/pyproject.toml` | L2 分层锚点：未传 `--run-live` 时 **collection 阶段跳过**，不实例化 `live_server` | spec 明确要求（来源: openspec/specs/e2e-test-infra/spec.md） |
| `MARKER_INTEGRITY` | `integrity` | `backend/pyproject.toml` | L1 全量 Parquet 质量门禁锚点；**无数据时跳过（而非失败）** | 三层测试金字塔 + 数据不入库（见下 `.gitignore` 条） |
| `MARKER_ONLINE` | `online` | `backend/pyproject.toml` | 需外网（Bitget / BlockBeats）的子集；默认跳过，**CI 永不传 `--run-online`** | spec「online 保持跳过」（来源: openspec/specs/ci-quality-gates/spec.md） |
| `GITIGNORE.backend/.env` | `.env` | `backend/.gitignore` | 真实凭据文件不得入库（`BB_API_KEY`、`BITGET_*` 都在这里） | 凭据 **MUST** 仅从环境变量读取（来源: openspec/specs/system-architecture/spec.md） |
| `GITIGNORE.backend/data/` | `data/` | `backend/.gitignore` | Parquet/Excel/缓存全部落盘物不入库；**代价是 L1 门禁在全新克隆上跳过** | 仓库体积与 diff 噪声（来源: openspec/specs/repo-hygiene/spec.md） |
| `PRECOMMIT_RUFF_REV` | `v0.16.8` | `.pre-commit-config.yaml` | 钩子工具/版本须与 CI 一致，注释已要求与 `uv.lock` 中 ruff 保持同步 | spec「钩子使用的工具与版本 SHALL 与 CI 保持一致」（来源: openspec/specs/ci-quality-gates/spec.md） |

### 必须实现的函数

> 不适用：本子模块无函数。但存在两条"必须有的命令"——CI 必须执行 `ruff check .` / `ruff format --check .`（后端静态门禁）与 `pytest -q --cov=market_data`（覆盖率断言）；缺任一条即等于把阈值配置变成装饰品。

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| L2 是否并入默认回归 | **否**：`live` 默认在 collection 阶段跳过，需 `--run-live` 显式开启，且 CI 放独立 job | 全量常跑 | L2 要拉起真实 uvicorn 子进程，冷启动以十秒计；并入主 job 会让每次提交的反馈变慢，且失败原因（端口/冷启动）与代码无关（来源: openspec/specs/e2e-test-infra/spec.md） |
| 外网用例如何计入门禁 | `online` 标记 + 永不传 `--run-online`（离线只跳过，不失败） | 直接不写这类用例 / 让外网失败即红 | 既要保留真实连通性的验证入口，又不能让外部服务抖动阻断合入（来源: openspec/specs/ci-quality-gates/spec.md） |
| 覆盖率计量方式 | 行覆盖（`branch = false`）、按包（`source = ["market_data"]`） | 分支覆盖 | 分支覆盖会立刻把阈值压到基线以下，导致要么调低阈值要么大面积补测；先按行覆盖建立棘轮基线 |
| 既有 lint 告警如何消化 | 保留规则集、对**单条规则**豁免并写下收敛计划（`B008`） | 关闭整条规则 / 全仓一次性改写 | 整条规则关闭不可追溯；全仓改写会把功能 diff 淹没在风格 diff 里（来源: openspec/specs/ci-quality-gates/spec.md） |
| 阈值配置放哪 | 全部集中在 `backend/pyproject.toml` | `.ruff.toml` / `.coveragerc` / `pytest.ini` 分文件 | 一处看全"这个后端的质量口径"，且 CI 只需 `uv run` 即可复用同一份配置 |
| 忽略规则分层 | backend 层只写后端特有的（`.venv/ data/ .env __pycache__/ *.pyc`），工具缓存与覆盖率产物由**仓库根**统一兜住 | 在 `backend/.gitignore` 重复列全 | 避免多处双写；代价是删根规则会同时波及前后端（见变更风险） |

## 变更风险

> 改动这些配置会破坏什么：

- **调低 `fail_under` 违约、调高到高于实测值即 CI 立即红**。阈值由 CI 的 `pytest --cov` 强制执行（不是只出报告），所以它是一个"数字即政策"：只能随基线上升而下调整到**已实测过**的更低位，且必须在 PR 说明里写明基线。把阈值调高到未达到的数字，等价于亲手阻断所有人合入。（来源: openspec/specs/ci-quality-gates/spec.md）
- **删掉或改错 marker 声明会同时破坏三层测试金字塔与文档承诺**：移除 `live` 后，`--run-live` 的选择策略失去锚点，主回归 job（或本地 `pytest -q`）可能拉起重型子进程，表现为"测试随机变慢/偶发端口冲突"；移除 `integrity` 后，L1 的门禁语义与 `KNOWN_GAPS` 硬断言不再可独立寻址。AGENTS.md / README 里记录的命令矩阵必须与实现一致，这本身是规格要求。（来源: openspec/specs/e2e-test-infra/spec.md）
- **给 CI 增加 `--run-online` 会让门禁依赖外部服务**：Bitget / BlockBeats 不可达时应跳过而非失败（"never fail"是标记定义的一部分），否则门禁失去可信度。
- **删掉 `backend/.gitignore` 的 `.env` 条目，是一次凭据泄漏事故**：`.env` 内含 `BB_API_KEY` 与预留的 `BITGET_*` 三件套；一旦入库即不可撤回（需要重写历史）。这是本模块后果最重的一行。
- **忽略规则是分层的，删错地方会双向出问题**：`backend/.pytest_cache/`、`.ruff_cache/`、`.coverage`、`coverage.json` **不在 `backend/.gitignore` 里**，它们由仓库根 `.gitignore` 兜住。① 删根条目 → 前后端的缓存/覆盖率产物一起变成未跟踪噪声，违反「`.gitignore` SHALL 覆盖本地工具与 CI 产物」；② 反过来误删 `backend/.gitignore` 的 `data/` → 大量 Parquet/Excel 会被 git 看到，仓库体积失控。（来源: openspec/specs/repo-hygiene/spec.md）
- **`RUFF_EXTEND_EXCLUDE` 指向了一个当前不存在的目录**（`src/market_data/_vendor`）：这是**预置豁免**。一旦有人真的把第三方代码放进该目录，它就会**绕过 lint 与格式化，但仍计入覆盖率统计**——即"不受风格约束、却会左右 `fail_under`"的不利组合。放代码进 `_vendor`（或改用 `_vendor`  vendoring）属于架构决策，必须显式评审，不能当作省事手段。
- **把 ruff 版本随 `uv.lock` 升级，却不同步 `.pre-commit-config.yaml` 的 `rev`**，会让本地修复与 CI 判定不一致（新版本可能引入新规则或改动默认行为），产出"本地改了 CI 还红"或"本地过了 CI 才红"的循环。（配置文件注释已写明同步义务）
- **移除 `B008` 豁免而不把 FastAPI 依赖改为 `Annotated` 风格**，会让所有 `Depends()` / `Body()` 默认值一次性报错，CI lint 直接红；正确路径是先迁移、后恢复规则（豁免注释里的 ratchet plan）。
- **把静态检查或覆盖率从 CI 命令行里去掉**（而不是从 pyproject），会造成"配置还在、门禁已失效"的隐性退化——阈值变成装饰品比没有阈值更危险。
- **L1 门禁在干净环境上会跳过**（数据不入库），因此"CI 绿"不代表真实数据没问题；数据相关的改动必须在有 `data/parquet` 的环境上本地补跑一次 `pytest -m integrity`。

## 边界：允许做什么、禁止做什么

> 判定原则：**阈值只能变严且必须基于实测；门禁只能加、不能隐性失效；忽略规则只能收紧理由、不能无人知晓地破口。** 这三个方向的要求均写在规格里而非团队习惯，因此任何一处放松都必须以“改规格”的方式落地，而不是只改一个数字。（来源: openspec/specs/ci-quality-gates/spec.md、openspec/specs/repo-hygiene/spec.md）

- **允许**：在补充大量测试后**上调** `fail_under`（棘轮只升不降）。
- **禁止**：下调 `fail_under` 来让 CI 变绿；也禁止用 CI 命令行参数绕开泵口（例如另跑一条不带 `--cov=market_data` 的 pytest，使 `fail_under` 不被读到）。
- **禁止**：新增规则级 `ignore` 而不带“原因 + 收敛计划”注释——现存唯一豁免是 `B008`，其注释已注明原因（FastAPI `Depends()`/`Body()` 惯用法）与收敛计划（全量迁到 `Annotated` 风格后重新启用）。（来源: openspec/specs/ci-quality-gates/spec.md）
- **允许**：把新用例挂到已有 marker（`integrity` / `live` / `online`）上；**禁止**新增未声明的自定义 marker，也禁止把重型 L2 用例标成普通用例——后者会让 `pytest -q` 直接拉起 uvicorn 子进程。（来源: openspec/specs/e2e-test-infra/spec.md）
- **禁止**：让 `online` 用例在离线时 fail（只能 skip）；也禁止在 CI 任何 job 传 `--run-online`。（来源: openspec/specs/ci-quality-gates/spec.md）
- **允许**：在 `data/` 已被忽略的前提下把 `MD_DATA_DIR` 指向仓库内目录（默认 `./data`）；**禁止**把 `data/` 或任何生成型产物加入版本控制（包括 `git add -f`）。（来源: openspec/specs/repo-hygiene/spec.md）
- **禁止**：把源代码放进 `src/market_data/_vendor` 以绕过 lint；该目录当前不存在，只是预置豁免点，放代码进去属于需显式评审的架构决策。
- **禁止**：把阈值/规则/ marker 声明搬到 `setup.cfg`、`ruff.toml`、`pytest.ini`、`.coveragerc` 等旁路文件，使 CI 不再通过 pyproject 读同一份口径。

## 跨模块依赖

> 实现本子模块功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `.github/workflows` | 门禁的执行者：Python 3.11 + `uv sync --frozen` → `ruff check/format --check` → `pytest -q` / `-m integrity` / `--cov`；L2 独立 job；**永不传 `--run-online`** | `ci.yml` 各 step | extracted |
| `backend/tests` | marker 的实际声明处（用例上）与 `--run-live` / `--run-online` 选项的实现处；`KNOWN_GAPS` / `STRUCTURAL_EXEMPTIONS` 白名单决定 L1 断言强度 | `conftest.py`（`pytest_addoption`、跳过逻辑）、`data_registry.py` | extracted |
| `backend/src` | 被统计与被 lint 的对象：代码风格改动会体现在 `ruff format --check`，新增未覆盖分支会体现在 `fail_under` | `market_data` 包 34 个模块 | extracted |
| `.pre-commit-config.yaml`（仓库根） | 与 CI 同源的门禁副本；ruff 版本须与 `uv.lock` 一致 | `rev: v0.16.8`（backend 段 `files: ^backend/`） | extracted |
| `openspec` | 门禁矩阵、棘轮策略、忽略规约与文档一致性的规范来源 | `ci-quality-gates`、`repo-hygiene`、`e2e-test-infra` | extracted |
| `README.md` / `AGENTS.md` | 命令矩阵的对外承诺面（三条命令 + 两个开关），必须与 marker 实现一致 | 「测试 / 质量门」小节 | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `backend/tests` | 通过 `pytest` 读取 `[tool.pytest.ini_options]` 与 `[tool.coverage.*]` 决定分层与闸口 | `markers`、`testpaths`、`fail_under` |
| `.github/workflows` | 每次 push / PR 都执行一次由本模块定义的判定命令 | — |
| `frontend/tests`（对照） | 前端用同类"覆盖率棘轮 + lint/format 门禁"但换工具与阈值；修改任一侧时需保持策略口径一致，以免只在一端出现装饰性阈值 | Biome / vitest thresholds |
| `backend/scripts` | 脚本文件位于 `^backend/` 的 ruff 匹配范围内（pre-commit），因此一次性脚本改动同样受 lint 约束 | — |

## 典型调用链

> 1–3 条功能入口到本模块的调用路径（函数名链，不写代码）。

### 一次提交被拦截的完整路径
```
git commit（本地）
  → .pre-commit-config.yaml: ruff-check --fix / ruff-format（files: ^backend/）   ← 本模块配置被消费
    → git push → .github/workflows/ci.yml: backend job                            ← 跨模块：.github/workflows
      → uv sync --frozen（校验 uv.lock）                                          ← 跨模块：backend/__files/deps
        → uv run ruff check . → uv run ruff format --check .                      ← 本模块：RUFF_SELECT / B008 豁免
          → uv run pytest -q（live/online 自动跳过）→ -m integrity → --cov=market_data ← 跨模块：backend/tests
            → fail_under=80 判定 → 非零退出码即阻断合入                            ← 本模块闸口
```
> 边界：本地与 CI 用同一套规则与同一版本的 ruff；任一处偏离即"门禁不可信"。（来源: openspec/specs/ci-quality-gates/spec.md）

### L2 分层的生效路径
```
uv run pytest -m live --run-live（CI 独立 job）
  → backend/pyproject.toml: [tool.pytest.ini_options].markers 声明 `live`          ← 本模块入口
    → backend/tests/conftest.py: pytest_addoption(--run-live) + collection 阶段跳过 ← 跨模块：backend/tests
      → live_server fixture 启动真实 uvicorn（MD_DATA_DIR=<tmp>, MD_SCHEDULE_INTERVAL_SECONDS=0） ← 跨模块：backend/__files/env
        → teardown terminate → wait → (超时) kill                                   ← 跨模块：backend/tests
```
> 边界：**不传 `--run-live` 时 `live` 用例必须跳过且不得启动子进程**；marker 声明若缺失则默认 `pytest -q` 会污染主 job。（来源: openspec/specs/e2e-test-infra/spec.md）

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/ci-quality-gates/spec.md`、`openspec/specs/repo-hygiene/spec.md`、`openspec/specs/e2e-test-infra/spec.md`（仅提炼与门禁/卫生相关的条目，非完整规范）

- 仓库 **SHALL** 提供在 push 与 PR 触发的 GitHub Actions 工作流，至少含后端 job 与前端 job；后端 **SHALL** 用 Python 3.11；CI **SHALL NOT** 依赖 `online` 用例成功。（来源: openspec/specs/ci-quality-gates/spec.md）
- 后端 CI **SHALL** 执行 `python -m pytest -q` 与 `python -m pytest -m integrity`，并以独立 job 执行 `python -m pytest -m live --run-live`，**SHALL NOT** 传入 `--run-online`。（来源: openspec/specs/ci-quality-gates/spec.md）
- ruff（lint + format）**SHALL** 作为静态检查门禁覆盖 `backend/` 的源码与测试；规则集 **SHALL** 显式声明；无法一次性清理的既有告警 **SHALL** 通过规则级 `ignore` 或带原因的 `# noqa` 处理，**SHALL NOT** 直接关闭整条规则而不留说明；CI **SHALL** 以非零退出码阻断未修复的 lint 错误。（来源: openspec/specs/ci-quality-gates/spec.md）
- 覆盖率阈值 **MUST NOT** 高于实施时测得的基线，**SHALL** 以基线向下取整确定，并 **SHALL** 记录"只升不降"的棘轮策略；覆盖率低于阈值时对应测试命令 **SHALL** 以非零退出码失败。（来源: openspec/specs/ci-quality-gates/spec.md）
- 仓库 **SHALL** 提供 `.pre-commit-config.yaml`（后端 ruff、前端 Biome），钩子工具与版本 **SHALL** 与 CI 一致。（来源: openspec/specs/ci-quality-gates/spec.md）
- 仓库 **MUST NOT** 跟踪生成型产物；`.gitignore` **SHALL** 覆盖本地工具与 CI 产生的目录/文件；构建/导出文件 **SHALL** 从版本控制移除并由 `.gitignore` 覆盖。（来源: openspec/specs/repo-hygiene/spec.md）
- 未显式传 `--run-live` 时，`live` 标记用例 **SHALL** 在 collection 阶段跳过且 **SHALL NOT** 实例化 `live_server`；`pytest -q -m "not live"` 的收集结果 **SHALL NOT** 含任何 L2 用例；仓库文档（`AGENTS.md`、`README.md`）**SHALL** 记录与 marker 策略一致的命令矩阵，**SHALL NOT** 保留与实现不符的 L2 命令。（来源: openspec/specs/e2e-test-infra/spec.md）
