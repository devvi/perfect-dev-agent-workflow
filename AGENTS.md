# Perfect Dev Agent Workflow

> **两部分结构：** 这个项目是一个 **可复用的游戏开发 agent 框架**（`framework/`），附带一个 **贪吃蛇实验项目**（根目录）。

## 框架 (framework/)

面向有经验的游戏制作人，把设计经验自动化为可重复的 agent 流程。

```
┌─ 你提 Issue ────────────────────────────────────────────────┐
│  research agent → Obsidian 知识搜索 → PRD → PR → 自动合并    │
│  plan agent → 架构设计 + 测试用例 → PR → 自动合并            │
│  implement agent → OpenCode 分层实现 → PR → CI → review → 部署 │
└─────────────────────────────────────────────────────────────┘
```

详见：
- `framework/ARCHITECTURE.md` — 系统架构、设计决策、已知限制
- `framework/quickstart.md` — 游戏制作人 30 分钟上手
- `framework/templates/` — 模板文件副本
- `framework/cicd/` — CI/CD 流程副本

## 实验项目 (根目录)

当前实验项目是一个贪吃蛇游戏（Metroidvania Snake），用于验证框架的实际效果。

所有关于游戏本身的代码、测试、文档都在根目录：
- `public/` — 游戏源码
- `tests/` — 游戏特定测试（包括 E2E play-test）
- `docs/` — Issue 级别的 PRD、DESIGN、REFERENCE
- `.github/workflows/` — 运行时 workflow（GitHub 要求位置）
- `.github/ISSUE_TEMPLATE/` — Issue 模板（GitHub 要求位置）

## Workflow Labels

| Label | Stage | 说明 |
|-------|-------|------|
| `workflow/available` | Available | Issue 创建后，等待处理 |
| `workflow/research` | Research | research agent 进行中 |
| `workflow/plan` | Plan | plan agent 进行中 |
| `workflow/implement` | Implement | implement agent 进行中 |
| `workflow/test` | Test | review agent 审查中 |
| `workflow/deploy` | Deploy | 部署进行中 |
| `workflow/self-correct` | Fixing | CI 失败，自愈中 |
| `status/blocked` | Blocked | 需要人工介入 |
| `status/done` | Done | Issue 关闭 |


## Tech Stack

| 组件 | 用途 |
|------|------|
| Hermes Agent | Agent 运行时 + 事件路由 |
| OpenCode Serve | LLM 代码生成引擎 |
| GitHub Issues | 任务队列 + 状态管理 |
| GitHub Actions | CI/CD 执行环境 |
| Vercel | 部署平台 |
| Obsidian | 知识库（设计笔记） |
| Playwright | E2E 浏览器测试 |

## Hermes Skills

框架的核心逻辑在 `.hermes/skills/` 下：

- `game-research-agent` — Issue → PRD（含 Obsidian 搜索）
- `obsidian-knowledge-search` — 知识搜索 + 缓存管理
- `game-plan-agent` — PRD → DESIGN + 测试用例
- `game-implement-agent` — DESIGN → 代码（OpenCode 分层实现）
- `game-review-agent` — 代码审查 + 合并决策
- `dev-workflow-dispatcher` — 事件调度 + 规则
- `workflow-retro` — 事后回顾 + 自我修复
