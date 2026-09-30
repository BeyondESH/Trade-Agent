#!/usr/bin/env python3
"""
code-index-builder · scripts/validate.py
知识库格式校验工具

校验 codeindex/<repo>/ 下各模块的文档格式是否符合规范。

用法：
    python3 scripts/validate.py <知识库根目录>
    python3 scripts/validate.py <知识库根目录> --script-root <源码根目录>
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Optional


def parse_frontmatter(text: str) -> Optional[dict]:
    m = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
    if not m:
        return None
    fm: dict = {}
    current_key = None
    for line in m.group(1).splitlines():
        if re.match(r'^\s{2,}', line) and current_key:
            fm[current_key] = (fm.get(current_key, '') + ' ' + line.strip()).strip()
            continue
        list_match = re.match(r'^\s+-\s+(.*)', line)
        if list_match and current_key:
            if not isinstance(fm.get(current_key), list):
                fm[current_key] = []
            fm[current_key].append(list_match.group(1).strip())
            continue
        kv = re.match(r'^(\w[\w_]*):\s*(.*)', line)
        if kv:
            current_key = kv.group(1)
            val = kv.group(2).strip()
            fm[current_key] = '' if val in ('>', '|', '') else val.strip('"').strip("'")
    return fm


class ValidationResult:
    def __init__(self):
        self.errors:   list[str] = []
        self.warnings: list[str] = []
        self.passed:   int = 0

    def error(self, msg: str):  self.errors.append(msg)
    def warn(self, msg: str):   self.warnings.append(msg)
    def ok(self):               self.passed += 1

    def summary(self) -> str:
        lines = [f"  ❌ {e}" for e in self.errors] + [f"  ⚠️  {w}" for w in self.warnings]
        lines.append(f"  ✅ {self.passed} checks passed, {len(self.errors)} errors, {len(self.warnings)} warnings")
        return '\n'.join(lines)

    @property
    def is_ok(self) -> bool:
        return len(self.errors) == 0


# ── 必填字段 ────────────────────────────────────────────────────────────

OVERVIEW_REQUIRED = ['module_id', 'architectural_role']
OVERVIEW_RECOMMENDED = ['world_model_hints', 'upstream_modules', 'downstream_modules']
SUBMOD_RECOMMENDED = ['entity_names', 'retrieval_hints', 'architectural_role']


def validate_overview(
    filepath: Path, text: str, fm: dict,
    all_module_ids: set[str],
    result: ValidationResult,
):
    for field in OVERVIEW_REQUIRED:
        if field not in fm or not fm[field]:
            result.error(f"{filepath.name}: 缺少必填 frontmatter 字段 '{field}'")
        else:
            result.ok()

    # 必须包含 ## Files 节
    if '## Files' not in text:
        result.error(f"{filepath.name}: 缺少 '## Files' 节（需列出源码路径和子文档路径）")
    else:
        result.ok()

    # 必须包含 ## 子文档速览 节
    if '## 子文档速览' not in text:
        result.error(f"{filepath.name}: 缺少 '## 子文档速览' 节（需含子文档→覆盖内容→关键实体三列表）")
    else:
        result.ok()

    # 推荐字段
    for field in OVERVIEW_RECOMMENDED:
        val = fm.get(field)
        if not val or (isinstance(val, list) and len(val) == 0):
            result.warn(f"{filepath.name}: 推荐填写 '{field}'")
        else:
            result.ok()

    # upstream/downstream 引用合法性
    for field in ('upstream_modules', 'downstream_modules'):
        refs = fm.get(field, [])
        if not isinstance(refs, list):
            refs = [refs] if refs else []
        for ref_id in refs:
            if ref_id and ref_id not in all_module_ids:
                result.warn(f"{filepath.name}: {field} 引用的模块 '{ref_id}' 不在知识库中")
            elif ref_id:
                result.ok()


def validate_submodule(
    filepath: Path, text: str, fm: dict,
    result: ValidationResult,
):
    # entity_names 和 retrieval_hints 推荐
    for field in SUBMOD_RECOMMENDED:
        val = fm.get(field)
        if not val or (isinstance(val, list) and len(val) == 0):
            result.warn(f"{filepath.name}: 推荐填写 '{field}'（可提升搜索召回率）")
        else:
            result.ok()

    # 文档正文长度
    body = re.sub(r'^---.*?---', '', text, flags=re.DOTALL).strip()
    if len(body) < 100:
        result.warn(f"{filepath.name}: 正文内容不足 100 字，建议补充")
    else:
        result.ok()

    # 禁止大段代码块粘贴（代码块超 50 行视为可疑）
    code_blocks = re.findall(r'```[^`]*```', text, re.DOTALL)
    for cb in code_blocks:
        if cb.count('\n') > 50:
            result.warn(f"{filepath.name}: 存在超过 50 行的代码块，知识库文档禁止粘贴大段源码")
            break
    result.ok()

    # 必须包含 ## 跨模块依赖 节
    if '## 跨模块依赖' not in text:
        result.error(f"{filepath.name}: 缺少 '## 跨模块依赖' 节（需含外部依赖表 + 反向调用方表，确无则填\"无\"）")
    else:
        result.ok()

    # 有协议/事件入口时（含 C_/S_ 前缀符号或 on_/handle_ 前缀）必须有 ## 典型调用链
    has_protocol_hint = bool(
        re.search(r'\bC_[A-Z]|\bS_[A-Z]', text) or
        re.search(r'\bon_\w+|\bhandle_\w+|\bHandl\w+', text, re.IGNORECASE)
    )
    if has_protocol_hint and '## 典型调用链' not in text:
        result.warn(f"{filepath.name}: 检测到协议/事件入口符号，建议补充 '## 典型调用链' 节")
    elif '## 典型调用链' in text:
        result.ok()


def validate_sigs(module_dir: Path, result: ValidationResult):
    """检查 _sigs.jsonl 和 _grep_hints.txt 是否存在。"""
    sigs_path  = module_dir / "_sigs.jsonl"
    hints_path = module_dir / "_grep_hints.txt"
    if not sigs_path.exists():
        result.warn(f"{module_dir.name}/_sigs.jsonl: 不存在，建议运行 extract_signatures.py")
    else:
        result.ok()
    if not hints_path.exists():
        result.warn(f"{module_dir.name}/_grep_hints.txt: 不存在，建议运行 generate_desc.py --finalize")
    else:
        result.ok()


def validate_conventions(kb_root: Path) -> ValidationResult:
    """检查全局 _conventions.md 必须包含的 5 节。"""
    result = ValidationResult()
    conv_path = kb_root / '_conventions.md'
    if not conv_path.exists():
        result.warn("缺少全局 _conventions.md，建议生成")
        return result
    result.ok()

    text = conv_path.read_text(encoding='utf-8')
    required_sections = [
        ('数据持久化', '数据持久化规约'),
        ('协议', '协议/接口命名规约'),
        ('状态机', '状态机规约'),
        ('计数', '计数/限额规约'),
        ('模块间调用禁忌', '模块间调用禁忌'),
    ]
    for keyword, label in required_sections:
        if keyword not in text:
            result.error(f"_conventions.md: 缺少 '{label}' 节")
        else:
            result.ok()
    return result


def validate_module(
    module_dir: Path,
    all_module_ids: set[str],
) -> ValidationResult:
    result = ValidationResult()

    overview_path = module_dir / '_overview.md'
    if not overview_path.exists():
        result.error(f"{module_dir.name}/: 缺少 _overview.md")
        return result
    result.ok()

    text = overview_path.read_text(encoding='utf-8')
    fm = parse_frontmatter(text)
    if fm is None:
        result.error("_overview.md: 缺少 YAML frontmatter")
    else:
        validate_overview(overview_path, text, fm, all_module_ids, result)

    for md_file in sorted(module_dir.glob('*.md')):
        if md_file.name.startswith('_'):
            continue
        text = md_file.read_text(encoding='utf-8')
        fm = parse_frontmatter(text)
        if fm is None:
            result.error(f"{md_file.name}: 缺少 YAML frontmatter")
            continue
        validate_submodule(md_file, text, fm, result)

    validate_sigs(module_dir, result)
    return result


def validate_index(kb_root: Path, all_module_ids: set[str]) -> ValidationResult:
    result = ValidationResult()
    index_path = kb_root / '_index.md'
    if not index_path.exists():
        result.warn("缺少 _index.md，请运行 build_index.py 生成")
        return result
    result.ok()

    text = index_path.read_text(encoding='utf-8')
    fm = parse_frontmatter(text)
    if fm is None:
        result.error("_index.md: 缺少 YAML frontmatter")
        return result

    for field in ['type', 'version', 'last_updated', 'total_modules']:
        if field not in fm:
            result.error(f"_index.md: 缺少字段 '{field}'")
        else:
            result.ok()

    return result


def main():
    parser = argparse.ArgumentParser(description='知识库格式校验工具')
    parser.add_argument('kb_root',       help='知识库根目录路径')
    parser.add_argument('--script-root', help='源码根目录（供将来扩展用）', default=None)
    args = parser.parse_args()

    kb_root = Path(args.kb_root)
    if not kb_root.is_dir():
        print(f"❌ 知识库根目录不存在: {kb_root}")
        sys.exit(1)

    sub_dirs = [
        d for d in kb_root.iterdir()
        if d.is_dir() and not d.name.startswith('.') and not d.name.startswith('_')
    ]
    # 叶目录兼容：若 kb_root 无非下划线子目录，把自身视为唯一模块
    is_leaf_kb = len(sub_dirs) == 0

    all_module_ids = {
        d.name for d in sub_dirs
        if (d / '_overview.md').exists()
    }
    if is_leaf_kb and (kb_root / '_overview.md').exists():
        all_module_ids.add(kb_root.name)

    all_ok = True

    print("📋 校验 _index.md ...")
    idx_result = validate_index(kb_root, all_module_ids)
    print(idx_result.summary())
    if not idx_result.is_ok:
        all_ok = False
    print()

    print("📋 校验 _conventions.md ...")
    conv_result = validate_conventions(kb_root)
    print(conv_result.summary())
    if not conv_result.is_ok:
        all_ok = False
    print()

    # 叶目录场景：只校验 kb_root 自身
    modules = sorted(sub_dirs) if sub_dirs else [kb_root]
    if not modules:
        print("ℹ️  未找到任何模块目录")
    else:
        for module_dir in modules:
            if module_dir.name.startswith('_'):
                continue
            print(f"📦 校验模块: {module_dir.name} ...")
            mod_result = validate_module(module_dir, all_module_ids)
            print(mod_result.summary())
            if not mod_result.is_ok:
                all_ok = False
            print()

    if all_ok:
        print("🎉 所有校验通过！")
    else:
        print("💡 存在校验错误，请修复后重试。")
        sys.exit(1)


if __name__ == '__main__':
    main()
