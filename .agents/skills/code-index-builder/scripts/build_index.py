#!/usr/bin/env python3
"""
code-index-builder · scripts/build_index.py
专家知识库索引生成工具

生成 codeindex/<repo>/_index.md，包含模块清单、架构位置速查、模块依赖关系。

用法：
    python3 scripts/build_index.py <知识库根目录>
    python3 scripts/build_index.py <知识库根目录> --dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path
from typing import List, Optional


def parse_frontmatter(text: str) -> Optional[dict]:
    """轻量级 YAML frontmatter 解析，支持标量、列表、多行字符串。"""
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


def collect_modules(kb_root: Path) -> List[dict]:
    """扫描所有模块目录，提取 _overview.md 的 frontmatter。
    叶目录兼容：若 kb_root 自身无非下划线子目录，将 kb_root 自身作为唯一模块目录处理。
    """
    modules = []
    sub_dirs = [d for d in sorted(kb_root.iterdir())
                if d.is_dir() and not d.name.startswith('.') and not d.name.startswith('_')]
    # 叶目录兼容：无子目录时，把 kb_root 自身当作模块目录
    candidates = sub_dirs if sub_dirs else [kb_root]
    for d in candidates:
        if not d.is_dir() or d.name.startswith('.') or d.name.startswith('_'):
            continue
        overview = d / '_overview.md'
        if not overview.exists():
            print(f"  ⚠️  跳过 {d.name}/: 缺少 _overview.md")
            continue
        text = overview.read_text(encoding='utf-8')
        fm = parse_frontmatter(text)
        if fm is None:
            print(f"  ⚠️  跳过 {d.name}/: _overview.md 缺少 frontmatter")
            continue

        module_id   = fm.get('module_id', d.name)
        title       = fm.get('title', module_id)
        description = fm.get('description', '')
        desc_short  = description.split('。')[0].split('\n')[0].strip()
        if len(desc_short) > 60:
            desc_short = desc_short[:57] + '...'

        keywords = fm.get('trigger_keywords', [])
        kw_str = ','.join(keywords) if isinstance(keywords, list) else str(keywords)

        source_paths = fm.get('source_paths', [])
        if isinstance(source_paths, list):
            sp_str = ', '.join(source_paths)
        else:
            sp_str = str(source_paths)

        upstream   = fm.get('upstream_modules', [])
        downstream = fm.get('downstream_modules', [])
        if not isinstance(upstream,   list): upstream   = [upstream]   if upstream   else []
        if not isinstance(downstream, list): downstream = [downstream] if downstream else []

        world_model_hints = fm.get('world_model_hints', [])
        if not isinstance(world_model_hints, list):
            world_model_hints = [world_model_hints] if world_model_hints else []

        architectural_role = fm.get('architectural_role', '')

        sub_files = sorted(
            f.name for f in d.glob('*.md')
            if not f.name.startswith('_') and re.match(r'\w+_\w+\.md', f.name)
        )

        modules.append({
            'id':                 module_id,
            'title':              title,
            'description':        desc_short,
            'keywords':           kw_str,
            'source_paths':       sp_str,
            'upstream':           upstream,
            'downstream':         downstream,
            'world_model_hints':  world_model_hints,
            'architectural_role': architectural_role,
            'sub_files':          sub_files,
        })

    return modules


def generate_index(modules: List[dict], today: str) -> str:
    """生成 _index.md 内容。"""
    lines = [
        '---',
        'type: index',
        'version: "2.0"',
        f'last_updated: {today}',
        f'total_modules: {len(modules)}',
        '---',
        '',
        '# 知识库全局索引',
        '',
        '> Agent 处理具体模块任务时，应首先读取本文件定位相关模块。',
        '',
        '## 模块清单',
        '',
        '| 模块ID | 名称 | 一句话描述 | 触发关键词 | 源码路径 |',
        '|--------|------|-----------|-----------|---------|',
    ]
    for m in modules:
        lines.append(f"| {m['id']} | {m['title']} | {m['description']} | {m['keywords']} | {m['source_paths']} |")

    has_arch = any(m['architectural_role'] or m['world_model_hints'] for m in modules)
    if has_arch:
        lines.extend([
            '',
            '## 架构位置速查',
            '',
            '| 模块ID | 架构角色 | 世界模型提示 |',
            '|--------|---------|-------------|',
        ])
        for m in modules:
            role  = m['architectural_role'] or '—'
            hints = '；'.join(m['world_model_hints']) if m['world_model_hints'] else '—'
            lines.append(f"| {m['id']} | {role} | {hints} |")

    has_flow = any(m['upstream'] or m['downstream'] for m in modules)
    if has_flow:
        lines.extend([
            '',
            '## 模块依赖关系',
            '',
            '| 模块ID | 上游（依赖我的） | 下游（我依赖的） |',
            '|--------|----------------|----------------|',
        ])
        for m in modules:
            up   = ', '.join(m['upstream'])   if m['upstream']   else '—'
            down = ', '.join(m['downstream']) if m['downstream'] else '—'
            lines.append(f"| {m['id']} | {up} | {down} |")

    lines.extend([
        '',
        '## 使用指引',
        '',
        '1. 根据用户任务关键词，匹配「触发关键词」列',
        '2. 找到模块后，读取对应的 `_overview.md`',
        '3. 按需读取子模块文档获取详细知识',
        '4. 符号级精确定位：`grep "函数名" codeindex/<repo>/{module}/_grep_hints.txt`',
        '',
    ])

    return '\n'.join(lines)


def probe_codemap(workspace_json: Optional[Path] = None) -> bool:
    """
    探测 Codemap MCP 是否可用。
    实际 MCP 调用须由 Agent 发起（get_graph_stats()）；
    本函数读取 workspace.json 中的 codemap 字段作为探测结果缓存。
    若 workspace.json 不存在或字段为空，返回 False（保守降级）。
    """
    if workspace_json and workspace_json.exists():
        try:
            import json as _json
            data = _json.loads(workspace_json.read_text(encoding="utf-8"))
            status = data.get("codemap", "")
            if status == "available":
                return True
        except Exception:
            pass
    return False


def main():
    parser = argparse.ArgumentParser(description='知识库索引生成工具')
    parser.add_argument('kb_root',   help='知识库根目录路径')
    parser.add_argument('--dry-run', action='store_true', help='只输出内容，不写入文件')
    parser.add_argument('--skip-sigs', action='store_true',
                        help='跳过 Step 2–4（extract_signatures / generate_desc），适用于 Codemap 可用时')
    parser.add_argument('--workspace', metavar='WORKSPACE_JSON', default=None,
                        help='workspace.json 路径（用于读取 Codemap 探测结果，默认自动推断）')
    args = parser.parse_args()

    kb_root = Path(args.kb_root)
    if not kb_root.is_dir():
        print(f"❌ 知识库根目录不存在: {kb_root}")
        sys.exit(1)

    # ── Codemap 可用性探测 ──────────────────────────────────────
    workspace_json = Path(args.workspace) if args.workspace else kb_root.parent / "workspace.json"
    codemap_available = args.skip_sigs or probe_codemap(workspace_json)

    if codemap_available:
        print("✅ Codemap 可用，Step 2–4 已跳过（符号索引由 Codemap 实时提供）")
    else:
        print("⚠️  Codemap 不可用，使用脚本 fallback（Step 2→3→4）")

    import os
    os.environ["CODEMAP_STATUS"] = "available" if codemap_available else "unavailable"

    print(f"📂 扫描知识库: {kb_root}")
    modules = collect_modules(kb_root)

    if not modules:
        print("ℹ️  未找到任何有效模块，_index.md 未生成")
        sys.exit(0)

    print(f"✅ 找到 {len(modules)} 个模块: {', '.join(m['id'] for m in modules)}")

    today   = date.today().isoformat()
    content = generate_index(modules, today)

    if args.dry_run:
        print('\n--- 预览 _index.md ---\n')
        print(content)
    else:
        index_path = kb_root / '_index.md'
        index_path.write_text(content, encoding='utf-8')
        print(f"📝 已生成: {index_path}")


if __name__ == '__main__':
    main()
