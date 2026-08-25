# 五场过场重做 · 施工单（2026-08-20）

> **Notion 2026-08-24 定稿状态**：新版 `CS_Chuchuan`（102 s，车厢内
> headLook）内容完成，当前只作为独立预览入口发布：
> `Taierzhuang1938/?preview=CS_Chuchuan`。正片默认 `开始游戏 / L0_Jiehe`
> 仍使用 `CS_ChuchuanLegacy`，因为新版下车后的《断线》玩法尚未完成；新版预览
> 结束或跳过后只显示一次 `跟随通信排。`，不启动旧 L0 的 AI/战斗。失焦、无音频
> (`&audio=0`) 与低画质 (`&quality=low`) 走同一条稳定收口路径。预览页先显示一次
> “播放序章”按钮，用该真人手势解锁 WebAudio；点击后 102 秒流程不再等待任何交互。

## 0 为什么重做（用户原话的意思，逐条对应）

1. 「出川过场动画的背景和前景都是什么鬼」—— 背景是一块黑底上的大亮盘（天空穹半径 4000 m 钉在原点，布景摆在 (4000,4000) 相机在球外面）；前景是一块木纹大盒子当「闷罐车」、一块拉丝的地面贴图（26×140 m 的面只铺一遍 2 m 的纹理）。**引擎侧已修**：天空穹跟相机、过场可自带天空预设、地面材质可 repeat。
2. 「人物都是反关节走路」—— 步态的胯高写成 −|sin|，人在腿最该绷直的那一刻蹲得最深，膝盖从大腿下面戳出来。**引擎侧已修**（Script_Actor：胯高由支撑脚几何反解）。
3. 「李宗仁过场里的 4/5/6 镜的场景等等全都不对」—— 微距拍一块纯色盒子当电文稿、三个木纹盒子当夜车。**要重做布景**。
4. 「开篇应该介绍一下战役来源；出川稍微介绍一下人物来源就行了」—— 开场过场的**内容**改：先讲滕县这一仗怎么来的（徐州会战、津浦路、第五战区），再用两三镜讲川军出川与玩家是谁。
5. 「李宗仁这个对话也没有，过场的目的也不知道是干啥的」—— 原设计「全场无人开口，只有电文与时刻」被用户否了。**要有对白、目的要一眼看懂**：命令下了、车在开、但是到不了城里。
6. 「王铭章的过场也莫名其妙（抄电影的片段不就好了）」—— 原分镜拆成八个互不连贯的碎镜（街心背影／反打／墙根脚／缒城／土路／准星／空路／黑场），没人看得懂发生了什么。**按《血战台儿庄》那一段的节拍重排**：城里指挥 → 西门楼机枪扫来 → 中弹 → 卫士要背他走、他不肯 → 再中弹 → 卫士扑上去 → 黑场与史源卡。
7. 「全都重做修好」—— 最后一电与北门突围也要过一遍：布景封闭（相机不许看见布景外面的虚空）、姿态对、对白把事情讲清楚。

## 1 引擎契约（Script_Cutscene.mjs 现在吃什么）

### 1.1 一场过场的对象

```js
export const CS_X = {
  id, title, seconds,            // seconds 必须等于 shots[].seconds 之和（ValidateCutscene 硬断言）
  trigger,                       // "beforeLevel:L0_Jiehe" / "afterLevel:L5_Shizijie"，决定正片里脚下是哪一关的场
  sky,                           // 可选：天空预设名（dawn/night/overcast/smokyDay/burningStreet/dusk）。
                                 // 给了就整场换天（天空+IBL+平行光+后期），播完还原成本关的
  fadeIn,                        // 可选：整场开头从黑淡入的秒数
  standalone, setOrigin,         // 独立布景：坐标写局部值，setOrigin 是世界原点（见 §1.4 摆哪里）
  props: [...], cast: [...], shots: [...],
  skipCard / epilogueCard / tally / skipCardFrom,
  people: { id: { name, short, real, note } },   // 本场新引入的人物表条目（并进 CAST）
  presumed: [{ id, value, unit?, note }],         // 本场新引入的推定值（并进 PRESUMED_STAGING）
  forbiddenLines: [...],
  why,                           // 一句话：这一场为什么存在
};
```

### 1.2 props（一次性道具）

```js
{ kind: "box"|"cyl"|"plane", size, pos, rx, ry, name,
  mat: "Ground"|"GroundRubble"|"BrickWall"|"BrickWallSooty"|"Adobe"|"RoofTile"|"WoodDoor"|"WoodBeam"|"WoodStock"|"Sandbag"|"Stone"|"Steel",
  repeat: n | [u, v],            // 可选：覆盖贴图铺几遍。**不给时引擎已按世界尺寸自动铺**（Ground 2.6 m 一张、砖 1.2 m、木 1.0 m）
  tint: 0xRRGGBB, roughness,     // 库材质上再染色/改粗糙度
  color: 0xRRGGBB,               // 没有 mat 时的纯色
  emissive: 0xRRGGBB,            // 自发光（灯泡、门缝光）
  light: { color, intensity, distance, offsetY },   // 挂一盏点光。室内戏**必须**有，IBL 照不进盒子
  inside: true,                  // 材质翻成 BackSide：相机在盒子里拍内壁（做房间/车厢就用一个大盒子 + inside）
  probeOnly: true }              // 只在预览页建
```

- 室内：**一个大盒子 inside:true 当屋子**（地面/四壁/顶一次到位，相机在里面永远看不见外面的虚空），再摆桌椅灯。墙用 `mat:"BrickWall"` 或 `Adobe`（贴图自动按尺寸铺），**不用 WoodBeam 当墙**。注意 inside 盒子六个面同一材质 —— 想让地面与墙不同，就再铺一块 plane 当地面、一块薄 box 当顶。
- 地面：`kind:"plane"` + `mat:"Ground"`。
- propMoves（镜内道具位移）与 flash（枪口焰贴片）照旧，见 Script_Cutscene.mjs。

### 1.3 cast（演员）

```js
{ id, kind: "nra"|"nraOfficer"|"nraDare"|"ija"|"ijaOfficer"|"civilian", weapon: "HanYang"|"ZhongZheng"|"Mauser96"|null, seed,
  track: [ { t, pos:[x,y,z], ry, state:{...} }, ... ] }
```

- `t` 是**过场全局秒**。两帧之间位置/数值线性插值；布尔（hidden/dead）取前一帧。第一帧之前一律隐藏。
- 换场（瞬移）必须在中间插一帧 `hidden:true`，否则人会以几十米每秒横穿画面。
- state 可用：`moveSpeed`(0–1，1=4.2 m/s；**轨道速度必须 = moveSpeed×4.2**，否则滑步/原地踏步)、`crouch`、`prone`、`aim`、`melee`、`throwing`、`hurt`(0–1 中弹踉跄)、`dying`(0–1 往下瘫)、`dead:true`(布娃娃倒地)、`lookYaw`/`lookPitch`(弧度，转头看东西)、`firing`。
- **nraOfficer** 是新加的：武装带 + 枪套 + 皮鞋、不背枪（weapon:null）。师长／参谋长／长官／军官都用它。
- Actor 正面是局部 −Z；`ry = Math.atan2(-dx, -dz)` 让他面朝 (dx,dz)。**写反了人就背对着走**，出图必查。
- 没有坐姿。要「坐」就站在桌后、用机位裁掉腿，或 crouch≈0.9 凑合（只能远景）。
- 「脸」是一张光板——分镜尽量用背影、侧影、半身、手与物件；给脸的镜头控制在 1 秒以内或放远。

### 1.4 shots（镜头）

```js
{ n, seconds, focalMm,               // focalMm 是 35 mm 等效焦距（24/35/50/85/135/200），代码里不许写 fov 度数
  note,                              // 这一镜是什么（给走带/审查看）
  camera: { from, to, look, lookTo, ease,   // 机位与被摄物（局部坐标），to/lookTo 给了就是运动镜头
            fromActor: "wang", lookActor: "wang",   // ★ 锚在演员脚下：from/look 变成相对他的偏移（世界轴向，不随他转身）
            shake: 0–1 },                            //   跟拍/反打用它，不用逐秒反算坐标
  shakeAt: [{ at, seconds, amount }],
  subs:  [{ at, seconds, tier, text, big, small, title, date }],   // title/date 是字卡专用样式
  lines: [{ at, seconds, who, text, tier, off }],                  // 台词；who 必须在 CAST（含本场 people）里
  sfx:   [{ at, name, volume }],
  flash: [{ at, pos, seconds, size }],
  propMoves: [{ name, from, to, startAt, endAt, ease }],
  black: true,                       // 整镜黑场
  titleCard: true,                   // ★ 字幕居中（配 black 用：章节字卡）
  fadeIn: 秒,                        // ★ 本镜开头从黑淡入
  blackOutAt: 秒,                    // 从本镜第几秒开始黑出
  gunsight: true }                   // 敌方视角的枪管+准星贴片
```

- 字幕时长：**每个汉字 ≥ 0.22 s，再加 1.2 s**；一条字幕 ≤ 32 字，超过就拆两条。台词每句 ≤ 22 字。

#### 1.4.1 受限自由转头（headLook）

需要玩家在导演机位上观察时，在过场对象或单个镜头上写 `cameraMode:"headLook"`。
导演的 `from/to/look/lookTo` 仍按时间轴推进，鼠标只叠加局部 yaw/pitch：

```js
cameraMode: "headLook",
headLook: { yaw: [-0.55, 0.55], pitch: [-0.30, 0.30], sensitivityScale: 0.8 },
```

`yaw`、`pitch` 是弧度范围，也可写 `yawLimit`/`pitchLimit` 或单个对称数字；默认范围为
±0.65/±0.38。过场期间 InputRouter 只保留 Look 与 Esc，移动、跳跃、开火、ADS、换弹、
近战、投掷、滚轮换枪和交互全部被吞掉。截图/自动化调用 `Play(id,{neutralLook:true})`
可强制中性视角（yaw=0、pitch=0）。

台词/字幕可以带 `voiceCue`（兼容 `voice`），接入 `AudioEngine.Play("voice."+cue)`；
若声库未载入，字幕仍按数据时长显示，若已知语音时长则自动延长字幕到不短于语音。
`headLook` 过场可声明 `ambience`/`ambienceCue`，入场保存当前环境与音乐、切序章环境并停音乐，
正常结束或跳过时恢复原状态。
- 可用音效名见 Data_SfxSources.mjs（footstepDirt / type92 / explosionFar / impactWood / impactMetal / impactBrick / impactDirt / bodyFall / shellIncoming / rifle 等，用 grep 查 `name:` 或 Data_Voice）。

### 1.5 布景摆哪里

| 情形 | 做法 |
|---|---|
| 戏就发生在滕县城里/城外（十字街、西门、北门、东关、西关电灯厂） | `standalone:false, setOrigin:[0,0,0]`，坐标直接用 Data_Tengxian.mjs 的世界坐标。城是按关切片建的：**trigger 决定脚下是哪一关的场**（beforeLevel:Li → 第 i−1 关的场，afterLevel:Li → 第 i 关的场）。L5Crossroad 切片 ±340 m 含全城；L6Breakout 含北门外到 −700；L0Jiehe ±400/±300 含城与近郊 |
| 独立布景（长官部、军团部、车厢、车站、川陕道） | `standalone:true`，setOrigin **放到离城心 ≥ 1800 m（切比雪夫距离）的地方**：1700 m 以内铺着真地形网格（y≈−1.2±0.55，会和你的地面打架），4000 m 以外也无所谓（天空穹现在跟相机走）。建议 `[2400,0,0]`、`[0,0,2400]`、`[-2400,0,0]`、`[2400,0,2400]` 各场错开 |
| 城外近郊的空地（行军、土路） | 最省事的是 L0 场里城北/城东的原野：`standalone:false`，坐标 x∈[−400,400] z∈[−300,300] 之外 100 m 内的原野有麦地与秃树；地面高度 ≈ −1.2 ± 0.55（**演员 pos 的 y 要贴地**：先出图看，人悬空/陷地就改 y） |

- 雾：白天预设在 300 m 外基本吃光一切；城墙当背景要摆在 80—200 m 内才看得见轮廓。
- 夜：night 预设曝光 3.6，室内必须挂点光，不然全黑（不是 bug，是没光）。

### 1.6 出图与自检（唯一的验收手段）

```bash
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_X                      # 每镜两张（开头+镜中）
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_X --times=0.5,3,7.2    # 指定秒数
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_X --every=1.0          # 每秒一张
```

- 落在 `Taierzhuang1938/_shots/cutscene/CS_X_t0xx.x.png`（已 gitignore）；**每张图都要用 Read 打开看**，顺带对照终端打印的字幕/台词日志。
- 数据自检：`node Taierzhuang1938/Script_CutsceneCheck.mjs CS_X`（纯数据，秒出；硬错 + 软错：字幕读不完、滑步、台词互顶、布景离城太近……）。出图脚本开头也会打印同一份。
- **worktree 里别用 npm run**，直接 node 调脚本。

`Script_CutsceneShot.mjs` 使用 `manual=1` 把时钟交给 `StepFrames`，批量
`--times` 不会被页面 rAF 偷推；默认 neutral 视角可复现。需要边界视角时追加
`--yaw` / `--pitch`（范围 yaw `[-2.09,2.09]`、pitch `[-1.05,0.96]`）：

```bash
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_Chuchuan --times=60 --yaw=2.09 --pitch=-1.05
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_Chuchuan --times=60 --yaw=-2.09 --pitch=-1.05
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_Chuchuan --times=60 --yaw=2.09 --pitch=0.96
node Taierzhuang1938/Script_CutsceneShot.mjs --cut=CS_Chuchuan --times=60 --yaw=-2.09 --pitch=0.96
```

四条命令分别取四边界；不传参数就是 neutral。Notion 矩阵 11 时刻可直接使用
`--times=0.5,8.5,20,35,50.5,60,69,76,82.5,89,94`。

### 1.7 第二轮引擎补丁（第一轮五位作者的 engineRequests 已落地，**数据侧要跟着改**）

| 能力 | 怎么用 | 对数据的要求 |
|---|---|---|
| 过场期间玩家 viewmodel 已隐藏 | 什么都不用做 | **把 look 点推到 45 m 外的 `Far()` 绕法全部撤掉**，look 直接给被摄物；近平面会自己按距离收到 0.03—1.2 m，1.2 m 以内的微距可以拍了 |
| `black:true` 的镜第一帧就全黑；csRoot 进场不再有 0.35 s 淡入 | 什么都不用做 | 为了盖第一帧而加长的 cut.fadeIn 可以改回想要的值 |
| 关卡 HUD 在过场 Play 的瞬间全部隐藏（无过渡） | — | 出图里不该再有简报/路标残影 |
| Actor 新姿态 `kneel`(0–1 双膝跪地)、`reach`(0–1 空手双手往前下方伸：够桌面/电键/土袋/扶人；叠 `melee` 当一下一下扒/拽)、`binoculars`(0–1 双手举到眼前) | state 里给 | 跪倒用 `kneel` 别再用 crouch+dying 凑；扒土袋/敲键/执笔用 `reach`；举望远镜用 `binoculars` |
| `dead:true` 从**当前胯高**开始倒（跪着/蹲着的人不会先弹起站直再倒） | — | 王铭章镜 6 可以换回 `dead:true` |
| 后脑勺有深色发盖（不再是肤色球）；草鞋 albedo 压暗 | — | — |
| 枪口焰贴片有径向渐变贴图 + HDR 增益 | `flash:[{at,pos,seconds,size}]` | size 可以放回 1.0—1.6，不会露方块 |
| propMoves 同一道具多段：只让已开始的最晚一段生效；支持 `rotFrom/rotTo:[rx,ry,rz]` | 「先掉再滑」「震一下再回弹」「摔下来翻个面」 | — |
| 点光闪烁 `light.flicker: 0–1` | 火光道具 `{ emissive, light:{..., flicker:0.6} }` | 「城在烧」的火光别再是静止灯泡 |
| 出图脚本对 afterLevel 的场：路标全标 reached、AI 藏起、常驻烟柱拆掉（按「这一关打完」的状态拍） | — | 王铭章/北门的机位不必再绕街口那根黑烟柱 |
| L0 冬麦平板压薄（不再是远景里一条发绿的堤） | — | — |

### 1.8 第三轮引擎补丁

| 能力 | 怎么用 |
|---|---|
| 发盖加宽到整个后半球（0.93 头宽） | 背影/3/4 后侧不再读成正脸；`nraOfficer` 一样有 |
| 字幕层抬高一档，**字幕与台词同屏不再压字** | 需要「台词 + small 字幕」同屏的镜子可以放回去 |
| props 支持 `rz` | 挂钟指针、斜靠的东西 |
| `light.decay`（默认 2 平方反比；给 1 线性、0 不衰减） | 远处火光要照到几十米外的人：`light:{intensity:60, distance:90, decay:1, flicker:0.5}` |
| `shot.cameraFar` / `cut.cameraFar` | 远处大布景在远平面上被切出断头时抬它（L5 的远平面只有 400 m，L0 是 620 m）；播完自动还原 |

**★ lookPitch 的符号**（最后一电那场连栽三轮，写死在这里）：Script_Actor.mjs:1343 是 `neck.rotation.x = lookPitch * 0.62 + …`，而这个 rig 里 `rotation.x` 为**正 = 抬头**（人物正面朝 −Z）。所以：

> **`lookPitch` 正 = 抬头，负 = 低头。**

「低头看电台 / 看地图 / 用帽檐压住脸板」一律给**负值**（−0.3 ~ −0.8）。写成正的就是全场抬下巴，而背影镜里抬下巴恰好把整块肤色面对准机位 —— 看上去像在给脸。

## 2 五场的施工单

各场都要满足：
- 开头第一帧不许是旧机位闪一下（Play 已摆一帧）；结尾黑场或黑出，接补卡/结算。
- 画面里**不许出现**：黑底亮盘、虚空、拉丝贴图、悬空/陷地的人、背对走路的人、穿墙的相机、站在桌子里的人。
- 文案可信度分档照旧（信史/主流/转述/虚构），虚构句不承载事实断言；forbiddenLines 照旧。
- 每句台词/字幕出现的时机与时长按 §1.4 的字数规则。
- people 里新加的真实人物只做史料里有的事。

### 2.1 CS_Chuchuan / CS_ChuchuanLegacy 出川（正片默认与新版预览）

`CS_ChuchuanLegacy` 是 `beforeLevel:L0_Jiehe` 的线上默认（约 42 s），保证
旧界河接缝不变；`CS_Chuchuan` 是按 2026-08-24 Notion 定稿重做的 102 s 车厢内容，只从
`?preview=CS_Chuchuan` 进入，等待《断线》后再接可玩下车段。两者必须同时在
`CUTSCENES` 与 `CUTSCENE_ORDER` 注册，编辑器和测试都要能单独选择。

#### CS_Chuchuan（新版独立预览，102 s）

目的：不以上来开枪介绍战争，而是在一节驶向滕县的军列里，用旧伤、空位、破旧装备、四川话闲谈、小站伤员和两声炮，表现这支部队长期作战后的疲惫与习惯性准备。玩家是无名、无脸、无个人记忆的观察者，固定在通信兵座位，只保留转头与跳过。

冻结结构：

| 时间 | 秒 | 画面 | 声音／台词 |
|---|---:|---|---|
| 0:00—0:08 | 8 | 两张黑场历史字卡 | 轮轨循环，无音乐 |
| 0:08—0:40 | 32 | 五名重点士兵：补鞋、擦枪、机枪手、旧伤兵、检查弹药的班长；两个空位只放铺盖与旧军帽 | 八句四川话闲谈、发涩枪栓、低笑 |
| 0:40—0:56 | 16 | 短站台、一副担架、两名担架兵、一名轻伤员、远烟柱 | 制动、担架木杆、压低咳嗽；不用孩子哭声 |
| 0:56—1:08 | 12 | 两声炮；第二声更近，五人先后停手，旧伤兵睁眼 | 旧伤兵：“近咯。” |
| 1:08—1:30 | 22 | 班长起身环视；众人应答；班长哽咽、点头；随后全员默默收拾装备 | 八句问答由一个 SeedAudio 1.0 连续 cue 一次生成，不能逐句拆分 |
| 1:30—1:42 | 12 | 短黑地点卡；开门、依次下车；观察者机位最后落到道砟上 | 车外军官喊通信排下车；交接“跟随通信排。” |

- 全段 `standalone:true`，车厢局部静止，窗外景片与小站块移动；不做火车物理或连续铁路地图。
- 车内只保留五名重点 NPC；窗外三人、门外一名军官，同一时刻不超过九人。其他车厢乘员不靠堆模型表现。
- 所有对白是四川话并锁定火山引擎 SeedAudio 1.0；API 不可用就失败，不允许经 Lovart 或换 Qwen、系统朗读。1:08—1:30 只登记一个 `prologue_motivation_01` 音频 cue，八条逐句数据只显示字幕；字幕时点按这条连续成品的真实停顿校准。
- `skipCard` 只保留两张历史字卡与地点卡；默认 Legacy 入口和禁用台词边界不变。

### 2.2 CS_LiZongrenTang 李宗仁电联汤恩伯（beforeLevel:L1_Beishahe，约 40 s）

目的：让玩家看见**命令确实下了、车确实在开、时间确实很紧**，而城里的人一句也不知道。有对白。**仍然不下判决**：不出现「见死不救／拥兵自重／避战不前」，也不出现替谁开脱的话；汤的迂回方案是史料里李宗仁 3/16 的命令，不演成汤的私心。

建议结构：

| 镜 | 秒 | 画面 | 字幕/台词 |
|---|---|---|---|
| 1 | 3 | 黑场字卡 | 「三月十四日 夜 · 徐州 第五战区司令长官部」 |
| 2 | 5 | 室内（封闭盒子 + 台灯点光 + 桌 + 电话 + 墙上地图纸）：李宗仁站在桌后拿起电话，背影/侧影 | 李宗仁：「接第二十军团。……恩伯兄，我李宗仁。」（虚构） |
| 3 | 6 | 同机位或越肩 | 李宗仁：「滕县方面王铭章电告，界河当面之敌已在一个师团以上，炮火很猛。」（转述） 「八十五军抽一个整师，开到滕县附近作预备队。」（转述，3/14 17 时电令） |
| 4 | 5 | 硬切：第二十军团司令部（另一间屋，另一盏灯），汤恩伯持话筒 | 汤恩伯：「八十五军正在徐州上车，往临城送。第四师先头一个团，明天就能下车。」（转述） |
| 5 | 5 | 回李宗仁 | 李宗仁：「要快。滕县多守一天，徐州就多一天准备。」（虚构） 字幕（small）：「三月十四日二十一时，蒋介石电话：第八十五军务必于十七日拂晓前到达。」（主流） |
| 6 | 6 | 夜里的闷罐列车剪影（独立布景：铁轨 + 三节车厢 + 一盏远灯，车厢用 inside/灰暗色，不用木纹盒子裸奔） | 字幕：「三月十五日，第八十五军第四师先头一团在临城站下车，随即投入战斗。」（主流） |
| 7 | 5 | 汤恩伯屋里，他放下电话对参谋说（或字幕） | 字幕：「三月十六日十六时，李宗仁再令：第八十五军以一部支援滕县城防，主力由铁道以东向邹县迂回攻击。」（主流） 汤恩伯：「一部支援滕县，主力向邹县迂回。照办。」（转述） |
| 8 | 4 | 黑场 | 「这些电话与命令，城里的人一句也不知道。」（叙述） |

- people：`li: { name:"李宗仁", short:"李宗仁", real:true, note:"第五战区司令长官，徐州" }`、`tang: { name:"汤恩伯", short:"汤恩伯", real:true, note:"第二十军团军团长" }`，kind 都用 nraOfficer。
- 两间屋各一个 inside 盒子，独立布景摆到 ≥1800 m 外；`sky:"night"`。
- 电话机、桌面、纸都是近景道具：桌面用纯色（不用 WoodBeam），纸用浅色薄盒。
- skipCard 列全部带时刻的事实句。forbiddenLines 照旧。

### 2.3 CS_LastWire 最后一电（afterLevel:L3_Fanji，约 26 s）

目的：守军自己嘴里说出「必然陷落」。放在刚夺回东关门的高点上。

保留原分镜的骨架（电台、八个字、敲键、砸电台、黑场），但：
- 屋子做成封闭盒子（inside）+ 油灯点光，相机任何一镜都不许看见屋外；
- 王铭章 kind 改 nraOfficer（背影/侧影），赵渭滨 nraOfficer，报务员 nra；人站在桌**旁**不站桌里；
- 加对白把事讲清：赵渭滨「师长，给孙总司令的电报怎么写？」（虚构）→ 王铭章「就一句。决心死拼，以报国家。」（主流）→ 赵「……还有呢？」→ 王「没有了。发。」（虚构）→ 敲键 → 王「发完把电台砸了，别留给他们。」（转述：另有记载称发完此电后下令砸毁电台）；
- 长版电文与版本差异的小字幕照旧；skipCard 照旧。

### 2.4 CS_WangMingzhang 王铭章殉国（afterLevel:L5_Shizijie，约 42 s）

目的：按《血战台儿庄》那一段的节拍，做成一段看得懂的戏：**一个人在街口指挥，机枪从西门楼扫过来，他倒下，弟兄们要背他走，他不肯，再中弹，没了。**不是八个碎镜。

硬约束不变：**不许任何一帧枪口对着自己**；不演举枪自尽；敌方视角（若用）只给枪管与准星不给脸；称谓「师长」不许「师座」。殉国方式两说在结尾卡片并列（1938 电讯自戕说／墓志与家属的中弹说），本作采中弹。

建议结构（在 L5 的城里实景，十字街口 (0,0) 与西门里街，`standalone:false`）：

| 镜 | 秒 | 画面 | 字幕/台词 |
|---|---|---|---|
| 1 | 6 | 十字街口，街心：王铭章（nraOfficer，举望远镜用 aim 不给枪）站着，两三个卫士蹲在瓦砾后；尘、远处火光；西门方向机枪声 | 副官（画外）：「师长！西门楼丢了——机枪顺着街扫到这儿！」 王铭章：「我看得见。」（虚构） |
| 2 | 4 | 反打 135 mm：西门里街尽头西城门楼剪影，枪口焰 | （sfx type92，impactBrick） |
| 3 | 6 | 回街口，王铭章转身朝弟兄们（lookYaw） | 王铭章：「弟兄们！城还在我们手里。能站起来的，都到街口来！」（虚构） |
| 4 | 5 | 王铭章往前走两步（moveSpeed 0.2），一梭子扫来：`hurt` 拉满 → `dying`，他跪倒；卫士扑过来 | 卫士：「师长——！」（虚构） sfx type92、bodyFall |
| 5 | 7 | 近一点：卫士架着他要往后拖（卫士 crouch + melee 当拽），王铭章 dying≈0.8 | 王铭章：「不要管我……守住城。」（虚构） 卫士：「师长，我背你走！」 王铭章：「走不了了。……弟兄们，守住。」（虚构） |
| 6 | 4 | 第二梭子，王铭章 `dead:true`（布娃娃），卫士伏地 | sfx type92 ×3、bodyFall |
| 7 | 5 | 机位完全不动：尘落下来，街口只剩卫士伏在他身上，没有台词 | （静） |
| 8 | 5 | 黑场 | 字幕两行：「殉国地点两说：城中心十字街口／西关电灯厂附近壕沟。」「时间三说：三月十七日下午三时／五时／黄昏。」 |

- epilogueCard 沿用旧的五行（含 1938 电讯自戕说 → 墓志 → 张宣武回忆 → 家属否认 → 本作采中弹；褒扬令；同时殉国名单），skipCardFrom 同。
- 卫士 2—3 人 kind nra；副官 kind nra 只出声。机枪焰位置沿用旧镜 2 的 (-303.5,12.8,0.6)。
- `sky` 不给（沿用 L5 的 burningStreet）。
- 用 fromActor/lookActor 锚在 wang 上，别手算坐标。

### 2.5 CS_BeimenBreakout 北门突围（afterLevel:L6_Beimen，约 24—28 s）

目的不变（没有追兵、不带解脱感的收尾 + 结算）。保留五镜骨架，逐镜出图校：
- 镜 1 扒土袋：只有手和土 → 现在演员 crouch 0.85+melee 0.4 是否真像「扒」；相机别穿进土袋；
- 镜 2 门洞里向外：门洞是不是真的是个亮方框（北门洞几何在 z≈−305，门是堵死的土袋——注意土袋道具与城门几何的关系，出图看）；
- 镜 3 俯拍麦地那条线：人要贴地（城外 y≈−1.2）；
- 镜 4 长焦回望城墙：有没有火光/烟（L6 场有常驻烟柱）；
- 镜 5 结算 tally 照旧。
- 侯子平一句台词照旧；北门扒门史实字幕照旧。

## 3 交付

本轮集成例外：为保持 Legacy 默认、预览入口与手动截图时钟，LUNA-05 允许
`Data_TengxianScript.mjs`、`Script_Main.mjs`、`Script_CutsceneShot.mjs`、
`index.html`、`Style_Game.css` 与测试/文档文件做装配层改动；不改
`Data_CutsceneChuchuan.mjs`、`Script_Cutscene.mjs`、`Script_Actor.mjs` 或音频数据。

- 各场只改自己的 `Data_Cutscene<Name>.mjs`。**不许改** Script_Cutscene.mjs / Script_Main.mjs / Script_Actor.mjs / Data_TengxianScript.mjs；引擎缺什么在报告里写，别自己动。
- 交付物：改好的数据文件 + 每镜至少一张出图（路径列在报告里）+ 一张 3—6 行的自评（哪一镜还不满意、为什么、建议引擎加什么）。

## 1.9 出川场景/人物大修轮发现的引擎坑（2026-08-25，改过场前先读）

- **材质名写错不报错**：`library.Get()` 抛错后 `_MakeProp` 静默退回米白
  MeshStandardMaterial。「窗外一片白」的根因就是 16 块景片用了不存在的
  `CarriageLandscape`。用新材质名前先在 Script_TexBake.RECIPES / LoadExternalSet 里核对。
- **`_MakeProp` 不把 `metalness` 转给 `library.Get()`**，而材质库默认 metalness=1：
  所有 `mat:"Steel"/"CarriageWallSteel"` 的大面在室内盒子里渲成纯黑（金属无漫反射）。
  室内大面别用钢材质，改木衬/灰泥/无贴图平涂绕开。
- **`spec.noFog` 是 no-op**：Script_Cutscene 里没有任何消费者，数据里写了不生效。
- **`Model_ChuchuanStationPlatform.glb` 轴向是坏的**：整体「上」= −Z、长轴 = +Y，
  且内部一半零件按 +Y 建——怎么旋转都有一半躺下。重跑 Blender 管线前别挂它；
  现用盒子自建小站顶替（Data_CutsceneChuchuan 的 CHUCHUAN_STATION_PARTS）。
- **出图脚本两个陷阱**：`--times` 只给一两个时刻时大贴图（>2 MB）可能没解码完，
  景片渲成黑板，审查请跑完整时刻序列；不同 yaw/pitch 轮次的出图**同名覆盖**，
  每轮拍完先改名再拍下一轮。
- **过场人物活化是引擎自动的**（Script_Cutscene 扫 shot.lines 注入 talking /
  听者转头 / 众人应答；Script_Actor 的 lifePose 待机微动作），数据不用写。
  旋钮在 `CutsceneDirector.LIFE`；这套系统必须挂在类身上——CutsceneControlTest
  用 new Function 切类源码单跑，模块级 const 在那个 eval 里看不见。
  数据钩子：`state.idleLife:false` 让某人绝对静止。
- **遗留打磨候选**：门外月台到景片之间约 24 m 中景只有 SRTM 平原（有地平线不空但素）；
  正面景片 z≈28.7 的边界在个别下车视角可见接缝；擦枪(cleanRifle=1)横枪枪口
  仍会越过 0.7 m 外的邻座（几何解不开，要么挪人要么站着擦）；站牌是空白板。

- **无贴图平涂的面比带贴图的面亮一倍以上**（2026-08-25 外壳轮实测）：同样 sRGB 色号，
  `color`-only 的箱子渲近白，带 `mat` 的正常。外壳/装饰件一律给 mat（WoodBeam 即可），
  必须平涂时色号往暗里再压两档。反向同理：`CarriageBenchWood` 贴图均值反照率约 0.25，
  背光面 tint 要往亮里给。
- **`spec.texture` 通道无法平铺**：`_MakeProp` 只在有 `spec.mat` 时重算 UV，`repeat` 也只转给
  材质库；TextureLoader 默认 ClampToEdge，一张图会被拉满整面。自定义可平铺贴图必须进材质库
  （LoadExternalSet），引擎侧的活。
