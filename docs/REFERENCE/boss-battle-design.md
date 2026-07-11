---
topic: "boss-battle-design"
created: 2026-07-11
source_issue: 127
keywords: ["boss", "snake boss", "AI behavior", "boss room", "multi-phase boss", "victory screen", "boss intro", "pillar room", "boss health", "food drop", "blink mechanic"]
expires_after_days: 7
wiki_files_checked: [
  "wiki/JRPG战斗系统演变.md",
  "wiki/体验引擎-patterns.md",
  "wiki/体验引擎-游戏设计框架.md",
  "wiki/体验引擎——游戏设计全景探秘.md",
  "wiki/体验引擎章节精读.md",
  "wiki/体验引擎-glossary.md",
  "wiki/独立游戏开发讨论.md",
  "wiki/2026-06-18 独立游戏开发与设计思路讨论.md",
  "wiki/游戏设计理念.md",
  "wiki/Project YOUTH.md",
  "wiki/Project Animal.md",
  "wiki/汐.md",
  "wiki/完美的一天.md",
  "wiki/原始材料-汐.md",
  "wiki/原始材料-开发笔记.md",
  "wiki/原始材料-技术笔记.md",
  "wiki/原始材料-Clippings.md",
  "wiki/原始材料索引.md",
  "wiki/体验引擎-glossary.md",
  "wiki/CUSGA 2026 游戏评选笔记.md"
]
---

# Boss Battle Design — Issue #127 Knowledge Brief

## 1. Directly Applicable

### 1.1 Boss Room Layout (Pillars, 4× Larger Room)

**No existing wiki content directly addresses boss room layout, pillar placement, or larger-than-normal room design.** The wiki contains no architectural/level design patterns for boss arenas.

However, the existing codebase provides the foundation:
- `ROOM_SIZE = 20` (20×20 grid) in `constants.js` — can be scaled per-room
- `ROOM_TYPE` enum (NORMAL, START, GOAL, SAVE, HIDDEN, GACHA, KEY_SHRINE) — a new `BOSS` type can be added
- `generateRoomTiles()` in `generator.js` — interior generation can be extended for boss rooms
- Pillars would use `CELL.STONE_WALL` (value 4, existing in `constants.js`) — collision + break behavior for STONE_WALL cells already exists conceptually

**Applicable pattern (from 体验引擎/Elastic Challenge):** The 4 pillars at NE/SE/NW/SW are a form of **elastic challenge** — they break on collision, dropping food, providing a tactical layer. This maps to the "multi-level success/failure" pattern.

### 1.2 Boss AI Behavior (Chase → Charge → Normal → Hunting)

**No existing wiki content directly describes chase/charge/multi-phase boss AI.** However:

- **Existing AI system** (`public/src/engine/ai.js`) already implements:
  - `enemyChasePath()` — greedy pathfinding toward target (snake head or nearest food)
  - `aiState = 'chase'` — chase mode when player is in same room
  - `tryStealFood()` — enemy can steal and eat food to grow
  - `chaseRange` and `speedTicks` — configurable chase parameters
  - Segmented snake-body enemies (segments array, HP system)
  - `returnCount` — return-to-home behavior when too far

- **JRPG战斗系统演变.md** provides one directly applicable principle:
  - Line 30: `"战斗与叙事整合：Boss战应表达角色冲突，战斗机制应隐喻角色成长"`
  - Translation: "Battle and narrative integration: Boss battles should express character conflict; combat mechanics should metaphorically represent character growth."

- **体验引擎/Elastic Challenge pattern** applies to multi-phase design: each phase transition is a "self-reinvention" of the boss, keeping the fight at the player's skill edge.

### 1.3 Boss Health System (Multi-Part Boss, 6 HP)

**No direct wiki content on segmented/multi-part boss health bars.** However:

- Existing enemy system supports `hp` and `segments` array in `ai.js`
- The "Blue Hammer" spec (double-row, 3 HP per row × 2 rows = 6 total) maps cleanly to the existing segmented enemy architecture
- The multi-row visualization borrows from the Snake game's own visual language (two parallel rows of cells)

### 1.4 Food/Bullet Drop Physics and Blinking Mechanics

**No wiki content covers food drop physics, bounce, or blinking/despawn mechanics.**

Applicable concepts:
- 体验引擎's **弹性挑战** (Elastic Challenge) pattern — the dropping food creates a second-chance dynamic after pillar collision
- 独立游戏开发讨论's "建造-破坏-建造" philosophy — pillars (built) → player breaks them (destroy) → food appears (new rule emerges)
- The blink-before-despawn is a **可变间隔强化** (Variable-Ratio Reinforcement) pattern — creates urgency and tension around collecting dropped items

### 1.5 Victory Screens and Boss Introduction Sequences

**No wiki content on victory screen design or boss intro sequences.**

The existing code in `public/src/render/overlays.js` has:
- `renderVictoryScreen()` — current simple victory overlay (gold text, stats)
- `renderGameOverScreen()` — game over overlay (red text, stats)
- `renderTitleScreen()` — interactive title menu

These provide the rendering infrastructure (dark overlays, styled text, stats display) that can be reused for both boss intro (dialog/pause) and enhanced victory sequences.

**Applicable principle (体验引擎):**
- Line 37: `"情绪 = 生理唤醒 + 认知标签"` (Emotion = physiological arousal + cognitive label) — the boss intro sequence should create arousal (pausing game, dramatic entrance) and label it with the fiction layer (boss name, dialog)
- The victory screen transition from boss defeat is a **人类价值变化** (Human Value Change) from 危险/安全 (danger/safety) — the shift from tense fight to reward screen fulfills this emotional arc

---

## 2. Inspirational

### 2.1 Design Philosophy from 建造→破坏→建造 (Build → Destroy → Build)

From **独立游戏开发讨论.md** and **2026-06-18 独立游戏开发与设计思路讨论.md:**

> "建立一套规则 → 设计工具让玩家破坏这套规则 → 破坏本身 + 旧规则 → 建立新规则（螺旋上升）"

**Application to Boss Fight:**
- Phase 1 (Chase): Boss chases player → player "builds" dodging strategy
- Phase 2 (Charge at 4 HP): Boss gains new ability → player must "destroy" old strategy, adapt
- Phase 3 (Normal Snake + Hunting at 2 HP): Boss becomes a snake the player can fight directly → "new rules emerge"
- Pillars as destructible elements: player destroys environment → food rewards → new tactical options

### 2.2 Elastic Challenge for Multi-Phase Difficulty

From **体验引擎-patterns.md** (Pattern 2):

> "创建多级成功和失败。评分系统、分级评判、不会结束游戏的局部失败。"

**Application:** The boss fight doesn't need to kill the player outright on failure — losing a segment or dropping food can be "local failure" that the player recovers from, creating a wider skill range where less skilled players can still progress.

### 2.3 标签化 (Labeling) for Boss Narrative

From **体验引擎-patterns.md** (Pattern 6):

> "用小说赋予机制交互意义。给单位起名、赋予性格特质、创建叙事上下文。"

**Application:** Naming the boss "Blue Hammer" and giving it an intro dialog creates narrative context for the fight mechanics. The three phases aren't just mechanic changes — they tell a story of the boss weakening/transforming.

### 2.4 情绪维持 (Emotional Maintenance) During Learning

From **体验引擎-patterns.md** (Pattern 4):

> "使用低技能的情绪触发器（美术、音乐、叙事钩子）在学习期间保持参与度。"

**Application:** If the boss is hard, the intro sequence and dramatic visual (BOSS door, larger room, pillars) provide low-skill emotional hooks that keep the player engaged even before they learn the fight patterns.

### 2.5 决策生产系统 (Decision-Producing Systems)

From **体验引擎-patterns.md** (Pattern 10):

> "设计通过机制交互自然产生决策的系统，而非对话树。"

**Application:** The boss fight should produce natural decisions through mechanics:
- "Do I break the pillar for food now, or dodge the charge first?"
- "Do I shoot at the boss's head, or survive another wave?"
- "Which direction to dodge the charge attack?"

### 2.6 JRPG Multi-Phase Design Lessons

From **JRPG战斗系统演变.md**:

> **分层设计**: 基础动作→进阶连招→策略属性，让不同深度玩家都能找到乐趣

The boss phases naturally implement this layering:
1. Chase (basic movement/dodging)
2. Charge (advanced timing/spacing)
3. Normal snake + hunting (strategic positioning + shooting)

> **模块化难度**: 遭遇频率/敌人强度/grind需求/AI辅助可独立调节

Each boss phase can be independently tuned — charge speed, chase range, food drop rate.

### 2.7 Game Design Review Framework — Enemy/AI Design Dimension

From **game-design-review** skill (references/dimensions.md):

> **Enemy/AI Design** — behavior patterns, threat communication, encounter design

For the Blue Hammer boss, threat communication patterns:
- Chase: visual follow (player sees boss tracking them)
- Charge: telegraph (wind-up before charge)
- Phase transition: screen shake, visual/color change

---

## 3. Knowledge Gaps

The following are **not present in any searched wiki file** and represent genuine knowledge gaps:

### 3.1 Boss Room Generation
- **No pattern for 4× (or larger) room scaling.** The current `ROOM_SIZE = 20` is global. Need to implement per-room size override.
- **No pattern for pillar/obstacle placement in boss arenas.** Need to design pillar generation (positioning at NE/SE/NW/SW corners).
- **No pattern for BOSS door visual differentiation.** Need BOSS door type (different color/lock visual from normal doors).
- **No pattern for boss room as replacement for goal room.** The existing GOAL room triggers immediate victory — need logic to make boss room replace goal condition.

### 3.2 Boss AI Behavior Patterns
- **No charge attack pattern** — charge (fast linear movement in one direction, then pause/halt) is entirely new. Existing AI only does greedy pathfinding.
- **No multi-phase state machine** — need to implement boss state machine (Phase 1 → Phase 2 at 4 HP → Phase 3 at 2 HP).
- **No hunting-mode AI pattern** — hunting (boss goes off-screen, then re-enters from a direction to ambush) requires room-edge spawning logic and different pathfinding.
- **No telegraph/wind-up animation** — charge needs visual telegraph (pause before rush, color flash, etc.)

### 3.3 Boss Health Display
- **No multi-segment health bar UI** — the existing HUD doesn't show enemy HP bars. Need boss health bar (possibly dual-row, 3+3 segments).
- **No multi-part boss damage model** — the boss has 2 rows × 3 HP each, effectively two linked entities. Need to implement:
  - Damage applied to current active row
  - Row destruction = visual change (boss shrinks/loses row)
  - Boss behavior change on row/HP thresholds

### 3.4 Physics & Animation Systems
- **No food drop physics** — food currently spawns at fixed positions. Need:
  - Bounce physics on drop (food springs from pillar collision point)
  - Velocity-based food scattering
  - Food settles at random position after bouncing
- **No blink mechanic** — food items don't have a despawn timer. Need:
  - Blinking animation (alpha oscillation before removal)
  - Blink timing (e.g., food blinks for 1.5s then disappears)

### 3.5 Boss Intro & Victory Screen
- **No pausing for boss intro** — game doesn't have a "dialog pause" state. Need:
  - `BOSS_INTRO` game state (similar to PAUSED but with boss dialog)
  - Boss name/description dialog rendering
  - Player must press key to dismiss and start fight
- **No enhanced victory screen** — current victory screen is simple stats. Need:
  - Boss-specific victory content (e.g., "Blue Hammer Defeated!")
  - Possible transition from boss death animation → victory screen

### 3.6 Game Design Patterns Not in Wiki
- Boss room lock mechanics (BOSS key or conditional unlock)
- Phase transition screen effects (flash, shake, brief pause)
- Room-wide AOE attacks (e.g., hunting mode charge)
- Enemy spawn-on-edge behavior
- Invulnerability frames / damage resistance in boss fights
- Fight pacing (attack windows vs. danger windows)

### 3.7 Existing Code That Can Be Repurposed

The following code can be DIRECTLY reused or extended for the boss feature:

| Code | File | Boss Use |
|------|------|----------|
| `enemyChasePath()` | `ai.js:109` | Base for chase Phase 1 (may need speed boost) |
| `segments` + `hp` | `ai.js:80-82` | Boss segmented body (3+3 double row) |
| `tryStealFood()` | `ai.js:149` | Boss eating dropped food |
| `CELL.STONE_WALL` (4) | `constants.js:38` | Pillar cell type (break on collision) |
| `renderVictoryScreen()` | `overlays.js:141` | Base for new boss victory screen |
| `renderPauseScreen()` | `overlays.js:169` | Base for boss intro pause dialog |
| `screenShake` | `core.js:70` | Phase transition and charge impact |
| `GAME_STATE` | `constants.js:43` | Can add `BOSS_INTRO` state |
| `ROOM_TYPE` | `constants.js:11` | Can add `BOSS` room type |
| `invulnerableTicks` | `core.js:76` | During boss transition/invuln frames |
