# 音频接线（Data_AudioWiring）

**这一册只回答一个问题：这件事发生的时候，哪一声该响、多大、在哪儿、多久一次。**

三层分工，改东西之前先认清楚改的是哪一层：

| 层 | 文件 | 回答的问题 |
| --- | --- | --- |
| 引擎 | `Script_Audio.mjs` | 怎么发声（配方、混音、混响、空间化、预算、去重） |
| **接线** | `Script_AudioWiring.mjs` + `Data_Tuning_Audio.mjs` | **什么时候值得响一声** |
| 玩法 | `Script_Main` / `Script_Ai` / `Script_Combat` | 发生了什么 |

素材清单与烘焙参数在 [Data_AudioAssets.md](Data_AudioAssets.md)，那一册不写触发条件；
这一册不写素材来源。

---

## 一、为什么会有这一层

这一批接线之前，一整批 cue 的配方、素材、混音、编辑器说明全都在，**没有任何地方调用过**：

- `launcherPop`（掷弹筒发射）—— 一次都没播过。玩家听到的是「凭空来的一发炮弹」，
  而不是「有人在那边打我」；「原地不动就是靶子」这条规则因此没有预警。
- `footstepDirt / footstepRubble` —— 按 `state.frame % 3` 轮着播，
  脚底下踩的是什么**从来没有人问过**。听感是「每走三步换一次地面」。
- `Script_Ai` 里一条 foley 都没有：满场几十个兵，开枪只有枪声，没有拉栓、没有换弹、
  没有脚步。
- 近失弹只进压制账，不出声 ——「有人在打我」这件事没有任何听觉线索。
- 爆炸只有近/远两条录音、以 60 m 分界，而且**不看遮挡**：隔着一堵墙的爆炸与炸在
  脸上的是同一条声音，只是小一点。

这一类失败**全是静默的**：开机冒烟、通关冒烟、音频资产冒烟三条全绿的时候它们照样成立。
所以这一层配一条自己的闸：`Script_AudioWiringTest.mjs`。

---

## 二、逐条接线

下表里的数全部读自 `Data_Tuning_Audio.mjs`，代码里不写字面量。改数改那张表。

### 1. 宿主探针（`AudioWiring.Probes()` → `audio.SetProbes`）

| 项 | 口径 |
| --- | --- |
| `occlusion(from, to)` | 射线**抬到声源自己地面之上 1.2 m** 再打（`terrain:true`，撞到实体且比目标近 0.4 m 以上算挡）。挡住了再问一次 2.6 m 那一档：通了 → `0.45`（矮东西，绕得过去），仍挡 → `1`；第一条就通 → `0`。没有战场可问时返回 `undefined` |
| `zone(position)` | 先向上打 6 m：撞到 `roof/ceiling/floor/platform/bridge` 或**横向 2.5 m 见方以上**的盒子、**且离查询点 2.0 m 以上** → `interior`；否则数 6 m 内的立面，≥3 面 → `courtyard`，1—2 面 → `street`，0 面 → `open` |
| 缓存 | 1 m 网格 + 0.5 s 有效期，上限 512 条（超了整表清空）。**换关必须 `Reset()`** —— 缓存里存的是上一张地图的墙 |
| 立面判据 | tag 在 `WALL_TAGS` 里、盒高 ≥ 1.2 m、盒顶高过听者 0.4 m、水平距离 ≤ 6 m |

**为什么屋顶要判横向尺寸**：一辆板车、一根电线杆、一棵树都会挡住向上那条射线。
只看「上面有没有东西」的话，站在街心也会被判成在屋里，整条街换成室内 IR ——
「不知道从哪儿来的音效」会以另一种形式再来一次。

**为什么还要判净空（2026-09-09）**：只判横向的话，津浦路路基那种
**9.3 × 15.2 m 却只有 0.34 m 厚**的板会被当成屋顶。实测开阔地 40 个采样点，
贴地那一档 **12 个（30%）判成 interior**，抬到 1.35 m 只剩 4 个。
后果是混响换成室内 IR，还会叠一档 `ZONE_BOUNDARY_OCC`（干声 −4.2 dB、低通 6.5 kHz）——
用户报的「人物讲话那个轻的非常奇怪」就是它。屋顶总在头顶两米开外。
**只收紧屋顶这一条**：试过把整个采样点抬到 1.2 m 再问，但 `CountWalls` 的
「盒顶要高过查询点 0.4 m」那道闸会把一米五的院墙一起筛掉，40 个点里 7 个
street 直接掉成 open。别顺手改对的那两条。

**为什么射线要抬**（`PROBE.sourceRiseM`）：宿主交给探针的是事件的几何原点 ——
迫击炮弹的爆心就是 `GroundHeight()` 本身，兵的 `position` 是脚底。
从听者眼睛（1.6 m）打过去的射线全程只降 1.6 m，一路擦着地皮走。
实测 72 个采样点：终点贴地时 29 个判成挡住，抬到 2.0 m 只剩 18 个，
那 11 条假阳性撞的全是 `embankment` / `villageStraw` 这类矮碰撞盒，
**一条地形都没有**。完整取证与数字见 `docs/Data_AudioEngine.md` §2.5。

**为什么要缓存**：满场三四十个兵，每帧对每个声源打一条射线是买不起的。
玩家 0.5 s 走不出 3 m，同格内遮挡关系不会翻转；真翻转的那一刻（拐过墙角）
最多晚半秒到，而半秒的滞后在听感上远好过掉帧。

**取证入口**：`Debug.AudioZone(limit = 5)`

```js
window.Taierzhuang.Debug.AudioZone()
// { listener:{x,y,z}, zone:"street", walls:2, probesInstalled:true,
//   soldiers:[{ id, side, distance, occlusion }, …], fireVoices:1, cracks:0 }
```

`probesInstalled:false` = 引擎侧的 `SetProbes` 还没合进来，接线侧的判空正在兜底
（混响仍按 `AMBIENCE_PRESETS` 的固定 space 走，只是没有逐位置的空间档）。

### 2. 逐弹弹啸（`bulletCrack` / `bulletWhizz`）

| 项 | 口径 |
| --- | --- |
| 触发 | 一发子弹从**玩家**身边掠过。AI 之间的近失弹**不播** |
| 位置 | 弹道上离身体最近的那一点（`CollectBulletNearMisses` 的 `pass.point`） |
| 叠加 | 掠过距离 < 1.5 m 再叠一条 `bulletWhizz`（延后 15 ms） |
| 遮挡 | 被 `Blocked(point, body)` 挡住的不播（与压制走同一个判据：子弹没到那儿就既不压制也不响） |
| 限速 | 同一帧最多 2 条；100 ms 内最多 3 条 |
| 优先级 | `priority: true`，**不进 `LOW_PRIORITY`** —— 它是「有人在打我」的唯一线索，交火最激烈时反而静音就是本末倒置 |

两条来源：

1. `MarchBullet`（Script_Main）→ `ResolveNearMisses` → `BulletNearMissesForPlayer`。
   玩家在弹道链上是个临时代理对象，靠它身上的 `isPlayer` 标认人。
   这条路覆盖车载机枪等真的走弹道积分的射击。
2. `Script_Ai` 打偏的那一发 → `AiNearMissAtPlayer`。
   **这条链上没有真实弹道**（AI 打人是概率判定），所以近失点是照 `miss` 距离在瞄点
   旁边摆出来的：方向取瞄准方向的水平法线（左右由 `fireSequence` 奇偶定，不用随机），
   高度抬 0.15 m。近失半径 `crackWithinM = 2.6` 与 `COMBAT.suppressRadius` **故意同值**，
   改一个要同时改另一个。

**为什么不分枪种**：步枪与机枪弹初速 700—800 m/s，全部超音速，掠过耳边的是弹头
自己的锥形激波，不是枪声。

### 3. 跳弹（`ricochet`）

打在 `brick` / `stone` / `metal` 上 **25%** 概率追加，延后 20 ms（两声要分得开）、
音量 0.5、逐次 ±15% 变调。土、沙包、木、肉不跳。

随机走 `Mulberry32`，种子跟着射击序号（玩家步枪用 `state.playerShots`，
架设机枪用 `shot.index`）—— 不是 `Math.random`：逐轮录音比对要可复现，
与曳光按 `playerShots` 取模是同一条理由。

接线点：Script_Main 的玩家步枪弹着与架设机枪弹着。
**尚未接**：`FireVehicleBullet` 的墙面弹着（那条路连弹着音本身都没有，
补它属于另一件事）。

### 4. AI foley

| cue | 触发 | 距离闸 | 限频 |
| --- | --- | --- | --- |
| `bolt` | 栓动步枪每发之后，延后 0.55 s | ≤ 25 m | 与玩家那条同口径 |
| `stripperLoad` / `magIn` | 进入 RELOAD 状态的那一次边沿（`boltRifle` 走桥夹，其余走弹匣） | ≤ 30 m | 状态边沿本身就是限频 |
| 脚步 | 累计步距 ≥ 1.9 m | ≤ 30 m | 每个兵自己 0.28 s（挂在 `soldier.audioStepAt`） |

全部走 `LOW_PRIORITY` 语义（`bolt` 本来就在表里，脚步四条这一批补进去）：
预算紧张时先丢它们——丢一记别人的拉栓没人发现，丢一发枪声就穿帮。

**为什么换弹要有手上动作声**：喊话（`Bark("ammo")`）是意图，这一声是事实。
喊话有 0.55 s 全局闸与 4.5 s 同类闸，十有八九被吃掉，
于是「他在换弹、接下来三秒不开枪」这条战术信息一直只有字幕没有声音。

### 5. 玩家脚步按材质

脚下材质由 `SurfaceUnder()` 决定，顺序是：

1. `WaterDepth > 0.03` → `mud`；
2. 向下打 1.4 m 射线，拿碰撞盒 `tag` 查 `STEP_BY_TAG`；
3. 查不到再查调用方传进来的 `SURFACE_BY_TAG`（弹着表面表）；
4. 还查不到 → `dirt`。

`STEP_BY_TAG` 与 `SURFACE_BY_TAG` **故意是两张表**：同一个 tag 在两件事上给的答案本来
就不同 —— `rubble` 挨枪出砖灰（brick），踩上去是碎砖滑动（rubble）；
`villageStraw` 挨枪是土，踩上去是麦秸。

| 姿态 / 状态 | 音量 | 步距 |
| --- | --- | --- |
| 站 | 0.45 | 1.9 m |
| 蹲 | ×0.50（−6 dB） | 1.55 m |
| 卧 | ×0.32（−10 dB） | 1.0 m |
| 冲刺 | ×1.26（+2 dB），变调 ×1.06 | 1.5 m |
| 快速匍匐 | 再 ×1.8 | — |

**冲刺步距变短不是变长**。原来是 2.4 m，听感是「跑得越快脚步越稀」，方向正好反了：
跑起来是小步高频。

脚步**不给 position**：脚就在自己身下，走空间化那条链只会白花一个 panner，
而且 HRTF 会把自己的脚步推到某个方位上去（听着像旁边有人在走）。

### 6. 身体 foley

| cue | 触发 | 数 |
| --- | --- | --- |
| `clothMove` | 姿态切换（站/蹲/卧任意变化） | 音量 0.42 |
| `clothMove` | 翻越 / 攀爬（`vaultCount + mantleCount` 增加） | 音量 0.6、变调 0.92 |
| `gearRattle` | 冲刺中每 0.9 s | 音量 0.38 |
| `breathHeavy` | 冲刺满 3 s，或血量 < 35%；停止条件后再喘 1.2 s | 音量 0.5，每 2.4 s 续一条，**非空间化、wet 0** |
| `bodyLand` | 落地且冲击 > 0.25 | 0.55 ×（0.5 + impact×0.6） |

落地这条同时换掉了旧的 `bodyFall`：那是**一个人倒下**（装具散开、四肢先后落地），
拿它当玩家落地音的话，每次跳窗台都像旁边有人被打死。

翻越那一下的价值：它是「我确实翻过去了」的唯一听觉回执。

### 7. 手榴弹（`grenadeBounce` / `grenadeRoll`）

刚体（Rapier）**不发接触事件**，所以按速度突变判：

- **弹跳**：竖直速度由 < −1.6 m/s 变成 > +0.2 m/s（真的弹起来了），
  或者速率一帧掉了三成以上（撞墙）。同一枚弹两记之间至少隔 0.12 s ——
  刚体在墙角会连续接触，不限频会连响一串。
- **滚**：速率在 0.35—1.6 m/s 之间持续 0.18 s。**一枚弹只报一次**：滚是一段状态，
  不是一次事件。
- 45 m 以外不播。

物理与无物理（编辑器切片重建的空档）两条路都接了。
**没有「落地即炸不弹跳」这回事**：现有积分是真刚体，弹跳与滚动都存在。

### 8. 掷弹筒（`launcherPop`）

`Combat.CallIncoming("launcher", …)` 的发射点，音量 0.9。
炮兵（`artillery`）不播 —— 那是几公里外的联队炮，发射声传不到。

位置要注意：`CallIncoming` 里的 `from` 是**画弹道用的假起点**（120 m 外、24 m 高）。
声音把 y 拉回地面（`GroundHeight + 0.6`），否则方位会被读成「天上」，
而掷弹筒是抵着地打的。这一声的全部价值是告诉玩家**它从哪儿来**。

### 9. 爆炸三档 + 碎屑 + 耳鸣

| 听者距离 | cue |
| --- | --- |
| < 40 m | `explosionNear` |
| 40—120 m | `explosionMid`（**新**） |
| > 120 m | `explosionFar` |

- **遮挡：只许算一层**（2026-09-09 修）。`occluded` 由 `Script_Combat.Blast` 算一次
  （震屏用同一个判据，不会出现「震得到听不到」这种自相矛盾），但**音频那一份现在
  由引擎独占** —— `Script_Audio.Play` 会拿同一条探针自己问一遍。接线层这里的
  「volume ×0.5 + `airCut 900`」只在 `audio.probes.occlusion` 没注册时才生效
  （编辑器裸跑规则层），写法与 `blastAutoDeafen` / `gunAutoDuck` 同一套判空。

  这不是洁癖：两层叠起来实测是 **−18.0 dB 干声 + 一道 800 Hz 砖墙**
  （20 m 一发，干声有效电平 0.1925 → 0.0242，低通 6402 → 800 Hz），
  32 发取样里 13 发吃了双份 —— 那就是用户报的「炮弹爆炸都没声音」。
  而且两层的判据起点/方向/余量都不同，32 发里 4 发两边给的答案是反的。
  数字与取证脚本见 `docs/Data_AudioEngine.md` §2.5。
- **顺序**：这段现在排在 `Destruction.Blast` **之后** —— 爆压把墙打穿的同一瞬间，
  洞口后面的人应该听到没被削过的那一声。
- **落屑**：40 m 内，延后 0.4—1.2 s，在爆心周围 3—8 m 随机 2—3 个位置播 `debrisFall`，
  音量按距离线性衰减。随机走 `Mulberry32`（种子含爆心坐标）。
- **耳鸣**：12 m 内调 `audio.Deafen?.(0.45)`。引擎侧接上「Play 按爆炸类 cue 自动
  Deafen」之后（`audio.blastAutoDeafen` 为真）这条自动让位，两条同时生效也只是
  写同一条滤波自动化，不会更聋。
- 接线层缺席时（编辑器裸跑规则层）退回原来那条两档判断，一声不少。

### 10. 玩家开枪走分层

```js
audio.PlayGunshot(cue, { position, priority: true, firstPerson: true, weaponClass })
audioWiring.GunDuck()      // → audio.DuckAmbience?.(0.3, 0.5)
```

`weaponClass` 由 `WeaponClassOf(weaponId)` 给：`Zb26` / `Type11` / `Type92Hmg` 是 `"mg"`，
其余 `"rifle"`。引擎侧按 `weaponClass × zone` 挑六条 `gunTail*` 中的一条。

引擎那批没合进来时：`PlayGunshot` 不认识这些字段也无所谓，它会原样落回 `Play()`，
行为与改之前一模一样；连 `PlayGunshot` 都没有才退回 `Play`。
`DuckAmbience` 缺席时整条压环境静默跳过。

**压环境为什么值得**：不压的话枪声是「贴在一片底噪上面」的，压一下才「炸得开」——
这是全套枪感里最便宜也最明显的一条。

### 11. 火焰点声源（`fireSpot`）

挂在 `vfx.smokeSources` 里 `fire ≥ 0.2` 的烟源上（`SCENE_EFFECTS` 的 FireSmall /
FireMedium / GroundFire / BurningWreck / BurningHouse 都带 fire）。

- 同时最多 **4 条**，按到听者的距离取最近的；55 m 以外不要。
- 每 0.5 s 重挑一次（火不会跑，每帧挑是白花的）。
- 生命周期走 `MoveVoice`（跟位）/ `StopVoice`（离场或被摘掉时 0.5 s 淡出）。
- 每 1.9 s 续一条（配方 2.2 s，留 0.3 s 交叠），且**一帧只起一条** ——
  同名 cue 在 22 ms 去重窗里只活得下来一条，四条一起起等于白起三条，
  而且那三条会被记成 `drops.dedupe`，查起来像在丢音。

---

## 三、新 cue 一览（合成回落 + 素材契约）

素材由素材侧从 Sonniss 实录里切，**名字是契约**。素材落地之前走的是
`Script_Audio.RECIPES` 里这一批合成回落配方 —— 要求是「能听见、听得出是什么」，
不要求好听：接线红不红不能取决于素材到没到。

| cue | 用途 |
| --- | --- |
| `bulletCrack` / `bulletWhizz` | 逐弹弹啸两层 |
| `ricochet` | 跳弹 |
| `impactStone` | 打在条石/门墩上（`IMPACT_CUE` 目前仍走 `impactBrick`，接线待补） |
| `footstepWood` / `footstepStone` / `footstepGrass` / `footstepMud` | 四种新地面 |
| `clothMove` / `gearRattle` / `breathHeavy` / `bodyLand` | 身体 foley |
| `grenadeBounce` / `grenadeRoll` | 手榴弹落地与滚动 |
| `explosionMid` / `debrisFall` | 爆炸中距档与落屑 |
| `fireSpot` | 火场循环点声源 |
| `zb26Far` / `type11Far` / `type92Far` | 三挺机枪的远场层 |
| `gunTail{Open,Street,Interior}{Rifle,Mg}` | 按空间档 × 枪种的枪尾 |

登记位置（每加一条都要六处齐全，缺一处就是静默失败）：

1. `Script_Audio.RECIPES` —— 合成回落；
2. `Script_Audio.NODE_COST` —— 不写就默认 19，一条一直烧着的火要吃掉六分之一预算。
   **这一批一律压到 ≤ 11 个节点**：`Script_AudioTest` 会把 `SOUND_NAMES` 逐条播一遍，
   一条 20 节点的音必然在预算最紧的那一刻被丢掉，于是「配方哑了」这条红的
   其实是预算不是配方（屋内枪尾原来各建五条早期反射，就是这么红的；
   改成两记之后听感分辨不出差别 —— 五记挤在 8 ms 里本来就听不出条数）；
3. `Script_Audio.MIX_GAIN` —— 合成层配平；
4. `Script_Audio.SAMPLE_WET` —— 混响 send；
5. `Script_Audio.LOW_PRIORITY` —— 该不该在预算紧张时先丢；
6. `Script_EditorAudio.SOUND_INFO` —— 分类与中文说明，
   缺了 `Script_EditorTest`「每个配方都有分类与说明」那条会红。

**素材落地时还要补 `SAMPLE_MIX`**：`LoadSfxPack` 会把 `MIX_GAIN[cue]` 重写成
`SAMPLE_MIX[cue] ?? 1`，不补的话新 cue 会以 1.0 出场，比脚步响四倍。

`zb26Far` / `type11Far` / `type92Far` 另外登记在 `SAMPLE_BURST`（射速与近场同一组数）
与 `AMB_AIR`（撒进环境床时的空气低通）。它们的 `FAR_CUE` 映射由引擎侧那一批接，
这一层只保证名字与配方存在。

---

## 四、取证与验收

```powershell
node Taierzhuang1938/Script_AudioWiringTest.mjs     # 接线（本册）
node Taierzhuang1938/Script_AudioTest.mjs           # 资产与配方
node Taierzhuang1938/Script_BootTest.mjs            # 开机预算
```

实机取证入口：

```
http://127.0.0.1:8080/Taierzhuang1938/?phase=1&menu=0&intro=0
```

点 `#bootStart` 进关。**不能带 `?shot=1`** —— 出图模式根本不建 AudioContext，
量到的是另一条路。进关之后 `Debug.AudioZone()` 读空间档与遮挡。

**8.6 / 8.7 两节是例外，它们量的就是「响没响、响成什么样」**（2026-09-09 补）：
用户报的两条 bug 都是「声音在，但被链路改得听不出来了」，请求数对这类事完全没有
分辨力 —— 32 发爆炸全都请求成功、控制台干净、原有 37 条断言全绿，而实听是「没响」。
这两节的判据分别是：12 发落在起伏地面上的炮弹出声率 100%、接线层交给引擎的
volume/airCut 没被改过、探针说通透的那些干声与"强制 occlusion=0"的参考值差在 3 dB
以内、任何一发都不低于 −12.5 dB（引擎单层的上限）；以及三米外同伴的四档台词
遮挡为 0、不在 interior 档、不进远声组、干声节点没建。
把接线层那一层遮挡改回无条件生效，立刻红两条，报的就是 `60m#5 -18.0dB occ=1`。

`Script_AudioWiringTest` 的其余断言判据是 `audio.RequestedCount(name)`（请求数）而不是
「响没响」：请求数是**接线**的直接证据，而实际发声还要过去重窗、节点预算、
距离剔除三道闸——那三道是引擎的账。拿「响没响」当判据的话，
某天预算一紧它就变成一条随机翻红的断言，而红的原因与接线无关。

几条断言里**换的是世界不是规则**（把 `battlefield.Raycast` / `NearbyColliders`
换成固定回答）：真地图上两点之间有没有墙、哪块地是木头，那是布设层与地形层的账，
有各自的闸。这一层量的是「拿到这个回答之后接线怎么做」。

---

## 五、已知缺口

- `impactStone` 的配方与说明都在，但 `IMPACT_CUE` 还没有 `stone` 这一档
  （`SURFACE_BY_TAG` 里也没有任何 tag 映射到 stone）。补它要同时动世界几何的 tag，
  与 `metal` 那条缺口是同一类（见 `Script_Main.SURFACE_BY_TAG` 的注释）。
- `FireVehicleBullet`（车载机枪）的墙面弹着没有音效，因此也没有跳弹。
- 六条 `gunTail*` 与三条 `*Far` 机枪远场的**播放**归引擎侧那一批
  （`PlayGunshot` 的 `weaponClass` × `zone` 分层）；这一层只保证名字、配方、
  混音与说明齐全，自己不直接播它们。
- 声速延迟（300 m 外那一枪该晚 0.87 s 到）仍然没做，见 `Script_Audio.PlayGunshot`
  的注释——那会动到所有「开枪→听见」的时序断言。
