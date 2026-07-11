# REFERENCE — Cached Research Knowledge

> Auto-maintained by `obsidian-knowledge-search` skill.
> Each file has YAML frontmatter with expiry date. Stale entries are replaced
> on the next fresh search — no manual cleanup needed.

## Format

```yaml
---
topic: "<topic name>"
created: 2026-07-10
source_issue: 109
keywords: ["keyword1", "keyword2"]
expires_after_days: 7
wiki_files_checked: ["wiki/file1.md", "wiki/file2.md"]
---
```

## Freshness Rules

| Condition | Action |
|-----------|--------|
| Entry < 7 days old + wiki files unchanged | Use cache |
| Entry ≥ 7 days old | Re-search + overwrite |
| Wiki source file changed since `created` | Re-search + overwrite |

## Files

Current cache entries are listed below. Each file is created by `obsidian-knowledge-search`
when a fresh search finds new knowledge.
