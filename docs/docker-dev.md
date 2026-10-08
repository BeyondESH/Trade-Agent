# Docker 开发环境（原生工作副本 + rsync 单向同步）

本仓库的 Docker 开发环境采用「**原生工作副本（native working copy）**」模型：

> **仓库不再 bind-mount 进容器。** 容器在 ext4 命名卷里维护自己的**工作副本**；Windows 侧
> 的仓库以**只读**方式挂载到 `/src-ro` 作为同步源，由 `scripts/dev-sync.sh` **单向 rsync**
> 进 `/workspace`。git、pytest、vitest、pnpm 全部在容器内、在 ext4 上运行。

这是一次**刻意的架构变更**，与旧的 bind-mount 设计不同。

## 始终在线（always-on）栈 · 单容器

本环境默认以「**始终在线**」方式运行：`docker compose up -d`（或 `scripts/dev-sync.sh up`）
拉起**一个**长期容器 `dev`，它同时是**交互式工具箱**和**常驻服务器**——容器入口脚本
`docker/entrypoint.sh` 在后台启动 FastAPI/uvicorn 与 vite dev server，并把两路输出分别加上
`[backend]` / `[frontend]` 前缀，浏览器直接打开即可，**无需手动起后端 / 前端**。

| 服务 | 容器 | 作用 | 发布端口 |
|---|---|---|---|
| `dev` | `trade-dev-1` | 工具箱（shell / exec / 测试 / sync）**＋** 常驻 backend / frontend | **8181** 与 **5173** |

- **一个容器、一个镜像、一组卷**：镜像 `trade_agent_img`；卷 `trade-workspace` → `/workspace`、
  `trade-data` → `/workspace/backend/data`。后端 / 前端跑的就是你 `sync` 进去的**同一份**
  工作副本，容器里的 `git` / 测试与浏览器里看到的代码始终一致。
- **两个端口都在同一个容器上**（一个容器可以同时绑定 8181 与 5173）：
  - 后端：**http://127.0.0.1:8181**（`/health`、`/api`、`/ws`）
  - 前端：**http://127.0.0.1:5173**，HMR 正常（工作副本在 ext4，inotify 生效，无轮询）
- **readable 合并日志**：`docker compose logs -f` 里两路输出各有前缀（`[backend]` / `[frontend]`）。
  只想看一路：`scripts/dev-sync.sh backend` / `scripts/dev-sync.sh frontend`。
- **`SERVICES=0` 工具箱模式**：`SERVICES=0 docker compose up -d` → **不起任何服务器**，容器只做
  `exec` / 测试（无进程监听 8181/5173），但仍保持存活。恢复常驻：`docker compose up -d`
  （`SERVICES` 默认 `1`，环境值变化会触发容器重建）。
- **入口脚本的等待行为**：启动服务器前，它会轮询直到 `backend/.venv/bin/python` **且**
  `frontend/node_modules/.bin/vite` 存在（最多 `SERVICES_WAIT_SECONDS`，默认 **300s**）；超时则
  打印**明确可操作**的报错（提示执行 `scripts/dev-sync.sh sync`）并以**非 0** 退出——不会静默
  崩溃循环。因此在全新卷上先 `up` 后 `sync` 也不会「莫名其妙地崩」。
- **子进程崩溃自愈**：若 backend 或 frontend 进程退出，入口脚本会打印日志并在
  `SERVICES_RESTART_DELAY`（默认 **3s**）后**重启**它；容器**不会**因某个子进程退出而退出，
  「始终在线」得以维持（每一轮都打印，绝非静默）。
- 后端默认带 `MD_SCHEDULE_INTERVAL_SECONDS=0`（关闭定时增量落盘，避免常驻容器持续对外轮询 /
  写卷）；需要周期性落盘时把它改成正整数即可。

### dev 代理端口 vs E2E 端口（`DEV_BACKEND_PORT`）

vite 的 dev/preview 代理（`/api`、`/ws`）**必须**转发到本容器常驻后端（**8181**），否则页面能加载
但**拿不到任何数据**。历史上这两件事曾被同一个变量 `E2E_BACKEND_PORT` 承担，造成冲突：

| 关注点 | 变量 | 含义 |
|---|---|---|
| 前端 dev/preview **代理后端** | **`DEV_BACKEND_PORT`**（本容器 = `8181`） | 代理把 `/api`、`/ws` 转发到哪个端口 |
| **Playwright E2E** 自起后端端口 | `E2E_BACKEND_PORT`（缺省 `8000`） | `frontend/playwright.config.ts` 用它决定 `market_data.cli serve --port …` 起在哪个端口 |

若在本容器里把 `E2E_BACKEND_PORT=8181`，`npm run test:e2e` 会试图在 **8181 再起一个后端**，
与入口脚本已常驻监督的那个**抢端口**。因此容器**只设置 `DEV_BACKEND_PORT=8181`**，
`E2E_BACKEND_PORT` 保持未设置：代理走到 8181，而 E2E 的端口语义原样保留。

`frontend/vite.config.ts` 的解析顺序是 `DEV_BACKEND_PORT ?? E2E_BACKEND_PORT ?? 8000`——在宿主 /
E2E 上二者都未设置（或 `E2E_BACKEND_PORT` 照旧可覆盖）时行为**与以前完全一致**，改动是**加法**。

> **容器内 E2E 现已支持。** `frontend/playwright.config.ts` 按**平台**解析后端解释器（Windows →
> `.venv/Scripts/python.exe`，Linux/macOS → `.venv/bin/python`），Chromium 也已烘焙进镜像
> （`/opt/ms-playwright`）。直接跑：
>
> ```bash
> scripts/dev-sync.sh test-e2e
> ```
>
> 它用**空闲端口**（默认 `E2E_BACKEND_PORT=8010` / `E2E_FRONTEND_PORT=5273`）另起一套 vite + 后端，
> **绝不与常驻的 8181 / 5173 抢端口**。详见下文 [容器内运行 Playwright E2E](#容器内运行-playwright-e2e)。
> 仅跑前端单测用 `scripts/dev-sync.sh test-frontend`。

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
- **不会**在你**主动**停掉容器后把它拉起来——主动 `docker compose stop` 之后它就保持停止。

```bash
docker compose stop               # 主动停（保持停止，重启策略不会再拉起）
docker compose start              # 主动起
docker compose restart dev        # 重启这唯一的容器（会重启 backend 与 frontend）
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

| 项目 | 值 | 说明 |
|---|---|---|
| 镜像 | **`trade_agent_img`** | 只含工具链，**不 COPY 仓库** |
| 容器 | **`trade-dev-1`**（服务名 `dev`） | 唯一容器：工具箱 + 常驻服务器 |
| `/mnt/d/work/project/trade` → `/src-ro` | **bind（`read_only: true`）** | 单向同步的**源**，容器永不写入 |
| `trade-workspace` → `/workspace` | **named volume（ext4）** | **原生工作副本**，git / 测试在此运行 |
| `trade-data` → `/workspace/backend/data` | **named volume** | 后端数据目录，与宿主 parquet 隔离 |

- 端口：**8181**（后端 API）· **5173**（vite dev）——**两者都发布在唯一的 `dev` 容器上**。
- 用户：**uid 1000 / gid 1000**（与 WSL 宿主一致；镜像已把两个卷挂载点预置为 `1000:1000`，
  空卷首次挂载会继承该归属）。
- 环境变量：`DEV_SERVER_HOST=0.0.0.0`、`DEV_BACKEND_PORT=8181`、`LANG=C.UTF-8`、
  `LC_ALL=C.UTF-8`、`UV_LINK_MODE=copy`、`COREPACK_ENABLE_DOWNLOAD_PROMPT=0`、
  `MD_SCHEDULE_INTERVAL_SECONDS=0`、`SERVICES=1`（默认；`0` = 仅工具箱）。入口脚本还读
  `SERVICES_WAIT_SECONDS`（默认 300）与 `SERVICES_RESTART_DELAY`（默认 3）。
- **`DEV_BACKEND_PORT` 指向前端 dev/preview 代理的后端**（本容器为常驻后端的 **8181**）。
  它与 **`E2E_BACKEND_PORT`** 是**两个不同关注点**，详见下节。

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
# 1) 构建 + 启动（唯一容器，自动起 backend/frontend）+ 首次同步（在 WSL 内执行）
wsl.exe -d Ubuntu-26.04 -- bash -lc 'cd /mnt/d/work/project/trade && scripts/dev-sync.sh up'

# 2) 进入容器（可选）
wsl.exe -d Ubuntu-26.04 -- bash -lc 'cd /mnt/d/work/project/trade && scripts/dev-sync.sh shell'
```

启动完成后直接打开（backend / frontend 已常驻在同一容器）：

- 前端：**http://127.0.0.1:5173**
- 后端：**http://127.0.0.1:8181/health**

日常流程（宿主 → 容器，单向）：

1. 在 **Windows / WSL 宿主**编辑源码；
2. `scripts/dev-sync.sh sync` —— 把改动同步进容器（前端 HMR 即时生效；后端改动后
   `docker compose restart dev` 即可）；
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
| `logs` | 跟随唯一容器的合并日志（两路前缀） |
| `backend` | **跟随常驻后端日志**（过滤 `[backend]`；不再手动起进程，避免与常驻服务抢 8181） |
| `frontend` | **跟随常驻前端日志**（过滤 `[frontend]`；不再手动起进程，避免与常驻服务抢 5173） |
| `test-backend` | 容器内后端 pytest（`not integrity and not live and not online`） |
| `test-frontend` | 容器内前端 vitest |
| `test-e2e` | 容器内前端 Playwright E2E（自起**空闲端口**的 vite + 后端，不与常驻服务抢端口） |
| `hub-e2e` | 容器内 `agent_hub-main` e2e |
| `doctor` | 打印宿主路径 / 端口 / 卷名 / 唯一容器状态 |

> **`backend` / `frontend` 已改为「看常驻服务的日志」**：服务器现在由容器入口脚本常驻启动，
> 同一个容器、同一个端口，再起第二个 uvicorn/vite 必然冲突。因此这两个子命令只做**日志跟随**
> （`docker compose logs -f dev | grep '\[backend\]'` 等），开发者无法用它们误起第二个进程。
> 要重启常驻服务用 `docker compose restart dev`。

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

> 入口脚本本身**绝不安装依赖**——安装只由 `dev-sync.sh` 做，因此容器重启是幂等、无副作用的。

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
- 后端由入口脚本常驻启动，compose 里已带 `MD_SCHEDULE_INTERVAL_SECONDS=0`，
  避免容器去写宿主 parquet。

## 在容器内运行与测试

> backend / frontend 默认**已经常驻运行**（同一容器内，入口脚本拉起）。`test-backend` /
> `test-frontend` / `test-e2e` / `hub-e2e` 只是往容器里 `exec` 测试进程，**不受影响**。曾经的
> 「手动起服务」子命令 `backend` / `frontend` 已改为**日志跟随**，不会再抢端口。

```bash
# 测试（推荐；无需动常驻服务）
scripts/dev-sync.sh test-backend     # pytest -q -m "not integrity and not live and not online"
scripts/dev-sync.sh test-frontend    # vitest run
scripts/dev-sync.sh test-e2e         # Playwright E2E（自起空闲端口，见下节）
scripts/dev-sync.sh hub-e2e          # pnpm e2e
# 看常驻服务日志（合并看就 docker compose logs -f）
scripts/dev-sync.sh backend          # 只看 [backend]
scripts/dev-sync.sh frontend         # 只看 [frontend]
```

等价的原始命令：

```bash
docker compose exec dev bash -lc 'cd /workspace/backend && .venv/bin/python -m pytest -q -m "not integrity and not live and not online"'
docker compose exec dev bash -lc 'cd /workspace/frontend && npx vitest run'
docker compose logs -f               # 合并日志（带 [backend]/[frontend] 前缀）
```

## 容器内运行 Playwright E2E

容器内可直接运行 `npm run test:e2e`（Playwright）。它**自己另起一套** vite + 后端，因此必须：

1. **用空闲端口**，否则会和常驻栈抢 `5173` / `8181`；
2. **后端解释器按平台解析**（容器里是 Linux 的 `.venv/bin/python`）；
3. **Chromium 已就位**（在镜像里，无需联网重新下载）。

推荐入口是 `scripts/dev-sync.sh test-e2e`，它一次性处理好三件事：

```bash
scripts/dev-sync.sh test-e2e
```

它会 `cd /workspace/frontend` 并执行 `npm run test:e2e`，默认导出：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `E2E_BACKEND_PORT` | `8010` | Playwright 自起后端的端口 |
| `E2E_FRONTEND_PORT` | `5273` | Playwright 自起 vite 的端口 |
| `DEV_BACKEND_PORT` | `=$E2E_BACKEND_PORT` | 让**这套** E2E vite 的 `/api`、`/ws` 代理指向 E2E 后端，而不是常驻的 `8181` |

以上三个变量都可从外部覆盖，例如换端口：

```bash
E2E_BACKEND_PORT=8020 E2E_FRONTEND_PORT=5283 scripts/dev-sync.sh test-e2e
```

等价的原始命令（`-T` 关掉 TTY）：

```bash
wsl.exe -d Ubuntu-26.04 -- bash -lc 'cd /mnt/d/work/project/trade && \
  docker compose exec -T dev bash -lc "cd /workspace/frontend && \
  E2E_BACKEND_PORT=8010 E2E_FRONTEND_PORT=5273 DEV_BACKEND_PORT=8010 npm run test:e2e"'
```

> **为什么显式设置 `DEV_BACKEND_PORT`**：容器环境里它是 `8181`（常驻后端）。`frontend/vite.config.ts`
> 的解析顺序是 `DEV_BACKEND_PORT ?? E2E_BACKEND_PORT ?? 8000`，若不为本次 E2E 覆盖它，Playwright
> 起的 vite 会把 `/api` + `/ws` 代理到常驻 8181，E2E 后端（8010）虽被拉起却无人使用。`test-e2e`
> 只在这个子树里覆盖它；**已经跑着的常驻 vite 在启动时就已解析好 `8181`，不受影响**。

浏览器二进制烘焙在镜像的 `/opt/ms-playwright`（`PLAYWRIGHT_BROWSERS_PATH`，`Dockerfile` 安装，
以 `dev` 用户执行、owner `1000:1000`），因此容器重建后依旧存在，且**不依赖 `$HOME`**——无论
`docker exec` 用 root 还是 `dev` 都能找到。版本固定为 `playwright@1.62.1`，与
`frontend/package.json` 声明的客户端版本一致。可自检：

```bash
docker compose exec dev bash -lc 'npx playwright --version && ls /opt/ms-playwright'
docker compose exec dev bash -lc 'npx playwright install --dry-run chromium'   # 应显示已安装
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

> 镜像**不 COPY 仓库的代码**：代码全部由 `scripts/dev-sync.sh` 经 rsync 进入 `trade-workspace`
> 卷。构建时只 COPY 一个文件——监督脚本 `docker/entrypoint.sh`（装到
> `/usr/local/bin/dev-entrypoint.sh`）。`.dockerignore` 因此把整个仓库排除，
> 只放行 `Dockerfile` 与 `docker/entrypoint.sh`——它只约束 **build context 的传输**，
> 与运行时容器内容无关。

## 故障排查

```bash
scripts/dev-sync.sh doctor      # 宿主路径 / 端口 / 卷名 / 唯一容器是否 UP
docker compose config           # 渲染后的完整 compose 配置
docker compose logs dev         # 唯一容器日志（两路带前缀）
docker compose ps               # 容器状态（空 = 未启动）
```

- `scripts/dev-sync.sh sync` 报 “container is not running” → 先 `scripts/dev-sync.sh up`。
- 日志里出现 `[entrypoint] ERROR: the synced working copy is not ready after 300s` →
  在宿主执行 `scripts/dev-sync.sh sync` 填充工作副本（容器会以非 0 退出并（按
  `unless-stopped`）重试）。
- 只想起工具箱、不起服务器 → `SERVICES=0 docker compose up -d`；恢复 → `docker compose up -d`。
- 若 `docker compose up` 报端口被占用，确认是在 **WSL 内**执行（WSL 为 NAT 网络，与 Windows
  主机端口相互独立）。
