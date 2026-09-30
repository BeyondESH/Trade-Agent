#!/usr/bin/env python3
# ⚠️  FALLBACK SCRIPT
# 本脚本是 Codemap MCP Tools 的降级路径。
# 若环境已接入 Codemap MCP（get_graph_stats() 可响应），请优先使用
# find_symbol / search_code，无需运行本脚本。
# build_index.py 在 Codemap 可用时会自动跳过本脚本（Step 2）。
# 若需强制运行，请使用：python3 extract_signatures.py ... --force
"""
code-index-builder · scripts/extract_signatures.py
===================================================
使用 tree-sitter 从源文件中提取函数/类/方法签名。
按模块（仓库根一级子目录）分组，输出到 codeindex/<repo>/{module}/_sigs.jsonl。

支持语言（需对应 tree-sitter-* wheel）：
  Python / C / C++ / JavaScript / TypeScript / Java / Go / Rust / Lua / C# / Ruby

其他语言以通用正则兜底（无需额外依赖）。

用法
----
# 扫描整个仓库，按模块输出到 codeindex/ 目录
python3 extract_signatures.py /path/to/repo --kb-output ./codeindex/<repo-name>

# 只处理指定模块
python3 extract_signatures.py /path/to/repo --kb-output ./codeindex/<repo-name> --modules combat inventory

# 指定文件后缀过滤
python3 extract_signatures.py /path/to/repo --kb-output ./codeindex/<repo-name> --exts .py .cpp

# 控制并发数
python3 extract_signatures.py /path/to/repo --kb-output ./codeindex/<repo-name> --workers 8

# 增量模式（Step 0b/增量更新）：跳过 _sigs.jsonl 比源文件新的模块
python3 extract_signatures.py /path/to/repo --kb-output ./codeindex/<repo-name> --incremental

# 差异比对模式（Step 0b-1）：输出到临时目录，不覆盖正式 _sigs.jsonl
python3 extract_signatures.py /path/to/repo --kb-output ./codeindex/<repo-name> \
  --diff-output ./build/<repo-name>-diff --modules combat
"""

from __future__ import annotations

import json
import os
import re
import sys
import argparse
import textwrap
import time
from pathlib import Path
from typing import Any, Optional
from collections import defaultdict
import traceback

try:
    import multiprocessing
    HAS_MULTIPROCESSING = True
except ImportError:
    HAS_MULTIPROCESSING = False

VERSION = "2.0"

# ──────────────────────────────────────────────────────────────
# 语言映射
# ──────────────────────────────────────────────────────────────

LANG_MAP: dict[str, str] = {
    ".py":   "python",
    ".c":    "c",
    ".h":    "c",
    ".cpp":  "cpp",
    ".cxx":  "cpp",
    ".cc":   "cpp",
    ".hpp":  "cpp",
    ".hh":   "cpp",
    ".js":   "javascript",
    ".jsx":  "javascript",
    ".ts":   "typescript",
    ".tsx":  "typescript",
    ".java": "java",
    ".go":   "go",
    ".rs":   "rust",
    ".lua":  "lua",
    ".rb":   "ruby",
    ".cs":   "c_sharp",
    ".swift":"swift",
    ".kt":   "kotlin",
}

SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".venv", "venv",
    "env", ".env", "dist", "build", ".idea", ".vscode", ".cache",
}

MAX_FILE_BYTES = 512 * 1024  # 512 KB


# ──────────────────────────────────────────────────────────────
# tree-sitter 解析器加载（懒加载，缺包则优雅降级）
# ──────────────────────────────────────────────────────────────

def _load_ts_language(lang: str):
    """尝试加载 tree-sitter language 对象，失败返回 None。
    优先使用独立的 tree_sitter_<lang> 包；若未安装则回退到 tree_sitter_languages。
    """
    try:
        from tree_sitter import Language, Parser  # noqa: F401
    except ImportError:
        print("⚠️  tree-sitter 未安装", file=sys.stderr)
        return None

    # tree_sitter_languages（支持 C、Go、Rust、Lua 等几十种语言）
    try:
        from tree_sitter_languages import get_language
        return get_language(lang)
    except Exception:
        print(f"⚠️  tree-sitter 不支持语言 '{lang}'\n{traceback.format_exc()}", file=sys.stderr)
        return None


_TS_LANG_CACHE: dict[str, Any] = {}

def _get_ts_language(lang: str):
    if lang not in _TS_LANG_CACHE:
        _TS_LANG_CACHE[lang] = _load_ts_language(lang)
    return _TS_LANG_CACHE[lang]


# ──────────────────────────────────────────────────────────────
# tree-sitter 查询定义（每种语言的捕获模式）
# ──────────────────────────────────────────────────────────────

# 每项格式：(query_string, kind_map)
# kind_map: capture_name → entity kind
_TS_QUERIES: dict[str, tuple[str, dict]] = {
    "python": (
        """
        (function_definition name: (identifier) @func.name) @func
        (async_function_definition name: (identifier) @async_func.name) @async_func
        (class_definition name: (identifier) @class.name) @class
        """,
        {"func": "function", "async_func": "function", "class": "class"},
    ),
    "c": (
        """
        (function_definition declarator: (function_declarator
            declarator: (identifier) @func.name)) @func
        (declaration declarator: (function_declarator
            declarator: (identifier) @func_decl.name)) @func_decl
        (struct_specifier name: (type_identifier) @struct.name) @struct
        """,
        {"func": "function", "func_decl": "function", "struct": "class"},
    ),
    "cpp": (
        """
        (function_definition declarator: (function_declarator
            declarator: [(identifier)(qualified_identifier)(destructor_name)] @func.name)) @func
        (declaration declarator: (function_declarator
            declarator: [(identifier)(qualified_identifier)] @func_decl.name)) @func_decl
        (class_specifier name: (type_identifier) @class.name) @class
        (struct_specifier name: (type_identifier) @struct.name) @struct
        (template_declaration (function_definition
            declarator: (function_declarator
                declarator: [(identifier)(qualified_identifier)] @tmpl.name))) @tmpl_func
        """,
        {"func": "function", "func_decl": "function", "class": "class",
         "struct": "class", "tmpl": "function", "tmpl_func": "function"},
    ),
    "javascript": (
        """
        (function_declaration name: (identifier) @func.name) @func
        (function_expression id: (identifier) @func_expr.name) @func_expr
        (arrow_function) @arrow
        (method_definition name: (property_identifier) @method.name) @method
        (class_declaration name: (identifier) @class.name) @class
        """,
        {"func": "function", "func_expr": "function", "method": "method",
         "class": "class", "arrow": "function"},
    ),
    "typescript": (
        """
        (function_declaration name: (identifier) @func.name) @func
        (method_definition name: (property_identifier) @method.name) @method
        (class_declaration name: (identifier) @class.name) @class
        (interface_declaration name: (type_identifier) @iface.name) @iface
        (type_alias_declaration name: (type_identifier) @type.name) @type_alias
        """,
        {"func": "function", "method": "method", "class": "class",
         "iface": "class", "type": "class", "type_alias": "class"},
    ),
    "java": (
        """
        (method_declaration name: (identifier) @method.name) @method
        (class_declaration name: (identifier) @class.name) @class
        (interface_declaration name: (identifier) @iface.name) @iface
        (constructor_declaration name: (identifier) @ctor.name) @ctor
        """,
        {"method": "method", "class": "class", "iface": "class", "ctor": "function"},
    ),
    "go": (
        """
        (function_declaration name: (identifier) @func.name) @func
        (method_declaration name: (field_identifier) @method.name) @method
        (type_spec name: (type_identifier) @type.name) @type_decl
        """,
        {"func": "function", "method": "method", "type": "class", "type_decl": "class"},
    ),
    "rust": (
        """
        (function_item name: (identifier) @func.name) @func
        (impl_item type: (type_identifier) @impl.name) @impl
        (struct_item name: (type_identifier) @struct.name) @struct
        (enum_item name: (type_identifier) @enum.name) @enum
        (trait_item name: (type_identifier) @trait.name) @trait
        """,
        {"func": "function", "impl": "class", "struct": "class",
         "enum": "class", "trait": "class"},
    ),
    "lua": (
        """
        (function_declaration name: [(identifier)(dot_index_expression)(method_index_expression)] @func.name) @func
        (local_function_statement name: (identifier) @local_func.name) @local_func
        (assignment_statement
            (variable_list (dot_index_expression) @assign_func.name)
            (expression_list (function_definition))) @assign_func_def
        """,
        {"func": "function", "local_func": "function", "assign_func": "function",
         "assign_func_def": "function"},
    ),
    "ruby": (
        """
        (method name: (identifier) @method.name) @method
        (class name: [(constant)(scope_resolution)] @class.name) @class
        (module name: [(constant)(scope_resolution)] @module.name) @module
        """,
        {"method": "method", "class": "class", "module": "class"},
    ),
    "c_sharp": (
        """
        (method_declaration name: (identifier) @method.name) @method
        (class_declaration name: (identifier) @class.name) @class
        (interface_declaration name: (identifier) @iface.name) @iface
        (struct_declaration name: (identifier) @struct.name) @struct
        (constructor_declaration name: (identifier) @ctor.name) @ctor
        """,
        {"method": "method", "class": "class", "iface": "class",
         "struct": "class", "ctor": "function"},
    ),
}


# ──────────────────────────────────────────────────────────────
# tree-sitter 提取核心
# ──────────────────────────────────────────────────────────────

def _node_text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="ignore")


def _node_first_line(node, source_bytes: bytes) -> str:
    """取节点起始行文本（用作 signature）。"""
    start = node.start_byte
    # 向后找到换行或 { 或 :
    end = start
    while end < len(source_bytes):
        ch = source_bytes[end:end+1]
        if ch in (b"\n", b"{", b":"):
            break
        end += 1
    return source_bytes[start:end].decode("utf-8", errors="ignore").strip()


def _is_public(name: str, lang: str) -> bool:
    if lang == "python":
        return not name.startswith("_")
    if lang in ("c", "cpp"):
        return not name.startswith("_") and not (name.isupper() and len(name) > 3)
    if lang in ("java", "c_sharp"):
        return True  # tree-sitter 不直接给出 modifier，默认认为 public
    return not name.startswith("_")


def _extract_docstring(node, source_bytes: bytes, lang: str) -> str:
    """尝试从节点后的第一个子节点提取 docstring / 行注释。"""
    if lang == "python":
        body = None
        for child in node.children:
            if child.type == "block":
                body = child
                break
        if body and body.child_count > 0:
            first = body.children[0]
            if first.type == "expression_statement":
                for c in first.children:
                    if c.type == "string":
                        raw = _node_text(c, source_bytes).strip("\"'").strip()
                        return raw.split("\n")[0][:200]
    # 通用：向前一行找 // 或 # 注释
    start_line = source_bytes[:node.start_byte].count(b"\n")
    lines = source_bytes.decode("utf-8", errors="ignore").splitlines()
    if start_line > 0:
        prev_line = lines[start_line - 1].strip()
        m = re.match(r'^(?://|#|--|/\*+)\s*(.*)', prev_line)
        if m:
            return m.group(1).strip()[:200]
    return ""


def _extract_parent_class(node) -> Optional[str]:
    """向上找最近的 class 节点名，作为 parent。"""
    parent = node.parent
    while parent:
        if parent.type in ("class_definition", "class_declaration",
                           "class_specifier", "impl_item",
                           "class_body", "class"):
            for child in parent.children:
                if child.type in ("identifier", "type_identifier"):
                    return child.text.decode("utf-8", errors="ignore") if hasattr(child, "text") else ""
        parent = parent.parent
    return None


def _extract_with_tree_sitter(text: str, lang: str) -> list[dict]:
    ts_lang = _get_ts_language(lang)
    if ts_lang is None:
        return []

    try:
        from tree_sitter import Parser
    except ImportError:
        return []

    query_info = _TS_QUERIES.get(lang)
    if not query_info:
        return []

    query_str, kind_map = query_info
    source_bytes = text.encode("utf-8")

    try:
        # tree-sitter 0.21.x：先构造 Parser() 再 set_language
        parser = Parser()
        parser.set_language(ts_lang)
        tree = parser.parse(source_bytes)
    except Exception:
        return []

    try:
        query = ts_lang.query(query_str)
        captures = query.captures(tree.root_node)
    except Exception:
        return []

    # captures 可能是 dict（新版）或 list（旧版）
    if isinstance(captures, dict):
        # 新版 API：{capture_name: [node, ...]}
        capture_list = []
        for cap_name, nodes in captures.items():
            for node in nodes:
                capture_list.append((node, cap_name))
    else:
        # 旧版 API：[(node, capture_name), ...]
        capture_list = [(node, cap_name) for node, cap_name in captures]

    # 只保留 "entity" 级别的捕获（非 .name 子捕获）
    entity_captures = [(node, cap) for node, cap in capture_list if "." not in cap or cap.endswith("_func")]

    entities: list[dict] = []
    seen_bytes: set[int] = set()

    for node, cap_name in entity_captures:
        # 避免重复
        if node.start_byte in seen_bytes:
            continue
        seen_bytes.add(node.start_byte)

        kind_key = cap_name.split(".")[0] if "." in cap_name else cap_name
        kind = kind_map.get(kind_key, "function")

        # 找对应的 .name 捕获
        name = ""
        name_cap = f"{kind_key}.name"
        for n2, c2 in capture_list:
            if c2 == name_cap and n2.start_byte >= node.start_byte and n2.end_byte <= node.end_byte:
                name = _node_text(n2, source_bytes)
                break

        if not name:
            # 尝试从节点自身提取名字
            for child in node.children:
                if child.type in ("identifier", "type_identifier", "field_identifier",
                                  "property_identifier"):
                    name = _node_text(child, source_bytes)
                    break

        if not name:
            continue

        lineno = node.start_point[0] + 1
        sig = _node_first_line(node, source_bytes)
        doc = _extract_docstring(node, source_bytes, lang)
        parent = None
        if kind in ("method", "function") and lang not in ("c", "cpp"):
            parent = _extract_parent_class(node)

        entities.append({
            "kind":      kind,
            "name":      name,
            "signature": sig,
            "parent":    parent,
            "lineno":    lineno,
            "docstring": doc,
            "is_public": _is_public(name, lang),
        })

    entities.sort(key=lambda e: e["lineno"])
    return entities


# ──────────────────────────────────────────────────────────────
# 通用正则兜底（无 tree-sitter 时使用）
# ──────────────────────────────────────────────────────────────

_GENERIC_RE = re.compile(
    r'^(?:[ \t]*)(?:(?:public|private|protected|static|async|export|def|func)\s+)*'
    r'(?:function|def|class|sub|func)\s+(?P<name>\w+)\s*[({]',
    re.MULTILINE | re.IGNORECASE,
)

def _extract_generic(text: str, lang: str) -> list[dict]:
    lines = text.splitlines()
    entities: list[dict] = []
    for m in _GENERIC_RE.finditer(text):
        lineno = text[:m.start()].count("\n") + 1
        name = m.group("name")
        entities.append({
            "kind":      "function",
            "name":      name,
            "signature": lines[lineno - 1].rstrip(),
            "parent":    None,
            "lineno":    lineno,
            "docstring": "",
            "is_public": not name.startswith("_"),
        })
    return entities


# ──────────────────────────────────────────────────────────────
# 单文件解析入口
# ──────────────────────────────────────────────────────────────

def extract_file(abs_path: Path, rel_path: str) -> Optional[dict]:
    suffix = abs_path.suffix.lower()
    lang = LANG_MAP.get(suffix)
    if lang is None:
        return None

    try:
        size = abs_path.stat().st_size
    except OSError:
        return None

    if size > MAX_FILE_BYTES:
        return {"language": lang, "entities": [], "_skipped": f"file too large ({size} bytes)"}

    try:
        text = abs_path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return {"language": lang, "entities": [], "_skipped": str(e)}

    # 尝试 tree-sitter，失败则降级到通用正则
    entities = _extract_with_tree_sitter(text, lang)
    if not entities:
        entities = _extract_generic(text, lang)

    return {"language": lang, "entities": entities}


# ──────────────────────────────────────────────────────────────
# 文件收集
# ──────────────────────────────────────────────────────────────

def collect_files(
    root: Path,
    base: Path,
    allowed_exts: Optional[set[str]] = None,
) -> list[tuple[Path, str]]:
    results: list[tuple[Path, str]] = []

    def _walk(current: Path) -> None:
        try:
            entries = sorted(current.iterdir(), key=lambda p: p.name.lower())
        except PermissionError:
            return
        for entry in entries:
            if entry.is_dir():
                if entry.name in SKIP_DIRS or entry.name.startswith("."):
                    continue
                _walk(entry)
            elif entry.is_file():
                if allowed_exts is not None and entry.suffix.lower() not in allowed_exts:
                    continue
                if LANG_MAP.get(entry.suffix.lower()) is None and allowed_exts is None:
                    continue
                try:
                    rel = str(entry.relative_to(base))
                except ValueError:
                    rel = str(entry)
                results.append((entry, rel))

    _walk(root)
    return results


# ──────────────────────────────────────────────────────────────
# 多进程 worker
# ──────────────────────────────────────────────────────────────

def _process_file_worker(args: tuple[str, str]) -> tuple[str, Optional[dict]]:
    abs_path_str, rel_path = args
    result = extract_file(Path(abs_path_str), rel_path)
    return rel_path, result


# ──────────────────────────────────────────────────────────────
# 扫描单模块，输出 JSONL
# ──────────────────────────────────────────────────────────────

def scan_module(
    module_dir: Path,
    repo_root: Path,
    output_jsonl: Path,
    allowed_exts: Optional[set[str]],
    public_only: bool,
    workers: int,
) -> dict:
    t0 = time.time()
    file_list = collect_files(module_dir, repo_root, allowed_exts)
    total_files = len(file_list)

    stats = {
        "total_files":    total_files,
        "processed":      0,
        "skipped":        0,
        "total_entities": 0,
        "elapsed_sec":    0.0,
    }

    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    worker_args = [(str(abs_p), rel_p) for abs_p, rel_p in file_list]

    with open(output_jsonl, "w", encoding="utf-8") as fp:
        def _write(rel_path: str, result: Optional[dict]) -> None:
            if result is None:
                return
            lang = result.get("language", "")
            skipped = result.get("_skipped")
            stats["processed"] += 1

            if skipped:
                stats["skipped"] += 1
                fp.write(json.dumps({"file": rel_path, "lang": lang, "_skipped": skipped},
                                    ensure_ascii=False) + "\n")
                return

            for entity in result.get("entities", []):
                if public_only and not entity.get("is_public"):
                    continue
                row: dict = {
                    "file":      rel_path,
                    "lang":      lang,
                    "line":      entity["lineno"],
                    "kind":      entity["kind"],
                    "name":      entity["name"],
                    "sig":       entity["signature"],
                    "doc":       entity.get("docstring", ""),
                    "desc":      "",          # ← 由 Agent 通过 generate_desc.py 填写
                    "is_public": entity.get("is_public", True),
                }
                if entity.get("parent"):
                    row["parent"] = entity["parent"]
                fp.write(json.dumps(row, ensure_ascii=False) + "\n")
                stats["total_entities"] += 1

        if HAS_MULTIPROCESSING and workers > 1 and total_files > 0:
            with multiprocessing.Pool(processes=workers) as pool:
                for rel_path, result in pool.imap_unordered(_process_file_worker, worker_args, chunksize=50):
                    _write(rel_path, result)
        else:
            for abs_p, rel_path in file_list:
                _write(rel_path, extract_file(abs_p, rel_path))

    stats["elapsed_sec"] = round(time.time() - t0, 2)
    return stats


# ──────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="用 tree-sitter 提取各模块签名，输出到 codeindex/<repo>/{module}/_sigs.jsonl",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
        示例:
          # 扫描整个仓库，按一级子目录拆分模块
          python3 extract_signatures.py /repo --kb-output ./codeindex/my-repo

          # 只处理指定模块
          python3 extract_signatures.py /repo --kb-output ./codeindex/my-repo --modules combat inventory

          # 只处理 Python + C++ 文件
          python3 extract_signatures.py /repo --kb-output ./codeindex/my-repo --exts .py .cpp
        """),
    )
    parser.add_argument("repo_path",      help="仓库根目录")
    parser.add_argument("--kb-output",    required=True, metavar="KB_DIR",
                        help="kb 根输出目录（如 ./codeindex/my-repo）")
    parser.add_argument("--modules",      nargs="+", metavar="MODULE", default=None,
                        help="只处理指定的一级子目录模块名（默认全部）")
    parser.add_argument("--exts",         nargs="+", metavar="EXT", default=None,
                        help="只处理指定文件后缀，如 --exts .py .cpp")
    parser.add_argument("--public-only",  action="store_true",
                        help="只输出 is_public=true 的实体")
    parser.add_argument("--workers", "-j", type=int,
                        default=max(1, (os.cpu_count() or 1)),
                        help="并发 worker 数（默认 CPU 核数）")
    parser.add_argument("--incremental",  action="store_true",
                        help="增量模式（Step 0b/增量更新）：若 _sigs.jsonl 比模块所有源文件都新则跳过该模块")
    parser.add_argument("--diff-output",  metavar="DIFF_DIR", default=None,
                        help="差异比对模式（Step 0b-1）：将签名提取结果写到此临时目录，不覆盖正式 --kb-output 中的 _sigs.jsonl")
    parser.add_argument("--codemap-check", action="store_true",
                        help="探测 Codemap MCP 是否可用（调用 get_graph_stats），可用时打印提示并退出，不执行提取")
    parser.add_argument("--force", action="store_true",
                        help="强制执行符号提取，忽略 Codemap 可用性（覆盖 FALLBACK SCRIPT 建议）")

    args = parser.parse_args()

    # --codemap-check：探测 Codemap 可用性后退出
    if args.codemap_check:
        try:
            import subprocess, json as _json
            result = subprocess.run(
                ["python3", "-c",
                 "import sys; sys.exit(0)"],  # placeholder：实际环境中替换为 MCP 调用
                capture_output=True, timeout=5
            )
            # 实际探测逻辑由调用方（build_index.py）通过 MCP 完成；
            # 此处仅作占位，打印提示供 Agent 判断。
            print("⚠️  --codemap-check 仅供 build_index.py 内部使用。"
                  "\n    请在 build_index.py 中查看 Codemap 探测结果（workspace.json 中的 codemap 字段）。")
        except Exception as e:
            print(f"⚠️  Codemap 探测异常：{e}")
        sys.exit(0)

    repo_root  = Path(args.repo_path).resolve()
    kb_out     = Path(args.kb_output).resolve()
    diff_out   = Path(args.diff_output).resolve() if args.diff_output else None
    allowed    = set(args.exts) if args.exts else None

    if not repo_root.is_dir():
        print(f"❌ 仓库目录不存在: {repo_root}", file=sys.stderr)
        sys.exit(1)

    # 收集一级子目录（模块列表）
    all_modules = [
        d.name for d in sorted(repo_root.iterdir(), key=lambda p: p.name.lower())
        if d.is_dir() and not d.name.startswith(".") and d.name not in SKIP_DIRS
    ]

    # ── 叶目录兼容：repo_root 自身无子目录时，把它作为唯一模块（用 "." 表示）──
    is_leaf_repo = len(all_modules) == 0
    if is_leaf_repo:
        all_modules = ["."]

    if args.modules:
        if is_leaf_repo:
            # 叶目录场景下忽略 --modules 过滤，直接处理根目录
            target_modules = ["."]
        else:
            target_modules = [m for m in args.modules if m in all_modules]
            missing = [m for m in args.modules if m not in all_modules]
            if missing:
                print(f"⚠️  以下模块在仓库中未找到，已忽略: {missing}", file=sys.stderr)
    else:
        target_modules = all_modules

    if not target_modules:
        print("❌ 没有找到任何可处理的模块", file=sys.stderr)
        sys.exit(1)

    print(f"\n🔍 code-index-builder · extract_signatures v{VERSION}")
    print(f"   仓库路径  : {repo_root}")
    print(f"   KB 输出   : {kb_out}")
    if diff_out:
        print(f"   差异输出  : {diff_out}  (--diff-output，不覆盖正式 codeindex/)")
    print(f"   模块数量  : {len(target_modules)} ({', '.join(target_modules[:5])}{'…' if len(target_modules)>5 else ''})")
    print(f"   后缀过滤  : {args.exts or '所有已知语言'}")
    print(f"   public-only: {args.public_only}")
    print(f"   incremental: {args.incremental}")
    print(f"   workers   : {args.workers}")

    # 检测 tree-sitter 可用性
    try:
        import tree_sitter  # noqa: F401
        print("   tree-sitter: ✅ 已安装")
    except ImportError:
        print("   tree-sitter: ⚠️  未安装，将使用通用正则兜底（建议 pip install tree-sitter tree-sitter-python ...）")

    print()

    grand_total_entities = 0
    grand_total_files    = 0
    cache_hit_modules:   list[str] = []
    cache_miss_modules:  list[str] = []

    for mod in target_modules:
        # 叶目录场景：mod="." 时 module_dir 就是 repo_root 自身
        module_dir   = repo_root if mod == "." else repo_root / mod
        # --diff-output：写到临时目录，不触碰正式 codeindex/
        # --incremental：检查缓存，命中则跳过
        actual_out   = diff_out if diff_out else kb_out
        # 叶目录场景：_sigs.jsonl 直接放在 kb_out 根，不建子目录
        output_jsonl = actual_out / "_sigs.jsonl" if mod == "." else actual_out / mod / "_sigs.jsonl"

        # ── 增量缓存检测 ────────────────────────────────────────────
        if args.incremental and not diff_out:
            sigs_path = kb_out / "_sigs.jsonl" if mod == "." else kb_out / mod / "_sigs.jsonl"
            if sigs_path.exists():
                sigs_mtime = sigs_path.stat().st_mtime
                # 找模块内最新的源文件修改时间
                latest_src = 0.0
                for f in module_dir.rglob("*"):
                    if f.is_file() and f.suffix.lower() in {".py",".c",".h",".cpp",".hpp",
                                                             ".js",".ts",".lua",".java",
                                                             ".go",".rs",".cs",".rb"}:
                        t = f.stat().st_mtime
                        if t > latest_src:
                            latest_src = t
                if latest_src < sigs_mtime:
                    cache_hit_modules.append(mod)
                    print(f"⏭️  跳过（缓存命中）: {mod}")
                    continue
            cache_miss_modules.append(mod)

        print(f"📦 处理模块: {mod}")
        stats = scan_module(
            module_dir=module_dir,
            repo_root=repo_root,
            output_jsonl=output_jsonl,
            allowed_exts=allowed,
            public_only=args.public_only,
            workers=args.workers,
        )
        grand_total_entities += stats["total_entities"]
        grand_total_files    += stats["processed"]
        print(f"   ✓ 处理文件: {stats['processed']}  实体: {stats['total_entities']}  "
              f"跳过: {stats['skipped']}  耗时: {stats['elapsed_sec']}s")
        print(f"   → {output_jsonl}")

    # ── 增量摘要 ────────────────────────────────────────────────────
    if args.incremental:
        print(f"\n符号提取缓存：{len(cache_hit_modules)} 个模块命中（跳过），"
              f"{len(cache_miss_modules) or (len(target_modules) - len(cache_hit_modules))} 个模块需重提取")

    # ── diff-output 模式：输出签名差异报告 ─────────────────────────
    if diff_out:
        print(f"\n📊 差异比对模式（Step 0b-1）：提取结果已写入 {diff_out}")
        print("   请将此目录中的 _sigs.jsonl 与正式 codeindex/ 中的对应文件手动/脚本比对，")
        print("   或运行 diff_kb.py --sig-diff 进行自动签名漂移检测。")

    print(f"\n✅ 全部完成！共处理 {grand_total_files} 个文件，提取 {grand_total_entities} 个实体")
    if not diff_out:
        print("\n📋 下一步：")
        print(f"   python3 generate_desc.py {kb_out}")
        print(f"   → 对每个模块生成 _desc_context.md，供 Agent 批量填写 desc\n")


if __name__ == "__main__":
    if HAS_MULTIPROCESSING:
        multiprocessing.freeze_support()
    main()
