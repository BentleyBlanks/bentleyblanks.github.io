# 远景人群的姿势层（ActorCrowd LOD）

代码：`Script_ActorCrowd.mjs`（本体）、`Script_Ai.CullActors`（喂信号）、
`Data_Tuning_Ai.ACTOR_DETAIL`（三个旋钮）。闸门：`Script_ActorCrowdTest.mjs`、
`Script_VisibilityTest.mjs`。取证：`Script_FirstLevelFrameProbe.mjs`。

## 0. 这一轮补的是什么（2026-09-09）

玩家：「远处的敌人还是很蠢：不会动、不找掩体、干站着。」

实拍取证：前沿开战 20 s，按距离分档数人 —— **46—74 m 那一档 31 个日军里 20 个其实在跪射**。
AI 是对的，`renderLod` 是对的，实例数是对的，`Script_VisibilityTest` 六条全绿；
画面上那 31 个人**全是站着的**。因为 `ACTOR_DETAIL.enterM = 46` 以外的人全走这一层，
而这一层当时只烘了**一个**姿势（`{ aim: 0.35, moveSpeed: 0, crouch: 0, prone: 0 }`）：

- 蹲的人 → 站着的那尊雕像；
- 卧的人 → 同一尊雕像绕 X 倒 80°、抬高 0.28 m；
- 跑的人 → 同一尊雕像在地上滑行。

也就是说「干站着」有一半根本不是 AI 的问题，是**表现层**的。现在每个 kind 烘一组姿势，
`CullActors` 把姿态与移动信号一起交下来，由这一层挑桶。

## 1. 姿势桶表

一个 kind 八档（`ACTOR_DETAIL.crowdRunFrames = 4` 时）。姿势不是画出来的，是拿一个真
`Actor` 摆好之后**逐顶点烘死**的 —— 所以远景与近景摆的是同一个姿势，走近时不会变身。

| 桶 id | 喂给 `Actor.Update` | 收敛时长 | 落到的 clip | 人体最长边 nra / ija | 三角形 |
| --- | --- | --- | --- | --- | --- |
| `standing` | `aim .35` | 0.4 s | `AdvanceFire` | 1.54 / 1.51 m | 15 571 / 23 573 |
| `kneel` | `aim .50 crouch 1` | 2.5 s | `KneelHold` | 1.21 / 1.17 m | 同上 |
| `prone` | `aim .35 prone 1` | 1.5 s | `StandFireCrouch` | 0.91 / 0.78 m | 同上 |
| `run0`—`run3` | `aim .25 moveSpeed 1` | 0.4 s + 循环等分 | `RifleRun` | 1.43—1.50 m | 同上 |
| `dead` | `dead: true, dying: 1` | 1.0 s | 程序化 `PoseRagdoll` | 1.58 / 1.54 m | 同上 |

三角形每档都一样：八档是同一批网格摆了八个姿势。**一个人只画在一个桶里**，
所以人数不变时整帧三角形一个都不多（`Script_ActorCrowdTest` 有一条专门量这个）。

几条容易踩的：

- **收敛时长不是随手给的。** 军人是蒙皮 GLB，姿势来自 `Script_CharacterModel` 的 clip，
  换 clip 走 0.12 s crossFade；蹲下还要先播完一整条过渡 clip（`StandToKneel`，实测 1.7 s）
  才切 `KneelHold`。第一版给 6 帧（0.1 s），烘出来的**跪姿 1.61 m 比站姿 1.53 m 还高** ——
  那是「刚开始蹲」的第一帧。蹲/卧两档用 1/20 s 的大步长走完同样的秒数，省掉一百多次
  `Actor.Update`（烘焙不出画，中间帧一帧都不要）。
- **clip 名与内容不符**：`StandFireCrouch` 才是低姿匍匐，`ProneFire` 反而是站姿甩臂。
  一律走 `Script_CharacterModel.POSE_CLIPS` 语义表，别按名字反推。
- **卧姿是「低姿蜷伏」不是「全身摊平」**：`POSE_CLIPS.proneFire` 的骨盆高 0.12—0.27 m，
  人体包围盒约 0.43 × 0.65 × 0.49 m。这是**近景完整 Actor 的同一个姿势**（`?phase=2` 把一个人
  的 `prone` 拉满出图核对过），这一层只是照抄。旧的「站姿倒 80°」看着更像躺平，
  但它与走近之后看到的不是一个东西 —— LOD 的第一要求是两层一致。
- **烘焙不做贴地 IK**（`actor.allowFootIk = false`）。探针量的是「烘这一刻 root 恰好落在
  世界哪一点」的地面高度，与将来这批实例站的地方毫无关系，却会被整批人一起继承。
- **倒地必须排最后**：`Actor.Ragdoll` 一进去 `ragdollState` 就回不来了，而一个 kind 的
  八档共用同一个 Actor（造 Actor 是烘焙里最贵的一笔）。

## 2. 选桶规则（`Push` 的契约）

```js
Push(kind, position, yaw, scale = 1, prone = 0, dead = false, pose = null)
// pose = { stance: 0|1|2, moveSpeed: 0..1, crouch: 0..1, elapsed: 秒, jitter: 0..1, phase?: 0..1 }
```

优先级：

1. `dead` → `dead` 桶（不变）；
2. `stance === 2` 或 `prone ≥ 0.5` → `prone` 桶（真卧姿，不再翻转、不再抬高）；
3. `moveSpeed > crowdRunSignal` → `run<i>` 翻页桶；
4. `0 < prone < 0.5`（站→卧的**半程**）→ 站姿桶 + 旧的整体翻转过渡。真卧姿桶是定格的，
   半程只能靠翻转补；46 m 外这段过渡 0.32 s，看不出接缝；
5. `stance === 1` 或 `crouch ≥ 0.5` → `kneel` 桶；
6. 其余 → `standing`。

**不传 `pose` 就是旧行为**，一个像素都不变（站姿桶 + 整体翻转当卧倒）。
`Script_VisibilityTest` 的容量探针与任何旧调用点都不必改。

## 3. 跑步翻页

- 帧数 `ACTOR_DETAIL.crowdRunFrames`（默认 4，给 0 就整个关掉跑步桶，退回站姿滑行）。
- **循环时长从资产量出来**，不是猜的：`RunCycleSeconds(actor)` 取当前 clip 的时长 ÷ 时间缩放
  （`RifleRun` 实测 **1.467 s**）；程序化分件退回「2 步 ÷ 4.5 步每秒 = 0.44 s」。
  烘 `run0` 的时候量一次，后面每一帧按 `循环 ÷ N` 推进。
- 相位由 `CullActors` 给：`{ elapsed: this.time, jitter: s.id * 0.37 }`。
  用 AI 自己的时间轴而不是墙钟 —— 分帧、暂停与 `StepFrames` 重放都可复现；
  `jitter` 让每个人固定错位，整条战线不会齐步走。
- `ACTOR_DETAIL.crowdRunFps` 只是**量不到资产时的退路值**（按当前资产 4 ÷ 1.467 ≈ 2.7）。
  别把它当「调快点更带感」的旋钮：翻快了远景的人就是在原地抽搐。
  `Script_ActorCrowdTest` 有一条盯着它与资产循环差不超过 25%，资产换了会红。

## 4. 预算账（实测，RTX 4070 SUPER / ANGLE-D3D11 / 无头 Edge）

### 4.1 提交量

军人 GLB 一档姿势是 **7 个材质桶** = 7 只 InstancedMesh。两个阵营八档 = 112 只（旧口径 28 只）。

**但空桶不进渲染列表**：`mesh.visible = count > 0`（站姿档例外，见下）。这一条不是可选优化 ——
three 的 `primcount === 0` 早退在 `renderInstances` 里，而 `renderBufferDirect` 已经先跑完
`setProgram`（材质状态、uniform 刷新、属性绑定）了，也就是一次不画一个像素的完整提交。
不加这一条，第一关前沿机位每帧的提交次数从 597 涨到 771。

| 机位 | 每帧提交次数（`--counts`，21 帧均值） | 实际 GL draw（`renderer.info.calls`） | 三角形 |
| --- | --- | --- | --- |
| front | 597 → **583** | 558 → 618 | 2.63 M → 2.63 M |
| frontEast | 534 → **519** | 497 → 527 | 1.68 M → 1.68 M |
| train（无远景人） | — | 1063 → 1063 | 3.25 M → 3.25 M |

两个数一个降一个升，都是真的：**提交次数**降是因为旧口径把 4 组桶（两阵营 × 站/倒地）
无条件留在渲染列表里、其中不少是空的；**实际 GL draw** 升是因为现在真的有更多档姿势在用。
最坏情况（八档同时有人）每 kind 56 只网格，`Script_ActorCrowdTest` 盯着
「远景层只多出 6 档 × 7 材质桶 = 42 只」这条结构断言。

**站姿档不许藏**：着色器预热（`Script_Main.WarmupShaders`）是对整棵 scene 挑代表件、
真画一帧把 program 逼出来的，藏起来的件挑不到也画不出。八档**共用一份材质克隆**
（program 缓存键完全相同），所以站姿档一直在场就够了 —— 顺带省掉 7 × 7 × kind 份材质对象。
材质克隆走 `CloneShadedMaterial`（`PatchesOf` 重挂补丁），**不与蒙皮人物共用材质对象**：
共用会让 three 每次在 skinning 与 instancing 之间切换都重算 `getProgram`，一帧几百次。

### 4.2 实例矩阵

每桶容量仍是 512（哪一档会挤满是内容决定的：一次冲锋能把整条战线塞进 `run` 桶）。
112 只 × 512 × 64 B ≈ 3.6 MB 的 CPU 侧 Float32Array + GPU buffer。
每帧**只上传 `[0, count)`**（`addUpdateRange`），空桶连脏标记都不设 ——
旧代码是无脑整块传，八档照抄会变成 3.6 MB/帧、60 Hz 下 216 MB/s。

### 4.3 场景节点

`scene.traverse` 的对象数 +84（两阵营 × 6 新档 × 7）。第一关前沿实测
`sceneObjects` 2778 → 2862、`updateMatrixWorld` 3982 → 4066。空桶 `visible = false`
之后这批节点不进渲染列表，只剩一次遍历。

### 4.4 烘焙耗时（`Prepare`，在加载画面后面）

| | 旧（2 档） | 新（8 档） |
| --- | --- | --- |
| 单个 kind | ≈ 41 ms | **65—75 ms** |
| 第一关两个 kind（nra + ija） | ≈ 82 ms | **132—151 ms** |

四次实测：146.4 / 150.7 / 133.8 / 131.8 ms（`crowd.bakeStats.totalMs`，逐 kind 也在里面）。
增量约 **+35 ms / kind**，全部落在 `Script_Main.WarmActorShaders` 那一段加载画面后面
（同一段里「等待着色器就绪」本身就是 1—8 s），**不是运行时的卡顿**。

一档姿势各造一个 Actor 的话这笔账要翻好几倍 —— 造 Actor 要克隆整棵 GLB 骨骼与网格，
是链路里最贵的一笔。现在一个 kind 只造一个，逐档摆姿势、各收一份几何。

想再压：`crowdRunFrames` 调小（4 → 2 省两档），或者给 0 直接退回站姿滑行。
**不要**改成「用到时再烘」：那会把这笔账从加载画面挪进「第一次有人跑起来」的那一帧。

## 5. 闸门

`Script_ActorCrowdTest.mjs`（浏览器，约 2 分钟，登记在 `render` 与 `ai` 两个域）问六件事：

1. **分桶**：站 / 跪 / 卧 / 跑 / 尸体各自落进对应的桶（按 `mesh.name` 与 `count`）；
2. **翻页**：一个循环里用满全部 Run 帧桶，而且那几个桶的**几何真的不同**
   （相邻帧最大顶点位移实测 0.106 m）；退路帧率与资产循环差 ≤ 25%；
3. **像素**：59 m 斜距、21° 俯角，把一个实例分别按站 / 跪 / 卧画一遍，各自与空场那一帧
   逐像素求差，量涂色像素的包围盒 —— 跪 39 px ≤ 站 50 px × 0.85，卧 309 px² ≤ 跪 447 px² × 0.9。
   **这一条不能省**：桶接对了、实例进去了、`visible` 是 true，三条全绿也可能画出来一模一样
   （2026-09-02 那次就是人全在实例表里、身体被烘成 1.7 cm 的一粒，六条断言全绿）；
4. **预算**：同样多的人摊到八档，远景层只多出 6 × 7 只网格，三角形一个都不多；
5. **旧签名**：六参数 `Push` 仍进站姿桶、卧倒仍是整体翻转（实例矩阵里那个绕 X 的负角）；
6. **Dispose**：场景里不留残桶、材质表清空。

`Script_VisibilityTest` 的「人体不是只剩一支枪」那条改成**按姿势给下限**：
跪 0.9 m、卧 0.55 m、其余 1.2 m。蹲跪与卧倒本来就矮，一刀切 1.2 m 会把正确的姿势判红；
而这道门要抓的是「塌成 0.02 m 的一粒」，0.55 m 离它仍有近三十倍。

## 6. 已知取舍 / 未解

- **卧姿看着像蜷着而不是躺平**。这是 `POSE_CLIPS.proneFire` 那条 clip 本身的样子，
  近景完整 Actor 一模一样，不是这一层引入的。要改得去改资产（或换一条卧姿 clip），
  改完这一层跟着变，不用动代码。
- **翻页只有 N 档、且一律按满速翻**。远景层不按各人的真实速度调频（那要按人存相位）；
  46 m 外读得出「在跑」，读不出「跑多快」。
- **姿势档只覆盖战斗姿态**。担架员、伤员跛行、投弹、白刃这些在远景层仍是站姿；
  它们几乎总在近景（担架队与白刃都发生在玩家身边），暂时不值一档桶。
- **半程过渡仍是整体翻转**（站→卧的 0.32 s）。做成连续插值要么按人存混合权重、
  要么再加一档中间姿势，两条都比它买到的多。
