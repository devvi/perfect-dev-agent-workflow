# Stage Gate 设计原理

> 为什么本地 Python 脚本比 GitHub Actions / branch protection 更适合做 stage gate

## 背景

2026-07-11 的 Retro 发现 implement-agent 创建 PR 时遗漏了 `workflow/implement`
label。修复时有两种方案被讨论：

- **方案 A（被拒）：** GitHub Action `label-enforcer.yml` + branch protection
- **方案 B（采纳）：** 本地 `stage-gate.py` Python 脚本，在转场点同步执行

K 的评价是：「你这个方向有点绕啊，你本地不能跑一段step程序吗，比如从research到plan一定会跑」

## 为什么方案 A（GitHub Actions）绕远了

### 1. 异步 vs 同步

| 维度 | GitHub Actions | 本地脚本 |
|------|---------------|---------|
| 执行时机 | push → 等 Action 启动 → 等跑完 → 等 status check 更新 | 转场点立即执行 |
| 反馈延迟 | 20-30s 起步 | <1s |
| 锁死 merge | 依赖 branch protection 配置（UI 操作，不能 git push） | exit 1 天然阻塞 |

### 2. 配置 vs 零配置

GitHub Actions 方案需要：
```
1. 写 label-enforcer.yml ✓（可以 git push）
2. 去 GitHub UI 配 branch protection ✗（手动操作）
3. 勾选 required status checks ✗（手动操作）
4. 每次加新的 check 都要改 branch protection ✗（手动操作）
```

本地脚本方案：
```
1. 写 stage-gate.py ✓（可以 git push）
2. 在 agent prompt 加一行 "先跑这个脚本" ✓
3. 完成
```

### 3. Token scope 限制

GitHub Actions 的 GITHUB_TOKEN 确实有写 issues 的权限，但：
- Actions 只有在 PR push 触发后才会跑
- 如果 PR 是在 agent 本地创建的（通过 `gh pr create`），Action 的触发是异步的
- 而 agent 的 PAT 受 `read:org` 限制，不能 `gh pr edit --add-label`

本地脚本用 `gh issue edit`（REST API）绕开了这个问题：
```bash
# ❌ 需要 read:org scope（GraphQL API）
gh pr edit $PR_NUM --add-label workflow/implement

# ✅ 只需要 repo scope（Issues REST API，PR 本质是 Issue）
gh issue edit $PR_NUM --add-label workflow/implement
```

## 核心设计原则

### 原则 1：代码 > prompt

验证逻辑一定是代码（Python/shell），不是 prompt。
- 代码可以被版本控制、review、测试
- prompt 是自然语言，每个模型理解不同
- `|| exit 1` 强制执行，LLM 无法跳过

### 原则 2：本地 > 远程

在 agent 的工作机器上跑的代码 > 在 GitHub 上跑的 Action。
- 本地代码可以在转场点**同步**执行，不需要等异步 webhook
- 本地代码可以读本地文件（如 `docs/PRD/*.md`），GitHub Action 不能
- 本地代码不需要网络延迟（除了必要的 API 调用）

### 原则 3：同步 > 异步

同步执行有一个天然优势：**调用者被阻塞，直到验证完成**。这意味着：
- exit 0 → 继续转场
- exit 1 → 立即停止，写日志，不需要等 branch protection 的 30s 延迟
- 不需要额外的"失败通知"机制——exit code 本身就是通知

### 原则 4：简单 > 复杂

```
复杂: GitHub Action → status check → branch protection → poll → merge gate
简单: python3 stage-gate.py || exit 1
```

越简单的链路越不容易出 bug。每一个增加的中介（Action runner, status check, branch
protection rule）都是新的故障点。

## 什么时候用 GitHub Actions

本地脚本 + GitHub Actions 各有适用场景：

| 场景 | 选哪个 | 原因 |
|------|--------|------|
| **转场前验证**（spawn agent 前） | 本地脚本 | 同步、零延迟、读本地文件 |
| **PR 创建后验证** | 本地脚本 | agent 原地就能跑 |
| **CI 测试** | GitHub Actions | 需要隔离环境、GPU、长时间运行 |
| **合并后推进**（label advancement） | GitHub Actions | 需要 GITHUB_TOKEN scope，即时触发 |
| **部署**（Vercel） | GitHub Actions | 部署需要在 GitHub 上执行 |
| **分支名验证** | 两者皆可 | 本地更简单，Actions 更稳健 |

关键区分：**需要 agent 等待的 → 本地脚本；不需要等待的 → Actions。**

## Bash `|| exit 1` 强制模式

这是确保代码 gate 不被跳过的关键模式：

```bash
# ❌ 弱约束（agent 可能跳过）
python3 ~/.hermes/scripts/stage-gate.py --pr "$PR_NUM"

# ✅ 强约束（bash 强制执行）
python3 ~/.hermes/scripts/stage-gate.py --pr "$PR_NUM"
if [ $? -ne 0 ]; then
  echo "Stage gate blocked"
  exit 1
fi

# ✅ 更简洁的等价写法
python3 ~/.hermes/scripts/stage-gate.py --pr "$PR_NUM" || exit 1
```

`||` 是 bash 运算符——agent 的 LLM 输出被 bash 解释执行，不是 LLM 自己决定
是否执行。如果 `stage-gate.py` exit 非 0，bash 会自动 `exit 1`，agent 无法绕过。

## 回溯：本次故障链

```
PR #117 创建（缺 workflow/implement label）
  ↓
opencode-review.yml CI → 之前 gated on label → SKIP
  ↓
workflow-chain.yml → 之前检查 label → 不在 PR 上 → SKIP
  ↓
deploy.yml → 之前检查 label → 不在 PR 上 → SKIP
  ↓
🚨 3 个门禁都因为同一个原因（label 缺失）失效
```

三个门禁的**共同脆弱点**是它们都依赖 label 作为信号。修复后：
- CI gate 改用 branch name（`impl/*` → 不可变）
- label 门禁用 `stage-gate.py` 自动修复（`gh issue edit` REST API）
- workflow-chain.yml 加 branch-name fallback
- 三处改为**独立的、不同的检查机制**，不再共享同一个脆弱信号

## 参考

- 脚本位置: `~/.hermes/scripts/stage-gate.py`
- 调用点: `game-implement-agent` skill Step 8 / Direct Fallback
- GitHub Action gates: `.github/workflows/opencode-review.yml`（CI branch gate）
- Post-merge fallback: `.github/workflows/workflow-chain.yml`
