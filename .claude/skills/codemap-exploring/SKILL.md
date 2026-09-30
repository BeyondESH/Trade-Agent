---
name: codemap-exploring
description: Explore and understand an unfamiliar codebase using the codemap graph index
compatibility: Requires codemap MCP server
---

# Exploring Codebases with Codemap

## When to Use
- "How does X work?"
- "Where is the logic for Y?"
- "Show me the main components"
- "What does this function call?"
- Understanding code you haven't seen before

## Workflow

```
1. search_code({matches: ["<concept or keyword>"]})                → Find relevant symbols
2. find_symbol({name: ["<symbol name>"]})                          → Locate specific function/class
3. get_symbol_detail({symbol_name: "<name>", include_body: true})  → Preview implementation
4. Read the actual file for surrounding context before editing
5. get_call_chain({symbol_name: "<name>"})                         → Trace relationships (only if needed)
```

> When embeddings are built (`--embed`), `search_code` automatically combines keyword
> and semantic similarity search for best results.

## Checklist

```
- [ ] search_code to find entry points (uses both keyword and semantic matching)
- [ ] find_symbol for exact symbol lookup
- [ ] get_symbol_detail to preview body and docs
- [ ] Read the actual file for surrounding context before editing
- [ ] get_call_chain / get_type_hierarchy only when task needs relationships
```

## Example: "How does the build pipeline work?"

```
1. search_code({matches: ["BuildFull"]})
   → function: BuildFull  internal/graph/builder.go:67

2. get_symbol_detail({symbol_name: "BuildFull", include_body: true})
   → signature, docs, and implementation preview

3. Read internal/graph/builder.go:67 to see full context (imports, neighbors)

4. get_call_chain({symbol_name: "BuildFull"})
   → BuildFull → scanner.Scan → parser.ParseFile → bulkInsertNodes → ...
```
