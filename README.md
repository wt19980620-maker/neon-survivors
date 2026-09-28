# 霓虹幸存者 Neon Survivors

霓虹几何风格的类幸存者（Vampire Survivors-like）网页游戏。Phaser 3 + TypeScript + Vite。

## 运行

```bash
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 生产构建到 dist/（纯静态文件，可直接部署）
```

## 玩法

- WASD / 方向键移动，触屏拖动虚拟摇杆；武器自动攻击
- 捡经验宝石升级，每次三选一；最多 4 把武器、5 个被动
- 5:00 首领「猩红守望者」，10:00 最终首领「虚空之主」，击败即胜利
- 精英怪和首领掉落宝箱（额外一次升级）
- 武器进化：武器满级 + 持有对应被动，打开宝箱时进化（暂停界面可查看配方进度）

| 武器 | 被动 | 进化 |
|---|---|---|
| 能量飞弹 | 急速 | 风暴弹幕：追踪连射 |
| 环绕刃 | 领域 | 星环绞杀：8 刃，半径胀缩 |
| 脉冲新星 | 活力 | 生命脉冲：命中回血 |
| 连锁闪电 | 力量 | 雷霆审判：终点雷暴爆炸 |
| 回旋飞盘 | 多重 | 裂变星盘：远端裂变 3 个小飞盘 |

- 每局结束获得金币，可在菜单「局外强化」永久提升
- Esc / P 暂停，M 静音

## 代码结构

| 文件 | 内容 |
|---|---|
| `src/game/data.ts` | 所有数值：武器每级属性、被动、敌人、经验曲线、局外强化 |
| `src/game/director.ts` | 刷怪节奏、脚本事件（包围、蜂群、首领）、敌人随时间成长 |
| `src/game/weapons.ts` | 5 种武器的行为 |
| `src/scenes/GameScene.ts` | 核心循环：玩家、敌人 AI、首领、掉落、伤害、特效 |
| `src/scenes/UIScene.ts` | HUD、升级选卡、暂停、结算、触屏摇杆 |
| `src/scenes/MenuScene.ts` | 主菜单与局外强化商店 |
| `src/game/textures.ts` | 运行时用 Canvas 绘制全部贴图（无美术资源文件） |
| `src/game/audio.ts` | WebAudio 实时合成音效（无音频文件） |

调平衡主要改 `data.ts` 和 `director.ts`。
