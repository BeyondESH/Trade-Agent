---
type: "Fragment"
id: .github/workflows/ci
title: "CI 质量门禁流水线 / job 编排与 marker 矩阵"
description: "CI 在 push/PR 时到底跑了哪些检查，为什么 L2 单独成 job，为什么 online 与 Playwright E2E 永远不进 CI？"
parent: /.github/workflows/_overview.md
fragment: ci
architectural_role: "工程基础设施层 · 合入前强制关口，禁止被业务代码绕过或局部关闭"
entity_names:
  constants:
    - name: "on（触发事件）"
      source: .github/workflows/ci.yml
      value: "[push, pull_request]"
    - name: "job: backend（后端主 job 名）"
      source: .github/workflows/ci.yml
      value: "backend (lint + unit + L1)"
    - name: "job: backend-l2（后端 L2 独立 job 名）"
      source: .github/workflows/ci.yml
      value: "backend (L2 live)"
    - name: "job: frontend（前端 job 名）"
      source: .github/workflows/ci.yml
      value: "frontend (lint + typecheck + test + coverage)"
    - name: "python-version（CI 固定解释器版本，非 >=3.11 漂移）"
      source: .github/workflows/ci.yml
      value: "3.11"
    - name: "node-version（前端 job Node 版本，取 README 声明的 LTS）"
      source: .github/workflows/ci.yml
      value: "20"
    - name: "后端依赖安装方式（禁止在 CI 内重新解析版本）"
      source: .github/workflows/ci.yml
      value: "uv sync --frozen"
    - name: "unit 命令 / marker 语义"
      source: .github/workflows/ci.yml
      value: "pytest -q（live/online 自动 deselect）"
    - name: "L1 命令"
      source: .github/workflows/ci.yml
      value: "pytest -m integrity（无数据时 skip，不 fail）"
    - name: "L2 命令"
      source: .github/workflows/ci.yml
      value: "pytest -m live --run-live"
    - name: "online 命令（CI 禁用）"
      source: .github/workflows/ci.yml
      value: "pytest --run-online → NEVER used here"
    - name: "runs-on（唯一允许的 runner）"
      source: .github/workflows/ci.yml
      value: "ubuntu-latest"
    - name: "actions/checkout 版本"
      source: .github/workflows/ci.yml
      value: "v4"
    - name: "setup-uv / setup-node action 版本"
      source: .github/workflows/ci.yml
      value: "astral-sh/setup-uv@v5 / actions/setup-node@v4"
retrieval_hints:
  - "提交后 CI 会跑哪些检查？为什么我的 PR 红了？"
  - "如何把一个 pytest 标记的用集成进 / 排除出 CI？"
  - "L2 真实进程测试为什么要单独开一个 job？"
  - "为什么线上外网用例（Bitget/BlockBeats）不在 CI 里跑？"
  - "⚠️ 你要找的不是测试本身：L1/L2 用例实现在 `backend/tests`（marker 与 `--run-live`/`--run-online` 定义在 `backend/pyproject.toml`），Playwright 旅程在 `frontend/tests/e2e/`，本模块只负责『何时以何命令执行它们』。"
  - "⚠️ 你要找的不是前端构建/部署：仓库当前没有发布（release/deploy）workflow，`ci.yml` 只做质量门禁，不含打包与上线。"
  - "CI / 流水线 / 门禁 / 质量关口 / 卡口 / 合入检查，指的都是本模块（`.github/workflows/ci.yml`）"
  - "新增 CI 检查必须写成 `ci.yml` 内既有 job 的一个 step；只有『需要干净/隔离进程』或『显著拖慢主 job』时才新建 job（参照既有 `backend-l2`），禁止另建第二个 workflow 文件。"
---

## 业务意图（这块解决什么问题）

它解决的不是「跑测试」，而是「**在不确定的开发节奏下，保证行情数据与交易端行为的可信度不被单次提交破坏**」：任何推送/PR 都必须同时通过后端静态检查、单元回归、L1 Parquet 数据完整性、L2 真实进程 API/WS、前端 lint/typecheck/单测，任一失败即整体红灯，代码无法合入主干。同时它固化了「CI 结论必须可复现」这一前提——依赖一律走锁文件冻结安装，因此 CI 红灯一定可以用本地等价命令复现，而不是「云端环境问题」。
（来源: `openspec/specs/ci-quality-gates/spec.md`「CI 流水线与作业编排」「后端 CI marker 矩阵与依赖可复现」Requirement）

## 对外接口

本模块无协议/RPC。它的「对外契约」是**一份命令矩阵 + 三张 job**，被 `AGENTS.md`、`README.md`、`.pre-commit-config.yaml` 三处文档/脚本引用：

| 接口（step / job） | 方向 | 关键内容 | 业务说明 |
|---|---|---|---|
| `ci.yml` `on:` | GitHub → CI | `push`, `pull_request` | 唯一触发源；无 workflow_dispatch、无定时门禁（门禁只服务于「变更」这一事件） |
| `backend` / `Install dependencies` | CI → 依赖 | `uv sync --frozen` | 必须与已提交 `backend/uv.lock` 完全一致，禁止 CI 解析出不同版本 |
| `backend` / `ruff lint`、`ruff format check` | CI → 静态门禁 | `uv run ruff check .` / `ruff format --check .` | 规则集来自 `backend/pyproject.toml`（`select=E,F,I,UP,B`）；违规以非零码阻断 |
| `backend` / `Unit regression` | CI → 逻辑回归 | `uv run pytest -q` | 单元回归，`live`/`online` 自动 deselect，**不得**在此启动重型 uvicorn 子进程 |
| `backend` / `L1 data integrity` | CI → 数据门禁 | `uv run pytest -m integrity` | Parquet 全序列质量（单调性/OHLC/缺口白名单）；无数据目录时 skip 而非 fail |
| `backend` / `Coverage gate` | CI → 阈值门禁 | `uv run pytest -q --cov=market_data --cov-report=term-missing` | 必须保持为**独立 step**（不放 `addopts`），否则 L1 那一跑会被算进单元覆盖率基线 |
| `backend-l2` / `L2 live API/WS` | CI → 真实进程 | `uv run pytest -m live --run-live` | 独立 job，独占干净进程跑真实 uvicorn 子进程 |
| `frontend` / 全部 step | CI → 前端门禁 | `npm ci` → `npm run lint` → `format:check` → `typecheck` → `test` → `test:coverage` | 每个 step 直接映射 `frontend/package.json` 的一个 script，CI 不内联 npx 命令 |

> ⚠️ 反向依赖：本模块**被引用不被调用**。`AGENTS.md`「Test Suite」三层表与 `README.md`「质量门禁」节按 L1/L2/L3 逐条记录 CI 命令矩阵，规格要求文档命令与实际执行严格一致（详见 `workflows_local_parity.md`）。

## 跨模块依赖

| 依赖对象 | 引用原因 | 关键符号/文件 | confidence |
|---|---|---|---|
| `backend` 配置 | runner 版本、marker 声明、覆盖率阈值全部来自此文件 | `backend/pyproject.toml`（`[tool.ruff]`、`[tool.pytest.ini_options].markers`、`[tool.coverage.report].fail_under`） | extracted |
| `backend/uv.lock` | `--frozen` 安装的唯一事实源；锁文件变更即 CI 环境变更 | `backend/uv.lock` | extracted |
| `backend/tests` | L1/L2 用例与被 deselect 的 `live`/`online` 用例在此实现 | `backend/tests/test_data_integrity.py`、`test_live_api.py`、`test_live_ws.py`、`conftest.py`（`live_server` fixture、`--run-live`/`--run-online` 开关） | extracted |
| `frontend` 脚本 | 前端 step 逐条复用 npm script，不在 CI 内重写命令 | `frontend/package.json`（`lint`/`format:check`/`typecheck`/`test`/`test:coverage`） | extracted |
| `frontend` 覆盖率阈值 | `test:coverage` 是否通过由 vitest thresholds 决定 | `frontend/vite.config.ts` `test.coverage` | extracted |
| `openspec/specs` | 门禁需求与卫生需求的规格来源（本模块是其实现） | `openspec/specs/ci-quality-gates/spec.md`、`openspec/specs/e2e-test-infra/spec.md` | extracted |

| 反向依赖（谁受本模块约束） | 约束场景 | confidence |
|---|---|---|
| `backend/src`、`frontend/src` | 未过门禁的改动无法合入；等价于「CI 是这两层的唯一强制守门人」 | extracted |
| `.pre-commit-config.yaml` | 声明「mirroring CI」，工具与版本必须与 CI 一致，否则本地过、CI 挂 | extracted |
| `AGENTS.md`、`README.md` | 命令矩阵一致性由规格强制，CI 改动需同变更内同步文档 | extracted |

## 典型调用链

### 链路 A：一次后端改动的完整门禁路径
```
GitHub push/PR 事件 → .github/workflows/ci.yml:on
  → job backend（working-directory: backend）
    → actions/checkout@v4 → astral-sh/setup-uv@v5(python 3.11, cache)
    → uv sync --frozen                    ← 依赖冻结（跨模块：backend/uv.lock）
    → ruff check . / ruff format --check . ← 跨模块：backend/pyproject.toml 规则集
    → pytest -q                            ← 单元回归（跨模块：backend/tests，live/online 被 deselect）
    → pytest -m integrity                  ← L1 Parquet 数据完整性（本变更自身不产生数据，缺数据即 skip）
    → pytest -q --cov=market_data --cov-report=term-missing   ← Coverage gate（阈值判定，本模块入口 step）
```

### 链路 B：L2 真实进程用例（为什么必须拆 job）
```
GitHub push/PR 事件 → job backend-l2（独立 job，与 backend 并行）
  → checkout → setup-uv → uv sync --frozen
    → pytest -m live --run-live           ← 本模块入口
      → backend/tests/conftest.py:live_server   ← 跨模块：会话级 spawn 真实 uvicorn 子进程
        → 轮询 /health + 读日志 "Uvicorn running on" 判就绪（自适应上限，可环境变量覆盖）
      → test_live_api.py / test_live_ws.py 共用同一个 live_server 实例
```
> 拆分成独立 job 的业务理由：L2 会起真实子进程，若与单元回归同进程/同 job 混跑，前序单测状态会污染冷启动计时与端口占用，历史表现为顺序相关 flaky。
（来源: `openspec/specs/e2e-test-infra/spec.md`「live_server 启动与自适应就绪 / L2 用例选择策略」、`openspec/changes/archive/2026-09-20-ci-lint-coverage/design.md` 决策 3）

### 链路 C：前端改动
```
GitHub push/PR 事件 → job frontend（working-directory: frontend）
  → checkout → setup-node@v4(node 20, cache-dependency-path: frontend/package-lock.json)
    → npm ci → npm run lint / format:check / typecheck / test / test:coverage
      ← 全部为 frontend/package.json scripts 的直映射（禁止在 yml 里内联 npx/biome 命令）
```

## 变更风险（动它会破坏什么）

- **删掉或合并 `backend-l2` job** → L2 的真实 uvicorn 子进程与单元回归共处同一 job/进程，冷启动计时被前序单测拖长、端口与状态互相污染，回归变成顺序相关的 flaky；这正是当初拆分 `backend-l2` 要消除的故障模式（来源: `openspec/specs/e2e-test-infra/spec.md`「live_server 启动与自适应就绪」、`openspec/changes/archive/2026-09-20-ci-lint-coverage/design.md` 决策 3）。
- **给 CI 加上 `--run-online`** → 门禁开始依赖 Bitget / BlockBeats 外网可用性，网络抖动即红灯，红灯与代码质量脱钩；后果是全队养成忽略 CI 的习惯（规格明文禁止 CI 依赖外网用例成功）。
- **把 Playwright E2E 塞进 CI** → 每次运行都要下载浏览器二进制并跑完整用户旅程，CI 时长与失败率同时上升，最终同样退化为噪声门禁（ci.yml 顶部注释与 README 质量门禁节均声明「暂不纳入 CI」）。
- **把 `Coverage gate` 并入其他 step 或写进 pytest `addopts`** → L1 那一跑的覆盖率被计入单元基线，阈值含义与历史数据不再可比，后续棘轮调整失去参照。
- **让前端 step 与 `package.json` script 脱钩（yml 内内联命令）** → 本地按 README 执行的命令与 CI 执行的命令变成两套，出现「本地绿、CI 红」后开发者只能靠读 yml 猜规则。

## 实现约束清单

> 改动本 workflow 前逐条核对；每条被违反都有对应的既有规格或事故性理由。

### 必须遵守的门禁矩阵

| 标识符 / step | 值 | 所在文件 | 说明 | 约束由来 |
|---|---|---|---|---|
| `on` | `[push, pull_request]` | `.github/workflows/ci.yml` | 门禁只在变更事件触发 | 规格「CI 流水线与作业编排」 |
| `python-version` | `"3.11"` | ci.yml | 固定解释器，不跟随 `requires-python = ">=3.11"` 漂移 | design 决策 2：不锁版本会让 CI 随 runner 漂移 |
| `node-version` | `"20"` | ci.yml | README 声明的 LTS，`cache-dependency-path` 必须显式指到 `frontend/package-lock.json` | 规格「版本固定」Scenario |
| `uv sync --frozen` | — | ci.yml | CI 永不重新解析依赖 | 规格「冻结依赖安装」：SHALL NOT 解析出与锁文件不同的版本 |
| `-m live --run-live` | 只出现在 `backend-l2` | ci.yml | L2 必须独立 job | design 决策 3 + `fix-live-test-order-flake`（子进程与单测互相干扰） |
| `--run-online` | **禁止出现在 CI** | ci.yml | 外网用例（Bitget/BlockBeats）恒保持 skip | 规格「online 保持跳过」：CI SHALL NOT 依赖外部网络用例成功 |
| `npm run test:e2e`（Playwright） | **禁止纳入 CI** | ci.yml | 每次跑要下载浏览器二进制且显著更慢 → CI 变 flaky 源 | ci.yml 顶部注释 + README 质量门禁节「暂不纳入 CI」 |
| `Coverage gate` 独立 step | `--cov=market_data` | ci.yml | 不得塞进 pytest `addopts` | ci.yml 内注释：否则 L1 那一跑被计入单元覆盖率基线 |

### 设计决策（存在多种可行方案时已选定）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|---|---|---|---|
| CI 平台 | GitHub Actions（`.github/workflows/ci.yml`） | GitLab CI | 远程仓库在 GitHub，仓库无 `.gitlab-ci.yml`（design 决策 1） |
| L2 接入方式 | 独立 job `backend-l2` | 只跑单元，L2 交本地/夜间 | 门禁覆盖不足；独立 job 兼得覆盖与干净冷启动（design 决策 3） |
| `online` 子集 | 永不启用 | 加 `--run-online` + 失败容忍 | 外网不可达会把红灯变成噪声，门禁失去权威性 |
| L3 Playwright E2E | 不纳入 CI，仅文档化可选项 | 纳入 CI（缓存浏览器） | 需安装浏览器、耗时长；本变更默认不做（design Open Questions / Non-Goals） |
| 前端 step 表达 | `npm run <script>` 直映射 | yml 内内联 `npx biome …` | 内联会让本地与 CI 命令矩阵分叉，文档不可复现 |

### 禁忌项（禁止事项）

- **禁止**为了让红灯消失而删除/`continue-on-error` 某个 step 或整个 job：门禁的存在意义就是暴露回归，绕过即作废。
- **禁止**在 CI 里改用 `pip install` / 裸 `uv sync`（无 `--frozen`）：破坏可复现性，且掩盖 `uv.lock` 未随依赖变更更新的问题。
- **禁止**新建第二个 workflow 文件承载门禁（如 `ci-backend.yml`）：marker 矩阵与三 job 划分是一张表，拆文件会让「哪些检查是强制的」不再一目了然。
- **禁止**把 `--run-live` 合并进主 job 或写成 `pytest -m live`（漏 flag）：前者污染进程，后者用例会全被 deselect，门禁静默变空。
- **禁止**在本模块写业务逻辑或临时脚本（例如内联多行 Python 做数据校验）：校验规则属于 `backend/tests`，CI 只负责调用。
