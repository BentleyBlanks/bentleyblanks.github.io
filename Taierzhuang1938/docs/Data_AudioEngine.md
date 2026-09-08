# 音频引擎：空间、动态与预算（2026-09-08）

《台儿庄：血战滕县》的音频引擎在 `Script_Audio.mjs`，验收在 `Script_AudioTest.mjs`。
素材来源、烘焙参数与 2026-08-20 那一轮的混音修复在
[Data_AudioAssets.md](Data_AudioAssets.md)；**这一份只讲引擎**：
声音从「发生了一件事」到「进玩家耳朵」这条链上，每一段的模型、常量、量法与实测数字，
以及宿主要接的那两条探针契约。

上一轮（2026-08-20）解决的是「一打起来就充斥着不知道哪儿来的、带拖尾的音效」——
那是**混音**问题（混响不吃距离、预算先到先得）。这一轮解决的是它后面那一层：
**空间信息缺席**。修完混音之后，声音的电平对了，但玩家仍然分不出

* 那一枪是在屋里打的还是在街上打的（混响只有全局一档）；
* 那一枪隔着一堵墙还是就在眼前（完全没有遮挡）；
* 那一枪离你三十米还是三百米（除了变轻变闷，没有别的线索）。

---

## 0. 信号链

```
源(osc/noise/sample)
  → 声部 gain（volume × 混音表）
  → [空气低通 ∧ 遮挡低通]          ← 同一只 BiquadFilter，取更狠的那个
      ├→ [遮挡干声衰减] → PannerNode ─┬→ farGain（> 45 m）→ sfxBus
      │                              └→ sfxBus / ambienceBus / musicBus
      └→ 混响 send → Convolver（按**声源所在区**选四档之一）→ 回声 gain → sfxBus

sfxBus ─────────────────────────────────┐
musicBus  → musicUser ─┐                │
ambienceBus → ambienceDuck → ambienceUser ┴→ duckGain ┘
  → masterGain → 母线慢压缩 → 补偿增益 → 耳鸣低通 → outGain → 末端限幅 → 软削顶 → 输出
```

新增的常驻节点：两只卷积（interior / courtyard）+ 两个回声 gain、`farGain`、
`ambienceDuck`、`busComp`、`busMakeup` —— 共 8 个，一次性开销，不进 `NODE_BUDGET`。

---

## 1. 宿主探针契约

**这是引擎与宿主之间唯一的空间接口。名字与语义是契约的一部分。**

```js
audio.SetProbes({
  occlusion: (from, to) => 0..1 | undefined,
  zone: (position) => "interior" | "courtyard" | "street" | "open",
});
```

### occlusion(from, to) → 0..1

* `from` / `to` 都是 `{x, y, z}` 世界坐标（米）。`from` 是**听者**（`audio.listenerPos`），
  `to` 是声源。
* 返回 `0` = 通透，`1` = 完全挡死，中间值线性插。宿主用 `battlefield.Raycast`
  实现即可：打到几层实体、总厚度多少，折成 0..1。
* **允许返回 `undefined`**（或 `null` / `NaN`），意思是「这一次不知道」——
  物理世界还没建好、射线预算用光、查询抛了。引擎会**沿用上一次的缓存值**，
  而不是当成通透。这一条很要紧：把「不知道」当通透，玩家会在过墙的一瞬间
  听到全场突然变亮。
* 引擎每帧最多问 `OCCLUSION_RAYS_PER_FRAME`（8）次，而且同一个 4 m 空间格里的
  声源 0.25 s 内共用一次结果，所以真实频率还要低一档。即便如此，
  **实现侧仍然要自己保证便宜**：这是每帧都会被调用的路径。
* 不注册 = 恒为 0，且引擎**不会为遮挡建任何节点**（回归为零）。

### zone(position) → 空间档名

* 返回值必须是 `"interior"` / `"courtyard"` / `"street"` / `"open"` 之一；
  返回别的（或抛异常）就退回当前全局档 `audio.space`，不报错、不打断。
* 这条探针同时被用来判**听者自己**在哪儿（每 0.2 s 问一次，缓存）。
* 语义按「这个点在什么样的反射环境里」：
  屋里（四面墙 + 顶）、院子（四面墙、无顶）、街巷（两侧墙）、旷野/河滩。
* 不注册 = 一律用 `audio.space`（由 `Ambience()` 按环境档设置），与旧行为逐条相同。

### 回归零

两条都不注册时，`Play` 的每一步都退回 2026-08-20 那一版：occ 恒 0（不插节点）、
混响 send 走 `this.space`、传播延迟照常生效（那一层不依赖探针）。
`Script_AudioTest.mjs` 有一条专门守这个：
`探针不注册时逐条回到老行为（occ 0、无额外节点、混响走 street）`。

---

## 2. 遮挡

### 模型

一次遮挡度 `occ ∈ [0,1]` 同时驱动三件事：

| | 公式 | occ = 1 时 |
| --- | --- | --- |
| 低通 | `20000 × (800/20000)^occ` | 800 Hz |
| 干声 | `10^(−12·occ/20)` | −12 dB |
| 湿声 | `10^(−4·occ/20)`（乘进 `wetScale`）| −4 dB |

**干湿差额是这一层的全部意义。** 隔着一堵墙听见的那一枪，直达声几乎没了，
听得见的**主要就是混响** —— 干湿一起压掉的话，墙那边就是「没有人在打」，
而不是「墙那边有人在打」。低通并进空气低通那只滤波器（取更狠的那个），
不另开节点：墙和空气吃的是同一段高频。

干声衰减单独一个 gain 节点，**不能折进源 gain** —— 源 gain 同时喂着湿声那一路。
`occ === 0` 时不建这个节点，所以探针没注册的场合一个节点都不多花。

室内/室外的界另叠一档 `ZONE_BOUNDARY_OCC = 0.35`（≈ 干声 −4.2 dB、低通 4.5 kHz）：
射线回答不了「你在屋里」这件事（门开着射线就是通的），但屋里听外面的枪仍然是闷的。
这一条做成**对称**的（站在街上听屋里那一枪同样闷），只做单向的话进屋出屋会有一次
不该有的突变。

### 节流（三层）

1. **空间格缓存**：`OCCLUSION_CELL_M = 4` m、`OCCLUSION_CACHE_S = 0.25` s。
   同一堵墙后面的一排兵共用一次射线 —— **真正省下来的是这一层**。
2. **每帧射线预算**：`OCCLUSION_RAYS_PER_FRAME = 8`，窗口按 60 fps 折算
   （引擎里没有 `Frame()` 钩子，只能拿 `ctx.currentTime` 分窗）。用光了沿用过期旧值；
   一次都没查过的按通透。
3. **听者位移失效**：走出 `OCCLUSION_LISTENER_MOVE_M = 2.5` m 整张缓存丢掉 ——
   拐过一个墙角，里面的结论条条都是错的。缓存超过 512 条也整张丢（防漏内存）。

会飞的源（`MoveVoice`）每 `OCCLUSION_REFRESH_S = 0.25` s 重查一次。
**起播时 occ 为 0 的那条飞进墙后面只能靠低通与湿声表达** ——
中途插一个 gain 节点要断开重接一条正在响的链，那一下会「咔」，比少 12 dB 难听。

### 实测

`Script_AudioTest.mjs`：同一条 `rifleNra`，只把探针从 0 拨到 1
（30 m → 50 m，跨格才问得到新值）：

```
干声 −12.0 dB   湿声 −6.2 dB   低通 4865 → 800 Hz   射线 5—8 次
```

湿声那 −6.2 dB = 遮挡 −4.0 dB + 距离从 30 m 到 50 m 的 `WetFalloff` −2.2 dB，
两项对得上。计数在 `audio.stats.occlusionQueries` /
`occlusionCached` / `occlusionSkipped`。

---

## 2.5 「炮弹爆炸没声音 / 人物讲话发虚」的定论（2026-09-09）

用户实听报的两条，取证入口是 phase=1（CH1_NanLu，起伏白盒 + 真撒兵），
钩住 `audio.Play` / `AudioWiring.Occlusion` / `AudioWiring.Zone` 逐条记
cue、距离、遮挡值、低通、干声节点、总线路由。四条假设里成立两条。

**两条都是 2026-09-08 那一轮新引入的。** `e1f235703`（那一轮之前的 master）里
`Script_AudioWiring.mjs` 这个文件根本不存在，`SetProbes` / `OCCLUSION_DRY_DB` /
`ZONE_BOUNDARY_OCC` / `StealVoices` 在 `Script_Audio.mjs` 里一次都搜不到 ——
不是老 bug 浮出来，是这一轮自己带进来的。

### 一、爆炸：同一堵墙被两个人各算一遍

`Script_Combat.Blast` 算了一次遮挡（爆心抬 0.35 m → 玩家眼睛、余量 0.5 m），
交给 `AudioWiring.Blast` 压 `volume × 0.5` + `airCut 900`；
而 `Script_Audio.Play` 拿**同一条探针**又问了一遍，再给 −12 dB 干声 + 800 Hz 低通。

实测（20 m 一发，radius 6.5）：

| | 干声有效电平 | 空气低通 |
| --- | --- | --- |
| 通透 | 0.1925 | 6402 Hz |
| 两层遮挡 | 0.0242 | 800 Hz |

**−18.0 dB 加一道 800 Hz 砖墙**。32 发取样里 13 发吃了双份 —— 那不是
「隔着一堵墙的爆炸」，那是没响。

而且两层的判据根本不是同一条（起点、方向、余量都不同）：32 发里 3 发
「引擎说挡了、宿主说没挡」，1 发反过来。所以问题不是"压狠了"，是重复计算。

**改法**：探针在场时遮挡由**引擎独占一层**，接线层那两行只留给「引擎侧没探针」
的场合（编辑器裸跑规则层），写法与 `blastAutoDeafen` / `gunAutoDuck` 同一套判空。

### 二、探针本身在假报：射线终点贴着地皮

宿主交给探针的是事件的**几何原点** —— 迫击炮弹的爆心就是 `GroundHeight()` 本身
（`Script_Combat` 那两行 `at.y = GroundHeight(...)`），兵的 `position` 是脚底。
于是从听者眼睛（1.6 m）打到那个点的射线全程只降 1.6 m，一路擦着地皮走。

72 个采样点 × 6 档距离，只改射线终点的抬高：

| 终点抬高 | 0 m | 0.35 m | 1.0 m | 1.5 m | 2.0 m |
| --- | --- | --- | --- | --- | --- |
| 判成"挡住" | 29 | 26 | 23 | 21 | 18 |

那 11 条假阳性撞的全是 `embankment`（0.3—0.7 m 厚的路基板）、`villageStraw`
这类矮碰撞盒，**一条地形都没有** —— 别去改 `RaycastTerrain`，坑不在那儿。

**改法**（在 `AudioWiring.Occlusion` 里，见 `Data_Tuning_Audio.PROBE`）：
射线抬到声源自己地面之上 `sourceRiseM = 1.2` 再打；挡住了再问一次
`clearRiseM = 2.6`（鲁南民房檐口高度）那一档 —— 那一档通了就只算
`partialOcc = 0.45`（−5.4 dB + 4.7 kHz，声音从矮东西上面绕过去），
两条都挡住才是 1。通透时仍然只花一条射线。

改完同一批爆炸：32 发里 23 发通透、4 发部分、5 发真挡死，双层计数 0，
最凶的一发 −12.0 dB（引擎单层的上限）。

### 三、讲话发虚：路基被当成了屋顶

`Zone()` 从被问的位置往上打 6 m，撞到东西就查 `IsCeiling`，
而 `IsCeiling` 的兜底判据是「横向 ≥ 2.5 × 2.5 m 就是屋顶」。
津浦路路基那块板实测 **9.3 × 15.2 m，却只有 0.34 m 厚** —— 站在它上面
（或者旁边，脚底那一点）一律被判成 interior。

40 个开阔地采样点，按查询高度统计：

| 查询高度 | 0 m | 0.5 m | 1.0 m | 1.35 m | 1.6 m |
| --- | --- | --- | --- | --- | --- |
| 判成 interior | 12 | 12 | 7 | 4 | 1 |

后果是双份的：混响换成室内 IR（`REVERB_RETURN` 0.9 vs open 0.7），
而且听者在 `open`、声源在 `interior` 会叠一档 `ZONE_BOUNDARY_OCC = 0.35`
（干声 −4.2 dB + 低通压到 6.5 kHz）。三米外一句耳语被这么一过，当然发闷发虚。

实测一句台词，同一个 X/Z、只差声源高度：

```
脚底（up=0）     occ 0.35  zone interior  低通 6483 Hz  干声 ×0.617
嘴高（up=1.35）  occ 0     zone open      低通 13921 Hz 干声 ×1
```

**改法三条**：

1. `IsCeiling` 加一道最低净空 `ceilingMinClearM = 2.0` —— 屋顶总在头顶两米开外，
   贴着脚背的那块板是地面。（**只收紧屋顶这一条**：试过把整个采样点抬到 1.2 m
   再问，但 `CountWalls` 的 `box.max[1] < position.y + 0.4` 那道闸会把一米五的
   院墙一起筛掉，40 个点里 7 个 street 直接掉成 open。坏的只有屋顶判据一条。）
2. `Bark()` 把坐标抬到嘴的高度 `BARK_MOUTH_Y = 1.52`（与
   `Data_Companions.COMPANION_TUNING.mouthY` 同值）。剧情台词那一路早就抬了
   （`Companion.Locate`），喊话这一路一直没抬 —— 同一个人的两句话走两套坐标。
3. 语音在三处走另一条规矩（见 `IsVoiceCue`）：**不进远声组**、**不许被
   voice stealing 偷**、**遮挡封顶 `OCCLUSION_MAX_VOICE = 0.5`**。
   理由都不是配平是可懂度：五十米外那句喊话是给玩家的信息，不是背景里的远处战斗；
   台词是长音、电平低、离得远，正好是偷声部算法眼里最该丢的那一条；
   隔着一堵墙的喊话本来就该听得见，那正是「喊」的意义。
   实测 50 m 一句喊话：`occ 1 → 0.5`，干声 ×0.251 → ×0.501，低通 800 → 3272 Hz。

### 排除掉的两条

* **voice stealing / 去重窗吃掉了爆炸** —— 不成立。`AudioWiring.Blast` 走
  `priority: true`，两道闸都绕过；32 发取样 `dropped` 全为 null。
* **传播延迟让爆炸和画面对不上** —— 不成立，同样因为 `priority`：
  32 发的 `propagation` 全是 0。（顺带记下来：这意味着 160 m 外的炮弹目前是
  **闪光与声音同时到**，与 §4 的设计相反。那是另一件事，不在这一轮里改。）

### 回归口

`Script_AudioWiringTest.mjs` 新增四条断言（8.6 / 8.7 两节）。
把接线层那一层遮挡改回无条件生效，立刻红两条，报的就是
`60m#5 -18.0dB occ=1` —— 断言不是摆设，是量出来的。

---

## 3. 分区混响（四档 IR）

IR 仍然是**现场程序生成**、种子确定（`HashString("ir:" + kind)`），一个外部文件都不用。

| 档 | 时长 | 稀疏度 | 衰减 | 高频阻尼 | 早期反射 | 回声增益 |
| --- | --- | --- | --- | --- | --- | --- |
| `interior` | 0.50 s | 1.0 | 11.0 | 0.30 | 3—22 ms（6 下）| 0.90 |
| `courtyard` | 0.70 s | 1.0 | 9.0 | 0.55 | 8—48 ms（6 下）| 0.86 |
| `street` | 0.95 s | 1.0 | 7.5 | 1（不阻尼）| 6—38 ms（6 下）| 0.85 |
| `open` | 2.60 s | 0.22 | 2.2 | 1（不阻尼）| 340 ms 一下「拍岸」| 0.70 |

* 「屋里那一枪」的辨识度全在**衰减快 + 闷**上，不在时长：土墙、泥顶、席子、麦秸，
  鲁南的民房几乎没有硬反射面。高频阻尼是一阶低通，加在包络**之前** ——
  吸声吃的是反射本身，不是整条尾巴的音量。
* 院子比屋里长、比街上干：四面墙但头顶开着，也没有街巷那种平行墙的颤动回声。
* **street / open 两档与 2026-08-20 那一版逐样本相同**：`damp === 1` 时那只一阶低通
  是恒等的，随机流的消耗顺序也没动。加两档不许顺手改掉已经调好的两档。

送去哪一档由**声源所在的区**决定，不是听者所在的区：混响是声源那个空间的响应 ——
你站在街上听见屋里一枪，听到的是那间屋子的短促闷响透过墙传出来，
不是街巷的 0.95 s 尾巴。听者在另一侧那件事由 `ZONE_BOUNDARY_OCC` 表达（见上一节）。

验收断言：`v.reverbNode === audio.reverbs.interior`（zone 探针说 interior 时），
以及四档 IR 时长严格递增 `0.5 < 0.7 < 0.95 < 2.6`。

---

## 4. 传播延迟

```
delay = clamp(distance / 340, 0, 1.4)      distance > 30 m 且 cue 属于「看得见发生那一刻」的类
```

* 常量：`PROPAGATION_DELAY`（总开关）、`PROPAGATION_MIN_M = 30`、
  `PROPAGATION_MAX_S = 1.4`、`SPEED_OF_SOUND = 340`。
* 走延迟的 cue（`IsPropagated`）：枪（`IsGunCue`：`FAR_CUE` / `SAMPLE_BURST` 两张表
  加 `GUN_EXTRA_CUES`）、`explosion*`、`strafe*`、`gunTail*`，
  外加 `PROPAGATION_CUES`（`shellImpact` / `shellIncoming` / `launcherPop` / `amb.cannonFar`）。
* **不走**的：脚步、拉栓、喊话、环境床 —— 玩家看不见它们「发生的那一刻」，
  延后到达只会变成音画不同步。
* **`priority` 与 `firstPerson` 不延迟**：玩家自己扣的扳机必须跟手，
  命中回执延后半秒等于把「打中了」这条信息推后了。
* `gunTail*` 必须跟着走，而且与本体用同一个 `distance` 算 —— 两者因此必然同时到。
  尾巴赶在本体之前是彻底的穿帮。

### 去重窗要跟着改（这是这一层最大的坑）

旧代码：`if (now - last < DEDUPE_S && delay === 0)` —— **只有不带延迟的才去重**。
传播延迟一上，一排人齐射全都带着延迟，22 ms 去重窗当场整个失效，
二十条一模一样的 `rifleNra` 会原样叠在同一毫秒上（那正是它要防的事）。

现在窗口比的是**到耳朵的时刻**：

```js
const startAt = now + max(0, delay) + propagation;
if (!priority && |startAt - lastPlayAt[name]| < DEDUPE_S) drop;
lastPlayAt[name] = startAt;
```

### 实测

```
80 m 外的 explosionFar   0.235 s（80/340 = 0.2353）
玩家自己那一枪(priority)  0 s
```

计数在 `audio.stats.propagationDelays`。

---

## 5. Duck 与耳鸣：从配方里搬出来

### 修的是什么

`A.Duck(...)` / `A.Deafen(...)` 原来写在 `explosionNear` / `explosionFar` 两条
**合成配方**体内。采样一盖上去（`LoadSfxPack`，也就是正常路径），那两条配方就
**再也不会被执行** —— 于是整局一次 duck 都没有：爆炸炸在脸上，
音乐和环境床照样满音量顶着。

这类 bug 没有任何机器发现得了：声音全在响、控制台干净、开机与通关冒烟全绿。

顺带修掉一个方向反了的：`explosionFar`（远炸）的配方里写着 `A.Deafen(0.3)` ——
**几百米外的一记闷响把玩家的耳朵震了**。

### 现在的模型

按 cue 类别查表，在 `Play` 里统一触发，**按听者距离缩放**：

`DUCK_ON`（`{ seconds, amount, range }`，`amount × clamp01(1 − d/range)`，
低于 `DUCK_MIN_AMOUNT = 0.06` 不触发）：

| cue | seconds | amount | range |
| --- | --- | --- | --- |
| `explosionNear` | 1.1 | 0.55 | 45 m |
| `explosionMid`（cue 还没有，先备着）| 0.9 | 0.45 | 80 m |
| `explosionFar` | 0.8 | 0.30 | 140 m |
| `shellImpact` | 0.8 | 0.45 | 55 m |
| `launcherPop` | 0.5 | 0.25 | 30 m |
| `strafeNear` | 0.7 | 0.35 | 40 m |

`DEAFEN_ON`：`explosionNear` 0.42 s、`explosionMid` 0.3 s、`shellImpact` 0.3 s，
且必须 `distance < DEAFEN_M = 12` m（手榴弹杀伤半径量级：再远只是很响，不是被震）。
`Deafen()` 仍保留成手动 API（编辑器试听、过场里被埋在土里那一拍）。

### 实测（采样路径下）

```
脚边那颗 explosionNear   duckGain 1.00 → 0.45   耳鸣低通 20000 → 520 Hz
200 m 外同一条           duckGain 1.00 → 1.00   耳鸣低通 20000 → 20000 Hz
```

断言里先查 `audio.sampleCues.has("explosionNear")`——不确认走的是采样路径，
这条测的就是个寂寞（那正是当初漏掉的原因）。

---

## 6. 玩家开枪压环境（HDR-lite）

真枪在耳边响的那 0.2 秒里，人耳的镫骨肌反射会把外界整体压掉十几分贝。
对应做法：`priority`（或 `firstPerson`）的枪类 cue 一响，
**环境床与远声组**快压慢放。

```
DuckAmbience(seconds = 0.06, amount = 0.5)
  压 40 ms → 保持 60 ms → 放 300 ms      level 0.50 = −6.02 dB
```

* 压的是两条独立节点：`ambienceDuck`（在 `ambienceBus` 与 `ambienceUser` 之间）
  和 `farGain`。**不许写 `ambienceBus` / `ambienceUser`** —— 前者是系统配平、
  后者是玩家推子，一次开枪就把两者之一改掉了（与 `duckGain` 同一条理由）。
* `farGain`：距离 > `FAR_GROUP_M = 45` m 的位置音统一从它进 `sfxBus`。
  混响回声**不接**它 —— 尾巴跟着让路会听出「空间在闪」。
* **不动近处的音效**：把身边的脚步和喊话一起压掉，听感会变成「开一枪世界静音一下」。
* 连发时每一发都重进一次，从**当前值**接上去而不是从 1 —— 从 1 起跳的话
  每一发都先把音量弹回去再压下来，那是颤音不是闪避。

实测：`1.00 → 0.50 → 1.00`（环境与远声组同步）。计数 `audio.stats.ambienceDucks`。

### 量这一层时的坑

Chrome 对「上游全静音」的子图会整段跳过处理，于是 `AudioParam` 的自动化压根不推进，
`gain.value` 一直读到你写进去的静态值 —— 表现就是「`DuckAmbience` 明明调了、
总线纹丝不动」。测试里用 `ConstantSourceNode` 喂 1e-6（听不见但不是静音）把两条
总线顶活，量完停掉。

---

## 7. Voice stealing

预算不够时**不再直接丢新的**。丢新的这条策略在听感上是反的 ——
玩家注意的永远是刚发生的那件事，而被丢掉的恰恰就是它。

```
在 activeVoices 里找：非 priority、且 effectiveGain 更低、且 distance 更远的那一条
→ 挑 effectiveGain 最低的 → 20 ms 淡出后释放 → 预算在**偷的那一刻**就还回去
一次 Play 最多偷 STEAL_MAX_PER_PLAY = 3 条
```

* `effectiveGain = volume × 混音表 × DryFalloff(distance)`，也就是「这一声在玩家
  耳朵里到底有多响」。`MoveVoice` 会按新距离重算（不然飞远了的飞机永远挂着
  起飞时的电平，成了偷不掉的常驻声部）。
* **只偷更远的**：偷了比新声还近的那一条，玩家听到的是眼前的声音消失。
* **只偷更轻的**：不然就成了「新来的一律插队」，一记贴脸爆炸会被一记远处的脚步顶掉。
* **priority 永远不被偷**，而且**偷不到时 priority 照播**（记 `stats.priorityOverBudget`）：
  玩家的枪 100% 出声是硬指标 —— 它一秒最多几条，几个节点的超支只存在几百毫秒，
  而少响一枪是玩家会报的 bug。
* 预算提前归还靠 `voice.reclaimed`：`FreeVoice` 见到这个标记就不再还第二次。
  代价是那 20 ms 里实际节点数比账面多几个（那正是淡出的时长）。

`audio.drops` 的 `budget` 拆成了两个数：

```js
drops = { dedupe, distance, stolen, starved, get budget() { return this.starved; } }
```

`stolen` = 腾出了位置、新声照播；`starved` = 实在偷不到、只好丢掉。
混在一个数里查不出该调什么：前者说明预算刚好卡在边上（正常），
后者说明场上全是不该丢的声音。`budget` 留成 `starved` 的别名，
老取证脚本与编辑器面板还在读它。

`this.nodeBudget`（默认 `NODE_BUDGET = 120`）改成了**实例字段**：编辑器要能现场调它，
测试要能把它压下来才量得准 —— 在浏览器里排几十条真声音去撑满 120 个节点，
那种测法是抛硬币。

### 实测

预算压到「当前 liveNodes × 0.8」之后连开 12 枪：

```
玩家 12/12 枪全响，偷了 6—9 条，超支放行 0 次，饿死 3—4 条
```

**测法的坑**：必须**先把填料放进去、再把预算压到它们已经撑破的位置**。
反过来（先压预算再放填料）测不到东西 —— 场上的 AI 一直在打，
`liveNodes` 在你压预算的那一刻是多少全看运气，填料会被当场饿死，
于是一条可偷的都没有，断言变成抛硬币。第一版就是这么翻的红。

---

## 8. 限幅抽泵：拆成两级

### 怎么量

`OfflineAudioContext`（48 kHz 单声道）里摆 **20 记 `explosionNear`**：
增益 4.0、间隔 0.15 s，干信号峰值 **2.00（+6.0 dBFS）**——
也就是「手榴弹雨」那一拍二十条声音不加限幅地叠在一起的样子。

叠一条 **6 kHz 的稳态正弦探针**（−26 dBFS），用 Goertzel 逐 20 ms 窗把探针幅度量出来。
压缩器施加的是**宽带**增益，所以探针幅度**就是**这一刻链上的增益，
它的 `max − min` 就是抽泵深度。

> **不能直接量宽带 RMS。** 第一版就是那么量的：WaveShaper 的 2x 过采样有群延迟，
> 逐窗相比会算出 ±5 dB 的假抖动，两条链的差别整个淹掉。
>
> 还有一条要知道：Chrome 的 `DynamicsCompressor` 自带一份**随参数变化的隐式 makeup
> 增益**（老链 +3.23 dB）。所有包络都要先减掉各自的静态增益才可比。

脚本在 `scratchpad/Measure_Pump.mjs`（不进仓库），跑法是 playwright 开一页
同源文档 → `page.evaluate` 里渲三遍（dry / old / new）。

### 结果

| | 抽泵深度 | 平均压 | 输出峰值 | 静态增益 |
| --- | --- | --- | --- | --- |
| 单级（旧）`−8 / 12:1 / rel 0.22` | **10.08 dB** | −3.06 dB | 0.932 | +3.23 dB |
| 两级（新，含补偿）| **8.91 dB** | −1.95 dB | 0.941 | +3.28 dB |
| 两级（不补偿）| 7.10 dB | −1.46 dB | 0.942 | +1.35 dB |

新链：

```
busComp   threshold −18  knee 20  ratio 1.6  attack 0.15  release 1.0
busMakeup ×1.25（+1.94 dB）
limiter   threshold  −1  knee 12  ratio 20   attack 0.004 release 0.4
```

### 两条要写下来的弯路

* **一开始配的 `−14 / 3:1 / rel 0.35` 更糟**：深度 11.47 dB，比旧的还多 1.4 dB。
  慢压缩的门槛压太低、比值太大，它自己就成了第二只在抽泵的压缩器。
  **慢压缩要「几乎不动」才叫慢压缩。**
* **补偿增益必须显式给。** 慢压缩把静态响度吃掉了 1.9 dB（Chrome 那份隐式 makeup
  随参数变），不补的话表现是「整个游戏变小声了」。补齐之后静态增益与旧链持平，
  代价是抽泵优势从 2.98 dB 缩到 1.17 dB —— 这笔账认了：
  谁也不会为了少一点抽泵接受整局低 2 dB。
* 补偿接在**两级之间**：接在末端之后的话，补回来的 1.9 dB 会直接顶进软削顶，
  换成失真。

冒烟里只守参数形状（慢的那只 `ratio ≤ 2 且 release ≥ 0.5`、
快的那只 `ratio ≥ 12 且 attack ≤ 0.006`），不重跑离线渲染 —— 那是几十秒的事，
不该挂在每次提交的路上。

---

## 9. 枪尾按区（第一人称分层）

```js
audio.PlayGunshot(name, { position, firstPerson, weaponClass: "rifle" | "mg", ... })
```

近/远两段本体（`FAR_CUE` 等功率交叉，2026-08-20 那一轮的东西，没动）之外，
按**声源所在区**再追一条尾巴 cue：

```
gunTail{Open|Street|Interior}{Rifle|Mg}      courtyard 用 Street 那条
```

* 本体那 5 ms 的瞬态在哪儿都差不多，同一把枪在屋里 / 院里 / 街上 / 旷野的区别
  几乎全在尾巴上。与卷积混响不重复：卷积给的是「空间的一般响应」（弥散），
  尾巴给的是「这把枪在这个空间里的那一条录音」（带瞬态包络）。
* 院墙与街墙是同一种反射面，分四套素材只会让素材量翻倍而听不出差别。
* **cue 不存在就静默跳过**（`RECIPES[tail]` 查不到）—— 素材侧在补，
  缺哪条哪条不响，不报错、不影响本体。
* 尾巴电平 `GUN_TAIL_GAIN = 0.55`：它是垫在本体后面的一层，站到本体前面就成了另一把枪。
* 尾巴不带 `priority`（不是玩法反馈，不许挤别人的位置），唯一例外是
  `firstPerson`：本体过了闸尾巴没过，听感是「哑火」。

`firstPerson` 对本体的影响：**不走 HRTF**（枪就在你脸前面，HRTF 只会把它推到某一侧去）、
**不加传播延迟**。

---

## 10. 常量速查

| 常量 | 值 | 在哪一节 |
| --- | --- | --- |
| `OCCLUSION_MIN_M` | 4 m | 2 |
| `OCCLUSION_RAYS_PER_FRAME` | 8 | 2 |
| `OCCLUSION_CACHE_S` / `OCCLUSION_CELL_M` | 0.25 s / 4 m | 2 |
| `OCCLUSION_LISTENER_MOVE_M` | 2.5 m | 2 |
| `OCCLUSION_LP_HZ` | 800 Hz | 2 |
| `OCCLUSION_DRY_DB` / `OCCLUSION_WET_DB` | −12 / −4 dB | 2 |
| `OCCLUSION_REFRESH_S` | 0.25 s | 2 |
| `ZONE_BOUNDARY_OCC` | 0.35 | 2 |
| `OCCLUSION_MAX_VOICE` | 0.5（`voice.*` 的遮挡封顶）| 2.5 |
| `BARK_MOUTH_Y` | 1.52 m（喊话坐标从脚底抬到嘴）| 2.5 |
| `REVERB_SPACES` / `REVERB_RETURN` | 四档 / 0.90·0.86·0.85·0.70 | 3 |
| `ZONE_CACHE_S` | 0.2 s | 3 |
| `PROPAGATION_MIN_M` / `PROPAGATION_MAX_S` | 30 m / 1.4 s | 4 |
| `DEDUPE_S` | 0.022 s | 4 |
| `DUCK_MIN_AMOUNT` | 0.06 | 5 |
| `DEAFEN_M` | 12 m | 5 |
| `FIRE_DUCK_AMOUNT` / `ATTACK` / `HOLD` / `RELEASE` | 0.5 / 40 / 60 / 300 ms | 6 |
| `FAR_GROUP_M` | 45 m（`voice.*` 不进这一组，见 §2.5）| 6 |
| `STEAL_FADE_S` / `STEAL_MAX_PER_PLAY` | 0.02 s / 3（`voice.*` 与 priority 一样永不被偷，见 §2.5）| 7 |
| `NODE_BUDGET`（→ `this.nodeBudget`）| 120 | 7 |
| `BUS_COMP` / `BUS_MAKEUP` / `PEAK_LIMITER` | 见 §8 | 8 |
| `GUN_TAIL_GAIN` | 0.55 | 9 |

---

## 11. 验收

```bash
node Taierzhuang1938/Script_AudioTest.mjs     # 空间三件套 + 动态 + 原有 30 条
node Taierzhuang1938/Script_BootTest.mjs      # 七关开机没被弄坏
```

这一轮加的断言（都在 `Script_AudioTest.mjs` 末段）：

* 遮挡：occ=1 的干声比 occ=0 低 ≥ 9 dB、低通 ≤ 1 kHz，且**湿声必须掉得比干声少 ≥ 3 dB**；
* 分区混响：zone=interior 的湿声接到 interior 卷积上，zone=street 接到 street；
* 传播延迟：80 m 外 ≈ 0.235 s、玩家 priority 那一枪 0；
* 探针不注册时逐条回到老行为（occ 0、无额外节点、混响走全局档）；
* 采样路径下 `explosionNear` 触发 duck 与耳鸣，且 200 m 外那一条两样都不触发；
* 玩家开枪把环境总线与远声组压到 ≈ 0.5 再放回 > 0.95；
* 预算打满时玩家 priority 枪 100% 播出，且 `drops.stolen > 0`；
* 两级动态在位（慢的够慢、快的够快）+ 四档 IR 时长严格递增。

**这一整块测的东西全都是静默的**：探针没注册上、遮挡只压了湿声、混响送错了档、
延迟把去重窗顶掉、duck 随采样一起失效、预算满了丢的是玩家的枪 ——
没有一条会报错、掉帧或者让别的断言翻红，只会「听着不对」。
