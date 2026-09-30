# Docker 开发环境（原生工作副本 + rsync 单向同步）

本仓库的 Docker 开发环境采用「**原生工作副本（native working copy）**」模型：

> **仓库不再 bind-mount 进容器。** 容器在 ext4 命名卷里维护自己的**工作副本**；Windows 侧
> 的仓库以**只读**方式挂载到 `/src-ro` 作为同步源，由 `scripts/dev-sync.sh` **单向 rsync**
> 进 `/workspace`。git、pytest、vitest、pnpm 全部在容器内、在 ext4 上运行。

这是一次**刻意的架构变更**，与旧的 bind-mount 设计不同。

## 始终在线（always-on）栈

本环境默认以「**始终在线**」方式运行：`docker compose up -d`（或 `scripts/dev-sync.sh up`）
一次性拉起三个长期服务，浏览器直接打开即可，**无需手动起后端 / 前端**。

| 服务 | 作用 | 发布端口 | 说明 |
|---|---|---|---|
| `dev` | 交互式工具箱（shell / exec / 测试 / sync） | 无 | 不对外服务；`docker compose up -d dev` 可**只**起它 |
| `backend` | FastAPI / uvicorn | **8181** | `http://127.0.0.1:8181`（`/health`、`/api`、`/ws`） |
| `frontend` | vite dev server | **5173** | `http://127.0.0.1:5173`，HMR 正常（无轮询） |

三者**共用同一个镜像 `trade-dev:latest` 与同一组卷**（`trade-workspace` → `/workspace`、
`trade-data` → `/workspace/backend/data`），因此后端 / 前端跑的就是你 `sync` 进去的**同一份**
工作副本，`dev` 里的 `git` / 测试与浏览器里看到的代码始终一致。

- **默认全部启动**（没有使用 compose profile）：符合「项目一直在，我只打开浏览器」的诉求。
- **只想跑 `dev`**（测试 / exec，不起服务器）：`docker compose up -d dev`。
- **端口**：`8181` / `5173` 现在发布在 `backend` / `frontend` 上；`dev` **不再发布端口**
  （两个容器不能绑定同一宿主端口，而 `dev` 从不对外服务）。
- `backend` / `frontend` 启动前会**等待** `/workspace/backend/.venv` 或
  `frontend/node_modules` 就绪（最多 300s，随后以清晰报错退出并提示执行
  `scripts/dev-sync.sh sync`），因此在全新卷上先 `up` 后 `sync` 也不会「莫名其妙地崩」。
- `backend` 默认带 `MD_SCHEDULE_INTERVAL_SECONDS=0`（关闭定时增量落盘，避免常驻容器持续对外
  轮询 / 写卷）；需要周期性落盘时把它改成正整数即可。

### 自动恢复链（已具备，无需额外配置）

容器随发行版 / `dockerd` 重启而恢复的链路在本环境**已经是既成事实**，不需要创建任何
Windows 计划任务或开机自启项：

```
WSL 发行版启动（用户自行启动 WSL）
  └─ systemd 启动 docker.service   # /etc/wsl.conf 的 systemd=true，docker 已 enabled
       └─ 带 restart: unless-stopped 的容器自动恢复
```

- `/etc/wsl.conf` 已配置 `systemd=true`，且 `systemctl is-enabled docker` → `enabled`、
  `systemctl is-active docker` → `active`，因此**发行版一启动，`dockerd` 就随之起来**。
- 只要 WSL 在跑，带 `restart: unless-stopped` 的容器就会在 `dockerd` 重启后自动恢复。
- **WSL 发行版本人由用户自行启动**；本环境**不注册**任何 Windows 计划任务 / 自启项。

### `restart: unless-stopped` 的含义

- **会**在 `dockerd` / WSL 发行版重启后**自动恢复**——这是「始终在线」的关键。
- **不会**在你**主动**停掉某个服务后把它拉起来——主动 `docker compose stop` 之后它就保持停止。

```bash
docker compose stop               # 主动停（保持停止，重启策略不会再拉起）
docker compose start              # 主动起
docker compose restart backend    # 重启单个服务
docker compose ps                 # 查看状态
```

> ⚠️ **`docker kill <name>` 不等同于一次「崩溃」**：Docker 会把它当作**主动停止**
> （标记 manually-stopped），`unless-stopped` 因此**不会**重启该容器（moby/moby#11065、#41302）。
> 若要验证「容器崩溃会自动恢复」，请在容器**内部**发信号（`docker exec <name> kill <pid>`），
> daemon 不会拦截，容器会按策略自动重启。

## 为什么（旧设计的问题）

旧设计把仓库 bind-mount 进容器（9p/virtiofs 挂载），后果：

| 现象 | 旧（bind mount / 9p） | 新（原生 ext4 工作副本） |
|---|---|---|
| 容器内 `git` | **SIGBUS / Bus error** | 正常（`status`/`log`/`rev-parse` 秒级返回） |
| 后端 pytest（`-m "not integrity and not live and not online"`） | **462–547 s** | **69.5 s**（pytest 自报；含 docker exec 的端到端 74.4 s），与宿主 ~104 s 同级 |

- `git` 崩溃的根因：git 会 **`mmap`** 自己的 pack 文件（约 25 MB），9p 无法可靠支撑缺页
  中断 → 进程收到 **SIGBUS**。这是本仓库无法在容器内使用 git 的根因。
- 测试变慢的根因：9p 的小文件元数据开销极高，`pytest` 收集中导入大量小文件时被放大。

新设计把仓库整体放到容器的 ext4 上，**9p 彻底离开热路径**——这正是本次重构的唯一目的。

## 前置条件

- Windows 已安装 **WSL2**，发行版 **Ubuntu-26.04**。
- Docker Engine 运行在 **WSL 内部**（本环境实测 Engine **29.8.1**、Compose **v5.5.1**，
  WSL2、WSL uid 1000），**没有 Docker Desktop**。因此**所有 docker 命令都要通过 WSL 调用**：

  ```bash
  wsl.exe -d Ubuntu-26.04 -- bash -lc 'docker version'
  ```

- 仓库位于 Windows `D:\work\project\trade`，WSL 内为 `/mnt/d/work/project/trade`
  （9p/virtiofs：小文件 I/O 慢，且容器内 `git` 无法在其上工作）。

## 挂载与卷（锁定设计）

| 挂载 | 类型 | 说明 |
|---|---|---|
| `/mnt/d/work/project/trade` → `/src-ro` | **bind（`read_only: true`）** | 单向同步的**源**，容器永不写入 |
| `trade-workspace` → `/workspace` | **named volume（ext4）** | **原生工作副本**，git / 测试在此运行 |
| `trade-data` → `/workspace/backend/data` | **named volume** | 后端数据目录，与宿主 parquet 隔离 |

- 端口：**8181**（后端 API，发布在 `backend` 服务）· **5173**（vite dev，发布在 `frontend` 服务）。
- 用户：**uid 1000 / gid 1000**（与 WSL 宿主一致；镜像已把两个卷挂载点预置为 `1000:1000`，
  空卷首次挂载会继承该归属）。
- 环境变量：`DEV_SERVER_HOST=0.0.0.0`、`LANG=C.UTF-8`、`LC_ALL=C.UTF-8`、
  `UV_LINK_MODE=copy`、`COREPACK_ENABLE_DOWNLOAD_PROMPT=0`。

> **容器内不再需要 `CHOKIDAR_USEPOLLING`**：工作副本在 ext4 上，inotify 正常，vite HMR
> 无需轮询（`frontend/vite.config.ts` 的轮询逻辑仍保留，但默认关闭）。
>
> **没有**仓库的 bind mount，**没有** `/workspace` 的 bind mount——这就是全部要点。

### ⚠️ `docker compose down -v` 会删除工作副本

`trade-workspace` 卷里就是整个工作副本。`docker compose down -v` **会连同卷一起删除**，
等于销毁工作副本（只能重新同步）。请**始终只用**：

```bash
docker compose down          # 保留卷（正确）
docker compose down -v       # 危险：删除 trade-workspace → 工作副本没了
```

## 快速开始

```bash
# 1) 构建 + 启动 + 首次同步（在 WSL 内执行）
wsl.exe -d Ubuntu-26.04 -- bash -lc 'cd /mnt/d/work/project/trade && scripts/dev-sync.sh up'

# 2) 进入容器
wsl.exe -d Ubuntu-26.04 -- bash -lc 'cd /mnt/d/work/project/trade && scripts/dev-sync.sh shell'
```

启动完成后直接打开（`backend` / `frontend` 已常驻）：

- 前端：**http://127.0.0.1:5173**
- 后端：**http://127.0.0.1:8181/health**

日常流程（宿主 → 容器，单向）：

1. 在 **Windows / WSL 宿主**编辑源码；
2. `scripts/dev-sync.sh sync` —— 把改动同步进容器；
3. `docker compose exec dev bash` —— 进容器内运行 / 测试。

```
Windows 编辑 ──(scripts/dev-sync.sh sync / up)──▶ /workspace（容器 ext4 工作副本）──▶ 运行/测试
        /mnt/d/work/project/trade ──(只读 /src-ro)──┘
```

## `scripts/dev-sync.sh`

一个脚本、两种角色（自动识别）：

- **宿主模式**：从 WSL/Windows 运行，把子命令代理进容器。
- **容器模式**：脚本经只读的 `/src-ro` 进入容器执行（宿主模式内部即
  `docker compose exec dev bash /src-ro/scripts/dev-sync.sh …`）。因为走的是只读绑定，
  **即使首次同步时 `/workspace` 还是空的也能用**——不存在“脚本还没同步进去”的先有鸡还是先有蛋问题。

| 宿主子命令 | 作用 |
|---|---|
| `sync [--full]` | 单向 rsync `/src-ro/` → `/workspace/`（按需安装依赖） |
| `up [--full]` | `docker compose up -d --build`，随后 `sync` |
| `shell` | 进入容器交互 bash |
| `down` | 停止并删除容器（**保留卷**） |
| `logs` | 跟随容器日志 |
| `backend` | 临时在 `dev` 容器内起后端（**会与常驻 `backend` 抢 8181**；先 `docker compose stop backend`） |
| `frontend` | 临时在 `dev` 容器内起 vite（**会与常驻 `frontend` 抢 5173**；先 `docker compose stop frontend`） |
| `test-backend` | 容器内后端 pytest（`not integrity and not live and not online`） |
| `test-frontend` | 容器内前端 vitest |
| `hub-e2e` | 容器内 `agent_hub-main` e2e |
| `doctor` | 打印宿主路径 / 端口 / 卷名 / 栈状态 |

### 同步语义

- **单向**：宿主 → 容器，`rsync -a --delete`；只读源 `/src-ro/` 永远不会被写入。
- **包含 `.git/`**：容器需要一份真实 git 工作副本（因此 `git status/log/rev-parse` 可用）。
  首次同步会把约 **68 MB** 的 `.git` 通过 9p 拷进来——**一次性成本**，之后都是增量。
- **排除**（宿主侧产物 / 工具状态，绝不进入容器）：
  `node_modules`、`.venv`、`__pycache__`、`.pytest_cache`、`.ruff_cache`、`.mypy_cache`、
  `dist`（锚定 `/frontend/dist/`）、`coverage`（锚定 `/frontend/coverage/`）、`.coverage`、
  `backend/data`、`backend/.env`、`.codemaker`、`.omo`、`.agents`、`.claude`、`.codex`、
  `.playwright-mcp`、`.playwright`、`.pnpm-store`、`.codegraph`、`.codemap`、`*.log`。
  - `node_modules` / `.venv` 在**容器内** ext4 上安装；`backend/data` 是独立卷；
    `.codemaker`/`.omo`/`.claude`/`.codex` 等是宿主工具状态。
  - **`dist`/`coverage` 锚定到前端**：裸 `dist` 会连带排除
    `frontend/vendor/klinecharts-pro/dist/`（`vite.config.ts` 的 alias 直接指向它），
    会直接搞坏前端——因此这两个模式必须锚定。
- **`--delete` 不会删除被排除的目标路径**，这正是 `backend/.env` 能存活的原因。
- **`--full`**：强制重装依赖（`npm ci` / `uv sync` / `pnpm install --frozen-lockfile`）；
  默认只做增量同步 + 「目录为空才装」的幂等初始化。
- **`skip-worktree`**：`sync` 结束后，会把一批**被排除但已被 git 跟踪**的路径（见脚本的
  `SKIP_WORKTREE_DIRS` / `SKIP_WORKTREE_FILES`：`frontend/coverage`、`backend/data`、
  `.codemaker`、`.omo`、`.agents`、`.claude`、`.codex`、`.playwright-mcp`、`.pnpm-store`、
  `.codegraph`、`.codemap`、`backend/.coverage` …）打上 `skip-worktree` bit，使容器内
  `git status` **不再把它们误报为「已删除」**（否则会有数百条 ` D` 行）。该步骤只设置这一个
  bit，**绝不 stage / commit / checkout / reset / clean**，且可重复执行（幂等）；对被正常同步的
  路径毫无影响，容器内对它们的真实改动仍会照常显示为 ` M`。
- 结束时打印一行汇总：`transferred=<n> file(s), bytes=<n>, deleted=<n>`。

### 首次运行初始化（幂等）

- `/workspace/.git` 不存在 → 视为首次，执行完整同步；
- `frontend/node_modules` 为空 → `npm ci`（严格按 lockfile，不重写 `package-lock.json`）；
- `backend/.venv` 为空 → `uv sync`；
- `agent_hub-main/node_modules` 为空 → `pnpm install --frozen-lockfile`；
- `trade-data` 卷为空且 `/src-ro/backend/data` 存在 → 一次性 rsync 进去。

## `.git` 的重要说明：两份独立工作副本

容器里的 git 与宿主的 git **共享历史，但是两份独立的工作副本**：

- **不要**在容器里跑会改写仓库的 git 命令（`commit` / 分支切换 / `reset --hard` / `clean`）——
  那只影响容器副本，不会影响宿主；**git 写操作一律在 Windows 宿主完成**。
- **宿主处于 commit / merge / rebase 中途时不要同步**——那会把一个**不一致的 `.git`**
  拷进容器。建议始终从宿主的**干净状态**发起同步。
- 容器内允许的 git 操作仅限**只读检查**：`git status` / `git log` / `git rev-parse`。

## `backend/data` 与 `backend/.env`

- **`backend/data`** 是 `trade-data` 命名卷，是**容器自己的**数据目录，**不会**写入宿主
  的 parquet 存储。若宿主 `backend/data` 有内容，首次同步会一次性 seed 进该卷。
- **`backend/.env`** 不在 git 里、且被同步**排除**；首次同步时若容器内缺失，会从
  `/src-ro/backend/.env` **一次性拷贝**一份。因为被排除，后续任何 `sync`（含 `--delete`）
  都不会删除或覆盖它。
- 启动后端时用 `scripts/dev-sync.sh backend`（内部带 `MD_SCHEDULE_INTERVAL_SECONDS=0`），
  避免容器去写宿主 parquet。

## 在容器内运行与测试

> `backend` / `frontend` 默认**已经常驻运行**（见「始终在线栈」）。`test-backend` /
> `test-frontend` / `hub-e2e` 只是往 `dev` 容器里 `exec` 测试进程，**不受影响**；只有
> `backend` / `frontend` 这两个「手动起服务」子命令会与常驻服务抢占端口，需先
> `docker compose stop backend|frontend`。

```bash
# 测试（推荐；无需动常驻服务）
scripts/dev-sync.sh test-backend     # pytest -q -m "not integrity and not live and not online"
scripts/dev-sync.sh test-frontend    # vitest run
scripts/dev-sync.sh hub-e2e          # pnpm e2e
# 临时手动起服务（会与常驻服务抢端口，需先 stop）
scripts/dev-sync.sh backend          # uvicorn :8181
scripts/dev-sync.sh frontend         # vite dev :5173
```

等价的原始命令：

```bash
docker compose exec dev bash -lc 'cd /workspace/backend && .venv/bin/python -m pytest -q -m "not integrity and not live and not online"'
docker compose exec dev bash -lc 'cd /workspace/frontend && npx vitest run'
```

## agent_hub-main 的 pnpm 工作流

`agent_hub-main/` 用 **pnpm 8.14.1** 管理（`package.json` 的 `packageManager` 字段固定该版本；
镜像已通过 Corepack 激活，进容器后裸 `pnpm` 即为 8.14.1，且 `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`
不会阻塞在交互提示）：

```bash
docker compose exec dev bash -lc 'cd /workspace/agent_hub-main && pnpm -v'                    # 8.14.1
docker compose exec dev bash -lc 'cd /workspace/agent_hub-main && pnpm install --frozen-lockfile'
docker compose exec dev bash -lc 'cd /workspace/agent_hub-main && pnpm e2e'                    # 离线（Part A）
```

`e2e` 分两部分：**Part A**（离线安装器校验）始终运行；**Part B**（MCP stdio 握手）默认
**skip**，需要联网与 npm registry，用环境变量开启：

```bash
docker compose exec dev bash -lc 'cd /workspace/agent_hub-main && AGENT_HUB_E2E_ONLINE=1 pnpm e2e'
```

## 镜像来源（mirror provenance）

**本环境无法访问 `registry-1.docker.io`**（连接被 reset）。基础镜像因此是从镜像源拉取并
retag 的：

```bash
docker pull docker.m.daocloud.io/library/python:3.12-slim-bookworm
docker tag  docker.m.daocloud.io/library/python:3.12-slim-bookworm python:3.12-slim-bookworm
docker compose build
```

`Dockerfile` 的 `FROM python:3.12-slim-bookworm` 因此命中本地已缓存的镜像。**provenance
说明：该镜像经 `docker.m.daocloud.io` 转发，对应 Docker Hub 上的同名 tag。** `Dockerfile`
未使用 `# syntax=docker/dockerfile:1`（该指令会强行从 docker.io 拉 build frontend，本环境会
失败；本项目也未使用任何 BuildKit-only 语法）。

> 镜像**不 COPY 仓库**：代码全部由 `scripts/dev-sync.sh` 经 rsync 进入 `trade-workspace` 卷。
> `.dockerignore` 因此把整个仓库排除、只留 `Dockerfile`——它只约束 **build context 的传输**，
> 与运行时容器内容无关。

## 故障排查

```bash
scripts/dev-sync.sh doctor      # 宿主路径 / 端口 / 卷名 / 栈是否 UP
docker compose config           # 渲染后的完整 compose 配置
docker compose logs dev         # 容器日志
docker compose ps               # 容器状态（空 = 未启动）
```

- `scripts/dev-sync.sh sync` 报 “container is not running” → 先 `scripts/dev-sync.sh up`。
- 若 `docker compose up` 报端口被占用，确认是在 **WSL 内**执行（WSL 为 NAT 网络，与 Windows
  主机端口相互独立）。
