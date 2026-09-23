## ADDED Requirements

### Requirement: CI 流水线与作业编排

仓库 SHALL 提供一个 GitHub Actions 工作流，在 push 与 pull request 时触发，并 SHALL 至少包含后端 job 与前端 job。后端 job SHALL 使用 Python 3.11，前端 job SHALL 使用 README 声明的 Node 版本（≥20，取 LTS）。CI SHALL NOT 依赖外部网络用例（`online`）成功。

#### Scenario: PR 触发门禁
- **WHEN** 向仓库推送提交或创建 PR
- **THEN** GitHub Actions SHALL 运行后端 job 与前端 job，并在任一失败时使整体检查失败

#### Scenario: 版本固定
- **WHEN** 后端/前端 job 初始化运行环境
- **THEN** 后端 SHALL 使用 Python 3.11，前端 SHALL 使用 Node 20（LTS）

### Requirement: 后端 CI marker 矩阵与依赖可复现

后端 CI SHALL 执行单元回归 `python -m pytest -q`（`live` 与 `online` 标记用例自动跳过）与 L1 数据完整性 `python -m pytest -m integrity`；SHALL 以独立 job 执行 L2 `python -m pytest -m live --run-live`；SHALL NOT 传入 `--run-online`。后端依赖安装 SHALL 基于已提交的 `backend/uv.lock`，使用 `uv sync --frozen` 以保证可复现。

#### Scenario: 单元与 L1 通过
- **WHEN** CI 运行后端主 job
- **THEN** `python -m pytest -q` 与 `python -m pytest -m integrity` SHALL 执行且不启动重型 L2 子进程

#### Scenario: L2 独立运行
- **WHEN** CI 运行后端 L2 job
- **THEN** SHALL 执行 `python -m pytest -m live --run-live` 并共享单个 `live_server` 实例

#### Scenario: online 保持跳过
- **WHEN** CI 运行后端任意 job
- **THEN** `online` 标记用例 SHALL 被跳过，SHALL NOT 因外网不可达而失败

#### Scenario: 冻结依赖安装
- **WHEN** CI 安装后端依赖
- **THEN** SHALL 使用 `uv sync --frozen` 与提交的 `uv.lock`，SHALL NOT 在 CI 中解析出与锁文件不同的版本

### Requirement: 后端静态检查（ruff）

后端 SHALL 配置 ruff（lint + format）作为静态检查门禁，覆盖 `backend/` 下的 Python 源码与测试。规则集 SHALL 显式声明；无法一次性清理的既有告警 SHALL 通过规则级 `ignore` 或单点 `# noqa`（附原因）处理，SHALL NOT 直接关闭整个规则而不留说明。CI SHALL 以非零退出码阻断未修复的 lint 错误。

#### Scenario: lint 失败阻断
- **WHEN** 提交引入不符合 ruff 规则的代码
- **THEN** CI 的 ruff 检查 SHALL 失败并使该 job 失败

#### Scenario: 既有告警有据可查
- **WHEN** 某规则因既有代码而暂时被 ignore
- **THEN** 配置文件 SHALL 包含说明该例外原因与后续收敛计划的注释

### Requirement: 前端静态检查（Biome）

前端 SHALL 配置 Biome 作为 lint + format 门禁，覆盖 `frontend/src`、`frontend/tests` 等源码目录，并 SHALL 排除 vendored 与生成目录（`frontend/vendor/**`、`dist/**`、`node_modules/**`）。`package.json` SHALL 提供 `lint`、`format`、`format:check` 脚本。CI SHALL 以非零退出码阻断未修复的 lint 错误。

#### Scenario: lint 失败阻断
- **WHEN** 提交引入不符合 Biome 规则的代码
- **THEN** CI 的 lint 检查 SHALL 失败并使该 job 失败

#### Scenario: 排除 vendored 目录
- **WHEN** Biome 扫描前端
- **THEN** SHALL NOT 扫描或报告 `frontend/vendor/**`、`dist/**`、`node_modules/**` 中的文件

### Requirement: 双端覆盖率门禁

后端 SHALL 生成覆盖率报告（`pytest-cov`，覆盖 `market_data` 包）并配置一个初始 `fail_under` 阈值；前端 SHALL 生成覆盖率报告（`@vitest/coverage-v8`）并配置初始阈值。初始阈值 MUST NOT 高于变更实施时测得的覆盖率基线，并 SHALL 在文档中记录"只升不降"的棘轮策略。

#### Scenario: 覆盖率低于阈值时失败
- **WHEN** 覆盖率低于配置阈值
- **THEN** 对应端的测试命令 SHALL 以非零退出码失败

#### Scenario: 阈值不高于基线
- **WHEN** 首次设定阈值
- **THEN** 阈值 SHALL 基于实测基线向下取整确定，SHALL NOT 采用未经测量的猜测值

### Requirement: 提交前门禁（pre-commit）

仓库 SHALL 提供 `.pre-commit-config.yaml`，配置后端 ruff（lint + format）与前端 Biome 钩子；钩子使用的工具与版本 SHALL 与 CI 保持一致，避免本地与 CI 结果不一致。

#### Scenario: 本地提交触发检查
- **WHEN** 开发者安装并运行 pre-commit 后提交代码
- **THEN** 受影响文件 SHALL 经过 ruff / Biome 检查，未通过时提交被阻断
