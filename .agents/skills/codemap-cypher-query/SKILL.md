---
name: codemap-cypher-query
description: "Use for any counting, ranking, or aggregation question about code structure: 'how many functions in file X?', 'which class has the most methods?', 'what are the most-called functions?', 'find duplicate symbol names', 'how many exported symbols?'. Generates and executes read-only Cypher queries."
compatibility: Requires codemap MCP server with query_cypher tool
---

# Dynamic Cypher Queries with Codemap

## When to Use

- "How many classes are in this file?"
- "How many methods does class X have?"
- "How many functions with the same name exist?"
- "Which classes have the most methods?"
- "What are the most-called functions?"
- "How many exported symbols are there?"
- Any counting, aggregation, or cross-cutting structural analysis that `search_code`/`find_symbol`/`get_call_chain` cannot answer directly

## Schema Reference

### Node Tables

**Symbol** — code symbols (functions, classes, methods, etc.)

| Property | Type | Description |
|----------|------|-------------|
| `id` | STRING (PK) | Format: `filepath:kind:scopedName` |
| `name` | STRING | Simple name (e.g. `Parse`, `Scanner.Parse`) |
| `qual_name` | STRING | Qualified name |
| `kind` | STRING | One of: `package`, `module`, `file`, `class`, `interface`, `function`, `method`, `field`, `variable`, `constant`, `param`, `type`, `import` |
| `language` | STRING | Language (go, python, typescript, etc.) |
| `file_path` | STRING | Source file path |
| `start_line` | INT64 | Start line number |
| `end_line` | INT64 | End line number |
| `signature` | STRING | Function/method signature |
| `doc_string` | STRING | Documentation comment |
| `parent_id` | STRING | Parent symbol ID |
| `exported` | BOOLEAN | Whether symbol is exported |
| `body` | STRING | Source code body |

**File** — source files

| Property | Type | Description |
|----------|------|-------------|
| `path` | STRING (PK) | File path |
| `language` | STRING | Detected language |
| `package` | STRING | Package/module name |
| `size` | INT64 | File size in bytes |

**Embedding** — vector embeddings (384 dimensions)

| Property | Type | Description |
|----------|------|-------------|
| `symbol_id` | STRING (PK) | Referenced symbol ID |
| `vec` | FLOAT[384] | Embedding vector |

### Relationship Tables

| Table | From → To | Properties | Description |
|-------|-----------|------------|-------------|
| `CONTAINS` | File → Symbol | — | File contains symbol |
| `IMPORTS` | File → File | `target_path`, `alias`, `is_wildcard`, `line` | Import relationship |
| `CALLS` | Symbol → Symbol | `file_path`, `line`, `col` | Function call |
| `INHERITS` | Symbol → Symbol | — | Class inheritance |
| `IMPLEMENTS` | Symbol → Symbol | — | Interface implementation |
| `HAS_CHILD` | Symbol → Symbol | — | Parent-child (class→method) |
| `REFERENCES_SYM` | Symbol → Symbol | `file_path`, `line` | Symbol reference |
| `DEPENDS_ON` | Symbol → Symbol | `file_path`, `line` | Dependency |
| `TYPE_OF` | Symbol → Symbol | — | Type relationship |

## Allowed vs Blocked Keywords

**Allowed** (read-only): `MATCH`, `WITH`, `CALL`, `RETURN`, `UNWIND`, `WHERE`, `AND`, `OR`, `NOT`, `AS`, `DISTINCT`, `ORDER BY`, `LIMIT`, `SKIP`, `UNION`, `UNION ALL`, `OPTIONAL`, `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `COLLECT`, `SIZE`, `HEAD`, `TAIL`, `RANGE`, `LABELS`, `PROPERTIES`, `STARTS WITH`, `ENDS WITH`, `CONTAINS`, `IN`, `EXISTS`, `CASE`, `WHEN`, `THEN`, `ELSE`, `END`

**Blocked** (write operations): `CREATE`, `DELETE`, `SET`, `MERGE`, `DROP`, `DETACH`, `REMOVE`, `ALTER`, `COPY`, `IMPORT`

> If your query contains a blocked keyword, even inside a `MATCH` clause, it will be rejected.
> To match symbols whose names contain blocked words, use `CONTAINS` or `STARTS WITH` instead of `=`.

## Kind Distinctions

When users ask "how many functions" or "how many methods", they usually mean **all callable definitions**. In the graph, these are split into two kinds:

| Kind | Meaning | Example |
|------|---------|---------|
| `function` | Top-level / free-standing function (no receiver) | `func main()`, `func setupCmd()` |
| `method` | Function with a struct/class receiver | `func (o *buildOpts) register()` |

**Use `kind IN ['function', 'method']` to count all callables.** Only use `kind = 'method'` alone when the user explicitly asks about class/struct methods.

## Common Query Patterns

### Count classes in a file

```cypher
MATCH (s:Symbol) WHERE s.kind = 'class' AND s.file_path = 'pkg/parser.go' RETURN count(s) AS cnt
```

### Count methods in a file

```cypher
MATCH (s:Symbol) WHERE s.kind = 'method' AND s.file_path CONTAINS 'parser' RETURN count(s) AS cnt
```

### Count all callables (functions + methods) in a file

```cypher
MATCH (s:Symbol) WHERE s.kind IN ['function', 'method'] AND s.file_path CONTAINS 'main.go' RETURN s.file_path AS file, count(s) AS callable_count
```

### Symbols with the same name (duplicates/overloads)

```cypher
MATCH (s:Symbol) WITH s.name AS name, collect(s.id) AS ids, count(s) AS cnt WHERE cnt > 1 RETURN name, cnt, ids ORDER BY cnt DESC LIMIT 20
```

### Count symbols by kind

```cypher
MATCH (s:Symbol) RETURN s.kind AS kind, count(s) AS cnt ORDER BY cnt DESC
```

### Classes with the most methods

```cypher
MATCH (parent:Symbol)-[:HAS_CHILD]->(child:Symbol) WHERE parent.kind = 'class' AND child.kind = 'method' RETURN parent.name, parent.qual_name, count(child) AS method_count ORDER BY method_count DESC LIMIT 10
```

### Most-called functions (by incoming CALLS edges)

```cypher
MATCH ()-[r:CALLS]->(callee:Symbol) RETURN callee.name, callee.qual_name, count(r) AS callers ORDER BY callers DESC LIMIT 10
```

### Exported symbols by kind

```cypher
MATCH (s:Symbol) WHERE s.exported = true RETURN s.kind AS kind, count(s) AS cnt ORDER BY cnt DESC
```

### Files importing a specific file

```cypher
MATCH (f1:File)-[:IMPORTS]->(f2:File) WHERE f2.path CONTAINS 'pkg/util' RETURN f1.path
```

### Interface implementations

```cypher
MATCH (impl:Symbol)-[:IMPLEMENTS]->(iface:Symbol) WHERE iface.kind = 'interface' RETURN iface.name, collect(impl.name) AS implementors
```

### Symbols per file (top files by symbol count)

```cypher
MATCH (f:File)-[:CONTAINS]->(s:Symbol) RETURN f.path, count(s) AS sym_count ORDER BY sym_count DESC LIMIT 10
```

### Deepest inheritance chain

```cypher
MATCH p=(child:Symbol)-[:INHERITS*1..5]->(parent:Symbol) RETURN child.name, parent.name, length(p) AS depth ORDER BY depth DESC LIMIT 10
```

### Files by language

```cypher
MATCH (f:File) RETURN f.language AS lang, count(f) AS cnt ORDER BY cnt DESC
```

### Full-text search via Cypher

```cypher
CALL QUERY_FTS_INDEX('Symbol', 'symbol_fts_index', 'parse config') WITH node, score RETURN node.name, node.kind, node.file_path, score ORDER BY score DESC LIMIT 10
```

## Workflow

```
1. Identify what the user is asking for
2. Map the question to a Cypher pattern using the schema reference above
3. Call query_cypher with the generated query
4. Interpret the JSON results and present to user
5. If the query fails, check:
   - Does it start with MATCH/WITH/CALL/RETURN/UNWIND?
   - Does it contain any blocked keywords?
   - Are property names exactly matching the schema?
   - Is there a LIMIT clause? (one will be added automatically if missing)
```

## Checklist

```
- [ ] Query starts with MATCH, WITH, CALL, RETURN, or UNWIND
- [ ] No CREATE, DELETE, SET, MERGE, DROP, DETACH, REMOVE, ALTER, COPY, IMPORT keywords
- [ ] Property names match schema exactly (e.g. `file_path`, not `filepath`)
- [ ] Kind values are lowercase: 'function', 'method', 'class', 'interface'
- [ ] LIMIT included for potentially large results (default: 50, max: 500)
- [ ] Avoid returning `body` field — it can be very large; use `include_body` in get_symbol_detail instead
```

## Tips

- Always use `LIMIT` for potentially large result sets — the tool caps at 500 rows
- Use `count()` for counting queries — don't return all rows and count client-side
- Symbol IDs have format `filepath:kind:scopedName` (e.g. `parser.go:method:Parser.Parse`)
- `qual_name` includes class prefix for methods (e.g. `Parser.Parse`)
- Use `CONTAINS` for partial file path matching, `=` for exact match
- Use `collect()` to aggregate related items into a list
- `CALL QUERY_FTS_INDEX` is available for full-text search within Cypher
- For multi-hop traversals, use `[:EDGE_TYPE*1..N]` syntax
- Long string values (>200 chars) are automatically truncated in results
- **`function` vs `method`**: `function` = top-level/free-standing; `method` = has a struct/class receiver. When users ask "how many functions" colloquially, query `kind IN ['function', 'method']` to cover both.
