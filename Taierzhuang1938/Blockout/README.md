# Blockout：白盒关卡编辑器的关卡配置

这个目录放白盒关卡编辑器（`index.html?editor=blockout&level=<关卡>`）读的配置。每个关卡一份，人和 AI 都直接改这里的 JSON；编辑器开着的时候 2 秒内自动同步，不用刷新页面。完整契约见 [docs/Data_EditorBlockout.md](../docs/Data_EditorBlockout.md)。

这些文件不是游戏数据：改它们不影响正式关卡怎么玩，只影响编辑器里摆出来的样子。

## 有哪些文件

| 文件 | 是什么 | 从哪来 |
| --- | --- | --- |
| `FirstLevel.json` | 第一关的 44 个关键帧：每一站玩家站哪、看哪，此时发生了什么，下一步去哪，敌我各在哪、朝哪、要往哪去 | 生成器从游戏数据算出来（`export FirstLevel`），之后可以手改 |
| `SecondLevel.json` | 第二关的 4 个空间占位关键帧（流程未定稿，只放地标，不放人） | `scene SecondLevel` 一起写出 |
| `SecondLevel.scene.json` | 第二关的草稿场景：1 m 一格的高度网格 + 院落级体块 + 道路 | `scene SecondLevel` 从城区地面函数与东关数据烘出来 |
| `FirstLevel0105.json` | 第一关 01–05 新剧本（Notion 10-18 定稿）的 25 个关键帧，按拍号 01-1…05-4，02末是 `02E-1/02E-2`（`stageLabel: "02末"`） | `export FirstLevel0105` 从空间锚点生成，之后以手改的 JSON 为准 |
| `FirstLevel0105.scene.json` | 01–05 的独立场地：0.5 m 高度网格（前沿沟、交通沟、支沟与南沿土垄、机枪坑、防炮洞、坡顶、集结处干沟与南岸坎顶的矮土埂、东南头的凹路、路）+ 体块（沟里的弹药箱垛 / 土袋垛 / 门板 / 水缸等日常摆件、路口板桥（一块块旧门板拼的：板与板之间留 9 cm 缝、厚薄高低略有不同）、干沟南岸枯树）+ 随信号出现 / 消失的体块（塌洞、坑沿被炸、战车压断桥面门板） | `scene FirstLevel0105` 按 `Data_EditorBlockoutFirstLevel0105Space.mjs` 烘出来 |
| `FirstLevel0105.voice.json` | 01–05 台词的占位配音清单（每句：说话人、字幕、mp3、时长、录音里的原始间隔），mp3 在 `../Audio/Blockout0105/` | `Script_EditorBlockoutFirstLevel0105Voice.mjs`（SeedAudio 整段生成后切句） |
| `FirstLevel0105.previz.json` | 01–05 每个关键帧的预演：镜头、人物调度、动作片段、台词时间、事件（契约 §14） | `Script_EditorBlockoutFirstLevel0105Previz.mjs` 生成，之后可手改 |
| `FirstLevel0610.json` | 第一关 06–10 新剧本（Notion 10-18 晚）的 20 个关键帧 06-1…10-4：干沟 → 凹路后送队 → 村口 → 巷子 / 邻院 / 老耿家 → 石碾后压住东街 → 后门 | `export FirstLevel0610` 从 `Data_EditorBlockoutFirstLevel0610Space.mjs` 的锚点生成，之后以手改的 JSON 为准 |
| `FirstLevel0610.scene.json` | 06–10 的场地（与 0105 同一套坐标，北半截逐点等于 0105）：0.5 m 高度网格（干沟、凹路南段、河汊子、整村压平的耿家庄、地瓜窖）+ 体块（院墙带门窗洞 / 狗洞 / 墙缝 / 侧门、房子、老耿家三间空心屋与平顶、石磨、窖沿与盖板、日常摆件、南岸枯树）+ 随信号体块（CartDeparted / SideGateOpen / CellarBlast / MgSilenced / BackDoorOpen，契约 §15） | `scene FirstLevel0610` |
| `FirstLevel1218.json` | 第一关 12–18 新剧本（10-19 扩写稿，还没进 Notion）的 19 个关键帧 12-1…18-5：出村 → 北沙河北岸大路上的车边 → 空袭、松手 → 排水沟 → 桥头接收院、过门槛、门槛上 → 守桥头、过浮桥、炸桥 → 北门 | `export FirstLevel1218` 从 `Data_EditorBlockoutFirstLevel1218Space.mjs` 的锚点生成，之后以手改的 JSON 为准 |
| `FirstLevel1218.scene.json` | 12–18 的场地（与 0105 / 0610 同一套坐标，村南那一截逐点等于 0610）：0.5 m 高度网格（出村小路、大路与路边浅沟、拐弯往西的河汊子、排水沟、两道河堤、北沙河、浮桥引道、散兵坑、土坎）+ 体块（14 段浮桥与船、接收院与厢房门槛、旁边院子、远处铁路桥、北门城墙与门洞、日常摆件）+ 随信号体块（CartOverturned / ChargesSet / BridgeBlown，契约 §16） | `scene FirstLevel1218` |
| `FirstLevel1218.voice.json` | 12–18 台词的占位配音清单，mp3 在 `../Audio/Blockout1218/` | `Script_EditorBlockoutFirstLevel1218Voice.mjs` |

第一关（`FirstLevel`）的场景就是游戏里的第一关（换成白盒画法），没有单独的场景文件。`FirstLevel0105` 是另一片场地，坐标原点在沟口，和游戏里的第一关无关。

**预演**：有 `<关卡>.previz.json` 的关卡，关键帧卡片上会出现「预演」按钮（或按 `N`），播这一拍的镜头、走位、台词字幕和占位配音，播完跳到下一个关键帧；再按 `N` 或 `Esc` 中断。改 previz 文件同样 2 秒内同步（正在播的那段播完才换）。

**2026-10-18 第三轮（用户「小毛病全都修掉」）**：
- 预演里的爆炸在默认白盒画质下也看得见了：白盒画质把游戏的粒子特效整棵藏掉，编辑器预演另画一份简易爆炸（火光 + 土柱 / 烟尘 + 贴地尘环），只在编辑器里、只在白盒（特效关）时画；游戏本身的爆炸不变。爆炸事件可以写 `h`（爆点离地高，如炸在车尾铁板上 1.5 m）。
- 预演演员键新增 `throw: {x, z, h?, flightS?}`：这个人播步兵的投弹动作（游戏里扔手榴弹的同一个片段「背枪投弹」），手里看得到手榴弹，抡 2.15 s 脱手，弹顺抛物线飞到落点（拖一条淡线）；落点的爆炸照旧写成 `explosion` 事件，时间 = throw 的 t + 2.15 + 飞行秒数。05-3 顺子甩那捆手榴弹炸车尾用它（原来拿「指方向」的片段顶着）。
- 板桥门板缝从 5 cm 加到 9 cm，旧门板厚 6–9 cm、顶面高低差 3 cm 上下、长短和歪斜各不相同；桥下净空（横木底离沟底 1.76 m）不变。
- 冬瓜在被子上的时候一直躺着（02-3 攥顺子袖子那一下不再播坐起来伸手的片段，改成说明字）；桥下的人一律蹲着或趴着过（05-1 班长、幺娃、机枪手钻桥底时先猫腰；05-2 班长一直蹲着；05-3 班长钻出桥底、在桥南沿外一步蹲着开枪；04-3 刘文财猫腰钻过桥底、在桥南蹲着等）。05-4 坡顶上的鬼子从桥东头绕过沟，不从桥底钻、不穿桥头横木。
- 预演里的烟（土雾、掷弹筒出膛的白烟、战车黑烟）和枪口火在白盒画质下也画出来了，同爆炸一样只在编辑器预演里、只在白盒特效关时画。

## 配置长什么样

坐标是游戏世界坐标：X 向东、Z 向南，单位米。朝向一律写 `yawDeg`：0 朝北，+90 朝西，−90 朝东，180 朝南。不想算角度时可以写 `faceTo: {x, z}`（朝向那个点），编辑器读进来时自己换算。

```json
{
  "schema": "tengxian-blockout/1",
  "level": "FirstLevel",
  "title": "第一关 · 往南的路",
  "source": { "generator": "…", "gameVersion": "…", "commit": "…", "generatedAt": "…" },
  "zones": [ { "id": "A", "name": "前沿与后交通壕", "stages": [1, 6], "box": { "minX": …, "maxX": …, "minZ": …, "maxZ": … } } ],
  "keyframes": [ { 一个关键帧 }, … ]
}
```

一个关键帧：

| 字段 | 写什么 |
| --- | --- |
| `id` | 关键帧编号，`阶段两位-序号`，如 `03-2`；只能用字母、数字、`-`、`_`，不能重复 |
| `stage` / `stageTitle` / `name` | 阶段号（导航栏按它分段）、阶段名、站位名 |
| `player` | 玩家站位：`x`、`z`、`yawDeg`、`pitchDeg`（低头为负）、`stance`（`stand` 站 / `crouch` 蹲 / `prone` 卧） |
| `what` | 此时发生了什么，一句话（40 字以内为宜，超过 80 字会报警告） |
| `next` | 下一步：`text` 文字，`x` / `z` 目标点，`radiusM` 目标圈半径；没有要去的地方就只写 `text`，或整个写 `null` |
| `how` | 靠什么让玩家知道，几个短语 |
| `notes` | 备注（设计对照、推测说明），界面上弱显示 |
| `signals` | 这一刻已经发生的场景变化，决定掩蔽部塌没塌、门开没开、桥断没断（见下表） |
| `units` | 敌我与百姓，见下表 |
| `pois` | 地标与要点：`id`、`name`、`kind`（`objective` 目标 / `poi` 要点 / `landmark` 地标 / `danger` 危险）、`x`、`z`、`radiusM` |

一个单位：

| 字段 | 写什么 |
| --- | --- |
| `id` | 关卡内固定的名字。**相邻两个关键帧里同一个 `id` 就是同一个人**，切关键帧时他会走过去；改名就会变成「一个消失、一个出现」 |
| `side` | `ija` 日军 / `nra` 国军 / `civ` 百姓 |
| `kind` | 不写 = 普通士兵；`officer` 军官、`civilian` 百姓、`child` 小孩、`tank` 战车、`litter` 担架（带两个抬担架的人）、`cart` 车、`animal` 牲口 |
| `name` | 短标签（罗班长、破墙机枪…）；没名字的普通兵只画图标 |
| `role` / `group` | 职责 / 所属遭遇组，用来分类筛选 |
| `weapon` | 不写时日军三八式、国军汉阳造；机枪写 `Type11` / `Type92Hmg` / `Zb26` 会自动画射界；`Dadao` = 大刀（站着不动时摆白刃戒备，不按步枪据枪） |
| `x` / `z` / `yawDeg` | 位置与朝向（也可以写 `faceTo`） |
| `stance` / `aim` / `state` | 站蹲卧；`aim: true` 举枪；`state: "down"` 倒地（伤或亡）。担架的 `down` 只表示抬担架的人倒了。倒地的人换位置时只平移、一直躺着（被拖、被抬） |
| `lie` | 只给倒地的人：`"along"` = 身体顺着朝向躺、头朝 `yawDeg` 的前方（躺在被子 / 担架上被拖着走的伤员用）；不写 = 原来的倒地样子（身子横在朝向两侧） |
| `bearers` | 只给担架：抬的人数，不写 = 2；`1` = 只有前头一个（后头是玩家自己，如 14-1），`0` = 担架放在地上 / 床边没人抬（如 17-1 床位上的老周） |
| `arc` | 射界 `{ "halfDeg": 半角, "rangeM": 射程 }`；不写时只有机枪和战车按默认画 |
| `path` | 从**上一个关键帧**的位置走到这里的折线（不含起点）；不写就走直线，穿墙的地方要写（过门洞写门外、门内各一点） |
| `intent` | 「即将去」的折线，画成虚线箭头；不写时如果下一个关键帧里他换了位置，自动取那边的 `path` |
| `speedMps` | 走过去的速度（米 / 秒）；不写时日军 2.8、国军 2.4、百姓 1.6、担架 1.2、战车 2.0 |
| `guess` | `true` = 这个位置是推测的（游戏数据里没写），界面上画虚线圈和问号 |

第一关用到的场景信号：

| 信号 | 意思 | 从哪个关键帧起 |
| --- | --- | --- |
| `BunkerCollapsed` | 掩蔽部被炸塌 | 01-2 |
| `MissionCourtyardGateOpen` | 内院门打开 | 10-1 |
| `MissionBridgeDestroyed` | x=76 的路桥被炸断 | 13-2 |
| `RailBridgeDestroyed` | 北沙河浮桥被炸断 | 18-3 |
| `NightGateShown` | 夜里北门那一片出现 | 18-4 |

`FirstLevel0105` 的场景信号（场景文件 `gates` 里对应的块随它出现 / 消失）：

| 信号 | 意思 | 从哪个关键帧起 |
| --- | --- | --- |
| `DugoutCollapsed` | 防炮洞口塌了：横楣与洞口顶盖没了，塌下的横木压住顺子，洞口南半边一堆土 | 01-4 |
| `PitShelled` | 战车一炮打塌机枪坑北沿一截胸墙 | 03-4 |
| `TankDisabled` | 战车瘫在路口：路口那段交通沟两侧沟沿被碾塌 | 05-3 |

切到下一个关键帧时，两边都有的人沿 `path` 走过去（各按自己的速度，整段超过 8 秒就整体快进）；只在新关键帧里有的人原地出现，写了 `path` 的从 `path` 起点走进来；只在旧关键帧里有的人消失，写了 `intent` 的先走完再消失。

## 第一关的摆位规矩（测试按这些判失败）

`Script_EditorBlockoutConfigTest.mjs` 对 `FirstLevel.json` 查这几条，`validate FirstLevel` 也会把问题一条条列出来：

- **走过去不穿墙**：相邻两个关键帧之间每个人的路线（`path`，没写就是直线；走进来、走出去的也算，原地不动的查站的那一点）按一个半径 0.3 m 的人、离地 0.5–1.4 m 那一段，每 0.1 m 取一点，不能扎进高过 1.6 m 的块超过 0.12 m。块按两个关键帧 `signals` 合起来的场景算（门开没开、桥断没断）。齐腰高的矮墙、坎子翻得过去，不算。
- **玩家站得下**：每个关键帧的 `player` 处放一个站着的人（半径 0.3 m、离地 0.35–1.6 m），碰到任何实心块都不行。
- **不挤**：人离玩家至少 1 m（倒地的 0.5 m）；人离担架中心至少 1.3 m，离抬担架的人站的那一段（担架中心沿朝向前后 1.6 m）至少 0.6 m；任意两个单位至少 0.8 m。
- **下一步不在脚下**：`next` 的目标点离玩家不到 2 m 时只写 `text`，不写坐标。

手改之后跑 `validate FirstLevel` 看有没有新问题。重新生成时，生成器给每个人挑路线的顺序是：配方里写的 `path` → 他跟的战术折线 / 指定要贴着走的路（例如跟车步兵贴着战车的路走）→ 附近已知路线（上路、走到和目的地平齐再下路）→ 两条路线接力 → 直线，挑第一条不穿墙的；都穿就在命令行里报出来。

场景文件（`*.scene.json`）里的 `terrain.data` 是 base64 编码的高度网格：`(cols+1)×(rows+1)` 个 16 位小端整数，单位厘米，第 `iz` 行第 `ix` 列在 `iz*(cols+1)+ix`。体块不写高度位置，载入时落在脚下最低的地面上。

## 怎么改

- **人手改**：直接改 JSON，保存。编辑器每 2 秒读一次文件，发现变了就重新摆当前关键帧（不重建场景），右上角状态点闪一下蓝色、顶部提示「配置已在外部修改，已同步」。改出错误时状态点变红，悬停看是哪一处。
- **在编辑器里改**：只有一个按钮「记下当前机位」，把玩家此刻的位置、朝向、姿态写进当前关键帧的 `player`。本机预览（`node scripts/Script_LocalPreview.mjs`）下直接写回这个目录；在线上（Pages）写不了，会存在浏览器里并提供下载。
- **AI 改**：同人手改。改之前先跑一遍 `summary` 看当前状态，改完跑 `validate`。
- 改完要提交前跑校验；重新生成会覆盖手改的内容，所以生成命令默认不覆盖已有文件，确认要覆盖才加 `--force`。

## 命令

从 worktree 根运行：

```powershell
node Taierzhuang1938/Script_EditorBlockoutCli.mjs validate all                  # 校验全部配置与场景；第一关另列摆位 / 走位问题
node Taierzhuang1938/Script_EditorBlockoutCli.mjs summary FirstLevel            # 每个关键帧一行：机位、各阵营人数、推测几个、要点几个、警告
node Taierzhuang1938/Script_EditorBlockoutCli.mjs kf FirstLevel 03-2            # 看一个关键帧的全部单位与要点
node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel --force     # 从游戏数据重新生成第一关（会丢掉手改）
node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel --out=tmp/FirstLevel.json   # 生成到别处对比，不碰这里
node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene SecondLevel --force     # 重新生成第二关草稿场景与占位配置
node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene FirstLevel0105 --force  # 重新烘 01–05 场地（只写场景文件）
node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel0105 --force # 从锚点重新生成 01–05 关键帧（会丢掉手改）
node Taierzhuang1938/Script_EditorBlockoutCli.mjs summary FirstLevel0105        # 01–05 每个关键帧一行
node Taierzhuang1938/Script_EditorBlockoutConfigTest.mjs                        # 格式、生成器与这里几份文件的测试
```

`--commit=<sha>`、`--generated-at=<时间>` 可以指定写进 `source` 的提交号与生成时间（不写就取当前 git 提交与现在）。

## 第一关的数据从哪来

- 关键帧清单（站位、此时、下一步、提示文字、Notion 对照备注）在 `Data_EditorBlockoutFirstLevelStations.mjs`，原样抄自契约 §8 的表。
- 机位、下一步坐标、敌我位置由 `Script_EditorBlockoutFirstLevel.mjs` 从游戏数据算：机位表（K* / G* / NN_n）、锚点、各阶段的遭遇组与战术折线、03–05 前沿的守军与战车路线、各段的哨位表、担架队检查点、老耿一家与驴车的站位、18 对岸的日军。
- 游戏数据里没写的位置（多数是班里人在某一刻站哪）标了 `guess: true`，是按就近的路线推的，值得在编辑器里看一眼再定。
