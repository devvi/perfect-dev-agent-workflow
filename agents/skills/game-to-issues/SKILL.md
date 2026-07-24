---
name: game-to-issues
description: "把游戏开发命令拆解为结构化的 GitHub Issues 管线 — 用 deepseek-v4-pro 做语义分解，输出 JSON 到 docs/RAW/，附带本地 HTML 前端进行审阅"
version: 2.4.0
author: Hermes Agent
platforms: [macos, linux]
metadata:
  hermes:
    tags: [game-dev, planning, issues, workflow, project-management]
    related_skills: [github-issues, dev-pipeline-automation, game-issues-review]
---

# Game-to-Issues

> 把一句游戏开发命令拆成可执行的 Issue 管线。
> 输出 → 本地审阅(HTML) → 确认 → 批量创建 GitHub Issues
> 也支持**反向同步**：从 GitHub 上已有的 Issues 重建本地 JSON plan 文件供 Dashboard 使用。

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

**反向同步流程 (GitHub → Local JSON):**

```
GitHub Issues ──→ gh issue list 提取数据 ──→ 构建V4 JSON ──→ 写入 docs/RAW/
            ──→ gh project item-list 获取 stage/status ──→ 验证 DAG
```

---

## 工作流（含 Grill Me 阶段）

```mermaid
flowchart LR
    A[用户命令] --> B[Step 1: Grill Me]
    B --> C{需求清晰？}
    C -->|否| B
    C -->|是| D[Step 1.5: 引擎调研]
    D --> E[Step 1.6: Obsidian 搜索]
    E --> F[Step 2: 语义分解]
    F --> G[Step 3: 保存 JSON]
    G --> H[Step 4: 审阅 + game-issues-review]
    H --> I[Step 5: 创建 GitHub Issues]
    I --> J[Version pipeline<br/>mvp→v1→v2→full]
```

**关键变化：** 第一阶段从"直接分解"改为"Grill Me 拷问 → 澄清 → 再分解"。

---

## 输入格式

用户用自然语言描述游戏开发需求，例如：

> "做一个平台跳跃游戏，玩家可以左右移动、跳跃、有敌人和金币收集系统"

> "给现有游戏添加一个排行榜系统，支持本地和在线排名"

> "重构玩家控制器，把状态机从 enum 改成 node-based"

---

## 输出 JSON 格式

保存到 `docs/RAW/game-to-issues-{slug}.json`

```json
{
  "meta": {
    "title": "命令摘要",
    "description": "原始命令原文",
    "engine": "Godot 4.7.1",
    "platform": "macOS / Linux",
    "created_at": "ISO 8601 时间戳",
    "model": "deepseek/deepseek-v4-pro",
    "status": "draft",
    "total_issues": 5
  },
  "issues": [
    {
      "id": 1,
      "github_number": 42,
      "title": "[Feature] Issue 标题",
      "description": "功能描述",
      "context": "背景和动机",
      "depth": "standard",
      "priority": "medium",
      "dependencies": [],
      "labels": ["enhancement", "workflow/backlog"],
      "estimate": "medium",
      "milestone": "mvp",
      "progress": 0,
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
| `description` | 分解生成 | Issue body 的 feature-description 字段 |
| `context` | 分解生成 | Issue body 的 context 字段 |
| `depth` | 分解判断 | 映射为 `depth/light` / `depth/standard` / `depth/deep` label |
| `priority` | 分解判断 | 映射为 `priority/critical` / `high` / `medium` / `low` label |
| `dependencies` | 分解生成 | issue id 数组，表示前置依赖 |
| `labels` | 自动添加 | 至少包含 `enhancement` + `workflow/backlog` |
| `acceptance_criteria` | 分解生成 | 3-5 条验收条件，放入 body |
| `milestone` | 分解判断 | 所属版本：`mvp` / `v1` / `v2` / `full` |
| `estimate` | 分解判断 | 工作量：`small` / `medium` / `large` |
| `progress` | 反向同步时填充 | 0-100 整数，表示实际完成进度。反向同步时从 GitHub issue state / PR merge 状态推导。0=backlog，100=closed。Dashboard 据此渲染进度条，0% 时显示空条 |
| `github_number` | 可选 | GitHub Issue 编号（仅在反向同步时填充），供 Dashboard 交叉引用 |
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

### 6. 分层表达 — 由浅入深的设计路径

游戏的内容不应该只有"一个深度"。不同玩家投入的时间和注意力不同，应该都能获得完整的体验，只是"完整"的层次不同。

#### 6.1 三层表达模型

```
浅层（泛玩家，100%可达）
  ─ 完整的故事线、清晰的氛围、即时的情感反馈
  ─ 一个对游戏行业毫无了解的玩家也能被雨夜的氛围打动
  ─ 不需要任何背景知识，不需要注意细节

中层（观察者，60%可达）
  ─ 场景之间的呼应、NPC故事的互文、主题的回响
  ─ 注意到便利店店员说的"朋友"就是天桥上醉酒的女人
  ─ 发现神秘人的话在不同场景中逐渐变化

深层（解读者，30%可达）
  ─ 游戏是对自身的隐喻 —— "3个月做卖座游戏"就是开发组自己的处境
  ─ 神秘人可能是玩家内心的投射，"秘密"随玩家状态变化本身就在说"答案在你心里"
  ─ 结局的寓言性：没有一个好结局，只有不同的真实
```

**关键设计原则：** 三层不是"隐藏内容"，而是"同一内容的不同阅读方式"。浅层玩家读完觉得是"一个雨夜的故事"，深层玩家读完觉得是"在说我"。

#### 6.2 分层在设计中的体现

每个场景和 NPC 的内容应该有三层可读性：

| 场景/NPC | 浅层（谁都能看到） | 中层（注意到细节） | 深层（理解隐喻） |
|---------|----------------|-----------------|----------------|
| 便利店店员 | 一个疲惫的夜班店员 | 他说"又一个做游戏的"——说明他不是第一次见到 | 他的疲惫映射了整个行业的系统性倦怠 |
| 天桥醉酒女人 | 一个喝醉的怨妇 | 她骂的是具体的人和事——可能是前同事 | 她可能就是便利店员说的"朋友" |
| 神秘人 | 一个神秘的陌生人 | ta的话越来越像在说玩家自己 | ta可能不是真实的人，是玩家内心"希望"的具象化 |

#### 6.3 分层对 Issue 分解的要求

每个内容相关的 Issue（场景、NPC、剧本）必须在设计和验收条件中明确三层表达：

```json
{
  "id": 12,
  "context": "分层表达：浅层=雨夜氛围+神秘相遇；中层=便利店灯光与公司招牌的冷暖对比暗示行业冷暖；深层=这个城市在雨夜中展现的面貌就是玩家内心的投射",
  "acceptance_criteria": [
    "浅层：场景氛围完整，环境可读文字易懂",
    "中层：场景中的细节元素之间有可发现的关联（如招牌内容呼应NPC对话）",
    "深层：场景的整体调性随玩家状态变化，暗示外部世界是内心的镜像"
  ]
}
```

#### 6.4 分层检查清单

- [ ] 浅层：一个注意力分散的玩家能否理解"发生了什么"？
- [ ] 中层：一个细心的玩家能否发现"还有更多"？
- [ ] 深层：一个投入的玩家能否感受到"它在说某种更本质的东西"？
- [ ] 三层是否共享同一套内容（不是三段分开写的剧本）？
- [ ] 有没有"表层无聊、深层才有趣"——浅层必须独立成立

### 7. 版本切片规则

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

### 8. 节奏控制（Pacing）— 游戏体验的呼吸感

无论 MVP 还是完整版，游戏必须有自己的节奏。节奏不是"做完再调"的东西，而是从设计阶段就要考虑的。

**节奏的本质：** 玩家的情绪需要起伏。持续的高强度让玩家疲惫，持续的低强度让玩家无聊。好的节奏是"呼吸"——紧绷释放、紧绷释放。

#### 8.1 节奏分解原则

每个分解出的 Issue 应该问自己：

| 问题 | 含义 |
|------|------|
| 这个 Issue 在玩家体验中处于什么情绪位置？ | 开场（建立基调）/ 上升（建立张力）/ 高潮（释放）/ 回落（反思）|
| 这个体验的持续时间是多少？ | 玩家在这个场景/对话/互动中待多久？|
| 这个 Issue 相邻的前后 Issue 是什么情绪？ | 不能连续3个高强度，不能连续3个低强度 |
| 这个 Issue 为下一个 Issue 做了什么情感铺垫？ | 每个环节应为下一环节蓄力或释放 |

#### 8.2 MVP 的节奏弧线

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

#### 8.3 完整版的节奏多样性

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

#### 8.4 节奏在 Issue 中的体现

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

### Step 0: Grill Me — 深度需求拷问

> 在分解之前，先拷问用户到底想做什么。不要接受一句"做个XXX游戏"就开工。
> 这一步的目标是产出一份**澄清设计简报（Clarified Design Brief）**，为后续分解提供坚实基础。

**重要：这一步是交互式的。** 输出问题给用户，等待用户回答，再基于回答提出更深的问题。至少进行 2-3 轮问答，直到你认为可以清晰分解为止。

#### 0.0 总轴线 — 主题驱动设计 (Theme-Driven Design)

整个 Grill Me 阶段围绕一条总轴线展开：**主题 → 情绪 → 机制 → 内容 → 版本**。
这条轴线来自 Obsidian 知识库中的两个核心参考：

**参考一：《体验引擎》（Tynan Sylvester）**
- 游戏是体验引擎：设计者不直接创作事件，而是构建**机制**，机制产生**事件**，事件触发**情绪**，情绪构成**体验**
- 优雅的定义：情绪/体验产出与设计成本的比值
- 情绪两因素理论：情绪 = 生理唤醒 + 认知标签
- 人类价值变化表：生/死、胜/败、友/敌、富/贫、知/无知、技巧/无能、自由/奴役、危险/安全

**参考二：《完美的一天》设计路径**
- 撒谎系统不是先想机制再找主题——而是从主题（儿童面对成人世界的道德困境）自然生长出来的
- 麦格芬体系：从"100块"到"放假原因"到"四个神奇盒子"到"我是谁"——层层递进
- 多周目的意义不是"重复"，而是"每一次都有不同的理解"
- 紧张/羞耻双数值：同一个机制同时服务叙事主题和玩法深度

**总轴线：主题 → 情绪 → 机制 → 内容 → 版本**

沿着这条轴线推进拷问，不做无意义的跳跃。每一个问题都可以追溯到这条轴上的某个位置：

```
主题 (Theme) ──→ 你想让玩家体验什么？不是"讲什么故事"，而是"感受到什么"。
   │
   ▼
情绪 (Emotion) ──→ 哪些具体情绪？孤独？希望？绝望？怀旧？恐惧？
   │                参考体验引擎的人类价值变化表
   ▼
机制 (Mechanism) ──→ 什么机制产生这些情绪？不是"对话系统"，而是"对话中什么让玩家紧张"。
   │                    参考完美的一天：撒谎系统从主题生长出来
   ▼
内容 (Content) ──→ 需要什么场景、角色、文本来实现这些机制？
   │
   ▼
版本 (Version) ──→ MVP 做什么？v1 做什么？什么可以推迟？
```

**反模式（不要这么做）：**
- ❌ "我想做一个 CRPG" → "好的，拆成20个技术 Issue"
- ❌ "我想做一个平台跳跃" → "先做物理系统再做关卡编辑器"
- 这些都是从技术出发，不是从体验出发

**正模式：**
- ✅ "我想做一个让玩家感到孤独的城市漫步" → "孤独感来自哪里？雨夜？空旷的场景？无人回应的对话？" → "那么我们需要雨夜渲染系统、空场景加载、单向对话脚本" → 拆解
- ✅ "我想做一个让玩家为每个选择感到紧张的道德困境" → "紧张感怎么产生？不可逆的选择？隐藏的后果？" → "那么我们需要选择分支系统、状态追踪、后果延迟揭示" → 拆解

#### 0.1 第一轮：表层理解 — 确认基本事实

根据用户的第一句话，确认最基本的参数。不是所有问题都需要问——如果用户已经提供了，就不要重复问：

| 问题 | 目的 |
|------|------|
| 什么类型的游戏？ | 类型决定后续所有分解决策 |
| 用什么引擎？ | 引擎决定语言和生态 |
| 目标平台？ | 平台决定性能预算和输入方式 |
| 核心玩法是什么（一句话）？ | 确定 MVP 的核心 |

**但是不要只问这些基础问题。** 这些只是热身。真正的拷问从现在开始。

#### 0.2 第二轮：深层拷问 — 挑战用户的假设

根据第一轮的回答，提出尖锐的、让用户不得不思考的问题。每一类游戏有不同的拷问方向：

**如果用户想做叙事/CRPG游戏：**
- "你想通过这个游戏让玩家感受到什么情绪？不是'讲一个故事'——是'感受什么'？"
- "这个游戏的核心张力是什么？玩家在哪个时刻会觉得'我做个选择是有代价的'？"
- "如果玩家只玩 30 分钟，你希望他离开时在想什么？"
- "你的游戏和《极乐迪斯科》《Florence》《Kentucky Route Zero》有什么本质不同？"
- "这个游戏的 '失败状态' 是什么样的？玩家什么时候会觉得'我搞砸了'——然后呢？"
- "你的主题（比如'资本对人的异化'）对应的具体机制是什么？不要告诉我是'对话选项'——极乐迪斯科也有对话选项，但它的技能检定系统才是灵魂。"

**如果用户想做平台跳跃/动作游戏：**
- "你的跳跃手感参考哪个游戏？马里奥的弹性？蔚蓝的精确？空洞骑士的沉重？"
- "玩家死亡的成本是什么？原地复活？回检查点？丢金币？"
- "你的核心动作组合是什么？跑+跳+攻击？还是只有跳跃？"
- "关卡设计的核心机制是什么？是一个机制贯穿始终（蔚蓝的水Dash），还是不断引入新机制（马里奥）？"
- "敌人的设计目的是什么？是障碍（马里奥的板栗仔）还是谜题（蔚蓝的泡泡）？"

**如果用户想做模拟/策略游戏：**
- "玩家在游戏中的'决策频率'是多少？每秒一个决策（星际争霸）还是每回合一个决策（文明）？"
- "游戏的经济系统是闭环（Stardew Valley）还是开环（Factorio）？"
- "玩家的失败状态是什么？破产？饿死？被摧毁？"

**如果用户想做解谜游戏：**
- "你的谜题是序列式（Portal——线性通过）还是组合式（Baba Is You——自由组合）？"
- "你的谜题机制有多少个？一个好的解谜游戏通常只有 2-3 个核心机制（传送枪+重力靴）。"
- "如果玩家卡住了，你的暗示系统是什么样的？"

#### 0.3 第三轮：版本规划 — 确定 MVP 边界

必须让用户明确：
- **MVP 长什么样？** 不要回答"做完核心功能"——具体到"玩家能从 A 走到 B，和 C 对话，做出选择，看到 D 结束画面"
- **什么功能可以被推迟到 v1/v2？** 主动建议推迟非核心功能
- **MVP 的体验时长是多少？** 5 分钟？15 分钟？30 分钟？
- **MVP 测试目标是什么？** "验证核心循环"还是"给投资人展示"？

#### 0.4 决策记录

每轮问答后，记录用户的回答到 `clarified_brief` 中。最终输出：

```json
{
  "clarified_brief": {
    "original_command": "用户的第一句话",
    "game_type": "确定的游戏类型",
    "engine": "确定的引擎",
    "platform": "确定的平台",
    "core_loop": "一句话描述核心玩法循环",
    "target_emotion": "玩家应该感受到的情绪",
    "mvp_boundary": "MVP 包含什么、不包含什么",
    "mvp_duration": "MVP 预期体验时长",
    "key_design_decisions": [
      "决策1：为什么不做X",
      "决策2：为什么选择Y机制"
    ],
    "obsidian_references": ["用到的 Obsidian 笔记"],
    "web_references": ["搜索到的参考资料"],
    "rounds": [
      {"round": 1, "question": "第一轮问题", "answer": "用户回答"},
      {"round": 2, "question": "第二轮问题", "answer": "用户回答"},
      {"round": 3, "question": "第三轮问题", "answer": "用户回答"}
    ]
  }
}
```

这个 `clarified_brief` 将作为 Step 2 语义分解的输入上下文。

---

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

### Step 1.6: Obsidian 知识库搜索

在分解之前，先搜索 Obsidian 知识库中已有的设计笔记，避免重复设计或遗漏已有的架构决策。

```
1. 读取 OBSIDIAN_VAULT_PATH 环境变量，解析 vault 路径
2. 搜索 wiki/ 目录：search_files(pattern="<项目关键词>", path="/Volumes/Obsidian/Knowledge Ocean/wiki/")
3. 搜索 raw/ 目录（如果 wiki 命中不够）：search_files(pattern="<项目关键词>", path="/Volumes/Obsidian/Knowledge Ocean/raw/")
4. 如果找到相关笔记 → read_file 读取内容 → 在后续分解中引用
```

**搜索关键词：** 从用户命令中提取核心概念（如"夜行"、"对话树"、"CRPG"等），每个概念单独搜索。

**使用规则：**
- wiki/ 命中优先（精炼笔记），raw/ 作为回退（原始资料）
- 匹配到的笔记内容注入到 Step 2 的分解 prompt 中作为上下文
- 如果没有命中，正常继续，不需要通知用户

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
```
## 📋 审阅：{项目标题}

共分解出 **{N}** 个 Issue

🌐 打开 HTML 前端查看完整详情和依赖图：
  file://{绝对路径}/docs/RAW/viewer.html?plan={slug}

### Step 4.5: 可选 — 运行 game-issues-review

在用户确认创建前，建议运行 `game-issues-review` 对 Issue 集进行专家级完整性审查：

```
▶ 用 game-issues-review 审阅 docs/RAW/game-to-issues-{slug}.json
```

该技能会检测 3C 缺口、隐藏依赖、MVP 可玩性、优先级合理性。确认审阅通过后进入 Step 5。

---

### Step 5: 反向同步 — 从已有 GitHub Issues 重建本地 JSON
|---|-------|--------|------|---------|--------|
| 1 | [Feature] ... | critical | standard | — | L |
| 2 | [Feature] ... | high | standard | #1 | M |
...

🔗 依赖流向图：
  #1 → #2 → #3
  #1 → #4
```

### Step 5: 反向同步 — 从已有 GitHub Issues 重建本地 JSON

当用户要求"本地保留一份和GitHub当前工作issue相同的版本"时，执行反向同步：

**5.1 提取 GitHub 数据**

```bash
# 获取所有 open/closed issues 及完整 body（含验收条件、依赖引用）
gh issue list --limit 100 --state all --json number,title,labels,state,body,id

# 获取项目 board 的 stage/status（用于 Dashboard 进度显示）
gh project item-list <PROJECT_NUMBER> --owner <OWNER> --limit 100 --format json
```

**5.2 构建依赖映射**

GitHub issue numbers（如 #42-#59）是连续的但不是从1开始。JSON plan 使用顺序 id (1-N)。创建一个显式映射表：

```
V4 JSON id → GitHub #:
1  → #42,  2 → #43,  3 → #44,  ...  18 → #59
```

转换 dependencies：读取 issue body 中 `## 前置依赖` 段落的 `#N` 引用，将 GitHub # 映射为 JSON id。

**5.3 添加 `github_number` 字段**

每个 issue 条目添加 `github_number: <N>` 字段，供 Dashboard Plans tab 做交叉引用（如锚定到 GitHub 详情页）。

**5.4 更新 `plans.json`**

`docs/RAW/plans.json` 是一个 JSON 数组，每条记录 `{slug, title, total_issues, created_at, status}`。创建/更新 plan 后必须同步修改此文件。格式：

```json
{
  "slug": "urban-night-walker",
  "title": "项目标题",
  "total_issues": 18,
  "created_at": "ISO 8601",
  "status": "created"
}
```

**5.5 里程碑分配**

反向同步时需自行分配 milestone。原则：
- **mvp**: 脚手架 + 核心引擎（对话/状态/渲染/UI） + 最少1条完整场景链（含NPC和结局）
- **v1**: 内容补齐（完整剧本、音效、测试）
- **v2**: 打磨/额外内容
- **full**: 全部 issues

### Step 6: 用户确认后创建 GitHub Issues（含 Version 标签）

创建 Issue 时，除了 `workflow/backlog` 和 `enhancement`，还要添加版本标签 `version/<milestone>`：

```bash
set -a && source ~/.hermes/.env 2>/dev/null; set +a

PLAN_FILE="docs/RAW/game-to-issues-{slug}.json"

# 读取并创建
python3 << 'PYEOF'
import json, subprocess, sys
with open("{{PLAN_FILE}}") as f:
    data = json.load(f)

# 按拓扑排序创建 Issue
for issue in data['issues']:
    labels = ",".join(issue['labels'])
    # 添加 version 标签
    milestone = issue.get('milestone', 'full')
    labels += f",version/{milestone}"
    
    body = f"""## 功能描述
{issue['description']}

## 上下文
{issue['context']}

## 版本
{milestone}

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

## 版本管线（Version Pipeline）

> 版本不是一次性的标签——它是贯穿整个工作流的控制维度。
> Picker 优先拣 MVP 的 Issue，再拣 v1/v2/full。
> Dashboard 按版本分组展示进度。
> 版本标签也在 GitHub 和 Project Board 上可见。

### 版本标签

每个 Issue 在创建时自动添加 `version/<milestone>` 标签（`version/mvp`、`version/v1`、`version/v2`、`version/full`）。

### Picker 版本优先级

在 `event-processor.py` 的 `pick_next_issue()` 中，排序键优先考虑：
1. 优先级（priority/critical > high > medium > low）
2. 版本（version/mvp > v1 > v2 > full）
3. 依赖数（依赖少的优先）

### Dashboard 版本分组

Dashboard 的 Plans tab 按版本分组显示：
- **MVP** — 红色进度条（0-100%）
- **v1** — 橙色进度条
- **v2** — 蓝色进度条
- **full** — 灰色进度条

每个分组的进度 = 该版本内已关闭 Issue / 总 Issue 数。

### 项目面板版本过滤

GitHub Project Board 添加 `Version` 字段（single-select），与 `version/*` 标签同步。
当 Issue 的 `version/*` 标签变更时，自动更新 Board 的 Version 字段。

### 版本对照表

| 版本标签 | 目标 | 应该包含 |
|---------|------|---------|
| `version/mvp` | 最小可玩产品 | 核心循环 + 最少1条完整路径 + 1个结局 |
| `version/v1` | 功能完整 | 所有核心功能 + 内容 + 音效 |
| `version/v2` | 完善打磨 | 多结局、性能优化、额外内容 |
| `version/full` | 全部 | 计划中的所有 Issue |

---

## 关键规则

1. **deepseek-v4-pro** 专用于分解任务 — 通过 Hermes provider 调用
2. JSON 文件保存后**必须展示给用户审阅**，不可自动创建
3. 依赖关系必须 DAG（有向无环图），创建时按拓扑顺序
4. 每个 Issue 的初始 label 必须包含 `workflow/backlog`
5. 文件命名：`docs/RAW/game-to-issues-{简短英文slug}.json`
6. 每次编辑后更新 `docs/RAW/viewer.html` 的 `availablePlans` 或让它自动扫描
7. 反向同步后必须更新 `plans.json`

---

## Pitfalls

### 模型返回非 JSON

deepseek-v4-pro 可能会返回 markdown 包裹的 JSON（代码块）。LLM 响应需 strip 掉 markdown 代码围栏再解析。

### deepseek-v4-pro API 超时（504 Gateway Timeout）

coconut proxy 对 v4-pro 的上游超时较短（约 30-60s）。当 prompt 长、max_tokens 大时容易超时。

**解决：draft + polish 两阶段法**
```json
// 阶段1: v4-flash 起草（快速，输出完整 JSON）
{"model": "deepseek/deepseek-v4-flash", "max_tokens": 8192}

// 阶段2: v4-pro 精修（输入小，生成少，不易超时）
{"model": "deepseek/deepseek-v4-pro", "temperature": 0.2, "max_tokens": 2048}
```
阶段2 的 prompt 只包含「审查并修正这个 JSON」——输入是阶段1的输出，远小于完整规则文档。也可以只用 v4-flash 单阶段，质量接近手写但粒度偏粗，需人工调整。

### 空依赖数组
如果没有依赖，`dependencies` 必须为 `[]`，不要省略。

### priority 数量平衡
不要太集中在 `critical`，应该按金字塔分布：critical < high < medium < low

### 依赖图循环
如果 deepseek 返回循环依赖（A→B→A），需要检测并报错，让用户手动修正。

**Python DAG 检测代码（可在反向同步后或分解后立即执行）：**
```python
edges = [(e['from'], e['to']) for e in data['dependency_graph']['edges']]
nodes = set(n for e in edges for n in e)
visited, stack = set(), set()
def has_cycle(n):
    visited.add(n); stack.add(n)
    for _, t in [(f,t) for f,t in edges if f == n]:
        if t not in visited:
            if has_cycle(t): return True
        elif t in stack:
            return True
    stack.discard(n)
    return False
cycle = any(has_cycle(n) for n in nodes)
print(f"{'❌ HAS CYCLE' if cycle else '✅ DAG valid'}")
```

### gh Issue 创建顺序
必须按拓扑顺序创建，否则 body 里引用 `#N` 时还不知道 issue number。

### 不要手动推进 workflow — 让 webhook 来驱动

创建 Issue 后**不要手动改 label 来触发 pipeline**。Issues 创建时会自动触发 GitHub webhook（`issues.opened`），webhook → workflow-dispatcher.py → pending.json → cron → event-processor → SPAWN → agent。

如果手动改 label（如 `gh issue edit --add-label workflow/available`），可能会绕过依赖检查、跳过阶段门控、破坏管线状态机。

正确的流程：
1. `gh issue create` → 自动带 `workflow/backlog` label
2. webhook 自动收到 `issues.opened` → 写入 pending.json
3. 下一个 cron tick → event-processor 读 pending → 输出 SPAWN
4. LLM 执行 SPAWN

只有在需要**紧急测试 webhook 连通性**时才手动触发，且恢复后立即切回自动流程。

### 创建前先确认 gh auth 状态

`gh issue create` 使用 GraphQL API（限额 5000/h），需先确认已登录：

```bash
gh auth status
# 如果显示 "not logged in" 或 token invalid 则先登录
echo 'ghp_...' | gh auth login --with-token
```

未认证状态下 GraphQL 限额为 0，`gh issue create` 会返回假成功（Issue 不会真正创建）。用 `curl` + REST API 做 fallback：

```bash
curl -s -X POST "https://api.github.com/repos/owner/repo/issues" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -d '{"title":"...","body":"...","labels":[...]}'
```

### JSON 输出必须先验证再展示

分解生成的 JSON **必须先通过语法和逻辑验证再展示给用户**。验证清单：
1. `json.dumps()` 确认无语法错误
2. 验证依赖图是 DAG（无循环引用）——使用上方 Python 代码
3. 验证每个 Issue 有唯一 id
4. 确认 `meta.total_issues` 与实际 issues 数量一致
5. 确认 `dependency_graph` 中所有 `from`/`to` 引用都是有效节点 id
6. 反向同步时额外确认每个 issue 的 `github_number` 对应到真实的 GitHub issue

未通过验证的 JSON 直接报错，不展示给用户。

### GH_TOKEN vs gh auth: Phantom Issues
