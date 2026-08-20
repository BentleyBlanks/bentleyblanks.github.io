# 滕县接入正片 —— 模块契约与推定值索引

台儿庄那一版（开放战场 + 占领点 + 战役阶段）已整体作废。这一份只记两件事：
**各模块之间的契约**，与**推定值登记在哪儿**。

具体的数字一律不在本文件里复制 —— 复制就会分叉。要看数就去看下面指的那三张表。

---

## 一、推定值登记在三处，本文件不再复制

| 登记表 | 位置 | 管什么 |
|---|---|---|
| `PRESUMED` | `Data_Tengxian.mjs` | 城的几何：墙、濠、瓮城、街巷宽度、院落形制…… |
| `PRESUMED_STAGING` | `Data_TengxianScript.mjs` | 演出：关卡时长、兵员池曲线、过场机位、虚构人物 |
| `PRESUMED_TUNING` | `Data_Battle.mjs` | 打法：路标坐标、关卡切片、敌军兵力与压力、携行、出生点、LOD |

**纪律**：凡在这三张表里登记的数，游戏内任何文本（字幕、图鉴、HUD）都不许说成史实。
找到实测数据之后，改数据、改用它的字段，并把该条从表里删掉。

第三张表是这一轮新加的。它只登记「打法层」的推定 —— 史料字段一律不在这一层复制，
`PHASES` 是 `LEVELS.map(...)` 出来的（关名、日期、时刻、brief、pool 全部来自
`Data_TengxianScript.LEVELS`），所以「改了剧本忘了改关卡表」这类错在结构上发生不了。

---

## 二、模块契约

```
Data_Tengxian.mjs          纯数据：城的图纸（志载 + 日方战详报 + 推定）
      │
Script_TengxianCity.mjs    建筑：按图纸砌墙盖房，产出 meshes / colliders / covers
      │
Script_TengxianField.mjs   适配：把「城」翻译成规则层认得的「战场」
      │                    GroundHeight / StandHeight / NearbyColliders /
      │                    Raycast / WaterDepth / bounds / colliders / covers / objectives
      ├──────────────┬──────────────┬──────────────┐
Script_Ai      Script_Player   Script_Navigation  Script_Combat
```

适配层存在的理由：建筑模块不知道什么叫「玩家」「视线」「淹没深度」，
而四个规则模块都是照同一套查询写的。把翻译单独放一层，建城的人和跑仗的人可以分开改。

`Script_Battlefield.mjs`（台儿庄那座城）已删除。它唯一与城无关的东西是
`RayAabb`，已搬进 `Script_Geo.mjs`。

叙事侧：

```
Data_TengxianScript.mjs    七关 beats + 五场分镜 + CAST
      ├── Script_Story.mjs      按关派发 beats（**没有翻译层**）
      └── Script_Cutscene.mjs   过场导演（不 import Script_Actor，工厂靠注入）
```

`Script_Story` 这一轮删掉了 `TranslateAt` 那张表。上一版需要它，是因为剧本按线性关卡写
而战场是开放地图，两套坐标系对不上；现在关卡真的是线性的，剧本的 `at` 语义
（`start` / `delay:` / `zone:` / `event:` / `wave:` / `waveClear:` / `end`）
就是运行时的语义，一一对应。

`zone:名字` 必须与 `Data_Battle.ZONES` 的 id **逐字一致**，对不上就是那句台词永远不播。
`event:名字` 由 `Script_Story.LEVEL_CUES` 判定（叙事上的时刻），
装配层也可以用 `story.Signal(name)` 主动推一条 —— 真发生过的事优先于时刻表。

---

## 三、关卡流程（这是与台儿庄结构差别最大的地方）

**每关只建一片切片，换关要拆掉重建。**

七关的地理跨度有两公里（界河在城北二十公里外、车站在城西 1.45 km、东关在城东 520 m），
一次全建出来既撞 draw call 红线也没有意义 —— 玩家在第二关永远看不见车站。

- `EnterLevel(index, { initial, cutscenes })` 是 **async** 的：建一片切片要分帧走完，
  不然主线程卡死几秒，浏览器判成无响应。期间 `state.ready = false`，`Frame()` 只走渲染。
- 换关顺序：关末过场 → 拆旧切片 → 建新切片 → 重建导航网格 → 关前过场 → 撒兵。
- `window.Taierzhuang.battlefield` / `.nav` / `.cutscene` 是**取值器**，不是普通属性 ——
  它们每换一关都会被换成新的一份，写成普通属性的话调试口会一直指着已经 Dispose 掉的城。

第一关（界河）的切片刻意取在城北的开阔原野上，**不让城墙入画**：
界河在滕县以北约二十公里，两地不共景，真在界河看得见滕县城墙是史实错误。

---

## 四、可见性硬规则与性能观测线

2026-08-20 起，**视锥内所有活人与尸体都必须显示，尸体保留到本关结束**。不得再用
人物名额、距离空洞或尸体数量上限减少战场内容。`Script_VisibilityTest.mjs` 锁定
“30/30 人可见、超过旧 26 具上限仍 30/30 保留”。

`Script_BootTest.mjs` 继续逐关观测 **drawCalls 1400、triangles 320 万** 两条旧线，
但只报告 `[PERF]`，不再因此判画面健康失败。完整人物开启后的 small/high 实测：
界河 1892、北沙河 2225、东关 2849、夜袭 793、城墙 349、十字街 3170、北门 2336；
三角形最高 267 万。`Script_PhysicsTest.mjs` 的十字街 low/small 实测 15.75 ms/帧，
仍低于原测试线 26 ms/帧。

按影响从大到小的旋钮：

1. **`TUNING[*].bounds`（关卡切片）** —— 少生成才是少 draw call。
2. **Actor 合批 / 共享骨架 / 等价 LOD** —— 只能减少提交开销，不能减少可见人数或尸体。
   当前一个完整 Actor 约 22 个可见网格，这是下一轮性能工作的主目标。
3. `TUNING[*].detailRadius / midRadius` —— **反直觉，慎用**：
   实测把 `detailRadius` 从 100 压到 62，三角形掉了 24% 而 calls 反而涨了。
   院落从 detail 掉到 silhouette 之后进的是**按扇区分批**的远景 sink，扇区多一个就多一批。
   降细节不等于降 draw call。

过场（尤其 `CS_BeimenBreakout`，近三百个网格）叠在城之上会顶穿红线，
所以**出图与自检模式一律不播过场**（`SHOT` 为真时 `cutscenes` 默认 false）。

---

## 五、还没做的

- 界河那一关只有原野、麦田与光秃乔木，**没有界河本身，也没有「南岸土坎」**。
  切片里的地形是 `Script_TengxianCity` 的城外原野解析式，它只认荆河与东关外的地隙。
  要把土坎做出来，得在建筑模块里加一块局部地形，那是建城侧的活。
- 各关的专属机制（堵口投弹条、掏墙两档、炮击观测跟着你走、视线走廊封锁、
  脱离战斗的空武器栏）目前只有**数据与旗标**（`TUNING` 里的 `spotter` / `corridorGun` /
  `disarmed` / `scavengeRifle`），规则层还没有逐条实现。
- `Script_Cutscene` 的近景「只有手／只有脚」镜头仍是白盒近似（Actor 没有手脚特写道具，
  也没有真正的蹲跪姿），见上游交付说明。
