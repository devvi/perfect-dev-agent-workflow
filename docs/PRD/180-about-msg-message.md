# PRD: ABOUT UI — Msg → Message

## 1. Problem

The ABOUT overlay in the game currently displays commit metadata with three labels: "Commit:", "Msg:", and "Date:". The "Msg:" label is abbreviated inconsistently with the other two labels, which both use full words ("Commit:", "Date:"). This inconsistency degrades UI polish and visual cohesion on the ABOUT screen.

**Current behavior (line 107 of overlays.js):**
```
Msg:   Add boss room ...
```

**Expected behavior:**
```
Message: Add boss room ...
```

The label should read "Message:" to match the full-word style of its sibling labels.

## 2. Solution

Perform a one-character replacement in `public/src/render/overlays.js` at line 107:

| File | Line | Current | New |
|------|------|---------|-----|
| `public/src/render/overlays.js` | 107 | `'Msg:   '` | `'Message: '` |

The replacement changes only the label string; all surrounding code — positioning (80, 230), font, color, data pipeline (`truncateMessage(info.message)`) — remains untouched.

## 3. Implementation Notes

- **Files to edit:** `public/src/render/overlays.js` (single character change)
- **Scope:** Minimal — no logic, no test impact, no configuration changes
- **Risks:** None. This is a pure UI string literal change with zero side effects.
- **Validation:** Run unit tests to confirm no regressions; visually verify the ABOUT screen renders "Message:" instead of "Msg:".
- **Branch strategy:** Feature branch off `master`, single-commit PR.
