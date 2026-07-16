# Perfect Dev Agent Workflow

> **两部分结构：** 这个项目是一个 **可复用的游戏开发 agent 框架**（`framework/`），附带一个 **贪吃蛇实验项目**（根目录）。

## 框架 (framework/)

面向有经验的游戏制作人，把设计经验自动化为可重复的 agent 流程。

```
┌─ 你提 Issue ────────────────────────────────────────────────┐
│  research agent → Obsidian 知识搜索 → PRD → PR → 自动合并    │
│  plan agent → 架构设计 + 测试描述 → PR → 自动合并            │
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
| `workflow/self-correct` | Fixing | CI 失败，自愈中 |
| `status/done` | Done | Issue 关闭 |

**Review 不在 label 链中。** Review agent 在 `check_run.completed` (CI 成功) 后、merge 前被调用。审核通过则 agent 直接 merge PR。详见 `game-review-agent` skill。


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

## 游戏设计文档（GDD）

Workflow 持续产出 Issue 级的 PRD / DESIGN / TASKS，但那是"用完即走"的碎片化知识。

**GDD（Game Design Document）** 是自动沉淀的统一入口——把所有系统的设计知识收敛到一处，结构化为分层文档。

```
docs/GAME_DESIGN/
├── INDEX.md          ← 目录 + 每章概要
├── 01-OVERVIEW.md    ← 游戏概述
├── 02-MOVEMENT.md    ← 移动与碰撞
├── 03-COMBAT.md      ← 战斗系统
├── ...
```

- **初版：** 手动从代码提取一次写完
- **增量更新：** Review agent 在每个 implement PR merge 后，读取 DESIGN doc 的架构决策/常量/数据流，写入对应 GDD 章节
- **不写入 GDD 的：** 代码 diff、测试用例、实施阶段——留在 PRD/DESIGN 中
- **约定文件：** `framework/templates/GDD_TEMPLATE.md`

GDD 的写作风格遵循"人读得懂，LLM 查得到"的原则：叙事体、层次编号、代码块放定义、表格放参数、段落讲意图。

详见 `docs/GAME_DESIGN/INDEX.md` 的维护规则。

## Hermes Skills

框架的核心逻辑在 `.hermes/skills/` 下：

- `game-research-agent` — Issue → PRD（含 Obsidian 搜索）
- `obsidian-knowledge-search` — 知识搜索 + 缓存管理
- `game-plan-agent` — PRD → DESIGN（含测试用例描述，不写可运行测试文件）
- `game-implement-agent` — DESIGN → 代码 + 测试文件（OpenCode 分层实现）
- `game-review-agent` — 代码审查 + 合并决策 + post-merge GDD 更新
- `dev-workflow-dispatcher` — 事件调度 + 规则
- `workflow-retro` — 事后回顾 + 自我修复
