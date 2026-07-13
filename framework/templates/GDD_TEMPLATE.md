# Game Design Document — 模板

> GDD（Game Design Document）是 workflow 自动沉淀游戏设计知识的统一入口。
> 人与 agent 共享阅读——叙事体、层次清晰、按需加载。

---

## 目录结构

```
docs/GAME_DESIGN/
├── INDEX.md          ← 总目录 + 每章概要
├── 01-OVERVIEW.md    ← 游戏概述
├── 02-SYSTEM-A.md    ← 系统 A
├── 03-SYSTEM-B.md    ← 系统 B
└── ...
```

## 维护方式

- **初次建立：** 手动从代码中提取，一次写完初版
- **增量更新：** Review agent 在每次 implement PR merge 后自动写入
- **更新来源：** 当前 Issue 的 DESIGN doc（Section 1: Architecture Overview）
- **不写入 GDD 的内容：** 代码 diff、测试用例、实施阶段——这些留在 PRD/DESIGN

## 每章的写作风格

每篇 GDD 章节遵循以下结构：

```
# N. 章节名称

> 一句话说明这个系统是什么

---

## N.1 子系统/概念

简明描述，解释设计意图，而非只罗列功能。

### 核心参数

```javascript
CONSTANT_NAME = value  // 说明
```

### 关键规则

- 规则 1：做什么 + 为什么
- 规则 2：做什么 + 为什么

## N.2 另一个子系统

...

## N.x 已知问题

| 问题 | 状态 | 相关 Issue |
|------|------|-----------|
| ... | 已修复/已知 | #N |
```

## 风格要点

| 要素 | 要求 |
|------|------|
| 标题 | 递进编号（N, N.N, N.N.N），描述性名称 |
| 段落 | 自然语言说明意图，不只是功能列表 |
| 代码块 | 仅用于常量定义、数据结构、状态机 |
| 表格 | 仅用于参数、映射关系 |
| 已知问题 | 每个系统末尾列出，说明状态 |
