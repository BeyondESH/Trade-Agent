---
type: "Fragment"
id: "backend/__files/deps"
title: "依赖面与版本锁定"
description: "后端升级某个包（尤其 plotly / vectorbt / pandas）会不会让服务在 import 阶段就崩？"
parent: /backend/__files/_overview.md
fragment: deps
architectural_role: "依赖与打包契约层（声明区间 + 冻结解析结果）"
entity_names:
  constants:
    - name: PACKAGE_NAME / PACKAGE_VERSION
      value: "market-data / 0.1.0"
      source: backend/pyproject.toml [project]
    - name: REQUIRES_PYTHON
      value: ">=3.11"
      source: backend/pyproject.toml（CI 实际使用 3.11；uv.lock 另为 3.12/3.14 解析分支）
    - name: PLOTLY_PIN
      value: "<7"
      source: backend/pyproject.toml（uv.lock 解析为 6.9.0）
    - name: VECTORBT_FLOOR
      value: ">=1.1"
      source: backend/pyproject.toml（uv.lock 解析为 1.1.0）
    - name: NUMPY_FLOOR
      value: ">=2.4"
      source: backend/pyproject.toml（uv.lock 同时解析出 2.5.3 与 2.4.6 两个分支）
    - name: PANDAS_FLOOR
      value: ">=2.2"
      source: backend/pyproject.toml（uv.lock 解析为 3.0.6，已跨一个 major）
    - name: AKSHARE_FLOOR
      value: ">=1.14.0"
      source: backend/pyproject.toml（uv.lock 解析为 1.18.96）
    - name: MCP_FLOOR
      value: ">=1.0.0"
      source: backend/pyproject.toml（uv.lock 解析为 2.2.0）
    - name: BUILD_BACKEND
      value: "hatchling"
      source: backend/pyproject.toml [build-system]
    - name: WHEEL_PACKAGES
      value: '["src/market_data"]'
      source: backend/pyproject.toml [tool.hatch.build.targets.wheel]
    - name: CONSOLE_SCRIPT
      value: "market-data = market_data.cli:main"
      source: backend/pyproject.toml [project.scripts]
    - name: UV_PACKAGE
      value: "true"
      source: backend/pyproject.toml [tool.uv]
    - name: LOCK_FORMAT
      value: "version = 1, revision = 3"
      source: backend/uv.lock 首两行
    - name: DEV_GROUP
      value: "pytest>=8.0, pytest-cov>=5.0, httpx>=0.28, ruff>=0.9"
      source: backend/pyproject.toml [dependency-groups.dev]
retrieval_hints:
  - "后端装了哪些包、Python 版本下限是多少、CI 用的是哪个版本？"
  - "为什么 plotly 必须锁在 7 以下？去掉这行会发生什么？"
  - "加一个新依赖之后要做哪些事 CI 才不会红？"
  - "为什么后端不用 TA-Lib / pandas-ta / PyTorch？"
  - "⚠️ 如果你要找的是**回测/因子计算的实现口径**（vectorbt Portfolio、qs_adapter、确定性要求），不在这里 → 在 `.codemaker/codeindex/backend/src/src_quant.md`；本模块只回答「用什么库、锁到哪个版本、会不会装崩」。"
  - "⚠️ 如果你要找的是 pytest marker 分层与覆盖率/ruff 门禁，不在这里 → 见同模块 `__files_gates.md`；两者都在 `pyproject.toml`，但职责不同。"
  - "⚠️ 如果你找的是前端 npm 依赖与 lock（package.json / package-lock / vendored klinecharts-pro），不在这里 → 在 `frontend/__files` 与 `frontend/vendor`。"
  - "本模块也叫「后端依赖清单」「requirements 的替代品」「uv 工程定义」，对应需求里的「引入第三方库」「升级依赖」「打包发布」。"
  - "架构归属句：任何新增/升级后端第三方库，必须同时改 `backend/pyproject.toml` 的依赖区间**并重新生成、提交 `backend/uv.lock`**；禁止在代码里新增只在本地 `pip install` 而不进依赖声明的包，也禁止新建 `requirements.txt`。"
---

## 对外接口（如有协议/RPC/事件则必填）

本子模块无运行时协议接口。它的对外契约是**安装契约**：任何环境（本机、CI、Docker）只要执行 `uv sync --frozen`，就必须得到与 `uv.lock` 完全一致的一套版本；只要执行 `uv sync`（不冻结），就可能得到在区间内漂移过 major 的另一套版本。

| 契约项 | 方向 | 关键字段 | 业务说明 | 入口符号/位置 |
|--------|------|---------|---------|---------|
| 依赖区间声明 | pyproject→解析器 | `dependencies`（15 项运行时）、`[dependency-groups].dev`（4 项） | 下限式声明（`>=`），唯一的上限 pin 是 `plotly<7` | `backend/pyproject.toml` |
| 冻结解析结果 | lock→安装器 | `version = 1`、`revision = 3`、每包 `version` + sha256 + `resolution-markers` | 机器可读的唯一安装事实；748KB，禁止手工编辑 | `backend/uv.lock` |
| 打包入口 | 构建器→wheel | `WHEEL_PACKAGES = ["src/market_data"]`、`CONSOLE_SCRIPT = market-data` | 决定 `market-data` CLI 命令是否被注册、哪些包被打进 wheel | `backend/pyproject.toml` |
| Python 下限 | pyproject→uv | `requires-python = ">=3.11"`；CI 固定 3.11 | 决定可用语法特性与 wheel 解析分支（lock 含 3.12/3.14 分支） | `backend/pyproject.toml`、`.github/workflows/ci.yml` |

## 业务意图

这组文件解决的业务问题是：**让"这台机器上跑的后端"和"那台机器上跑的后端"是同一个东西**。后端的能力面很宽（Parquet 列存、vectorbt 回测、AKShare 快讯、BlockBeats 数据、MCP 子进程、FastAPI/WS），这些能力全部依赖第三方库，而量化栈对库版本极其敏感——同一个 API 在不同 major 版本下语义不同，会让回测结果、指标数值、K 线抓取行为的差异被误读成"业务逻辑变了"。因此本模块用两层结构消化这个风险：`pyproject.toml` 声明**人类可读的意图**（哪些库是运行时必需的、哪些只在开发用、哪个库因上游 bug 必须封顶），`uv.lock` 承载**机器可复现的事实**（精确版本 + hash + 平台/Python 分支）。业务上的直接收益是：回测确定性、因子 IC 可比性、以及"CI 红=依赖漂移"这一可诊断ity。

## 实现约束清单

### 必须定义的常量/枚举

| 标识符 | 值 | 所在文件 | 说明 | 约束由来（如可追溯） |
|-------|----|---------|------|---------------------|
| `PLOTLY_PIN` | `plotly<7` | `backend/pyproject.toml` | **唯一的版本上限 pin**：vectorbt 1.1 的 plotly 模板仍注册 `scattermapbox`，而 plotly≥7 已从 `Layout.Template.Data` 移除该项 → **import 期崩溃** | 代码注释 + fix 提交「pin plotly<7 in pyproject and update lock」 |
| `REQUIRES_PYTHON` | `>=3.11` | `backend/pyproject.toml` | Python 下限；CI 固定 3.11，但 lock 为 3.12 / 3.14 也解析了分支（`resolution-markers`） | CI 版本固定要求（来源: openspec/specs/ci-quality-gates/spec.md） |
| `VECTORBT_FLOOR` | `>=1.1` | `backend/pyproject.toml` | 回测唯一口径库；`vbt.Portfolio.from_signals` 的成交/费用/滑点语义被规定为**唯一口径**，不再维护自定义回测逻辑 | spec 规定（来源: openspec/specs/quant-engine-vectorbt/spec.md） |
| `NUMPY_FLOOR` | `>=2.4` | `backend/pyproject.toml` | 自研指标/DL baseline 的底座；lock 同时存在 2.5.3 与 2.4.6 两条解析分支 | 「自研以求稳健 + Python 3.14 可跑」的选型（来源: openspec/changes/archive/2026-07-26-dl-quant-engine/design.md） |
| `AKSHARE_FLOOR` | `>=1.14.0` | `backend/pyproject.toml` | 全球快讯来源，**运行时依赖但必须懒加载**；它把 `akracer`（约 10MB wheel）作为 linux-only 传递依赖拉进来 | spec 要求 `akshare` 在后台线程内懒加载，不拖慢 uvicorn 启动（来源: openspec/specs/global-news-pipeline/spec.md） |
| `MCP_FLOOR` | `>=1.0.0` | `backend/pyproject.toml` | MCP 客户端库（lock 已到 2.2.0）；AI Agent 通道的历史 K 线与下单走 `npx @bitget-ai/bitget-agent-mcp` 子进程，Python 侧只做 stdio 客户端 | 两条通道划分（来源: openspec/specs/system-architecture/spec.md） |
| `DEV_GROUP.httpx` | `>=0.28` | `backend/pyproject.toml` `[dependency-groups.dev]` | **只是测试依赖**：FastAPI `TestClient` 需要，但**不是运行时依赖**，不得因为 webapi 用到 HTTP 就把它挪进 `dependencies` | 注释明示；L2 用真实进程、L3 用 Playwright |
| `LOCK_FORMAT` | `version = 1` / `revision = 3` | `backend/uv.lock` | 锁文件代际标记；由 uv 版本决定，人工改会直接导致 `--frozen` 校验失败 | uv 锁格式约定 |

### 设计决策（存在多种可行方案时必填）

| 决策点 | 选定方案 | 备选方案 | 选定理由 |
|--------|---------|---------|---------|
| 技术指标实现 | 自研 pandas/numpy 实现（MACD / KDJ / BOLL / VEGAS / 斐波那契） | 引入 `TA-Lib` 或 `pandas-ta` | `pandas-ta` 在新版 numpy / Python 3.14 下有已知导入问题（`from numpy import NaN`），`TA-Lib` 需原生编译；自研零额外依赖、便于单测对拍（来源: openspec/changes/archive/2026-07-26-indicator-structure-engine/design.md） |
| DL 模型实现 | numpy 自研 baseline + 可插拔 `Model` 接口 | 直接依赖 PyTorch / TensorFlow | PyTorch/TF 在 Python 3.14 多半无 wheel；自研保证 py3.14 可跑、离线可测，框架后续可无缝接入 sklearn/torch（来源: openspec/changes/archive/2026-07-26-dl-quant-engine/design.md、proposal.md） |
| 回测引擎 | vectorbt `Portfolio` 语义为唯一口径 | 继续维护自定义回测（信号下一根生效/翻仓双边成本/末根按市值） | 换取参数网格扫描、`range_split` / `walk_forward` 切分与 Numba 确定性；**明确不再保证与旧引擎结果一致**（来源: openspec/specs/quant-engine-vectorbt/spec.md） |
| 依赖管理工具 | uv + `pyproject.toml` + 提交 `uv.lock` | `requirements.txt` / pip-tools | CI 需以 `uv sync --frozen` 复现同一版本；无网络环境下也可锁 hash 校验（来源: openspec/specs/ci-quality-gates/spec.md） |
| 依赖区间风格 | 下限式 `>=`，仅对已知破坏 pin 上限 | 全量 pin 精确版本 | 精确 pin 会让安全/兼容修复无法自然流入；把上限留给**已被证实会崩**的那一个（`plotly<7`），既保持可读又避免"到处是版本锁" |
| 打包布局 | src-layout + hatchling，wheel 只收 `src/market_data` | 平铺 layout | 与 `[project.scripts]` 控制台入口、`coverage source = ["market_data"]` 三者口径统一 |

## 变更风险

> 改动 `pyproject.toml` 依赖段或 `uv.lock` 会破坏什么：

- **单独解除 `plotly<7` 会让后端在 import 阶段直接崩**：这不是运行时降级，而是 `import vectorbt` 即失败，导致 `backend/src` 的量化模块、webapi 与 CLI 全部无法启动。要升到 plotly 7+，前提是 vectorbt 侧模板问题已修（升级 vectorbt 或打补丁），且必须同时重生成 `uv.lock`。
- **改了依赖区间却没重新生成/提交 `uv.lock`，CI 立即失败**：CI 使用 `uv sync --frozen`，安装动作**只做校验不做解析**，区间与锁不一致即红。这条是"改 pyproject 却忘了 lock"最直接的暴露方式，也是最常见的 PR 阻塞原因。（来源: openspec/specs/ci-quality-gates/spec.md）
- **本地跑 `uv sync`（不带 `--frozen`）会悄悄重写 lock**：`pyproject.toml` 用下限式声明，因此重新解析会把 `pandas` 推到 3.x（当前锁 3.0.6）、`numpy` 推到 2.5.x——跨 major 的漂移会以一个 748KB 的锁文件 diff 混进功能提交里。凡出现非本意的 lock 大 diff，必须在评审中单独确认其影响面（回测口径、指标数值、Parquet dtype）。
- **CI 只在 Python 3.11 上跑，而 lock 已经为 3.14 解析了另一分支**：在 3.14 本机上 `uv sync --frozen` 装到的是 3.14 分支的版本组合（np 2.5.x / pandas 3.x 一侧），这条路径**没有任何门禁覆盖**。也就是说"我本地跑过"不等于 CI 跑过的那套依赖——本地与 CI 结果不一致的疑难杂症应从 `resolution-markers` 入手排查，而不是从业务代码入手。
- **把只在测试用的依赖挪进 `dependencies`（典型：`httpx`）会扩大安装面并模糊边界**：pyproject 注释明确 `httpx` 只服务 FastAPI `TestClient`，不是运行时依赖；反向地，若把它移出 dev 组而 L2/单测仍在用，CI 的 `uv sync` 后测试会缺包。
- **新增源文件放错位置会"打出装不出"**：wheel 只包含 `src/market_data`；在 `backend/src/` 下新建顶层包、或把模块放到 `backend/` 其它目录，本地以 `uv run` 能 import，但打出的 wheel 缺该包，表现为部署后 `ModuleNotFoundError`。同样，`[project.scripts]` 的入口一旦重命名，`market-data` CLI 与文档命令一起失效。
- **把 `akshare` 的 import 提到模块顶层会拖慢/破坏启动**：它是必需运行时依赖，但规格要求它在快讯后台线程内懒加载，且**不得**因导入失败拖慢 uvicorn 启动；同时它拉入约 10MB 的 linux-only 传递依赖 `akracer`，是安装体积的主要来源——不要试图"为了少一个依赖"删除它，也不要随意升级为顶层导入。（来源: openspec/specs/global-news-pipeline/spec.md）
- **升级 `vectorbt` 属于回测口径变更，不是依赖治理**：spec 已规定"以 vectorbt 语义为唯一口径，不再保证与旧引擎一致"；再升一个 major 会让历史回测结果、参数网格与 walk-forward 结论全部失去可比性，必须作为**业务变更**立项，而非顺手 bump。（来源: openspec/specs/quant-engine-vectorbt/spec.md）
- **手工编辑 `uv.lock` 或让本地与提交的 uv 代际不一致会破坏 `--frozen`**：锁文件的 `version`/`revision` 头与包 hash 是校验对象；只允许通过 `uv lock` 再生成。

## 边界：允许做什么、禁止做什么

> 判定原则：**新增依赖是一个需要解释的动作，删除依赖是一个需要解释的动作，升级依赖（尤其跨 major）是一个需要立项的动作。** 这条区分来自本模块的实际代价分布：加减依赖只影响安装面，而升级回测/数值库会一次性改变历史结论，使“代码没改但结果变了”这类问题极难归因。(来源: openspec/specs/quant-engine-vectorbt/spec.md、openspec/specs/ci-quality-gates/spec.md)

- **允许**：在没有硬上限约束时继续用下限式 `>=` 声明，让安全/兼容修复自然流入。
- **禁止**：为“锁得更稳”而给大量包加上限 pin（除已被证实会崩的 `plotly<7`）；广泛 pin 会让依赖无法自然升级，并把风险从“装不上”变成“装不到安全修复”。
- **禁止**：手工编辑 `uv.lock`，或以与提交时不同代际的 uv 生成后直接提交；锁文件的 `version`/`revision` 与每包 hash 均为 `--frozen` 的校验对象。
- **允许**：把仅在测试中使用的包放进 `[dependency-groups].dev`（例 `httpx`）；**禁止**因为 webapi 内部用到 HTTP 就把它挪进 `dependencies`（pyproject 注释已限定它只服务 TestClient）。
- **禁止**：把 `akshare` 的 import 提到模块顶层，或因为它“太重”而删除该运行时依赖；正确做法是保持它在快讯后台线程内懒加载。（来源: openspec/specs/global-news-pipeline/spec.md）
- **禁止**：为回避 npm 依赖问题而在仓库内 fork / vendoring 上游 `bitget-agent-hub` 源码；交易与行情能力只能以包形式引入。（来源: openspec/specs/system-architecture/spec.md）
- **禁止**：把新模块放到 `src/market_data` 之外却期待它被打包；wheel 白名单是封闭集合，开发期可 import ≠ 发布可 import。

## 跨模块依赖

> 实现本子模块功能时，除本模块外还需引用的外部模块：

| 依赖模块 | 引用原因 | 关键符号 | confidence |
|---------|---------|---------|------------|
| `.github/workflows` | CI 是 `uv.lock` + `pyproject.toml` 安装契约的唯一校验者（`uv sync --frozen`、`uv run pytest`、Python 3.11 固定） | `ci.yml` 的 `uv sync --frozen` / `python-version: "3.11"` | extracted |
| `backend/src` | 依赖区间的真实需求方；`plotly`/`vectorbt`/`akshare`/`mcp` 的可用性由它的 import 结构决定，且 `akshare` 懒加载约束限制其导入位置 | `dlquant.py`/`backtest` 相关模块、`mcp_client.py`（StdioServerParameters）、news 后台线程 | extracted |
| `backend/tests` | dev 组的 `pytest` / `pytest-cov` / `httpx` 由测试直接使用；测试基线（356 项单元）与依赖区间绑定 | `conftest.py`、`test_webapi.py`（TestClient） | extracted |
| `agent_hub-main`（vendored 上游） | 行情/交易能力以 **npm 包形式消费**（`@bitget-ai/bitget-agent-mcp`），不进 Python 依赖，但要求 Node ≥20 与 `MD_MCP_COMMAND=npx`；**MUST NOT fork 修改其源码** | `MIN_NODE_MAJOR = 20`、`mcp_client.py` | extracted |
| `openspec` | 回测口径、懒加载、Python 版本、依赖冻结等约束的规范来源 | `quant-engine-vectorbt`、`global-news-pipeline`、`ci-quality-gates`、`system-architecture` | extracted |

> 反向依赖（谁调用了本子模块）：

| 调用方模块 | 调用场景 | 关键符号 |
|-----------|---------|---------|
| `backend/src` | 任何第三方库 import；新增库的需求最终落到本模块的 `dependencies` | `import vectorbt as vbt`、`import akshare`（懒加载） |
| `backend/tests` | 单元/集成测试依赖 dev 组安装到位才能收集与执行 | `pytest`、`httpx.Client`、`pytest-cov` |
| `backend/scripts` | 一次性回填脚本使用 pyarrow/pandas 与 REST 客户端，间接依赖同一套安装 | `MD_DATA_DIR` 相关读写 |
| `.github/workflows` | 后端 job、L2 job 的全部命令行均以本模块定义的环境为前置 | `uv run pytest -q`、`uv run ruff check .` |

## 典型调用链

> 1–3 条功能入口到本模块的调用路径（函数名链，不写代码）。

### 从「新增一个依赖」到「CI 绿」
```
需求要引入新库（例：新的图表/统计库）
  → backend/pyproject.toml: [project].dependencies 追加下限            ← 本模块入口
    → uv lock（生成/更新 backend/uv.lock 的 version+hash+markers）      ← 本模块：必须同 PR 提交
      → .github/workflows/ci.yml: uv sync --frozen                      ← 跨模块：锁一致性校验
        → uv run pytest -q（backend/tests 分层）→ uv run pytest --cov   ← 跨模块：门禁断言
```
> 边界：`dependencies` 与 `uv.lock` 是一个原子变更，缺一即 CI 阻塞；上限 pin 仅在"已被证实会崩"时才允许加，且必须写原因。

### plotly 崩溃链（为何 pin 存在）
```
uv sync --frozen（得到 plotly 6.9.0）
  → backend/src/market_data/<quant 模块>: import vectorbt               ← 跨模块：backend/src
    → vectorbt 1.1.0 的 plotly 模板注册 scattermapbox
      → plotly>=7 已从 Layout.Template.Data 移除该字段 → import 期抛错   ← 本模块 pin <7 挡住这条路
```
> 边界：解 pin 的前置条件是先升 vectorbt/确认上游修复，且同步重生成 lock。改此 pin 的影响面是"后端整个起不来"。

### 打包与发布
```
uv build / uv sync（[tool.uv] package = true）
  → [build-system] hatchling → [tool.hatch.build.targets.wheel] packages = ["src/market_data"]   ← 本模块
    → [project.scripts] market-data = market_data.cli:main → 注册 `market-data` 命令               ← 本模块
      → backend/scripts 与 README 中的 `uv run market-data ...` 命令依赖之                          ← 跨模块
```
> 边界：`src/market_data` 之外的顶层包不会被装进 wheel；重命名 `market-data` 命令是对外可发现接口的破坏性变更。

## 附：OpenSpec 摘要

> 📋 本节内容来源于 OpenSpec：`openspec/specs/ci-quality-gates/spec.md`、`openspec/specs/quant-engine-vectorbt/spec.md`、`openspec/specs/global-news-pipeline/spec.md`、`openspec/specs/system-architecture/spec.md`、`openspec/changes/archive/2026-07-26-indicator-structure-engine/design.md`、`openspec/changes/archive/2026-07-26-dl-quant-engine/design.md`（仅提炼与依赖选型相关的条目，非完整规范）

- 后端依赖安装 **SHALL** 基于已提交的 `backend/uv.lock`，使用 `uv sync --frozen` 以保证可复现；**SHALL NOT** 在 CI 中解析出与锁文件不同的版本；后端 job **SHALL** 使用 Python 3.11。（来源: openspec/specs/ci-quality-gates/spec.md）
- 回测 **SHALL** 使用 `vbt.Portfolio.from_signals`（或等价 Portfolio API），以 vectorbt 语义为唯一口径，不再维护自定义"信号下一根生效/翻仓双边成本/末根按市值"逻辑；参数切分 **SHALL** 用 vectorbt splitter（`range_split` / `walk_forward`）；绩效摘要 **SHALL** 经 vectorbt returns + QuantStats 适配器产出；同输入同参数 **SHALL** 得到相同结果（Numba 确定性）。（来源: openspec/specs/quant-engine-vectorbt/spec.md）
- `akshare` **SHALL** 在快讯后台线程内懒加载，不拖慢 uvicorn 启动。（来源: openspec/specs/global-news-pipeline/spec.md）
- 系统主语言 **SHALL** 为 Python，并以**依赖形式**消费 `bitget-agent-hub`（`bitget-agent-sdk` / `bitget-agent-mcp` / `bitget-signal`），**不得 fork 修改其源码**；集成 Bitget 交易/行情能力时通过 npm 包引入，仓库内不得出现被 fork 的源码副本。（来源: openspec/specs/system-architecture/spec.md）
- 指标引擎选型理由（规格归档件）：`pandas-ta` 在新版 numpy / Python 3.14 下有已知导入问题（`from numpy import NaN`），`TA-Lib` 需原生编译；MACD/KDJ/BOLL 实现简单，自研更可控、零额外依赖、便于单测对拍。（来源: openspec/changes/archive/2026-07-26-indicator-structure-engine/design.md）
- DL 层选型理由（规格归档件）：PyTorch/TF 在 Python 3.14 可能暂无 wheel，故以 **numpy 算法 baseline** 落地并暴露 `Model` 接口，待框架就绪（或降级 Python）后可接入 sklearn/torch。（来源: openspec/changes/archive/2026-07-26-dl-quant-engine/design.md、openspec/changes/archive/2026-07-26-dl-quant-engine/proposal.md）
