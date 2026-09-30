#!/usr/bin/env python3
"""
code-index-builder · scripts/diff_kb.py
========================================
Step 0b 完整四项差异扫描工具。
在发现已有知识库时，执行以下检查并输出标准化差异报告：

  0b-1  签名一致性：sig 字段漂移 / 已删除符号 / 路径变更
  0b-2  新增符号：源码新增但 _sigs.jsonl 未收录的函数/类/常量/协议处理函数
  0b-3  Bug 边界规则：比 _sigs.jsonl 新的源文件中含 BUG/FIXME/anti-pattern 类注释
  0b-4  架构变更：新增/删除/膨胀模块（委托 scan_repo.py --diff-kb 实现）

用法
----
  # 全量四项检查
  python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo

  # 只检查指定模块
  python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --modules combat inventory

  # 只跑签名漂移检查（0b-1）
  python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --sig-diff

  # 只跑新增符号检查（0b-2）
  python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --new-syms

  # 只跑 Bug 边界规则检查（0b-3）
  python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --bug-rules

  # 只跑架构变更检查（0b-4）
  python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --arch-diff --depth 1

  # 将差异报告写出到文件
  python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --report ./build/diff_report.md
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
import time
from pathlib import Path
from typing import Optional

# ──────────────────────────────────────────────────────────────
# 常量
# ──────────────────────────────────────────────────────────────

SOURCE_EXTS = {
    ".py", ".c", ".h", ".cpp", ".hpp", ".hh", ".cxx", ".cc",
    ".js", ".ts", ".jsx", ".tsx", ".lua", ".java", ".go",
    ".rs", ".cs", ".rb", ".swift", ".kt",
}

SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", "venv",
    "env", ".env", "dist", "build", ".idea", ".vscode", ".cache",
}

# 协议处理函数前缀模式（Step 0b-2 专用）
PROTOCOL_PREFIX_RE = re.compile(
    r'\b(C_[A-Z][A-Z0-9_]*|S_[A-Z][A-Z0-9_]*|MSG_[A-Z][A-Z0-9_]*)\b'
)

# 状态/枚举常量名模式（Step 0b-2 专用）
STATE_CONST_RE = re.compile(
    r'\b([A-Z][A-Z0-9_]*(STATE|STATUS|PHASE|STAGE)[A-Z0-9_]*|'
    r'(STATE|STATUS|PHASE|STAGE)_[A-Z][A-Z0-9_]*)\b'
)

# Bug/边界规则注释模式（Step 0b-3 专用）
BUG_RULE_RE = re.compile(
    r'(?:'
    r'(?:#|//|--)\s*(?:BUG|FIXME|HACK|⚠️|NOTE:\s*不可|注意：|TODO:\s*必须|MUST NOT|DO NOT|FORBIDDEN|anti[-_]?pattern)[^\n]{0,200}'
    r'|'
    r'/\*+\s*(?:MUST|必须|禁止)[^*]{0,200}\*+/'
    r')',
    re.IGNORECASE,
)

# anti-pattern 专用注释（已被 scan_repo.py 收录格式）
ANTI_PATTERN_RE = re.compile(
    r'(?:#|//|--)\s*(?:anti[-_]?pattern|ANTI_PATTERN)\s*:\s*([^\n]{1,200})',
    re.IGNORECASE,
)


# ──────────────────────────────────────────────────────────────
# 工具函数
# ──────────────────────────────────────────────────────────────

def _iter_source_files(module_dir: Path):
    """遍历模块目录内所有源文件，yield (abs_path, rel_path_str)。"""
    for f in sorted(module_dir.rglob("*")):
        if f.is_file() and f.suffix.lower() in SOURCE_EXTS:
            if not any(part in SKIP_DIRS for part in f.parts):
                yield f


def _load_sigs_jsonl(sigs_path: Path) -> list[dict]:
    rows: list[dict] = []
    if not sigs_path.exists():
        return rows
    for line in sigs_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            pass
    return rows


def _extract_sigs_from_source(repo_root: Path, module_dir: Path) -> list[dict]:
    """
    从源文件中提取当前签名，复用 extract_signatures.py 的逻辑。
    为避免循环导入，直接在本模块内调用 subprocess 执行脚本。
    """
    import subprocess, tempfile
    script = Path(__file__).parent / "extract_signatures.py"
    if not script.exists():
        return []
    with tempfile.TemporaryDirectory() as tmpdir:
        rel_mod = str(module_dir.relative_to(repo_root))
        out_dir = Path(tmpdir)
        cmd = [
            sys.executable, str(script),
            str(repo_root),
            "--kb-output", str(out_dir),
            "--modules", rel_mod.replace("/", os.sep),
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except subprocess.CalledProcessError:
            return []
        sigs_path = out_dir / rel_mod / "_sigs.jsonl"
        return _load_sigs_jsonl(sigs_path)


# ──────────────────────────────────────────────────────────────
# Step 0b-1：签名一致性检查
# ──────────────────────────────────────────────────────────────

def check_sig_diff(
    repo_root: Path,
    kb_dir: Path,
    modules: Optional[list[str]],
) -> dict:
    """
    比对 _sigs.jsonl 中记录的签名与当前源码提取结果。
    返回 {module: {"drifted": [...], "deleted": [...], "path_changed": [...]}}
    """
    print("\n🔍 Step 0b-1：签名一致性检查...")
    result: dict[str, dict] = {}

    target_mods = _resolve_modules(repo_root, kb_dir, modules)

    for mod in target_mods:
        # 叶目录兼容："." 表示 repo_root 自身，_sigs.jsonl 放在 kb_dir 根
        module_dir = repo_root if mod == "." else repo_root / Path(mod)
        sigs_path  = kb_dir / "_sigs.jsonl" if mod == "." else kb_dir / mod / "_sigs.jsonl"
        if not sigs_path.exists():
            print(f"   ⚠️  {mod}: _sigs.jsonl 不存在，跳过")
            continue

        kb_rows   = _load_sigs_jsonl(sigs_path)
        new_rows  = _extract_sigs_from_source(repo_root, module_dir)

        # 索引：file:name → row
        kb_index  = {f"{r['file']}::{r['name']}": r for r in kb_rows if "name" in r}
        new_index = {f"{r['file']}::{r['name']}": r for r in new_rows if "name" in r}

        # 同时建立 name-only 索引，检测路径变更
        kb_by_name:  dict[str, list[dict]] = {}
        new_by_name: dict[str, list[dict]] = {}
        for r in kb_rows:
            kb_by_name.setdefault(r.get("name", ""), []).append(r)
        for r in new_rows:
            new_by_name.setdefault(r.get("name", ""), []).append(r)

        drifted:      list[dict] = []
        deleted:      list[dict] = []
        path_changed: list[dict] = []

        for key, kb_row in kb_index.items():
            name = kb_row.get("name", "")
            if key in new_index:
                new_row = new_index[key]
                kb_sig  = kb_row.get("sig", "").strip()
                new_sig = new_row.get("sig", "").strip()
                if kb_sig and new_sig and kb_sig != new_sig:
                    drifted.append({
                        "symbol":  f"{kb_row['file']}:{name}",
                        "old_sig": kb_sig,
                        "new_sig": new_sig,
                    })
            else:
                # 不在 new_index，检查是否路径变更
                moved = False
                for nr in new_by_name.get(name, []):
                    new_key = f"{nr['file']}::{name}"
                    if new_key not in kb_index:
                        path_changed.append({
                            "symbol":   name,
                            "old_file": kb_row["file"],
                            "new_file": nr["file"],
                        })
                        moved = True
                        break
                if not moved:
                    deleted.append({
                        "symbol": f"{kb_row['file']}:{name}",
                        "sig":    kb_row.get("sig", ""),
                    })

        result[mod] = {"drifted": drifted, "deleted": deleted, "path_changed": path_changed}

        total = len(drifted) + len(deleted) + len(path_changed)
        print(f"   {mod}: 漂移={len(drifted)} 删除={len(deleted)} 路径变更={len(path_changed)}"
              f"{'  ✅' if total == 0 else ''}")

    return result


# ──────────────────────────────────────────────────────────────
# Step 0b-2：新增符号检查
# ──────────────────────────────────────────────────────────────

def check_new_symbols(
    repo_root: Path,
    kb_dir: Path,
    modules: Optional[list[str]],
) -> dict:
    """
    比对当前源码提取结果与 _sigs.jsonl，找出知识库中未收录的新增符号。
    同时标记需要更新 _conventions.md 的协议/状态类常量。
    """
    print("\n🔍 Step 0b-2：新增符号/类/协议检查...")
    result: dict[str, dict] = {}

    target_mods = _resolve_modules(repo_root, kb_dir, modules)

    for mod in target_mods:
        # 叶目录兼容："." 表示 repo_root 自身
        module_dir = repo_root if mod == "." else repo_root / Path(mod)
        sigs_path  = kb_dir / "_sigs.jsonl" if mod == "." else kb_dir / mod / "_sigs.jsonl"
        kb_rows    = _load_sigs_jsonl(sigs_path)
        new_rows   = _extract_sigs_from_source(repo_root, module_dir)

        kb_keys  = {f"{r.get('file','')}::{r.get('name','')}" for r in kb_rows}
        new_syms = [r for r in new_rows
                    if f"{r.get('file','')}::{r.get('name','')}" not in kb_keys
                    and r.get("name")]

        # 分类
        protocol_syms = [r for r in new_syms
                         if PROTOCOL_PREFIX_RE.search(r.get("name", ""))]
        state_consts  = [r for r in new_syms
                         if STATE_CONST_RE.search(r.get("name", ""))
                         and r.get("kind") in ("constant", "variable")]
        other_syms    = [r for r in new_syms
                         if r not in protocol_syms and r not in state_consts]

        result[mod] = {
            "new_symbols":   new_syms,
            "protocol_syms": protocol_syms,
            "state_consts":  state_consts,
            "other_syms":    other_syms,
        }
        print(f"   {mod}: 新增符号={len(new_syms)} "
              f"（协议={len(protocol_syms)} 状态常量={len(state_consts)} 其他={len(other_syms)}）"
              f"{'  ✅' if not new_syms else ''}")

    return result


# ──────────────────────────────────────────────────────────────
# Step 0b-3：Bug 边界规则检查
# ──────────────────────────────────────────────────────────────

def check_bug_rules(
    repo_root: Path,
    kb_dir: Path,
    modules: Optional[list[str]],
) -> dict:
    """
    扫描比 _sigs.jsonl 更新的源文件，找出含 BUG/FIXME/anti-pattern 类注释但
    尚未被收录进知识库约束清单的边界规则。
    """
    print("\n🔍 Step 0b-3：Bug 边界规则补录检查...")
    result: dict[str, list[dict]] = {}

    target_mods = _resolve_modules(repo_root, kb_dir, modules)

    # 预先加载已有约束文本（用于去重）
    conventions_text = ""
    conv_path = kb_dir / "_conventions.md"
    if conv_path.exists():
        conventions_text = conv_path.read_text(encoding="utf-8", errors="ignore")

    for mod in target_mods:
        # 叶目录兼容："." 表示 repo_root 自身
        module_dir = repo_root if mod == "." else repo_root / Path(mod)
        sigs_path  = kb_dir / "_sigs.jsonl" if mod == "." else kb_dir / mod / "_sigs.jsonl"

        # 基线时间：_sigs.jsonl 修改时间（不存在则取 0，全量扫描）
        baseline_mtime = sigs_path.stat().st_mtime if sigs_path.exists() else 0.0

        # 加载模块子文档文本（用于约束去重）
        module_kb_text = ""
        # 叶目录兼容："." 表示 kb_dir 自身
        module_kb_dir = kb_dir if mod == "." else kb_dir / mod
        if module_kb_dir.is_dir():
            for md_f in module_kb_dir.glob("*.md"):
                module_kb_text += md_f.read_text(encoding="utf-8", errors="ignore") + "\n"

        missing_rules: list[dict] = []

        for src_file in _iter_source_files(module_dir):
            try:
                if src_file.stat().st_mtime <= baseline_mtime:
                    continue  # 文件未更新，跳过
                text = src_file.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            lines = text.splitlines()

            for m in BUG_RULE_RE.finditer(text):
                comment = m.group(0).strip()
                lineno  = text[:m.start()].count("\n") + 1

                # 若注释已被收录进知识库文档，跳过
                # 简单去重：取前 30 字符做模糊匹配
                key = re.sub(r'[^a-zA-Z\u4e00-\u9fff]', '', comment)[:30]
                if key in re.sub(r'[^a-zA-Z\u4e00-\u9fff]', '', module_kb_text + conventions_text):
                    continue

                try:
                    rel = str(src_file.relative_to(repo_root))
                except ValueError:
                    rel = str(src_file)

                missing_rules.append({
                    "file":    rel,
                    "line":    lineno,
                    "comment": comment[:200],
                    "type":    "anti_pattern" if ANTI_PATTERN_RE.search(comment) else "bug_hint",
                })

        result[mod] = missing_rules
        print(f"   {mod}: 未收录边界规则={len(missing_rules)}"
              f"{'  ✅' if not missing_rules else ''}")

    return result


# ──────────────────────────────────────────────────────────────
# Step 0b-4：架构变更检查（委托 scan_repo.py）
# ──────────────────────────────────────────────────────────────

def check_arch_diff(repo_root: Path, kb_dir: Path, scan_depth: int) -> dict:
    """委托 scan_repo.py --diff-kb 执行架构变更检查，捕获输出并返回结构化结果。"""
    print("\n🔍 Step 0b-4：架构变更检查（委托 scan_repo.py）...")
    import subprocess, tempfile

    scan_script = Path(__file__).parent / "scan_repo.py"
    if not scan_script.exists():
        print("   ❌ 找不到 scan_repo.py，跳过 0b-4", file=sys.stderr)
        return {}

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        tmp_path = Path(tf.name)

    try:
        cmd = [
            sys.executable, str(scan_script),
            str(repo_root), "--scan",
            "--diff-kb", str(kb_dir),
            "--depth",   str(scan_depth),
            "--output",  str(tmp_path),
        ]
        subprocess.run(cmd, check=True)
        if tmp_path.exists():
            data = json.loads(tmp_path.read_text(encoding="utf-8"))
            return data
    except Exception as e:
        print(f"   ⚠️  scan_repo.py 调用失败: {e}", file=sys.stderr)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)

    return {}


# ──────────────────────────────────────────────────────────────
# 辅助：解析目标模块列表
# ──────────────────────────────────────────────────────────────

def _resolve_modules(
    repo_root: Path,
    kb_dir: Path,
    modules: Optional[list[str]],
) -> list[str]:
    if modules:
        return modules
    # 枚举 codeindex/ 中的非下划线子目录作为模块列表
    result = []
    if kb_dir.is_dir():
        for d in sorted(kb_dir.iterdir()):
            if d.is_dir() and not d.name.startswith("_") and not d.name.startswith("."):
                # 验证仓库中对应目录存在
                if (repo_root / d.name).is_dir():
                    result.append(d.name)
    # 叶目录兼容：kb_dir 无子模块目录且 repo_root 本身就是叶目录时，用 "." 代表自身
    if not result and repo_root.is_dir():
        sub_dirs = [d for d in repo_root.iterdir()
                    if d.is_dir() and not d.name.startswith(".") and not d.name.startswith("_")]
        if not sub_dirs:
            result.append(".")
    return result


# ──────────────────────────────────────────────────────────────
# 输出：标准化差异报告
# ──────────────────────────────────────────────────────────────

def render_report(
    sig_diff:  Optional[dict],
    new_syms:  Optional[dict],
    bug_rules: Optional[dict],
    arch_diff: Optional[dict],
) -> str:
    lines = ["# 知识库差异扫描报告（Step 0b）\n"]

    # ── 0b-1 ──────────────────────────────────────────────────
    lines.append("## Step 0b-1：签名一致性\n")
    if sig_diff:
        drift_total = sum(len(v["drifted"])      for v in sig_diff.values())
        del_total   = sum(len(v["deleted"])      for v in sig_diff.values())
        path_total  = sum(len(v["path_changed"]) for v in sig_diff.values())
        lines.append(f"### [签名漂移] {drift_total} 条")
        for mod, v in sig_diff.items():
            for item in v["drifted"]:
                lines.append(f"- `{item['symbol']}` — `{item['old_sig']}` → `{item['new_sig']}`")
        lines.append(f"\n### [已删除符号] {del_total} 条")
        for mod, v in sig_diff.items():
            for item in v["deleted"]:
                lines.append(f"- `{item['symbol']}` — 源码中已不存在，将从 _sigs.jsonl 移除")
        lines.append(f"\n### [路径变更] {path_total} 条")
        for mod, v in sig_diff.items():
            for item in v["path_changed"]:
                lines.append(f"- `{item['symbol']}`: `{item['old_file']}` → `{item['new_file']}`")
    else:
        lines.append("_（本次未执行 0b-1 检查）_")

    # ── 0b-2 ──────────────────────────────────────────────────
    lines.append("\n## Step 0b-2：新增符号/类/协议\n")
    if new_syms:
        total = sum(len(v["new_symbols"]) for v in new_syms.values())
        lines.append(f"### [新增符号] {total} 条")
        for mod, v in new_syms.items():
            for sym in v["other_syms"]:
                lines.append(f"- `{sym.get('file','')}:{sym.get('name','')}` ({sym.get('kind','')})")
            for sym in v["protocol_syms"]:
                lines.append(f"- `{sym.get('file','')}:{sym.get('name','')}` — **协议处理函数，需更新 _conventions.md 协议命名规约**")
            for sym in v["state_consts"]:
                lines.append(f"- `{sym.get('file','')}:{sym.get('name','')}` — **状态常量，需补入 _conventions.md 状态机规约表**")
    else:
        lines.append("_（本次未执行 0b-2 检查）_")

    # ── 0b-3 ──────────────────────────────────────────────────
    lines.append("\n## Step 0b-3：Bug 边界规则补录\n")
    if bug_rules:
        total = sum(len(v) for v in bug_rules.values())
        lines.append(f"### [边界规则缺失] {total} 条")
        for mod, rules in bug_rules.items():
            for r in rules:
                tag = "anti_pattern" if r["type"] == "anti_pattern" else "bug_hint"
                lines.append(f"- `{r['file']}:{r['line']}` [{tag}] — {r['comment'][:100]}")
    else:
        lines.append("_（本次未执行 0b-3 检查）_")

    # ── 0b-4 ──────────────────────────────────────────────────
    lines.append("\n## Step 0b-4：架构变更\n")
    if arch_diff:
        added   = arch_diff.get("added_modules", [])
        removed = arch_diff.get("removed_modules", [])
        bloated = arch_diff.get("bloated_modules", [])
        lines.append(f"### [新增模块] {len(added)} 个")
        for m in added:
            lines.append(f"  - `{m}` — 首次发现，将走完整生成流程（Step 2→8）")
        lines.append(f"\n### [已删除模块] {len(removed)} 个")
        for m in removed:
            lines.append(f"  - `{m}` — 目录已删除，需从 _catalog.md / _index.md / _concept_index.md 中移除")
        lines.append(f"\n### [架构膨胀] {len(bloated)} 个")
        for b in bloated:
            old_c, new_c = b["old_file_count"], b["new_file_count"]
            pct = int((new_c - old_c) / max(old_c, 1) * 100)
            lines.append(f"  - `{b['module']}` — 源文件数从 {old_c} 增至 {new_c}（+{pct}%），建议在 Step 5 重新评估子文档拆分")
    else:
        lines.append("_（本次未执行 0b-4 检查）_")

    lines.append("\n---")
    lines.append("> 以上差异将在后续步骤中按需处理；无差异的模块保持缓存不变。")

    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# CLI 主入口
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Step 0b 差异扫描：检测已有知识库与源码的差异（签名/新增符号/边界规则/架构）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        示例:
          # 全量四项检查
          python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo

          # 只检查指定模块，只跑签名漂移
          python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --modules combat --sig-diff

          # 将报告写出到文件
          python3 diff_kb.py /path/to/repo --kb-dir ./codeindex/my-repo --report ./build/diff_report.md
        """),
    )
    parser.add_argument("repo_path",  help="仓库根目录（本地绝对路径）")
    parser.add_argument("--kb-dir",   required=True, metavar="KB_DIR",
                        help="已有知识库根目录，如 ./codeindex/my-repo")
    parser.add_argument("--modules",  nargs="+", metavar="MODULE", default=None,
                        help="只检查指定模块（默认：枚举 codeindex/ 所有子目录）")
    parser.add_argument("--depth",    type=int, default=1, choices=[1, 2],
                        help="Step 0b-4 架构变更检查的模块深度（默认 1）")
    parser.add_argument("--sig-diff", action="store_true",
                        help="只执行 0b-1 签名一致性检查")
    parser.add_argument("--new-syms", action="store_true",
                        help="只执行 0b-2 新增符号检查")
    parser.add_argument("--bug-rules", action="store_true",
                        help="只执行 0b-3 Bug 边界规则检查")
    parser.add_argument("--arch-diff", action="store_true",
                        help="只执行 0b-4 架构变更检查")
    parser.add_argument("--report",   metavar="FILE", default=None,
                        help="将差异报告写出到 Markdown 文件（同时也会打印到 stdout）")

    args = parser.parse_args()

    repo_root = Path(args.repo_path).resolve()
    kb_dir    = Path(args.kb_dir).resolve()

    if not repo_root.is_dir():
        print(f"❌ 仓库目录不存在: {repo_root}", file=sys.stderr)
        sys.exit(1)
    if not kb_dir.is_dir():
        print(f"❌ kb 目录不存在: {kb_dir}", file=sys.stderr)
        sys.exit(1)

    # 若未指定任何单项，默认全量执行
    run_all = not any([args.sig_diff, args.new_syms, args.bug_rules, args.arch_diff])

    t0 = time.time()
    print(f"\n🚀 code-index-builder · diff_kb")
    print(f"   仓库   : {repo_root}")
    print(f"   kb 目录: {kb_dir}")
    print(f"   模块   : {args.modules or '（全部）'}")

    sig_diff_result:  Optional[dict] = None
    new_syms_result:  Optional[dict] = None
    bug_rules_result: Optional[dict] = None
    arch_diff_result: Optional[dict] = None

    if run_all or args.sig_diff:
        sig_diff_result = check_sig_diff(repo_root, kb_dir, args.modules)

    if run_all or args.new_syms:
        new_syms_result = check_new_symbols(repo_root, kb_dir, args.modules)

    if run_all or args.bug_rules:
        bug_rules_result = check_bug_rules(repo_root, kb_dir, args.modules)

    if run_all or args.arch_diff:
        arch_diff_result = check_arch_diff(repo_root, kb_dir, args.depth)

    elapsed = round(time.time() - t0, 1)
    print(f"\n⏱️  扫描完成，耗时 {elapsed}s\n")

    report = render_report(sig_diff_result, new_syms_result, bug_rules_result, arch_diff_result)
    print(report)

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report, encoding="utf-8")
        print(f"\n✅ 差异报告已写出: {report_path}")


if __name__ == "__main__":
    main()
