---
name: codemap-impact-analysis
description: Understand blast radius and dependencies before making code changes
compatibility: Requires codemap MCP server
---

# Impact Analysis with Codemap

## When to Use
- "Is it safe to change this function?"
- "What will break if I modify X?"
- "Who depends on this type/interface?"
- "Show me all callers of this method"
- Before any non-trivial refactor or API change

## Workflow

```
1. find_symbol({name: ["X"]})                              → Locate the target symbol
2. get_dependencies({symbol_name: "X"})                    → Direct callers (WILL BREAK)
3. get_call_chain({symbol_name: "X"})                      → Downstream impact (what X uses)
4. get_type_hierarchy({symbol_name: "X"})                  → Implementors / subclasses
5. Assess risk and report to user before making changes
```

## Checklist

```
- [ ] find_symbol to locate the exact symbol to change
- [ ] get_dependencies to find direct callers (these WILL need updates)
- [ ] get_type_hierarchy if changing an interface or base class
- [ ] get_call_chain to understand downstream effects
- [ ] Assess risk level before proceeding
- [ ] Update callers in dependency order (deepest first)
```

## Risk Assessment

| Dependents | Risk |
|------------|------|
| 0-2 direct callers | LOW — safe to change |
| 3-10 direct callers | MEDIUM — update all callers |
| >10 direct callers | HIGH — consider deprecation path |
| Interface with many implementors | CRITICAL — coordinate carefully |

## Example: "What breaks if I rename validateToken?"

```
1. find_symbol({name: ["validateToken"]})
   → symbol_id: "src/auth/token.go:function:validateToken"

2. get_dependencies({symbol_name: "validateToken"})
   → loginHandler     (src/api/login.go:34)      ← must update
   → jwtMiddleware    (src/api/middleware.go:22)  ← must update
   → TestValidate     (src/auth/token_test.go:8)  ← must update

3. Risk: 3 direct callers = MEDIUM

4. Update plan:
   a. Rename validateToken → authenticateToken in token.go
   b. Update loginHandler, jwtMiddleware, TestValidate
   c. Run tests
```
