---
name: codemap-debugging
description: Trace bugs and errors through call chains using the codemap graph index
compatibility: Requires codemap MCP server
---

# Debugging with Codemap

## When to Use
- "Why is this function failing?"
- "Who calls this method?"
- "Where does this error originate?"
- "Trace the execution path for X"
- Investigating bugs, panics, or unexpected behavior

## Workflow

```
1. search_code({matches: ["<error text or symptom>"]})               → Find related symbols
2. find_symbol({name: ["<suspect function>"]})                       → Locate the suspect
3. get_call_chain({symbol_name: "<name>"})                           → Trace downstream calls
4. get_dependencies({symbol_name: "<name>"})                         → Find all callers (upstream)
5. get_symbol_detail({symbol_name: "<name>", include_body: true})    → Read body for logic errors
```

## Checklist

```
- [ ] Understand the symptom (error message, panic, wrong output)
- [ ] search_code for the error text or affected code area
- [ ] find_symbol to locate the suspect function
- [ ] get_dependencies to see all callers (who triggers this?)
- [ ] get_call_chain to see what the suspect calls
- [ ] get_symbol_detail to read the body and spot the bug
- [ ] Read source files only if codemap results are insufficient
```

## Debugging Patterns

| Symptom | Codemap Approach |
|---------|-----------------|
| Panic / nil pointer | `search_code` for panic site → `get_dependencies` to find callers |
| Wrong return value | `get_symbol_detail` to read body → `get_call_chain` to trace data flow |
| Unexpected behavior | `get_call_chain` to find side-effects in callees |
| "Who calls this?" | `get_dependencies` — finds all direct callers |
| Inheritance confusion | `get_type_hierarchy` — see full class tree |

## Example: "Function X panics intermittently"

```
1. search_code({matches: ["X"]})
   → function: processOrder  src/orders/processor.go:88

2. get_dependencies({symbol_name: "processOrder"})
   → Called by: handleCheckout, retryWorker, webhookHandler

3. get_call_chain({symbol_name: "processOrder"})
   → processOrder → fetchInventory (external DB call, no timeout!)
                 → validateStock

4. get_symbol_detail({symbol_name: "processOrder", include_body: true})
   → Body confirms: fetchInventory has no context deadline

5. Root cause: fetchInventory blocks indefinitely under DB load
```
