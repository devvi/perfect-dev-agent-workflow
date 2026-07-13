# 8. 存档系统

> 使用浏览器 localStorage 存储游戏进度，进入 SAVE 房间时自动存档。

---

## 8.1 存档触发

进入 `ROOM_TYPE.SAVE` 的房间时自动触发 `saveGame()`。

## 8.2 存档内容

```javascript
{
  version: 1,
  snake: [{x, y}, ...],        // 蛇身坐标
  currentRoom: {x, y},         // 当前房间
  direction: {x, y},           // 移动方向
  inventory: {
    keys: [...],               // 已收集钥匙 ID
    items: [{type, duration, stack}, ...],  // Power-up 列表
  },
  exploredMap: [[bool]],       // 房间探索状态
  score: number,
  fireRate: number,            // 战斗参数（保留 Power-up 效果）
  projectileSpeed: number,
  projectileDecay: number,
  projectilePower: number,
  doubleShot: boolean,
  maxProjectiles: number,
  worldState: {...},           // 完整世界状态
  timestamp: number,           // 存档时间
}
```

## 8.3 读档

游戏结束画面按 S 键触发 `loadGame()` → `applySave()`。

读档流程：
1. 从 localStorage 读取数据
2. 验证 version 和数据结构
3. 反序列化世界（还原房间、敌人、食物）
4. 重建蛇的状态和战斗参数
5. 还原房间探索状态
6. 设置 `gameState = 'playing'`，立即进入游戏

## 8.4 存档键

```javascript
SAVE_KEY = 'snake_save'
```

## 8.5 容错

- JSON 解析失败 → 清空存档并返回 null
- 版本不匹配 → 清空旧存档
- 数据结构不完整 → 清空并返回 null
