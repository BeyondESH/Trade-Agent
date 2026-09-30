# ---------------------------------------------------------------------------
# Dev container for the Trade-Agent repo (backend + frontend + agent_hub-main).
#
# MODEL: this image contains *tooling only*. It NEVER copies the repository.
# The container keeps a NATIVE working copy on ext4 in the `trade-workspace`
# named volume, populated by `scripts/dev-sync.sh` (one-way rsync, host ->
# container). The Windows repo is bind-mounted read-only at /src-ro purely as
# that sync source. See docs/docker-dev.md.
#
# BASE IMAGE PROVENANCE: this environment has no route to registry-1.docker.io
# (connection reset). The canonical base below was pulled from the mirror
# `docker.m.daocloud.io/library/python:3.12-slim-bookworm` and re-tagged to
# `python:3.12-slim-bookworm`, so this FROM line resolves against the local
# image. The mirror forwards the same upstream tag. See docs/docker-dev.md
# (§ "镜像来源 / mirror provenance").
#
# NOTE: the `# syntax=docker/dockerfile:1` directive is deliberately absent --
# it forces a pull of the build frontend from docker.io, which fails here.
# This file uses no BuildKit-only syntax.
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# --- System CLI (cached; changes rarely) ------------------------------------
# git/curl/ca-certificates/build-essential : normal dev toolchain + native builds
# jq/less/nano/procps                      : quality-of-life shell tooling
# gosu                                     : drop root -> uid 1000 if run as root
# locales                                  : UTF-8 locale support
# gnupg                                    : required by the NodeSource setup script
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        build-essential \
        jq \
        less \
        nano \
        procps \
        gosu \
        gnupg \
        locales; \
    rm -rf /var/lib/apt/lists/*

# UTF-8 locale (C.UTF-8 is compiled in, but en_US.UTF-8 makes tools happy).
RUN set -eux; \
    sed -i 's/^# *\(en_US.UTF-8\)/\1/' /etc/locale.gen; \
    locale-gen; \
    update-locale LANG=C.UTF-8
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# --- Node.js 20 (NodeSource) + npm ------------------------------------------
RUN set -eux; \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; \
    apt-get install -y --no-install-recommends nodejs; \
    rm -rf /var/lib/apt/lists/*

# --- pnpm 8.14.1 via Corepack -------------------------------------------------
# Node 20 ships Corepack. Enable it (installs `pnpm`/`pnpx` shims into the Node
# bin dir, so the non-root user inherits them) and activate the exact version
# agent_hub-main/package.json pins via its `packageManager` field. COREPACK_HOME
# is a shared, dev-writable location so the cached pnpm is reused at runtime
# instead of being re-downloaded. The download prompt is disabled so a bare
# `pnpm` never blocks on an interactive "[Y/n]" when stdin happens to be a TTY.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/opt/corepack
RUN set -eux; \
    corepack enable; \
    corepack prepare pnpm@8.14.1 --activate; \
    pnpm -v | grep -qx 8.14.1; \
    chown -R 1000:1000 /opt/corepack

# --- uv (pinned, on PATH for every user) ------------------------------------
# Install from PyPI so no extra registry (ghcr) is required. The binary lands in
# /usr/local/bin/uv (and uvx), world-readable, so the non-root user can use it.
RUN pip install --no-cache-dir "uv==0.12.17"

# --- Playwright's Chromium OS libraries -------------------------------------
# Only the *system* libraries belong in the image; the `playwright` npm package
# itself comes from the frontend volume. Pinned to the same version the frontend
# declares (@playwright/test 1.62.1) so the apt dependency list matches.
RUN set -eux; \
    npx --yes playwright@1.62.1 install-deps chromium; \
    rm -rf /var/lib/apt/lists/* /root/.npm

# --- Extra dev CLI tools: rsync / openssh-client / vim ----------------------
# Deliberately appended AFTER the expensive Node/Corepack/uv/Playwright layers:
# Docker build cache keys cascade forward, so adding packages here leaves those
# costly layers cached (a separate apt layer is cheaper than invalidating them).
#   rsync          : the sync mechanism itself (scripts/dev-sync.sh)
#   openssh-client : ssh / ssh-keygen for git-over-ssh and remote workflows
#   vim            : editor (nano is already installed above)
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        rsync \
        openssh-client \
        vim; \
    rm -rf /var/lib/apt/lists/*

# --- Non-root user (uid/gid 1000, matching the WSL host user) ----------------
# Pre-create the two named-volume mount points, owned by 1000:1000. An *empty*
# named volume mounted over an existing image directory inherits that
# directory's ownership the first time it is used; without this the volumes
# would be root-owned and uid 1000 could not write the native working copy.
#
# NOTE: `install -d -o 1000` only chowns the *leaf* directory — the intermediate
# /workspace/backend would stay root-owned and break the very first rsync. So
# create the tree first, then chown it recursively.
RUN set -eux; \
    groupadd --gid 1000 dev; \
    useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash dev; \
    install -d /workspace/backend/data; \
    chown -R 1000:1000 /workspace

# --- Entrypoint: supervises backend + frontend inside the single container ----
# The stack is ONE container that both serves (uvicorn :8181, vite :5173) and
# stays usable as a toolbox. The script waits for the synced working copy,
# streams each server's output with a `[backend]` / `[frontend]` prefix, and
# forwards stop signals. See docker/entrypoint.sh. Baked in as root then made
# world-executable; the container still runs as uid 1000.
COPY docker/entrypoint.sh /usr/local/bin/dev-entrypoint.sh
RUN chmod 0755 /usr/local/bin/dev-entrypoint.sh

# Compose overrides user/workdir/command; these are sane defaults for `docker run`.
WORKDIR /workspace
CMD ["sleep", "infinity"]
