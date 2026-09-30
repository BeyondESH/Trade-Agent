#!/usr/bin/env bash
# ===========================================================================
# entrypoint.sh — supervisor for the single Trade-Agent dev container.
# ===========================================================================
#
# This container is the WHOLE dev stack: the interactive toolbox AND the
# resident FastAPI (uvicorn :8181) + vite (:5173) servers. The script:
#
#   1. waits for the synced working copy to exist (backend/.venv/bin/python
#      AND frontend/node_modules/.bin/vite), up to SERVICES_WAIT_SECONDS
#      (default 300 s). If it never shows up it prints an actionable message
#      naming `scripts/dev-sync.sh sync` and exits non-zero — loudly, never a
#      silent crash loop.
#   2. when SERVICES=1 (the default) starts backend + frontend as background
#      children and streams their output to this container's stdout/stderr with
#      a `[backend]` / `[frontend]` prefix, so `docker compose logs -f` is
#      readable. When SERVICES=0 it starts neither and just stays alive as a
#      pure toolbox for `exec` / tests.
#   3. forwards SIGTERM/SIGINT to the children and waits for them, so
#      `docker compose stop` is graceful; `init: true` (tini) reaps the rest.
#   4. never exits just because a child died: it logs the exit with the pid and
#      restarts that service after SERVICES_RESTART_DELAY seconds (default 3),
#      keeping the stack "always on". If the workspace is genuinely broken the
#      restarted process fails fast and is restarted again — each cycle is
#      logged, never silent.
#
# The script is idempotent and side-effect free on restart: it NEVER installs
# dependencies (that is `scripts/dev-sync.sh`'s job) and writes nothing to the
# working copy.
#
# Config (env):
#   SERVICES                1 = run servers (default), 0 = toolbox only
#   SERVICES_WAIT_SECONDS   how long to wait for the synced copy (default 300)
#   SERVICES_RESTART_DELAY  seconds between a child death and its restart (3)
#   BACKEND_PORT            uvicorn port (default 8181)
#   FRONTEND_PORT           vite port   (default 5173)
# ===========================================================================

set -u

SERVICES="${SERVICES:-1}"
SERVICES_WAIT_SECONDS="${SERVICES_WAIT_SECONDS:-300}"
SERVICES_RESTART_DELAY="${SERVICES_RESTART_DELAY:-3}"
BACKEND_PORT="${BACKEND_PORT:-8181}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_PID=""
FRONTEND_PID=""
KEEPALIVE_PID=""
SHUTTING_DOWN=0

log() { printf '[entrypoint] %s\n' "$*" >&2; }

# Prefix each line of a stream with `[tag] ` so both services are readable in
# the combined `docker compose logs`.
prefix_stream() {
  local tag="$1" line
  while IFS= read -r line; do
    printf '[%s] %s\n' "$tag" "$line"
  done
}

have_backend() { [ -x /workspace/backend/.venv/bin/python ]; }
have_frontend() { [ -x /workspace/frontend/node_modules/.bin/vite ]; }

wait_for_workspace() {
  local waited=0
  while :; do
    if have_backend && have_frontend; then
      log "synced working copy is ready (backend .venv + frontend node_modules)."
      return 0
    fi
    if [ "$waited" -ge "$SERVICES_WAIT_SECONDS" ]; then
      log "ERROR: the synced working copy is not ready after ${SERVICES_WAIT_SECONDS}s."
      have_backend  || log "       missing: /workspace/backend/.venv/bin/python  (backend deps)"
      have_frontend || log "       missing: /workspace/frontend/node_modules/.bin/vite (frontend deps)"
      log "       Populate it from the host with:  scripts/dev-sync.sh sync"
      return 1
    fi
    log "waiting for the synced working copy ... (${waited}s/${SERVICES_WAIT_SECONDS}s) — run: scripts/dev-sync.sh sync"
    sleep 5
    waited=$((waited + 5))
  done
}

start_backend() {
  # The subshell `exec`s uvicorn, so $! IS the uvicorn pid (signals land on it).
  ( cd /workspace/backend && exec .venv/bin/python -m uvicorn market_data.webapi:create_app \
      --factory --host 0.0.0.0 --port "$BACKEND_PORT" ) \
    > >(prefix_stream backend) 2>&1 &
  BACKEND_PID=$!
  log "backend started (pid ${BACKEND_PID}) -> http://0.0.0.0:${BACKEND_PORT}"
}

start_frontend() {
  # Same trick: the subshell execs npm, which spawns vite (HMR via inotify —
  # CHOKIDAR_USEPOLLING is deliberately NOT set: the working copy is native ext4).
  ( cd /workspace/frontend && exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" ) \
    > >(prefix_stream frontend) 2>&1 &
  FRONTEND_PID=$!
  log "frontend started (pid ${FRONTEND_PID}) -> http://0.0.0.0:${FRONTEND_PORT}"
}

alive() { kill -0 "$1" 2>/dev/null; }

forward_shutdown() {
  SHUTTING_DOWN=1
  log "received stop signal; forwarding SIGTERM to children ..."
  [ -n "$BACKEND_PID" ]  && kill -TERM "$BACKEND_PID"  2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill -TERM "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$KEEPALIVE_PID" ] && kill -TERM "$KEEPALIVE_PID" 2>/dev/null || true
}
trap forward_shutdown TERM INT

# ---------------------------------------------------------------------------
# Toolbox-only mode: no servers, just stay alive so `exec` works and the
# container can host pytest / vitest / pnpm.
# ---------------------------------------------------------------------------
if [ "$SERVICES" != "1" ]; then
  log "SERVICES=${SERVICES}: toolbox-only mode — no servers started; container stays alive for exec/tests."
  while [ "$SHUTTING_DOWN" -eq 0 ]; do
    sleep 1 || true
  done
  log "stopped."
  exit 0
fi

# ---------------------------------------------------------------------------
# Server mode: wait for the synced copy, then supervise the two children.
# ---------------------------------------------------------------------------
if ! wait_for_workspace; then
  exit 1
fi

# A long-lived child keeps `wait -n` blocking on something real (never spins
# when both services happen to be between restarts).
sleep infinity &
KEEPALIVE_PID=$!

start_backend
start_frontend

# Reap any child that exits. `wait -n` reaps ONE child per call and returns
# (interrupted) when a signal arrives; we then check which tracked service is
# gone. Process-substitution prefixers may be returned too — harmless, since
# liveness is judged on the service pids only.
while [ "$SHUTTING_DOWN" -eq 0 ]; do
  wait -n 2>/dev/null || true
  [ "$SHUTTING_DOWN" -ne 0 ] && break

  if [ -n "$BACKEND_PID" ] && ! alive "$BACKEND_PID"; then
    log "backend (pid ${BACKEND_PID}) exited; restarting in ${SERVICES_RESTART_DELAY}s"
    BACKEND_PID=""
    sleep "$SERVICES_RESTART_DELAY"
    [ "$SHUTTING_DOWN" -eq 0 ] && start_backend
  fi

  if [ -n "$FRONTEND_PID" ] && ! alive "$FRONTEND_PID"; then
    log "frontend (pid ${FRONTEND_PID}) exited; restarting in ${SERVICES_RESTART_DELAY}s"
    FRONTEND_PID=""
    sleep "$SERVICES_RESTART_DELAY"
    [ "$SHUTTING_DOWN" -eq 0 ] && start_frontend
  fi
done

# Graceful teardown: wait for the children we signalled, then exit 0.
[ -n "$BACKEND_PID" ]  && wait "$BACKEND_PID"  2>/dev/null || true
[ -n "$FRONTEND_PID" ] && wait "$FRONTEND_PID" 2>/dev/null || true
log "all services stopped; exiting."
exit 0
