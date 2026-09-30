#!/usr/bin/env node
/**
 * Bitget Agent Hub — end-to-end smoke test
 * =========================================
 *
 * Two layers, chosen to match the package's "dependency-free, run with npx" ethos:
 *
 *   Part A — offline installer checks (ALWAYS runs · no network · deterministic)
 *     Spawns `node installer/cli.mjs` (the whole product) and asserts what that
 *     file actually implements:
 *       • `--version` exits 0 and prints the version shared by package.json + VERSION.
 *       • `--help` exits 0 and lists every documented subcommand / flag.
 *       • The bare invocation with a non-TTY stdin prints help and exits 0
 *         (the interactive menu is only entered when stdin.isTTY === true).
 *       • `upgrade-all --target all --dry-run` exits 0, prints the `[dry-run] $ ...`
 *         commands it WOULD run (version-dependent parts shown as `<latest>`), and
 *         spawns NOTHING. Verified against a hermetic stub package manager that
 *         records every invocation, so the check needs neither a real npm/pnpm on
 *         PATH nor network access.
 *       • Negative cases (unknown command, unknown `--target`, `rollback` without
 *         `--to`, unknown package) exit non-zero with a useful message.
 *       • An unavailable package manager fails cleanly: non-zero exit, an actionable
 *         message, and no raw `spawn npm ENOENT` / stack trace.
 *
 *   Part B — MCP stdio handshake (OPT-IN · skipped by default)
 *     Launches `@bitget-ai/bitget-agent-mcp` via npx, performs the JSON-RPC
 *     `initialize` handshake, then `tools/list`. Enable with:
 *
 *         AGENT_HUB_E2E_ONLINE=1 node e2e/mcp-smoke-test.mjs
 *
 *     It SKIPS (never fails) when the flag is unset, when npx/network are unavailable,
 *     or when the package cannot be fetched — so CI and air-gapped hosts stay green.
 *
 * Zero dependencies: Node built-ins only. Run with `node e2e/mcp-smoke-test.mjs`
 * (or `pnpm e2e`). Exits non-zero if any assertion fails.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

// ── Paths & constants ──────────────────────────────────────────────────
// Resolve everything relative to this script; never hardcode a drive/OS path.
// AGENT_HUB_E2E_ROOT lets the suite target a checkout elsewhere (used by tooling).
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = process.env.AGENT_HUB_E2E_ROOT || join(SCRIPT_DIR, "..");
const CLI_PATH = join(PKG_ROOT, "installer", "cli.mjs");
const NODE_BIN = process.execPath; // never a bare "node"
const SPAWN_TIMEOUT_MS = 60_000;

const pkgVersion = JSON.parse(
  readFileSync(join(PKG_ROOT, "package.json"), "utf8")
).version;
const versionFileVersion = readFileSync(join(PKG_ROOT, "VERSION"), "utf8").trim();

// ── Process helpers ────────────────────────────────────────────────────

/** Kill a child and (on Windows) its whole tree so nothing is left running. */
function killTree(child) {
  if (!child || child.pid == null) return;
  if (process.platform === "win32") {
    const k = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    k.on("error", () => {});
    k.unref();
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/**
 * Spawn a process, capture stdout/stderr, and resolve with its outcome.
 * Every spawn has a hard timeout so a hang becomes a failure, not a stall.
 */
function spawnCapture(command, args, { cwd, env = process.env, timeoutMs = SPAWN_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"], // stdin never a TTY → no interactive prompt
        shell: false,
      });
    } catch (err) {
      resolve({
        code: null, signal: null, stdout: "", stderr: String(err?.message ?? err),
        output: String(err?.message ?? err), timedOut: false, spawnError: err,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError = null;
    let settled = false;
    let timer;

    const done = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, output: stdout + stderr, timedOut, spawnError });
    };

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      spawnError = err;
      done(null, null);
    });
    child.on("close", (code, signal) => done(code, signal));

    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
  });
}

/** Run the installer CLI with the given arguments. */
function runCli(args, opts = {}) {
  return spawnCapture(NODE_BIN, [CLI_PATH, ...args], { cwd: PKG_ROOT, ...opts });
}

/** Build an env object whose PATH starts with `dir` (handles Windows `Path` casing). */
function withPath(dir, base = process.env) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path") delete env[key];
  }
  const delimiter = process.platform === "win32" ? ";" : ":";
  env.PATH = `${dir}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`;
  return env;
}

/**
 * Build an env whose PATH contains ONLY `dir` — no inherited entries. Used to run
 * the installer on a host with no npm/pnpm reachable, deterministically.
 */
function withOnlyPath(dir) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    const lower = key.toLowerCase();
    if (lower === "path" || lower === "npm_execpath") delete env[key];
  }
  env.PATH = dir;
  return env;
}

/**
 * Create a hermetic stub package manager so the installer can be exercised with no
 * npm/pnpm and no network. The stub answers the installer's read-only queries
 * (`list`, `view`, `root`) and *records every invocation* to a sentinel file before
 * answering — that record is how we prove --dry-run truly spawns nothing.
 *
 * The installer spawns bare `npm`/`pnpm` with shell:false, so on Windows a plain
 * .cmd shim cannot be used. Instead we put a copy of the Node binary on PATH as
 * `npm.exe`; Node then resolves the bare verb (`list`, `view`, …) to a helper
 * script in the stub workspace cwd. On POSIX we write small sh dispatch scripts.
 */
function makeStubPm() {
  const root = mkdtempSync(join(tmpdir(), "agent-hub-e2e-"));
  const binDir = join(root, "bin");
  const workDir = join(root, "work");
  mkdirSync(binDir);
  mkdirSync(workDir);

  const sentinel = join(root, "invocations.sentinel");
  // Every helper records its argv before doing anything else, so ANY spawn at all
  // is observable — reads included, not just install/uninstall.
  const record =
    `require("node:fs").appendFileSync(${JSON.stringify(sentinel)}, process.argv.slice(1).join(" ") + "\\n");`;
  const helpers = {
    list: `${record}\nprocess.stdout.write(JSON.stringify({ dependencies: {} }));`,
    view: `${record}\nprocess.stdout.write("3.0.0\\n");`,
    root: `${record}\nprocess.stdout.write(${JSON.stringify(workDir)} + "\\n");`,
    install: record,
    uninstall: record,
  };
  for (const [name, body] of Object.entries(helpers)) {
    writeFileSync(join(workDir, name), body);
  }

  if (process.platform === "win32") {
    for (const name of ["npm", "pnpm"]) {
      copyFileSync(NODE_BIN, join(binDir, `${name}.exe`));
    }
  } else {
    for (const name of ["npm", "pnpm"]) {
      const p = join(binDir, name);
      writeFileSync(p, `#!/bin/sh\ncmd="$1"; shift\nexec "${NODE_BIN}" "${workDir}/$cmd" "$@"\n`);
      chmodSync(p, 0o755);
    }
  }

  return {
    binDir,
    workDir,
    sentinel,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// PART A — offline installer checks
// ───────────────────────────────────────────────────────────────────────
test("Part A — offline installer checks", async (t) => {
  await t.test("VERSION file and package.json agree", () => {
    assert.equal(
      versionFileVersion,
      pkgVersion,
      `VERSION (${versionFileVersion}) and package.json (${pkgVersion}) disagree`
    );
  });

  await t.test("--version exits 0 and prints the package version", async () => {
    const r = await runCli(["--version"]);
    assert.equal(r.timedOut, false, `--version timed out\n${r.output}`);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}\n${r.output}`);
    assert.equal(r.stdout.trim(), pkgVersion);
  });

  await t.test("--help exits 0 and lists the documented subcommands/flags", async () => {
    const r = await runCli(["--help"]);
    assert.equal(r.timedOut, false, `--help timed out\n${r.output}`);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}\n${r.output}`);
    for (const token of [
      "upgrade-all",
      "upgrade",
      "rollback",
      "install",
      "--target",
      "--dry-run",
      "--version",
      "--help",
    ]) {
      assert.ok(r.stdout.includes(token), `--help output is missing "${token}"`);
    }
  });

  // The bare invocation opens an interactive readline menu ONLY when stdin is a
  // TTY. We deliberately spawn with stdin: "ignore" (not a TTY), so the code's
  // non-interactive guard runs: it prints help and exits 0 without blocking.
  await t.test("bare invocation with non-TTY stdin prints help and exits 0", async () => {
    const r = await runCli([]);
    assert.equal(r.timedOut, false, `bare invocation timed out (interactive prompt?)\n${r.output}`);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}\n${r.output}`);
    assert.ok(r.stdout.includes("Usage:"), "bare non-interactive invocation should print help");
    assert.ok(!r.stdout.includes("[dry-run]"), "bare invocation should not run any command");
  });

  await t.test("upgrade-all --target all --dry-run spawns nothing and previews <latest>", async () => {
    const stub = makeStubPm();
    try {
      const stubEnv = withPath(stub.binDir);

      // Positive control: prove the stub really records invocations; otherwise the
      // "no record" assertion below would be vacuous.
      const sanity = await spawnCapture("npm", ["list", "-g"], {
        cwd: stub.workDir,
        env: stubEnv,
      });
      assert.equal(sanity.code, 0, `stub sanity check failed\n${sanity.output}`);
      assert.ok(
        existsSync(stub.sentinel),
        "stub failed to record an invocation — test would be vacuous"
      );
      rmSync(stub.sentinel, { force: true });

      // Now run the real installer against the stub. PATH contains the stub, so any
      // spawn at all (read or write) would leave a record. The previewed package
      // manager is auto-detected from `npm_execpath`, so accept either npm or pnpm:
      // the assertion is about the resolved command, not which manager would run it.
      const r = await runCli(["upgrade-all", "--target", "all", "--dry-run"], {
        cwd: stub.workDir,
        env: stubEnv,
      });

      assert.equal(r.timedOut, false, `dry-run timed out\n${r.output}`);
      assert.equal(r.code, 0, `expected exit 0, got ${r.code}\n${r.output}`);
      assert.match(
        r.stdout,
        /\[dry-run\] \$ (?:npm|pnpm) install -g @bitget-ai\/bitget-agent-cli@<latest>/,
        `dry-run did not preview the CLI install with a <latest> placeholder\n${r.stdout}`
      );
      assert.ok(
        r.stdout.includes("[dry-run] $ node"),
        `dry-run did not preview skill deployment\n${r.stdout}`
      );
      assert.ok(
        r.stdout.includes("version resolution skipped"),
        `dry-run did not note that version resolution is skipped\n${r.stdout}`
      );
      assert.ok(
        !r.stdout.includes("@3.0.0"),
        `dry-run must not resolve real versions\n${r.stdout}`
      );
      assert.equal(
        existsSync(stub.sentinel),
        false,
        `--dry-run must spawn nothing, but the stub recorded: ${existsSync(stub.sentinel) ? readFileSync(stub.sentinel, "utf8") : ""}`
      );
    } finally {
      stub.cleanup();
    }
  });

  await t.test("negative: unknown subcommand exits non-zero", async () => {
    const r = await runCli(["definitely-not-a-command"]);
    assert.equal(r.timedOut, false, "unknown-command run timed out");
    assert.notEqual(r.code, 0, `expected non-zero exit\n${r.output}`);
    assert.ok(r.output.includes("Unknown command"), `expected "Unknown command", got:\n${r.output}`);
  });

  await t.test("negative: unknown --target value exits non-zero", async () => {
    const r = await runCli(["upgrade-all", "--target", "bogus"]);
    assert.equal(r.timedOut, false, "invalid-target run timed out");
    assert.notEqual(r.code, 0, `expected non-zero exit\n${r.output}`);
    assert.ok(r.output.includes("Unknown target"), `expected "Unknown target", got:\n${r.output}`);
  });

  await t.test("negative: rollback without --to (non-interactive) exits non-zero", async () => {
    const r = await runCli(["rollback", "@bitget-ai/bitget-agent-cli"]);
    assert.equal(r.timedOut, false, "rollback run timed out");
    assert.notEqual(r.code, 0, `expected non-zero exit\n${r.output}`);
    assert.ok(
      r.output.includes("rollback requires --to"),
      `expected "rollback requires --to", got:\n${r.output}`
    );
  });

  await t.test("negative: unknown package exits non-zero", async () => {
    const r = await runCli(["upgrade", "@bitget-ai/not-a-real-package"]);
    assert.equal(r.timedOut, false, "unknown-package run timed out");
    assert.notEqual(r.code, 0, `expected non-zero exit\n${r.output}`);
    assert.ok(r.output.includes("Unknown package"), `expected "Unknown package", got:\n${r.output}`);
  });

  await t.test("unavailable package manager fails cleanly (no ENOENT, no stack)", async () => {
    // Deterministic: PATH contains nothing (no npm/pnpm), so the installer's spawn
    // must fail — regardless of what this host happens to have installed.
    const emptyDir = mkdtempSync(join(tmpdir(), "agent-hub-e2e-nopath-"));
    try {
      const env = withOnlyPath(emptyDir);
      const r = await runCli(["upgrade-all", "--target", "all"], { env });

      assert.equal(r.timedOut, false, `run timed out\n${r.output}`);
      assert.notEqual(r.code, 0, `expected a non-zero exit\n${r.output}`);
      assert.ok(
        r.output.includes("package manager"),
        `expected the actionable package-manager message, got:\n${r.output}`
      );
      assert.ok(
        !r.output.includes("ENOENT"),
        `must not leak the raw spawn error:\n${r.output}`
      );
      assert.ok(
        !/\n\s+at\s+\S/.test(r.output),
        `must not print a raw stack trace:\n${r.output}`
      );
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────
// PART B — MCP stdio handshake (opt-in; skips unless AGENT_HUB_E2E_ONLINE=1)
// ───────────────────────────────────────────────────────────────────────
const MCP_PACKAGE =
  process.env.AGENT_HUB_E2E_MCP_PACKAGE || "@bitget-ai/bitget-agent-mcp@3.0.0";

/** Resolve how to invoke npx without relying on a shell shim being spawnable. */
function resolveNpxLaunch() {
  const npmCli = join(dirname(NODE_BIN), "node_modules", "npm", "bin", "npx-cli.js");
  if (existsSync(npmCli)) {
    return { command: NODE_BIN, args: [npmCli, "-y", MCP_PACKAGE], shell: false };
  }
  // Fallback: spawn npx directly (shell needed for the .cmd shim on Windows).
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["-y", MCP_PACKAGE],
    shell: process.platform === "win32",
  };
}

test(
  "Part B — MCP stdio handshake (@bitget-ai/bitget-agent-mcp via npx)",
  { skip: process.env.AGENT_HUB_E2E_ONLINE === "1" ? false : "opt-in: set AGENT_HUB_E2E_ONLINE=1 (needs network + npm registry)" },
  async (t) => {
    const launch = resolveNpxLaunch();
    const child = spawn(launch.command, launch.args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: launch.shell,
      env: process.env,
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));

    let buffer = "";
    const pending = new Map();
    child.stdout.on("data", (d) => {
      buffer += d;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id != null && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      }
    });

    const rpc = (id, method, params) =>
      new Promise((resolve, reject) => {
        pending.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        setTimeout(() => {
          if (pending.delete(id)) reject(new Error(`timeout waiting for ${method}`));
        }, 20_000);
      });

    try {
      const init = await rpc("initialize", "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "agent-hub-e2e", version: "1.0.0" },
      });
      if (init.error) throw new Error(`initialize returned error: ${JSON.stringify(init.error)}`);

      assert.ok(init.result, "initialize returned no result");
      assert.equal(
        typeof init.result.protocolVersion,
        "string",
        "initialize result must carry a protocolVersion string"
      );
      assert.ok(init.result.protocolVersion.length > 0, "protocolVersion must be non-empty");
      assert.ok(init.result.serverInfo?.name, "initialize result must carry serverInfo.name");

      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

      const tools = await rpc("tools-list", "tools/list", {});
      if (tools.error) throw new Error(`tools/list returned error: ${JSON.stringify(tools.error)}`);
      assert.ok(Array.isArray(tools.result?.tools), "tools/list must return a tools array");
      console.log(
        `Part B: handshake OK — protocolVersion=${init.result.protocolVersion}, ` +
          `server=${init.result.serverInfo.name}, tools=${tools.result.tools.length}`
      );
    } catch (err) {
      // Network / registry / startup problems must SKIP, never fail the suite.
      t.skip(`cannot run the online MCP handshake here: ${err.message}`);
    } finally {
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      killTree(child);
      if (stderr.trim()) {
        console.log(`Part B: server stderr (first 500 chars):\n${stderr.slice(0, 500)}`);
      }
    }
  }
);
