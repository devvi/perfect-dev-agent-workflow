# Tasks: #<N> — <简短标题>

| 字段 | 值 |
|------|----|
| Issue | #<N> |
| 优先级 | P0/P1/P2 |

## Overview

<一句话概述需要做什么，引用 DESIGN 文档。>

## Phase 1: <阶段名> (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `path/to/file` | <改什么> | 无 | P0 |
| 1.2 | `path/to/file` | <改什么> | 1.1 | P0 |

## Phase 2: <阶段名> (P0/P1)

<同上。>

## Dependency Graph

```
Phase 1 ────────────
├─ 1.1 (file: change) ─────┐
├─ 1.2 (file: change) ─────┤
└─ 1.3 (regression) ───────┘
                          │
Phase 2 ────────────        │
├─ 2.1 (tests)  ←── 1.1    │
└─ 2.2 (more)   ←── 1.2    │
                            │
All done ────────────────────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 |
|------|----------|----------|
| `path/to/file` | 新增/修改 | ±N |
