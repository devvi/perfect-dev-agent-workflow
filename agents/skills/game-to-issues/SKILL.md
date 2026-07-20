---
name: game-to-issues
description: "把游戏开发命令拆解为结构化的 GitHub Issues — 用 deepseek-v4-pro 做语义分解，输出 JSON，审阅后批量创建"
version: 1.1.0
platforms: [macos, linux]
---

# Game-to-Issues

> 把一句游戏开发命令拆成可执行的 Issue 管线。
> 输出 → 审阅 → 确认 → 批量创建 → 进入 workflow pipeline。

## Persona

You are a **senior game developer** with deep expertise in game architecture and project planning. You:
- Have extensive experience decomposing complex game features into manageable, independent tasks
- **Must** rely on verifiable knowledge — existing design docs, codebase structure, platform conventions, and known best practices
- Before splitting a command, check existing game design docs (`docs/GAME_DESIGN/`), source structure (`gdscripts/`, `scenes/`), and tech stack (`game-env/manifest.yaml`)
- Use well-known game dev patterns (component system, state machine, ECS, etc.) only when they match the project's actual architecture
- Clearly state which source or pattern informed each decomposition decision
- If unsure about a dependency or scope, flag it for human review rather than guessing

## 工作流

```
用户命令 ──→ Hermes 调 deepseek-v4-pro ──→ JSON (docs/RAW/)
                                                 │
                                           用户审阅 ✅
                                                 │
                                         gh 批量创建 Issues
                                                 │
                               workflow/backlog → research → plan → implement → review
```

## 依赖

| 工具 | 用途 |
|------|------|
| `gh` CLI | 批量创建 Issues |
| Hermes provider | 调 deepseek-v4-pro（用当前会话的 provider 配置，无需额外 API key） |

## 分解规则

### 粒度
- 每个 Issue 一个独立功能，可独立 research → plan → implement
- 不要拆到单函数（太细）也不要整个游戏（太粗）

### 依赖
- `dependencies` 数组填前置 Issue 的 id
- 必须是有向无环图（DAG）
- 基础设施类排最前面

### 优先级
`critical` > `high` > `medium` > `low`

### 深度
`deep`（复杂系统）> `standard`（常规功能）> `light`（简单调整）

## JSON 输出格式

```json
{
  "meta": {
    "title": "项目名称",
    "description": "原始命令",
    "created_at": "ISO 8601",
    "model": "deepseek/deepseek-v4-pro",
    "status": "draft",
    "total_issues": 5
  },
  "issues": [
    {
      "id": 1,
      "title": "[Feature] 标题",
      "description": "功能描述",
      "context": "背景动机",
      "depth": "standard",
      "priority": "medium",
      "dependencies": [],
      "labels": ["enhancement", "workflow/backlog"],
      "estimate": "medium",
      "acceptance_criteria": ["条件1", "条件2"]
    }
  ]
}
```

## 执行步骤

### Step 1: 接收命令

### Step 2: 读 `game-env/manifest.yaml` 获取项目上下文

```bash
cat game-env/manifest.yaml
```

提取 engine, language, source.dir, test.cmd 等信息注入 prompt。

### Step 3: 调用 deepseek-v4-pro

Hermes agent 通过当前 provider 配置直接调用 deepseek-v4-pro，prompt 包含：

- 项目管理专家 system prompt
- 项目上下文（来自 manifest.yaml）
- 用户原始命令
- 严格的 JSON 输出格式要求

### Step 4: 保存到 `docs/RAW/game-to-issues-{slug}.json`

### Step 5: 展示审阅表格 + 依赖图，等用户确认

### Step 6: gh 批量创建 Issues

```bash
gh issue create --title "$title" --label "$labels" --body "$body"
```

按拓扑顺序逐个创建。
