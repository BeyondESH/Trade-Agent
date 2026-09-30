#!/usr/bin/env python3
"""
code-index-builder · scripts/generate_desc.py
==============================================
Step 1（--prepare）：读取某模块的 _sigs.jsonl，做分词+词频统计，
                     生成 _desc_context.md 供 Agent 批量解读。

Step 2（--finalize）：在 Agent 将 desc 写回 _sigs.jsonl 后，
                      生成 _grep_hints.txt（符号名→文件:行号）。

用法
----
# 对 codeindex/ 下所有模块批量生成 _desc_context.md
python3 generate_desc.py ./codeindex/my-repo --prepare

# 只处理指定模块
python3 generate_desc.py ./codeindex/my-repo --prepare --modules combat inventory

# Agent 填写 desc 后，生成各模块的 _grep_hints.txt
python3 generate_desc.py ./codeindex/my-repo --finalize

# 单独处理一个模块目录
python3 generate_desc.py ./codeindex/my-repo/combat --prepare --single
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import textwrap
from collections import Counter
from pathlib import Path
from typing import Optional

TOP_N = 100          # 取词频 Top N
MAX_EXAMPLES = 5     # 每个词最多展示 N 个典型符号示例

# ──────────────────────────────────────────────────────────────
# 分词：下划线 + 驼峰
# ──────────────────────────────────────────────────────────────

_CAMEL_RE = re.compile(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])')
_STOP_WORDS = {
    "a", "an", "the", "of", "in", "to", "for", "and", "or", "is", "be",
    "at", "on", "by", "it", "as", "if", "do", "go", "my", "no", "up",
    # 常见但无语义的技术词
    "get", "set", "on", "is", "has", "can", "do", "run",
}
_MIN_WORD_LEN = 2    # 过滤单字母词


def _tokenize(name: str) -> list[str]:
    """将符号名分词（下划线 + 驼峰），返回小写词列表。"""
    # 去掉私有前缀下划线
    name = name.lstrip("_")
    # 下划线分词
    if "_" in name:
        parts = name.split("_")
    else:
        # 驼峰分词
        parts = _CAMEL_RE.sub("_", name).split("_")

    words = []
    for part in parts:
        part = part.lower().strip()
        if len(part) >= _MIN_WORD_LEN and part not in _STOP_WORDS:
            words.append(part)
    return words


# ──────────────────────────────────────────────────────────────
# --prepare：生成 _desc_context.md
# ──────────────────────────────────────────────────────────────

def prepare_module(module_dir: Path) -> bool:
    """
    读取 module_dir/_sigs.jsonl，统计词频，生成 _desc_context.md。
    返回 True 表示成功。
    """
    sigs_path = module_dir / "_sigs.jsonl"
    if not sigs_path.exists():
        print(f"  ⚠️  跳过 {module_dir.name}: 找不到 _sigs.jsonl")
        return False

    # ── 读取 JSONL ──────────────────────────────────────────
    all_entities: list[dict] = []
    skipped: list[dict] = []
    with open(sigs_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if "_skipped" in obj:
                    skipped.append(obj)
                else:
                    all_entities.append(obj)
            except Exception:
                pass

    public_entities = [e for e in all_entities if e.get("is_public", True)]
    total_pub = len(public_entities)

    if total_pub == 0:
        print(f"  ℹ️  {module_dir.name}: 无公开实体，跳过生成 _desc_context.md")
        return True

    # ── 分词 + 词频统计 ─────────────────────────────────────
    word_counter: Counter = Counter()
    word_to_symbols: dict[str, list[str]] = {}

    for e in public_entities:
        name = e.get("name", "")
        tokens = _tokenize(name)
        for tok in set(tokens):         # 每个符号对同一词只贡献一次计数
            word_counter[tok] += 1
            if tok not in word_to_symbols:
                word_to_symbols[tok] = []
            if name not in word_to_symbols[tok]:
                word_to_symbols[tok].append(name)

    top_words = word_counter.most_common(TOP_N)

    # ── 生成 _desc_context.md ───────────────────────────────
    lines: list[str] = [
        f"# {module_dir.name} · 符号解读上下文\n",
        f"\n",
        f"> **用途**：此文件供 Agent 读取，批量为模块内的公开符号生成一句话 desc。\n",
        f"> 完成后请将 desc 写回 `_sigs.jsonl`（对应行的 `\"desc\"` 字段），然后运行 `generate_desc.py --finalize`。\n",
        f"\n",
        f"## 模块概况\n",
        f"\n",
        f"- 公开实体总数：**{total_pub}** 个\n",
        f"- 跳过文件数：{len(skipped)} 个\n",
        f"\n",
        f"## 本模块高频词汇 Top {min(TOP_N, len(top_words))}\n",
        f"\n",
        f"> 按词频倒序排列，可作为理解本模块语义的快速词表。\n",
        f"\n",
        f"| 词 | 出现符号数 | 典型符号（最多 {MAX_EXAMPLES} 个） |\n",
        f"|---|---|---|\n",
    ]

    for word, count in top_words:
        examples = word_to_symbols.get(word, [])[:MAX_EXAMPLES]
        examples_str = "、".join(f"`{s}`" for s in examples)
        lines.append(f"| `{word}` | {count} | {examples_str} |\n")

    lines += [
        f"\n",
        f"## 需解读的公开符号（共 {total_pub} 个）\n",
        f"\n",
        f"> **Agent 任务**：为每个符号填写一句话中文 desc（≤ 60 字）。\n",
        f"> 结合上方词表和签名推断，优先使用 `doc` 字段内容；无 doc 时根据名称+路径推断。\n",
        f"> 私有符号（`is_public: false`）无需填写，desc 留空即可。\n",
        f"\n",
    ]

    # 按文件分组展示，方便 Agent 批处理
    file_groups: dict[str, list[dict]] = {}
    for e in public_entities:
        fp = e.get("file", "")
        if fp not in file_groups:
            file_groups[fp] = []
        file_groups[fp].append(e)

    for fp in sorted(file_groups.keys()):
        entities = file_groups[fp]
        lines.append(f"### `{fp}`\n\n")
        lines.append(f"| 符号名 | 类型 | 行号 | 签名摘要 | doc（已有） | desc（待填写） |\n")
        lines.append(f"|---|---|---|---|---|---|\n")
        for e in entities:
            name   = e.get("name", "")
            kind   = e.get("kind", "function")
            lineno = e.get("line", 0)
            sig    = e.get("sig", "").replace("|", "\\|")[:80]
            doc    = (e.get("doc") or "").replace("|", "\\|")[:60]
            desc   = (e.get("desc") or "").replace("|", "\\|")
            lines.append(f"| `{name}` | {kind} | {lineno} | `{sig}` | {doc} | {desc} |\n")
        lines.append("\n")

    out_path = module_dir / "_desc_context.md"
    out_path.write_text("".join(lines), encoding="utf-8")
    print(f"  ✓ {module_dir.name}: 生成 _desc_context.md ({total_pub} 个公开符号，top-{len(top_words)} 词)")
    return True


# ──────────────────────────────────────────────────────────────
# --finalize：生成 _grep_hints.txt
# ──────────────────────────────────────────────────────────────

def finalize_module(module_dir: Path) -> bool:
    """
    读取 module_dir/_sigs.jsonl（已由 Agent 填写 desc），
    生成 _grep_hints.txt。
    """
    sigs_path = module_dir / "_sigs.jsonl"
    if not sigs_path.exists():
        print(f"  ⚠️  跳过 {module_dir.name}: 找不到 _sigs.jsonl")
        return False

    entities: list[dict] = []
    with open(sigs_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if "_skipped" not in obj:
                    entities.append(obj)
            except Exception:
                pass

    if not entities:
        print(f"  ⚠️  {module_dir.name}: _sigs.jsonl 中无有效实体")
        return False

    # 生成 _grep_hints.txt：符号名 → 文件:行号  [desc 前 50 字]
    hints: list[str] = []
    for e in sorted(entities, key=lambda x: (x.get("file", ""), x.get("line", 0))):
        name   = e.get("name", "")
        fp     = e.get("file", "")
        lineno = e.get("line", 0)
        desc   = (e.get("desc") or "").strip()[:50]
        if not name or not fp:
            continue
        suffix = f"  # {desc}" if desc else ""
        hints.append(f"{name} → {fp}:{lineno}{suffix}")

    hints_path = module_dir / "_grep_hints.txt"
    hints_path.write_text("\n".join(hints) + "\n", encoding="utf-8")

    # 统计 desc 填写覆盖率
    pub_entities    = [e for e in entities if e.get("is_public", True)]
    desc_filled     = sum(1 for e in pub_entities if (e.get("desc") or "").strip())
    coverage_pct    = int(desc_filled / max(len(pub_entities), 1) * 100)

    print(f"  ✓ {module_dir.name}: 生成 _grep_hints.txt ({len(hints)} 条符号映射，"
          f"desc 覆盖率 {desc_filled}/{len(pub_entities)} = {coverage_pct}%)")
    return True


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def _collect_module_dirs(kb_root: Path, module_names: Optional[list[str]]) -> list[Path]:
    """从 kb_root 下收集所有（或指定）模块目录。
    叶目录兼容：若 kb_root 自身无非下划线子目录，将 kb_root 自身作为唯一模块目录返回。
    """
    result = []
    for d in sorted(kb_root.iterdir(), key=lambda p: p.name.lower()):
        if not d.is_dir() or d.name.startswith(".") or d.name.startswith("_"):
            continue
        if module_names and d.name not in module_names:
            continue
        result.append(d)
    # 叶目录兼容：无子模块目录时，将 kb_root 自身视为模块目录
    if not result and not module_names:
        result.append(kb_root)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="分词+词频→生成 desc 上下文文件，或在 Agent 填写后生成 _grep_hints.txt",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        用法示例:
          # Step 1：为所有模块生成 desc 上下文
          python3 generate_desc.py ./codeindex/my-repo --prepare

          # Step 1（只处理指定模块）
          python3 generate_desc.py ./codeindex/my-repo --prepare --modules combat inventory

          # Step 2（Agent 填写 desc 后）：生成 _grep_hints.txt
          python3 generate_desc.py ./codeindex/my-repo --finalize
        """),
    )
    parser.add_argument("kb_path",
                        help="kb 根目录（如 ./codeindex/my-repo）或单个模块目录（配合 --single）")
    parser.add_argument("--prepare",  action="store_true",
                        help="生成各模块的 _desc_context.md（Codemap 可用时无需执行，使用 --force 可强制运行）")
    parser.add_argument("--finalize", action="store_true",
                        help="生成各模块的 _grep_hints.txt（Agent 填写 desc 后调用；Codemap 不可用时的 fallback 符号索引）")
    parser.add_argument("--modules", nargs="+", metavar="MODULE", default=None,
                        help="只处理指定模块（默认全部）")
    parser.add_argument("--single", action="store_true",
                        help="kb_path 直接指向单个模块目录（无需再向下遍历）")
    parser.add_argument("--force", action="store_true",
                        help="强制执行 --prepare，即使 Codemap 可用（覆盖自动跳过逻辑）")

    args = parser.parse_args()

    if not args.prepare and not args.finalize:
        parser.error("请指定 --prepare 或 --finalize")

    # --prepare 在 Codemap 可用时给出提示（实际跳过由 build_index.py 控制）
    if args.prepare and not args.force:
        import os
        codemap_status = os.environ.get("CODEMAP_STATUS", "")
        if codemap_status == "available":
            print("⏭️  Codemap 可用（CODEMAP_STATUS=available），跳过 --prepare。"
                  "\n    如需强制运行，请追加 --force 参数。")
            sys.exit(0)

    kb_path = Path(args.kb_path).resolve()
    if not kb_path.exists():
        print(f"❌ 路径不存在: {kb_path}", file=sys.stderr)
        sys.exit(1)

    if args.single:
        module_dirs = [kb_path]
    else:
        if not kb_path.is_dir():
            print(f"❌ 不是目录: {kb_path}", file=sys.stderr)
            sys.exit(1)
        module_dirs = _collect_module_dirs(kb_path, args.modules)

    if not module_dirs:
        print("⚠️  未找到任何模块目录（目录名以 _ 或 . 开头的会被跳过）")
        sys.exit(0)

    mode = "prepare" if args.prepare else "finalize"
    print(f"\n⚙️  generate_desc · mode={mode}")
    print(f"   目标模块数: {len(module_dirs)}\n")

    ok_count  = 0
    fail_count = 0

    for d in module_dirs:
        if args.prepare:
            ok = prepare_module(d)
        else:
            ok = finalize_module(d)
        if ok:
            ok_count += 1
        else:
            fail_count += 1

    print(f"\n✅ 完成：{ok_count} 成功，{fail_count} 跳过/失败")

    if args.prepare:
        print("\n📋 下一步（Agent）：")
        print("   1. 读取各模块的 _desc_context.md")
        print("   2. 根据词表 + 签名，为每个公开符号填写 desc 字段")
        print("   3. 将 desc 写回对应模块的 _sigs.jsonl（更新每行的 \"desc\" 字段）")
        print("   4. 完成后运行: python3 generate_desc.py <kb_path> --finalize\n")
    else:
        print("\n📋 _grep_hints.txt 已就绪，可直接 grep 定位符号：")
        print("   grep '函数名' codeindex/<repo>/{module}/_grep_hints.txt\n")


if __name__ == "__main__":
    main()
