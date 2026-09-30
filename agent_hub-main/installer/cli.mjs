#!/usr/bin/env node

import { createRequire } from "node:module";
import { spawn as nodeSpawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";

// ── Constants ──────────────────────────────────────────────────────────
const TARGET_PACKAGES = ["@bitget-ai/bitget-agent-skill", "@bitget-ai/bitget-signal", "@bitget-ai/bitget-agent-cli"];

const SKILL_PACKAGES = ["@bitget-ai/bitget-agent-skill", "@bitget-ai/bitget-signal"];

const DEPLOY_TARGETS = {
  claude:   { label: "Claude Code", dir: "~/.claude/skills" },
  codex:    { label: "Codex",       dir: "~/.codex/skills" },
  openclaw: { label: "OpenClaw",    dir: "~/.openclaw/skills" },
};

const { version: CLI_VERSION } = createRequire(import.meta.url)(
  "../package.json"
);

// ── Dry-run preview constants ──────────────────────────────────────────
// Shown in --dry-run previews wherever the value can only be obtained by running
// a package manager (installed/latest version, global package root).
const LATEST_PLACEHOLDER = "<latest>";
const GLOBAL_ROOT_PLACEHOLDER = "<global-root>";
// Printed once per dry-run command: makes it explicit that nothing was queried.
const DRY_RUN_NOTE =
  "ℹ --dry-run: version resolution skipped — no npm/pnpm is executed and no network call is made.";

const HELP = `
bitget-agent-installer v${CLI_VERSION}

Usage:
  npx bitget-agent-installer                                  Interactive menu
  npx bitget-agent-installer upgrade-all [--target <tools>]   Upgrade all packages to latest
  npx bitget-agent-installer upgrade <pkg> [--target <tools>] Upgrade one package to latest
  npx bitget-agent-installer rollback <pkg> --to <version>    Rollback to specific version
  npx bitget-agent-installer install [pkg] [--target <tools>] Deploy skills to AI tools

Flags:
  --target <t>  AI tool targets: claude, codex, openclaw, all (default: claude)
  --dry-run     Preview commands without executing
  --version     Print version and exit
  --help, -h    Print this help and exit

Supported packages: ${TARGET_PACKAGES.join(", ")}
`.trim();

// ── Arg Parsing ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    help: args.includes("--help") || args.includes("-h"),
    version: args.includes("--version"),
    dryRun: args.includes("--dry-run"),
    to: args.includes("--to")
      ? args[args.indexOf("--to") + 1] || null
      : null,
    target: args.includes("--target")
      ? args[args.indexOf("--target") + 1] || null
      : null,
  };
  const positional = args.filter(
    (a) =>
      !a.startsWith("--") &&
      !a.startsWith("-h") &&
      a !== flags.to &&
      a !== flags.target
  );
  return { command: positional[0] || null, pkg: positional[1] || null, ...flags };
}

// ── Package Manager Detection ──────────────────────────────────────────
function detectPM() {
  const execPath = process.env.npm_execpath || "";
  return execPath.includes("pnpm") ? "pnpm" : "npm";
}

// ── Shell Helpers ──────────────────────────────────────────────────────

// Reports (at most once per process) that a required executable could not be
// spawned — e.g. `npm` is not installed or is not on PATH. Without this the raw
// `spawn npm ENOENT` error escapes to main().catch(); here it becomes one
// actionable line in the CLI's own style plus a well-defined non-zero exit code.
let spawnFailureReported = false;
function reportSpawnFailure(cmd) {
  if (spawnFailureReported) return;
  spawnFailureReported = true;
  const isPm = cmd === "npm" || cmd === "pnpm";
  console.error(
    `✗ Could not run ${isPm ? `the "${cmd}" package manager` : `"${cmd}"`} — it was not found or is not executable.`
  );
  if (isPm) {
    console.error("  Install Node.js 20+ (which includes npm) or pnpm, then retry.");
  }
  process.exitCode = 1;
}

function exec(cmd, args, { dryRun = false } = {}) {
  const full = `${cmd} ${args.join(" ")}`;
  if (dryRun) {
    console.log(`[dry-run] $ ${full}`);
    return Promise.resolve(0);
  }
  console.log(`$ ${full}`);
  return new Promise((resolve) => {
    let child;
    try {
      child = nodeSpawn(cmd, args, {
        stdio: ["ignore", "inherit", "inherit"],
        shell: false,
      });
    } catch {
      reportSpawnFailure(cmd);
      resolve(1);
      return;
    }
    child.on("error", () => {
      reportSpawnFailure(cmd);
      resolve(1);
    });
    child.on("close", (code) => resolve(code));
  });
}

/**
 * Run a read-only command and capture its output.
 *
 * Returns `null` in --dry-run: nothing is spawned and no network I/O happens.
 * Returns `null` (and reports a friendly, actionable error once) when the
 * command cannot be spawned, so callers degrade gracefully instead of letting
 * `spawn npm ENOENT` escape to the top-level catch.
 */
function execCapture(cmd, args, { dryRun = false } = {}) {
  if (dryRun) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child;
    try {
      child = nodeSpawn(cmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });
    } catch {
      reportSpawnFailure(cmd);
      resolve(null);
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("error", () => {
      reportSpawnFailure(cmd);
      resolve(null);
    });
    child.on("close", (code) =>
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })
    );
  });
}

// ── Registry / Global Queries ──────────────────────────────────────────

async function getInstalledVersions(pm, dryRun = false) {
  const res = await execCapture(pm, ["list", "-g", "--depth=0", "--json"], { dryRun });
  if (!res || res.code !== 0 || !res.stdout) {
    return new Map(TARGET_PACKAGES.map((p) => [p, null]));
  }

  const data = JSON.parse(res.stdout);
  const deps = data.dependencies || {};
  return new Map(
    TARGET_PACKAGES.map((p) => [p, deps[p]?.version || null])
  );
}

async function getLatestVersion(pm, pkg, dryRun = false) {
  // Dry-run resolves nothing: preview the version-dependent part as a placeholder.
  if (dryRun) return LATEST_PLACEHOLDER;
  const res = await execCapture(pm, ["view", pkg, "version"]);
  if (!res || res.code !== 0 || !res.stdout) return null;
  return res.stdout.replace(/^"|"$/g, "");
}

async function getVersionHistory(pm, pkg, dryRun = false) {
  // No network in dry-run: an empty history tells the caller to skip validation.
  if (dryRun) return [];
  const res = await execCapture(pm, [
    "view",
    pkg,
    "versions",
    "--json",
  ]);
  if (!res || res.code !== 0 || !res.stdout) return [];
  const versions = JSON.parse(res.stdout);
  return Array.isArray(versions) ? versions.reverse() : [versions];
}

async function getGlobalRoot(pm, dryRun = false) {
  // No package manager in dry-run: callers substitute GLOBAL_ROOT_PLACEHOLDER.
  if (dryRun) return null;
  const res = await execCapture(pm, ["root", "-g"]);
  if (!res || res.code !== 0 || !res.stdout) return null;
  return res.stdout;
}

async function deploySkills(pm, pkgNames, targets, dryRun) {
  const globalRoot = await getGlobalRoot(pm, dryRun);
  if (!globalRoot && !dryRun) {
    console.error("✗ Could not determine global package root");
    return false;
  }

  let allOk = true;
  for (const pkg of pkgNames) {
    if (!SKILL_PACKAGES.includes(pkg)) continue;

    // In dry-run the real root is unknown, so preview an explicit placeholder
    // rather than silently using a bogus path.
    const scriptPath = globalRoot
      ? join(globalRoot, pkg, "scripts", "install.js")
      : `${GLOBAL_ROOT_PLACEHOLDER}/${pkg}/scripts/install.js`;
    const targetStr = targets.join(",");

    console.log(`\n📦 Deploying ${pkg} skills → ${targets.map((t) => DEPLOY_TARGETS[t].label).join(", ")}`);

    const code = await exec("node", [scriptPath, "--target", targetStr], { dryRun });
    if (code !== 0 && !dryRun) {
      console.error(`  ✗ Skill deployment failed for ${pkg}`);
      allOk = false;
    }
  }
  return allOk;
}

// ── Helpers ────────────────────────────────────────────────────────────

function validatePkg(pkg) {
  if (!pkg) {
    console.error("Error: package name required.");
    console.error(`Supported: ${TARGET_PACKAGES.join(", ")}`);
    process.exitCode = 1;
    return false;
  }
  if (!TARGET_PACKAGES.includes(pkg)) {
    console.error(`Unknown package. Supported: ${TARGET_PACKAGES.join(", ")}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function parseTargets(targetStr) {
  if (!targetStr) return null;
  if (targetStr === "all") return Object.keys(DEPLOY_TARGETS);
  const keys = targetStr.split(",").map((s) => s.trim());
  const invalid = keys.filter((k) => !(k in DEPLOY_TARGETS));
  if (invalid.length > 0) {
    console.error(
      `Unknown target(s): ${invalid.join(", ")}. Valid: ${Object.keys(DEPLOY_TARGETS).join(", ")}, all`
    );
    process.exitCode = 1;
    return null;
  }
  return keys;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function isInteractive() {
  return process.stdin.isTTY === true;
}

// ── Commands ───────────────────────────────────────────────────────────

async function cmdUpgradeAll(pm, dryRun, targets) {
  console.log("\n🔄 Upgrading all packages to latest...\n");
  const installed = await getInstalledVersions(pm, dryRun);
  let allOk = true;

  for (const pkg of TARGET_PACKAGES) {
    const current = installed.get(pkg);
    const latest = await getLatestVersion(pm, pkg, dryRun);
    if (!latest) {
      console.error(`✗ Failed to fetch latest version for ${pkg}`);
      allOk = false;
      continue;
    }

    console.log(`\n── ${pkg} ──`);
    if (current === latest) {
      console.log(`  Already at latest (${latest}) — skipping`);
      continue;
    }

    if (current) {
      console.log(`  ${current} → ${latest}`);
      const code = await exec(pm, ["uninstall", "-g", pkg], { dryRun });
      if (code !== 0 && !dryRun) {
        console.error(`  ✗ Uninstall failed`);
        allOk = false;
        continue;
      }
    } else {
      console.log(`  Not installed — installing ${latest}`);
    }

    const code = await exec(pm, ["install", "-g", `${pkg}@${latest}`], {
      dryRun,
    });
    if (code !== 0 && !dryRun) {
      console.error(`  ✗ Install failed`);
      allOk = false;
    } else {
      console.log(`  ✓ ${pkg}@${latest}`);
    }
  }

  console.log(allOk ? "\n✓ All packages up to date." : "\n⚠ Some packages failed.");
  if (!allOk) process.exitCode = 1;

  if (targets && allOk) {
    const skillsUpgraded = TARGET_PACKAGES.filter((p) => SKILL_PACKAGES.includes(p));
    if (skillsUpgraded.length > 0) {
      await deploySkills(pm, skillsUpgraded, targets, dryRun);
    }
  }
}

async function cmdUpgrade(pm, pkg, dryRun, targets) {
  if (!validatePkg(pkg)) return;

  const installed = await getInstalledVersions(pm, dryRun);
  const current = installed.get(pkg);
  const latest = await getLatestVersion(pm, pkg, dryRun);

  if (!latest) {
    console.error(`✗ Failed to fetch latest version for ${pkg}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n── ${pkg} ──`);

  if (current === latest) {
    console.log(`Already at latest (${latest}) — skipping`);
    return;
  }

  if (current) {
    console.log(`${current} → ${latest}`);
    const code = await exec(pm, ["uninstall", "-g", pkg], { dryRun });
    if (code !== 0 && !dryRun) {
      console.error("✗ Uninstall failed");
      process.exitCode = 1;
      return;
    }
  } else if (isInteractive()) {
    const answer = await ask(
      `${pkg} is not installed globally. Install latest? (y/n) `
    );
    if (answer.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }
  } else {
    console.log(`Not installed — installing ${latest}`);
  }

  const code = await exec(pm, ["install", "-g", `${pkg}@${latest}`], {
    dryRun,
  });
  if (code !== 0 && !dryRun) {
    console.error("✗ Install failed");
    process.exitCode = 1;
  } else {
    console.log(`✓ ${pkg}@${latest}`);
    if (targets && SKILL_PACKAGES.includes(pkg)) {
      await deploySkills(pm, [pkg], targets, dryRun);
    }
  }
}

async function cmdRollback(pm, pkg, toVersion, dryRun, targets) {
  if (!validatePkg(pkg)) return;

  if (!toVersion && !isInteractive()) {
    console.error("rollback requires --to <version>");
    process.exitCode = 1;
    return;
  }

  const versions = dryRun ? [] : await getVersionHistory(pm, pkg);
  if (versions.length === 0 && !dryRun) {
    console.error(`✗ Failed to fetch version history for ${pkg}`);
    process.exitCode = 1;
    return;
  }

  let targetVersion = toVersion;

  if (!targetVersion) {
    const installed = await getInstalledVersions(pm, dryRun);
    const current = installed.get(pkg);
    console.log(
      `\n${pkg} — ${current ? `current: ${current}` : "(not installed)"}`
    );
    console.log("Available versions:");
    const display = versions.slice(0, 20);
    display.forEach((v, i) => {
      const mark = v === current ? " (current)" : "";
      console.log(`  ${i + 1}. ${v}${mark}`);
    });
    if (versions.length > 20) {
      console.log(`  ... ${versions.length} versions total`);
    }

    const answer = await ask("Select version (0 to cancel): ");
    const idx = parseInt(answer, 10);
    if (idx === 0 || isNaN(idx) || idx < 1 || idx > display.length) {
      console.log("Cancelled.");
      return;
    }
    targetVersion = display[idx - 1];
  }

  if (!dryRun && !versions.includes(targetVersion)) {
    console.error(
      `✗ Version ${targetVersion} not found for ${pkg}. Use '${pm} view ${pkg} versions --json' to see available versions.`
    );
    process.exitCode = 1;
    return;
  }

  const installed = await getInstalledVersions(pm, dryRun);
  const current = installed.get(pkg);

  if (current === targetVersion) {
    console.log(`Already at ${targetVersion} — skipping`);
    return;
  }

  console.log(`\n── ${pkg} → ${targetVersion} ──`);

  if (current) {
    const code = await exec(pm, ["uninstall", "-g", pkg], { dryRun });
    if (code !== 0 && !dryRun) {
      console.error("✗ Uninstall failed");
      process.exitCode = 1;
      return;
    }
  }

  const code = await exec(pm, ["install", "-g", `${pkg}@${targetVersion}`], {
    dryRun,
  });
  if (code !== 0 && !dryRun) {
    console.error("✗ Install failed");
    process.exitCode = 1;
  } else {
    console.log(`✓ ${pkg}@${targetVersion}`);
    if (targets && SKILL_PACKAGES.includes(pkg)) {
      await deploySkills(pm, [pkg], targets, dryRun);
    }
  }
}

async function cmdInstall(pm, pkg, targetStr, dryRun) {
  const targets = parseTargets(targetStr || "claude");
  if (!targets) return;

  let pkgNames;
  if (pkg) {
    if (!SKILL_PACKAGES.includes(pkg)) {
      console.error(
        `${pkg} does not contain installable skills. Supported: ${SKILL_PACKAGES.join(", ")}`
      );
      process.exitCode = 1;
      return;
    }
    pkgNames = [pkg];
  } else {
    pkgNames = [...SKILL_PACKAGES];
  }

  // Global-install state cannot be known without running a package manager, so
  // dry-run skips the precondition and previews the deployment commands.
  if (!dryRun) {
    const installed = await getInstalledVersions(pm);
    const missing = pkgNames.filter((p) => !installed.get(p));
    if (missing.length > 0) {
      for (const p of missing) {
        console.error(
          `${p} is not globally installed. Run \`npx bitget-agent-installer upgrade ${p}\` first.`
        );
      }
      process.exitCode = 1;
      return;
    }
  }

  const ok = await deploySkills(pm, pkgNames, targets, dryRun);
  if (!ok) process.exitCode = 1;
}

async function interactiveInstall(pm, dryRun) {
  console.log("\nSelect installation target:");
  const targetKeys = Object.keys(DEPLOY_TARGETS);
  targetKeys.forEach((k, i) => {
    console.log(`  ${i + 1}. ${DEPLOY_TARGETS[k].label}  (${DEPLOY_TARGETS[k].dir})`);
  });
  console.log(`  ${targetKeys.length + 1}. All`);

  const targetChoice = await ask("Enter number (comma-separated for multiple): ");
  let targets;
  const nums = targetChoice.split(",").map((s) => parseInt(s.trim(), 10));
  if (nums.includes(targetKeys.length + 1)) {
    targets = targetKeys;
  } else {
    targets = nums
      .map((n) => targetKeys[n - 1])
      .filter(Boolean);
  }
  if (targets.length === 0) {
    console.log("Cancelled.");
    return;
  }

  console.log("\nSelect skill package:");
  console.log("  1. @bitget-ai/bitget-agent-skill (trading skill)");
  console.log("  2. bitget-signal                 (market-signal skills — Bitget-only signals rolling in)");
  console.log("  3. All");

  const pkgChoice = await ask("Enter number: ");
  let pkgNames;
  switch (pkgChoice) {
    case "1": pkgNames = ["@bitget-ai/bitget-agent-skill"]; break;
    case "2": pkgNames = ["@bitget-ai/bitget-signal"]; break;
    case "3": pkgNames = [...SKILL_PACKAGES]; break;
    default:
      console.log("Cancelled.");
      return;
  }

  if (!dryRun) {
    const installed = await getInstalledVersions(pm);
    const missing = pkgNames.filter((p) => !installed.get(p));
    if (missing.length > 0) {
      for (const p of missing) {
        console.error(
          `${p} is not globally installed. Run \`npx bitget-agent-installer upgrade ${p}\` first.`
        );
      }
      process.exitCode = 1;
      return;
    }
  }

  const ok = await deploySkills(pm, pkgNames, targets, dryRun);
  if (!ok) process.exitCode = 1;
}

async function interactiveMenu(pm, dryRun) {
  const installed = await getInstalledVersions(pm, dryRun);

  console.log(`\nbitget-agent-installer v${CLI_VERSION}\n`);
  console.log("? Select an action:");
  console.log("  1. Upgrade all packages to latest");
  console.log("  2. Upgrade a specific package");
  console.log("  3. Rollback a specific package");
  console.log("  4. Install skills to AI tools");
  console.log("  0. Exit");

  const choice = await ask("\nEnter number: ");

  switch (choice) {
    case "1":
      await cmdUpgradeAll(pm, dryRun, ["claude"]);
      return;

    case "2": {
      console.log("\nSelect package to upgrade:");
      TARGET_PACKAGES.forEach((p, i) => {
        const ver = installed.get(p);
        console.log(`  ${i + 1}. ${p} ${ver ? `(${ver})` : "(not installed)"}`);
      });
      const pkgChoice = await ask("Enter number: ");
      const idx = parseInt(pkgChoice, 10) - 1;
      if (idx < 0 || idx >= TARGET_PACKAGES.length) {
        console.log("Cancelled.");
        return;
      }
      return cmdUpgrade(pm, TARGET_PACKAGES[idx], dryRun, null);
    }

    case "3": {
      console.log("\nSelect package to rollback:");
      TARGET_PACKAGES.forEach((p, i) => {
        const ver = installed.get(p);
        console.log(`  ${i + 1}. ${p} ${ver ? `(${ver})` : "(not installed)"}`);
      });
      const pkgChoice = await ask("Enter number: ");
      const idx = parseInt(pkgChoice, 10) - 1;
      if (idx < 0 || idx >= TARGET_PACKAGES.length) {
        console.log("Cancelled.");
        return;
      }
      return cmdRollback(pm, TARGET_PACKAGES[idx], null, dryRun, null);
    }

    case "4":
      return interactiveInstall(pm, dryRun);

    case "0":
      return;

    default:
      console.log("Invalid choice.");
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.version) {
    console.log(CLI_VERSION);
    return;
  }

  const DRY_RUN_COMMANDS = ["upgrade-all", "upgrade", "rollback", "install"];
  if (opts.dryRun && DRY_RUN_COMMANDS.includes(opts.command)) {
    console.log(DRY_RUN_NOTE);
  }

  const pm = detectPM();

  const targets = opts.target ? parseTargets(opts.target) : null;
  if (opts.target && !targets) return;

  if (opts.command === "upgrade-all") {
    return cmdUpgradeAll(pm, opts.dryRun, targets);
  }

  if (opts.command === "upgrade") {
    return cmdUpgrade(pm, opts.pkg, opts.dryRun, targets);
  }

  if (opts.command === "rollback") {
    return cmdRollback(pm, opts.pkg, opts.to, opts.dryRun, targets);
  }

  if (opts.command === "install") {
    return cmdInstall(pm, opts.pkg, opts.target, opts.dryRun);
  }

  if (!opts.command) {
    if (!isInteractive()) {
      console.log(HELP);
      return;
    }
    return interactiveMenu(pm, opts.dryRun);
  }

  console.error(`Unknown command: ${opts.command}`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
