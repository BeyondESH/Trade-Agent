#!/usr/bin/env bash
# ===========================================================================
# dev-sync.sh — Trade-Agent dev-container helper (ONE-WAY host -> container sync)
# ===========================================================================
#
# MODEL
#   The repository is NOT bind-mounted. The container keeps a *native* working
#   copy on ext4 inside the `trade-workspace` named volume; the Windows tree is
#   bind-mounted READ-ONLY at /src-ro and mirrored one-way into /workspace.
#   Everything (git, pytest, vitest, pnpm) then runs inside the container.
#
# WHY
#   The previous design bind-mounted the repo over 9p/virtiofs, where `git`
#   crashed with SIGBUS (git memory-maps its pack file and 9p cannot reliably
#   back the page fault) and pytest ran 462-547 s instead of ~104 s.
#
# TWO MODES (auto-detected)
#   * HOST mode      : run from WSL/Windows. `sync`/`up`/... proxy into the
#                      running container via `docker compose exec`.
#   * CONTAINER mode : when /src-ro exists (i.e. running inside the dev
#                      container), `sync` performs the real rsync + first-run
#                      initialisation. The host wrapper invokes THIS file from
#                      the read-only bind (/src-ro/scripts/dev-sync.sh), so it
#                      works even on the very first sync, while /workspace is
#                      still empty.
#
# USAGE (host; Docker Engine lives inside WSL, so run via wsl.exe)
#   scripts/dev-sync.sh sync [--full]   one-way rsync (+ installs if needed)
#   scripts/dev-sync.sh up   [--full]   docker compose up -d --build, then sync
#   scripts/dev-sync.sh shell           interactive bash inside the container
#   scripts/dev-sync.sh down            stop+remove the container (volumes kept)
#   scripts/dev-sync.sh logs            follow container logs
#   scripts/dev-sync.sh backend         follow the resident backend logs
#   scripts/dev-sync.sh frontend        follow the resident frontend logs
#   scripts/dev-sync.sh test-backend    backend pytest inside the container
#   scripts/dev-sync.sh test-frontend   frontend vitest inside the container
#   scripts/dev-sync.sh hub-e2e         agent_hub-main e2e inside the container
#   scripts/dev-sync.sh doctor          print paths/ports/volumes + stack status
#
# ⚠️  NEVER run `docker compose down -v`: the working tree lives in the
#     `trade-workspace` volume, so `-v` would destroy it. Use `down` alone.
# ===========================================================================
set -euo pipefail

if [ -d /src-ro ] && [ -d /workspace ]; then
  MODE=container
else
  MODE=host
fi

# ===========================================================================
# HOST MODE — thin proxy that drives the container from WSL/Windows.
# ===========================================================================
if [ "$MODE" = host ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$ROOT"

  SRC_HOST="${TRADE_SRC:-/mnt/d/work/project/trade}"
  BACKEND_PORT=8181
  FRONTEND_PORT=5173
  WORKSPACE_VOLUME=trade-workspace
  DATA_VOLUME=trade-data

  dc() { docker compose "$@"; }

  container_up() { dc ps --status running --services 2>/dev/null | grep -qx dev; }

  require_up() {
    if ! container_up; then
      echo "[dev-sync] the 'dev' container is not running; start it with: scripts/dev-sync.sh up" >&2
      exit 1
    fi
  }

  # Run this very file *inside* the container. It is reached through the
  # read-only /src-ro bind, so it exists before the first sync completes.
  inner() { require_up; dc exec -T dev bash /src-ro/scripts/dev-sync.sh "$@"; }

  usage() {
    # Print the header comment block: everything after the shebang, up to the
    # first line of code. Strips the leading "# ".
    awk 'NR==1{next} /^set /{exit} {sub(/^# ?/,""); print}' "${BASH_SOURCE[0]}"
  }

  doctor() {
    echo "repo root         : $ROOT"
    echo "TRADE_SRC (host)  : $SRC_HOST"
    echo "compose file      : $ROOT/compose.yaml"
    echo "compose service   : dev            (ONE container: toolbox + resident servers)"
    echo "image             : trade_agent_img"
    echo "backend port      : $BACKEND_PORT   -> http://127.0.0.1:$BACKEND_PORT  (published on dev)"
    echo "frontend port     : $FRONTEND_PORT   -> http://127.0.0.1:$FRONTEND_PORT  (published on dev)"
    echo "workspace volume  : $WORKSPACE_VOLUME  -> /workspace        (native ext4 working copy)"
    echo "data volume       : $DATA_VOLUME       -> /workspace/backend/data"
    echo "sync source       : /src-ro            (read-only bind of $SRC_HOST)"
    echo "sync command      : scripts/dev-sync.sh sync   (host -> container, one-way)"
    echo "server mode       : SERVICES=1 (default, servers on) | SERVICES=0 (toolbox only)"
    if container_up; then
      echo "stack             : UP"
    else
      echo "stack             : DOWN"
    fi
    echo "--- docker compose ps ---"
    dc ps
  }

  case "${1:-}" in
    sync)
      shift
      inner sync "$@"
      ;;
    up)
      shift
      dc up -d --build
      inner sync "$@"
      ;;
    shell)
      require_up
      dc exec dev bash
      ;;
    down)
      dc down
      ;;
    logs)
      dc logs -f --tail=200
      ;;
    backend)
      # The backend is ALREADY resident inside this container (entrypoint,
      # SERVICES=1). Starting another uvicorn would collide on :8181, so this
      # subcommand now FOLLOWS the resident backend's logs instead.
      require_up
      dc logs -f --tail=200 dev | grep --line-buffered '\[backend\]' || true
      ;;
    frontend)
      # Same as `backend`: the resident vite server owns :5173, so this follows
      # its logs rather than starting a second dev server.
      require_up
      dc logs -f --tail=200 dev | grep --line-buffered '\[frontend\]' || true
      ;;
    test-backend)
      shift
      inner test-backend "$@"
      ;;
    test-frontend)
      shift
      inner test-frontend "$@"
      ;;
    hub-e2e)
      shift
      inner hub-e2e "$@"
      ;;
    doctor)
      doctor
      ;;
    ""|-h|--help|help)
      usage
      ;;
    *)
      echo "unknown command: $1" >&2
      echo >&2
      usage >&2
      exit 1
      ;;
  esac
  exit 0
fi

# ===========================================================================
# CONTAINER MODE — the actual one-way mirror + first-run initialisation.
# ===========================================================================
SRC=/src-ro
DST=/workspace

# rsync excludes. Each entry is a *host-side* artifact that must not land in the
# native working copy: dependency trees are installed INSIDE the container on
# ext4, backend/data is its own volume, and .codemaker/.omo/.agents/... are host
# tool state that must never enter the container. `--delete` does NOT remove
# excluded destination paths, which is exactly why backend/.env survives.
#
# NOTE on anchoring: `dist` and `coverage` are anchored to the FRONTEND build
# output (/frontend/dist, /frontend/coverage). A bare `dist` pattern would also
# exclude the REQUIRED vendored bundle at frontend/vendor/klinecharts-pro/dist/
# — the vite alias points straight at it — and would break the frontend.
EXCLUDES=(
  --exclude=node_modules/
  --exclude=.venv/
  --exclude=__pycache__/
  --exclude=.pytest_cache/
  --exclude=.ruff_cache/
  --exclude=.mypy_cache/
  --exclude=/frontend/dist/
  --exclude=/backend/.env
  --exclude=*.log
)

# Excluded paths that MAY still be TRACKED in git (host tool state, local build
# output, the per-container coverage file, ...). Because they never land in the
# container, git would otherwise report every tracked file under them as deleted
# (` D` rows), which makes `git status` useless inside the container. After each
# sync they get a `skip-worktree` bit, so git stops reporting them while still
# knowing the index tracks them.
#
# SINGLE SOURCE OF TRUTH: these two arrays drive BOTH the rsync `--exclude`s
# (emitted below) and the skip-worktree candidates — the list is never written
# twice. Paths are stored WITHOUT a leading slash so `git ls-files` accepts them
# as repo-relative pathspecs. Directories get a trailing `/` in the rsync pattern,
# plain files do not.
SKIP_WORKTREE_DIRS=(
  frontend/coverage
  backend/data
  .codemaker
  .omo
  .agents
  .claude
  .codex
  .playwright-mcp
  .playwright
  .pnpm-store
  .codegraph
  .codemap
)
SKIP_WORKTREE_FILES=(
  backend/.coverage
)
for _ex in "${SKIP_WORKTREE_DIRS[@]}"; do
  EXCLUDES+=("--exclude=/${_ex}/")
done
for _ex in "${SKIP_WORKTREE_FILES[@]}"; do
  EXCLUDES+=("--exclude=/${_ex}")
done

# Mark the excluded-but-tracked paths as `skip-worktree`, so `git status` inside
# the container stays usable. Sets ONLY the skip-worktree bit — it never stages,
# commits, checks out, resets, cleans, or switches branch. Idempotent: git
# errors when the bit is already set, which is expected and silenced explicitly
# below. Safe no-op when /workspace/.git is absent or a path is untracked.
mark_skip_worktree() {
  if [ ! -d "$DST/.git" ]; then
    echo "[dev-sync] skip-worktree: $DST/.git absent — nothing to mark."
    return 0
  fi
  local -a candidates=("${SKIP_WORKTREE_DIRS[@]}" "${SKIP_WORKTREE_FILES[@]}")
  if [ "${#candidates[@]}" -eq 0 ]; then
    echo "[dev-sync] skip-worktree: no candidate paths."
    return 0
  fi
  local total=0 path n
  for path in "${candidates[@]}"; do
    n="$(git -C "$DST" ls-files -- "$path" | wc -l | tr -d '[:space:]')"
    if [ "$n" -eq 0 ]; then
      continue
    fi
    # `2>/dev/null || true` silences ONLY git's "already skip-worktree" error on
    # an idempotent re-run; it never hides a real failure of the pipeline.
    git -C "$DST" ls-files -z -- "$path" \
      | xargs -0 -r git -C "$DST" update-index --skip-worktree -- 2>/dev/null || true
    total=$((total + n))
  done
  echo "[dev-sync] skip-worktree: marked ${total} tracked file(s) across ${#candidates[@]} excluded path(s)."
}


do_sync() {
  local full=0 arg
  for arg in "$@"; do
    case "$arg" in
      --full) full=1 ;;
      *) echo "[dev-sync] unknown sync flag: $arg" >&2; exit 2 ;;
    esac
  done

  local first_run=0
  [ -d "$DST/.git" ] || first_run=1

  echo "[dev-sync] mirroring $SRC/ -> $DST/  (one-way, --delete, first_run=$first_run)"
  if [ "$first_run" = 1 ]; then
    echo "[dev-sync]   note: the first sync copies .git (~68 MB) over 9p — one-time cost."
  fi

  local stats_file
  stats_file="$(mktemp)"
  rsync -a --delete --info=stats2 --human-readable "${EXCLUDES[@]}" "$SRC"/ "$DST"/ | tee "$stats_file"

  local files bytes deleted
  files="$(sed -n 's/^Number of regular files transferred: //p' "$stats_file")"
  bytes="$(sed -n 's/^Total transferred file size: //p' "$stats_file")"
  deleted="$(sed -n 's/^Number of deleted files: //p' "$stats_file")"
  rm -f "$stats_file"
  echo "[dev-sync] summary: transferred=${files:-0} file(s), bytes=${bytes:-0}, deleted=${deleted:-0}"

  # backend/.env is excluded from the mirror, so --delete can never remove it.
  # Copy it from the source exactly once, if the destination has none yet.
  if [ ! -e "$DST/backend/.env" ] && [ -e "$SRC/backend/.env" ]; then
    cp -p "$SRC/backend/.env" "$DST/backend/.env"
    echo "[dev-sync] copied backend/.env from source (one-time; excluded from mirror)"
  fi

  # Seed the trade-data volume from the host ONCE, only while it is empty.
  if [ -d "$SRC/backend/data" ] && [ -z "$(ls -A "$DST/backend/data" 2>/dev/null)" ]; then
    echo "[dev-sync] seeding trade-data volume from $SRC/backend/data (one-time)"
    rsync -a "$SRC/backend/data/" "$DST/backend/data/"
  fi

  # Keep `git status` usable: excluded-but-tracked paths never land in the
  # container, so mark them skip-worktree (never stages/commits/checks out).
  mark_skip_worktree

  # --- dependency installs (idempotent; forced by --full) -------------------
  if [ "$full" = 1 ] || [ ! -d "$DST/frontend/node_modules" ] || [ -z "$(ls -A "$DST/frontend/node_modules" 2>/dev/null)" ]; then
    echo "[dev-sync] frontend: npm ci"
    ( cd "$DST/frontend" && npm ci )
  else
    echo "[dev-sync] frontend: node_modules present (use --full to force npm ci)"
  fi

  if [ "$full" = 1 ] || [ ! -d "$DST/backend/.venv" ] || [ -z "$(ls -A "$DST/backend/.venv" 2>/dev/null)" ]; then
    echo "[dev-sync] backend: uv sync"
    ( cd "$DST/backend" && uv sync )
  else
    echo "[dev-sync] backend: .venv present (use --full to force uv sync)"
  fi

  if [ "$full" = 1 ] || [ ! -d "$DST/agent_hub-main/node_modules" ] || [ -z "$(ls -A "$DST/agent_hub-main/node_modules" 2>/dev/null)" ]; then
    echo "[dev-sync] agent_hub-main: pnpm install --frozen-lockfile"
    ( cd "$DST/agent_hub-main" && pnpm install --frozen-lockfile )
  else
    echo "[dev-sync] agent_hub-main: node_modules present (use --full to force pnpm install)"
  fi

  echo "[dev-sync] done."
}

case "${1:-sync}" in
  sync)
    shift
    do_sync "$@"
    ;;
  test-backend)
    cd "$DST/backend"
    exec .venv/bin/python -m pytest -q -m "not integrity and not live and not online"
    ;;
  test-frontend)
    cd "$DST/frontend"
    exec npx vitest run
    ;;
  hub-e2e)
    cd "$DST/agent_hub-main"
    exec pnpm e2e
    ;;
  *)
    echo "unknown container command: $1" >&2
    exit 1
    ;;
esac
