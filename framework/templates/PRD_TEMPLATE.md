# Research: <feature-name>

> Parent Issue: #<N>
> Agent: <agent-name>
> Date: <YYYY-MM-DD>

---

## 1. Problem Definition

### Current Behavior
<What happens now? Be specific. Include steps to reproduce if bug.>

### Expected Behavior
<What should happen instead? Be concrete.>

### User Scenarios
- **Scenario A:** <When does this matter? Who is affected?>
- **Scenario B:** <Alternative context where this matters>
- **Frequency:** <Every time? Rare edge case?>

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?
<Check git blame, design docs, previous discussions. What was the original intent?>

### Why Change Now?
<What changed that makes the current behavior no longer acceptable?>

### Previous Constraints
<Any past decisions or constraints that are still binding?>

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `src/` |        |                  |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `src/` |        |              |

### Data Flow Impact
<Describe how data flows through the affected modules, what changes.>

### Documents to Update
- [ ] `docs/DESIGN/`
- [ ] `docs/REFERENCE/`
- [ ] `README.md`
- [ ] Other: ___

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: <name>
- **Description:** <How it works>
- **Pros:** <List>
- **Cons:** <List>
- **Risk:** <High/Medium/Low> — <why>
- **Effort:** <estimate>

### Approach B: <name>
- **Description:** <How it works>
- **Pros:** <List>
- **Cons:** <List>
- **Risk:** <High/Medium/Low> — <why>
- **Effort:** <estimate>

### Recommendation
→ **Approach <X>** because: <decisive rationale>

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. <Happy path step>
2. <Happy path step>

### Edge Cases
1. **<Case name>:** <What if... Expected behavior?>
2. **<Case name>:** <What if... Expected behavior?>
3. **<Case name>:** <What if... Expected behavior?>

### Failure Paths
1. **<Case name>:** <What happens when... Expected behavior?>

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| <Feature/Module> | Stable / In-flux | Low / Med / High |

### Blocks
| Future Work | Priority |
|-------------|----------|
| <Feature>   |          |

### Preparation Needed
- [ ] <Pre-step before implementation can begin>

---

## 7. Spike / Experiment (Optional — depth/deep only)

### Question to Answer
<What uncertainty needs resolving before committing to a plan?>

### Method
<Quick experiment to run>

### Result
<What was learned>

### Impact on Approach
<How does this change the recommendation?>
