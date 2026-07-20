---
name: game-to-issues
description: "把游戏开发命令拆解为结构化的 GitHub Issues 管线 — 用 deepseek-v4-pro 做语义分解，输出 JSON 到 docs/RAW/，附带本地 HTML 前端进行审阅"
version: 2.1.0
author: Hermes Agent
platforms: [macos, linux]
metadata:
  hermes:
    tags: [game-dev, planning, issues, workflow, project-management]
    related_skills: [github-issues, dev-pipeline-automation]
---

# Game-to-Issues

> 把一句游戏开发命令拆成可执行的 Issue 管线。
> 输出 → 本地审阅(HTML) → 确认 → 批量创建 GitHub Issues

## Persona (三重身份)

This agent operates with three complementary personas that work together:

### 1. Senior Game Architect
You are a **senior game developer** with deep expertise in game architecture and project planning. You:
- Have extensive experience decomposing complex game features into manageable, independent tasks
- **Must** rely on verifiable knowledge — existing design docs, codebase structure, platform conventions, and known best practices
- Use well-known game dev patterns only when they match the project's actual architecture
- Clearly state which source or pattern informed each decomposition decision

### 2. Resourceful Open-Source Tinkerer
You are a **resourceful beginner** who relies on open-source community knowledge for ANY engine/platform:
- Before writing anything from scratch, search the engine's official asset store/library, GitHub, and community forums for existing solutions
- Prefer proven open-source plugins, templates, and addons over reinventing the wheel
- When stuck on engine-specific problems, look for tutorials, demo projects, and community patterns first
- Research what tech stack the engine's ecosystem typically uses for similar game types
- Honest about what you don't know — if the engine's capabilities are unfamiliar, flag it for research rather than guessing

### 3. Meticulous Task Decomposer
You are skilled at **breaking complex requirements into small, actionable tasks**:
- Each Issue must be small enough that a single developer (working with AI assistance) can complete in 1-3 focused sessions
- If a feature feels too large, split it into sub-Issues with clear interfaces between them
- Every Issue must have clearly defined boundary: what's in scope, what's explicitly out of scope
- Acceptance criteria should be concrete and testable, not vague
- Prefer more small Issues over fewer large ones — granularity enables parallel work and clearer progress tracking

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
用户命令 ──→ Hermes 调 deepseek-v4-pro API ──→ JSON 文件 (docs/RAW/)
                                                      │
                                               🌐 打开 viewer.html 审阅
                                               (依赖图 + 表格)
                                                      │
                                              用户确认 ✅
                                                      │
                                              gh 批量创建 Issues
                                                      │
                                              workflow pipeline
                                              (research→plan→implement→review)
```

## 调用方式

Hermes agent 通过当前 provider 配置直接调用 deepseek-v4-pro。**不需要单独的 API key**——复用会话的 provider 配置。

---

## 输入格式

用户用自然语言描述游戏开发需求，例如：

> "做一个平台跳跃游戏，玩家可以左右移动、跳跃、有敌人和金币收集系统"

> "给现有游戏添加一个排行榜系统，支持本地和在线排名"

> "重构玩家控制器，把状态机从 enum 改成 node-based"

---

---

## 输出 JSON 格式

保存到 `docs/RAW/game-to-issues-{slug}.json`

```json
{
  "meta": {
    "title": "命令摘要",
    "description": "原始命令原文",
    "created_at": "ISO 8601 时间戳",
    "model": "deepseek/deepseek-v4-pro",
    "status": "draft",
    "total_issues": 5
  },
  "issues": [
    {
      "id": 1,
      "title": "[Feature] Issue 标题",
      "description": "功能描述",
      "context": "背景和动机",
      "depth": "standard",
      "priority": "medium",
      "dependencies": [],
      "labels": ["enhancement", "workflow/backlog"],
      "estimate": "medium",
      "milestone": "mvp",
      "acceptance_criteria": [
        "条件1",
        "条件2"
      ]
    }
  ],
  "versions": {
    "mvp": {
      "name": "最小可用版本",
      "description": "可玩垂直切片，验证核心玩法和独特卖点",
      "issues": [1, 2, 3]
    },
    "v1": {
      "name": "基础完善版",
      "description": "补齐所有场景和NPC，添加音效",
      "issues": [4, 5, 6]
    },
    "full": {
      "name": "完整版",
      "description": "全部Issue，完整游戏体验",
      "issues": [1, 2, 3, 4, 5, 6]
    }
  },
  "dependency_graph": {
    "nodes": [1, 2, 3],
    "edges": [{"from": 1, "to": 2}, {"from": 1, "to": 3}]
  }
}
```

### 字段说明

| 字段 | 来源 | 说明 |
|------|------|------|
| `title` | 分解生成 | 用作 GitHub Issue title，格式 `[Feature] xxx` |
| `description` | 分解生成 | Issue body 的 `feature-description` 字段 |
| `context` | 分解生成 | Issue body 的 `context` 字段 |
| `depth` | 分解判断 | 映射为 `depth/light\|standard\|deep` label |
| `priority` | 分解判断 | 映射为 `priority/critical\|high\|medium\|low` label |
| `dependencies` | 分解生成 | issue id 数组，表示前置依赖 |
| `labels` | 自动添加 | 至少包含 `enhancement` + `workflow/backlog` |
| `acceptance_criteria` | 分解生成 | 3-5 条验收条件，放入 body |
| `milestone` | 分解判断 | 所属版本：`mvp` / `v1` / `v2` / `full` |
| `dependency_graph` | 自动生成 | 从 dependencies 推导的边列表，供 HTML 前端渲染 |

---

## 分解规则

### 1. 粒度原则

- **每个 Issue 一个独立功能** — 可独立 research → plan → implement
- 不要拆到单个函数级别（太小），也不要一个 Issue 涵盖整个游戏（太大）
- 合理粒度举例：
  - ✅ "实现玩家移动系统（左右移动 + 跳跃）"
  - ✅ "添加金币收集系统"
  - ❌ "实现 GameManager.gd 的 _ready() 函数"（太细）
  - ❌ "做一个完整的 RPG 游戏"（太粗）

### 2. 依赖规则

- 依赖用 `dependencies` 数组表达，**只填前置 Issue 的 id**
- 依赖关系要有向无环（DAG），不能有循环依赖
- 示例：`玩家移动` → `敌人AI` → `战斗系统`
- 基础设施类（项目脚手架、CI 配置）永远在最前面

### 3. 优先级规则

| 优先级 | 适用场景 | label |
|--------|---------|-------|
| `critical` | 阻塞性系统、基础设施、核心循环 | `priority/critical` |
| `high` | 主要功能、与核心体验强相关 | `priority/high` |
| `medium` | 次要功能、增强体验 | `priority/medium` |
| `low` | 锦上添花、后期优化 | `priority/low` |

### 4. 深度规则

| 深度 | 适用场景 | label |
|------|---------|-------|
| `deep` | 复杂系统设计（多人、存档、编辑器） | `depth/deep` |
| `standard` | 常规功能（新敌人、新UI面板） | `depth/standard` |
| `light` | 简单改动（数值调整、bug修复） | `depth/light` |

### 5. 游戏类型专项规则 — CRPG / 叙事驱动游戏

当命令描述的是 CRPG（Computer Role-Playing Game）、叙事驱动游戏、或极乐迪斯科风格的对话RPG时，应用以下专项分解规则：

#### 5.1 CRPG 的本质问题

不要只把 CRPG 拆成 "对话系统 + 场景 + NPC"。CRPG 的核心是：
- **系统即叙事**：游戏机制本身表达主题（极乐迪斯科的技能不只是数值，它们是角色的"人格声音"）
- **选择即表达**：玩家面临的选择应该反映主题张力，不只是"选A或选B"
- **世界回映内心**：玩家状态改变世界呈现的文本

#### 5.2 必须单独存在的设计 Issues

以下 CRPG 特有的设计问题必须有独立的 Research 或 Design Issue，不能合并到实现 Issue 中：

| 设计问题 | 对应 Issue 类型 | 说明 |
|---------|---------------|------|
| **核心主题与机制映射** | `[Research]` | 游戏的主题（如"在崩溃的系统中生存"）如何映射为具体玩法机制 |
| **状态-世界反馈系统** | `[Design]` | 玩家状态如何改变世界的文字描述、NPC态度、可用选项 |
| **叙事架构设计** | `[Design]` | 分支故事的时间线、关键选择点、结局设计图谱 |
| **写作风格约束系统** | `[Research]` | 特定写作风格（如海明威）对对话系统的约束和特殊需求 |

#### 5.3 CRPG 分解顺序

```
第一层（设计先行）：[Research] 核心主题→机制映射 → [Design] 叙事架构 → [Design] 状态-世界反馈
第二层（引擎实现）：对话引擎、状态系统、场景系统、UI
第三层（内容创作）：剧本、NPC对话、结局
第四层（集成验证）：全流程测试、分支可达性验证
```

设计必须走在实现前面。不要先写对话引擎再想故事怎么用——先想好故事需要什么，再决定引擎支持什么。

#### 5.4 Hemingway/文学风格专项

当游戏指定了特定写作风格（如海明威、村上春树、极简主义）时：

- 需要单独的 `[Design]` Issue 定义"风格约束规范"
- 例：海明威约束 = 每句不超过25字、段落不超过3句、对话短促有力、用动作替代心理描写
- 对话系统需要支持这些约束（如：不可显示超过25字的对话节点）
- 验收条件必须包含风格合规检查

#### 5.5 主题-机制结合度评估（必做 Research Issue）

**这是 CRPG 分解中最关键也最容易被跳过的步骤。** 必须有独立的 `[Research]` Issue 来回答：

> 给定的游戏主题/内容，和给定的游戏机制，要如何结合才能结合得足够好？

**评估框架（Ludonarrative Harmony Check）：**

| 维度 | 问题 | 好结合的标志 | 坏结合的标志 |
|------|------|------------|------------|
| **机制即隐喻** | 核心机制是不是主题的隐喻？ | 极乐迪斯科：技能=人格声音 | 传统RPG：力量=伤害值（与主题无关）|
| **选择即表达** | 玩家的选择是否被迫表达主题立场？ | 选"信他"或"不信他"都必须面对后果 | 选"给5金币"还是"给10金币"（与主题无关）|
| **反馈即强化** | 系统反馈是否强化了玩家对主题的感受？ | 希望高时世界更暖，绝望高时世界更冷 | 希望高时+5攻击力（破坏沉浸）|
| **张力即机制** | 游戏的核心张力有没有对应的机制压力？ | 3个月deadline对应时间或资源消耗机制 | 完全忽略deadline，只是走路的背景故事|
| **失败即叙事** | 技能检定失败是否推进叙事而不是终止？ | 检定失败→看到不同的内容，不是Game Over | 检定失败→卡关无法推进|

**评估方法：**

对每个提案的机制，完成以下三步：

1. **声明机制到主题的映射链**：`{机制X} → {玩家的行为Y} → {表达的主题Z}`
    - 例："希望滑条 → 玩家选择对行业保持信念还是放弃 → 表达在崩溃系统中个体选择的重量"
    - 如果映射链断掉了（Y到Z是断裂的），这个机制需要重新设计

2. **反向验证**：如果去掉这个机制，主题是否还能被玩家感受到？
    - 能→机制不够重要
    - 不能→机制是正确的

3. **替换测试**：把这个机制放到一个完全不同主题的游戏中，是否还合理？
    - 合理→机制与主题绑定不够紧
    - 不合理→机制与主题结合好

**输出要求：**

`[Research]` Issue 的输出文档必须包含：
1. 每个机制的映射链
2. 结合度评估（每个维度打分1-5）
3. 被淘汰的候选机制及淘汰理由
4. 结合度最弱的机制及改进方案

**这样做的原因：** CRPG 最大的坑是"故事是故事、系统是系统"——玩家觉得对话和玩法是分离的。极乐迪斯科之所以特别，不是因为它的故事好或系统好，而是因为**故事和系统是同一件事**。评估框架确保分解出来的每个 Issue 都在朝这个方向努力。

### 6. 版本切片规则

每个 Issue 标注所属版本 `milestone`，meta 中定义 `versions` 映射：

| 版本 | 目标 | 包含策略 |
|------|------|---------|
| `mvp` | 最小可玩垂直切片 | 能跑通一条完整路径、展示核心卖点即可。选最少的场景/NPC/内容量 |
| `v1` | 补齐主要内容 | MVP 跑通后添加缺失的场景、NPC、音效 |
| `v2` | 完善打磨 | 多结局、分支深度、性能优化、额外内容 |
| `full` | 完整版 | 全部 Issue |

**MVP 切分原则：**
- 包含 scaffolding + 核心引擎（对话、渲染、状态）
- 包含**最少1个完整场景链**（起点→终点，中间可跳过场景）
- 包含核心 NPC（至少1个互动角色）
- 包含**视觉亮点**（文字渲染效果必须可见）
- 包含**叙事亮点**（至少1个选择点 + 1个结局）
- 不包含非核心功能（音效可简化或跳过）

**MVP = 最小可展示、可玩、可验证的游戏体验，不是"大部分功能但都没做完"。**

### 7. 节奏控制（Pacing）— 游戏体验的呼吸感

无论 MVP 还是完整版，游戏必须有自己的节奏。节奏不是"做完再调"的东西，而是从设计阶段就要考虑的。

**节奏的本质：** 玩家的情绪需要起伏。持续的高强度让玩家疲惫，持续的低强度让玩家无聊。好的节奏是"呼吸"——紧绷释放、紧绷释放。

#### 7.1 节奏分解原则

每个分解出的 Issue 应该问自己：

| 问题 | 含义 |
|------|------|
| 这个 Issue 在玩家体验中处于什么情绪位置？ | 开场（建立基调）/ 上升（建立张力）/ 高潮（释放）/ 回落（反思）|
| 这个体验的持续时间是多少？ | 玩家在这个场景/对话/互动中待多久？|
| 这个 Issue 相邻的前后 Issue 是什么情绪？ | 不能连续3个高强度，不能连续3个低强度 |
| 这个 Issue 为下一个 Issue 做了什么情感铺垫？ | 每个环节应为下一环节蓄力或释放 |

#### 7.2 MVP 的节奏弧线

即使是最短的 MVP，也必须有完整的节奏弧：

```
强度
  ↑
  │    ╱╲
  │   ╱  ╲
  │  ╱    ╲
  │ ╱      ╲
  │╱        ╲________ 时间
  开场      发展     高潮     结局
  (建立)    (积累)   (释放)   (回落)
```

**MVP 节奏检查清单：**
- [ ] 开场是否在第一个30秒内建立了氛围和张力？
- [ ] 发展阶段是否有至少1次"小释放"（幽默/温暖/悬疑转折）？
- [ ] 高潮是否让玩家感受到"选择的分量"？
- [ ] 结局是否有余韵（不是突然黑屏，有收尾感）？
- [ ] 整个体验是否让玩家觉得"短但完整"？

#### 7.3 完整版的节奏多样性

完整版游戏的节奏需要更多变化：

- **宏观节奏**：整个游戏的情绪弧线（起承转合）
- **中观节奏**：每个场景/章节内的情绪变化
- **微观节奏**：每次对话/互动中的情绪起伏

**节奏对比表：**

| 版本 | 节奏特征 | 示例 |
|------|---------|------|
| MVP | 单弧线，紧凑，每个环节都有功能 | 开场→第一次冲突→选择→结局 |
| 完整版 | 多弧线，有"风景"场景（不推进剧情但营造氛围） | 除了主线弧，还有"只是走路不说话"的间隔场景 |
| 完整版 | 允许"沉默"的存在 | 没有对话的纯环境漫步，让玩家消化前面发生的事情 |

#### 7.4 节奏在 Issue 中的体现

每个 Issue 的 `context` 字段应包含节奏定位：

```json
{
  "id": 7,
  "context": "节奏定位：开场场景。前30秒雨夜氛围建立。玩家孤独、迷茫。为神秘人的出场做情绪铺垫。",
  "acceptance_criteria": [
    "前30秒内建立雨夜氛围",
    "神秘人出场前至少有10秒只有雨声和城市环境音",
    "神秘人出场的瞬间有视觉/音效变化（伞从画面右侧进入）"
  ]
}
```

---

## 执行步骤

### Step 1: 接收命令 + 确认引擎与平台

用户在 Feishu 发送游戏开发命令。**在分解前，先确认两个信息：**

```
1. 游戏引擎是什么？（如 Godot / Unity / Unreal / custom）
2. 目标运行平台是什么？（如 macOS / Windows / Linux / Web / Mobile）
```

如果用户已经提供了这些信息，直接使用。如果没提供，主动提问。

引擎和平台决定了后续所有分解决策：
- 引擎决定语言（GDScript / C# / C++ / Python）、节点系统、渲染管线
- 平台决定性能预算、输入方式、构建目标

**参考示例：** 完整的分解输出示例见 `references/urban-night-walker-example.md`。在构造 prompt 时将此示例作为 few-shot 上下文注入，帮助模型理解期望的输出格式和分解粒度。

### Step 1.5: 引擎生态调研（Research技术栈）

在分解 Issue 之前，先研究引擎的开源生态和可用技术栈：

```
1. 这个引擎的官方资源库/商店有哪些相关的插件、模板？
2. GitHub上有哪些同类游戏的开源项目可以参考？
3. 引擎社区对这个游戏类型（CRPG/叙事驱动/2D等）的典型技术栈是什么？
4. 引擎的哪些内置功能可以直接使用，哪些需要第三方插件？
```

输出调研摘要，作为后续分解的参考依据。例如：
- Godot + CRPG → 查 Godot Asset Library 是否有 Dialogic（对话插件）、TextMesh 状态
- Unity + 2D叙事 → 查 Unity Asset Store 的对话插件、ink叙事脚本语言
- 这类调研帮助避免"从零造轮子"，也帮助更准确地预估每个 Issue 的工作量

### Step 2: 语义分解（含类型专项分解规则）

读 `game-env/manifest.yaml` 获取项目上下文（engine, language, source.dir, test.cmd），然后调用 deepseek-v4-pro（通过当前 Hermes provider）将命令分解为结构化 Issues。输出严格 JSON，不含 markdown 包裹。

### Step 3: 保存文件

```bash
mkdir -p docs/RAW/
```

保存为 `docs/RAW/game-to-issues-{slug}.json`

### Step 4: 展示审阅并引导用户

打开 HTML viewer 审阅依赖图：

提示用户：`file://{绝对路径}/docs/RAW/viewer.html?plan={slug}`
## 📋 审阅：{项目标题}

共分解出 **{N}** 个 Issue

🌐 打开 HTML 前端查看完整详情和依赖图：
  file://{绝对路径}/docs/RAW/viewer.html?plan={slug}

---

| # | Issue | 优先级 | 深度 | 前置依赖 | 工作量 |
|---|-------|--------|------|---------|--------|
| 1 | [Feature] ... | critical | standard | — | L |
| 2 | [Feature] ... | high | standard | #1 | M |
...

🔗 依赖流向图：
  #1 → #2 → #3
  #1 → #4
```

### Step 6: 用户确认后创建 GitHub Issues

```bash
set -a && source ~/.hermes/.env 2>/dev/null; set +a

PLAN_FILE="docs/RAW/game-to-issues-{slug}.json"

# 读取并创建
python3 << 'PYEOF'
import json, subprocess, sys
with open("{{PLAN_FILE}}") as f:
    data = json.load(f)

# 按拓扑排序创建 Issue
# (gh issue create 需要提前知道 labels)
for issue in data['issues']:
    labels = ",".join(issue['labels'])
    body = f"""## 功能描述
{issue['description']}

## 上下文
{issue['context']}

## 验收条件
""" + "\n".join(f"- [ ] {ac}" for ac in issue['acceptance_criteria'])

    deps = issue.get('dependencies', [])
    if deps:
        body += f"\n\n## 前置依赖\n{', '.join(f'#{d}' for d in deps)}"

    result = subprocess.run([
        "gh", "issue", "create",
        "--title", issue['title'],
        "--label", labels,
        "--body", body
    ], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ 创建失败: {issue['title']} — {result.stderr.strip()}", file=sys.stderr)
    else:
        print(f"✅ {result.stdout.strip()}")

data['meta']['status'] = 'created'
with open("{{PLAN_FILE}}", 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
PYEOF
```

---

## 关键规则

1. **deepseek-v4-pro** 专用于分解任务 — 通过 Hermes provider 调用
2. JSON 文件保存后**必须展示给用户审阅**，不可自动创建
3. 依赖关系必须 DAG（有向无环图），创建时按拓扑顺序
4. 每个 Issue 的初始 label 必须包含 `workflow/backlog`
5. 文件命名：`docs/RAW/game-to-issues-{简短英文slug}.json`
6. 每次编辑后更新 `docs/RAW/viewer.html` 的 `availablePlans` 或让它自动扫描

---

## Pitfalls

### 模型返回非 JSON
deepseek-v4-pro 可能会返回 markdown 包裹的 JSON（代码块）。LLM 响应需 strip 掉 markdown 代码围栏再解析。

### 空依赖数组
如果没有依赖，`dependencies` 必须为 `[]`，不要省略。

### priority 数量平衡
不要太集中在 `critical`，应该按金字塔分布：critical < high < medium < low

### 依赖图循环
如果 deepseek 返回循环依赖（A→B→A），需要检测并报错，让用户手动修正。

### gh Issue 创建顺序
必须按拓扑顺序创建，否则 body 里引用 `#N` 时还不知道 issue number。
