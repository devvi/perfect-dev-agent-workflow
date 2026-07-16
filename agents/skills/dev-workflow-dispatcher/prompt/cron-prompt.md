# Workflow Dispatcher — Cron Prompt

你的唯一输入是 event-processor.py 的 stdout。根据它做对应操作。

---

## 1. SPAWN 指令（脚本输出以 SPAWN: 开头）

所有 SPAWN handler 必须先检查该阶段是否已有 PR 在处理，防止重复 spawn。

### SPAWN: review,issue=N,branch=xxx
→ delegate_task review-agent, context={issue,branch}, goal="Review implement PR code"

### SPAWN: self-correct,issue=N,branch=xxx
→ delegate_task self-correct-agent, context={issue,branch}, goal="Fix CI failures"

### SPAWN: research,issue=N
→ Pre-check: 没有 OPEN 的 research PR（gh pr list --state open --json headRefName --jq '.[] | select(.headRefName | startswith("research/"))')？
  → 没有 → delegate_task research-agent
  → 有 → 已在进行中，跳过（避免重复 PR）

### SPAWN: plan,issue=N
→ Pre-check: research PR 已 merged？
  → 已 merged → 检查没有 OPEN 的 plan PR？没有 → delegate_task plan-agent
  → 有 OPEN plan PR → 已在进行中，跳过

### SPAWN: implement,issue=N
→ Pre-check: research+plan PRs 已 merged？没有 existing impl/ 分支？
  → 都通过 → delegate_task implement-agent
  → 有 existing impl/ 分支 → 已在进行中，跳过

---

## 2. [NO_ACTIONABLE_EVENTS: run stalled scan]

→ gh pr list --state open --json number,headRefName,body,state,mergeable
→ 检查 research/* 和 plan/* 的 OPEN PR：
  - 可合并（mergeable 不是 CONFLICTING）+ body 含 Parent #N → merge + 推进标签
  - 有冲突（CONFLICTING）→ 跳过，有人已经在处理
  - **绝不碰 impl/* 分支**
→ 没有 research/plan PR → 说明标签可能卡住了 → [SILENT]（当前不自动 repair）

---

## 3. P1: / P2: 非标准事件

→ 根据事件类型判断：
  - check_run → 查实际 CI 状态, 决定 spawn review/self-correct 或 skip
  - issues.labeled → 查 GitHub 当前标签, 确认后 spawn phase agent（注意重复检查）

---

## 4. 脚本无输出 / 其他情况

→ [SILENT]
