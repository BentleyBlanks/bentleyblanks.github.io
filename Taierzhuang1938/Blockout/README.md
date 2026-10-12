# Blockout：白盒关卡编辑器的关卡配置

这个目录放白盒关卡编辑器（`index.html?editor=blockout&level=<关卡>`）读的配置。每个关卡一份，人和 AI 都直接改这里的 JSON；编辑器开着的时候 2 秒内自动同步，不用刷新页面。完整契约见 [docs/Data_EditorBlockout.md](../docs/Data_EditorBlockout.md)。

这些文件不是游戏数据：改它们不影响正式关卡怎么玩，只影响编辑器里摆出来的样子。

## 有哪些文件

| 文件 | 是什么 | 从哪来 |
| --- | --- | --- |
| `FirstLevel.json` | 第一关的 44 个关键帧：每一站玩家站哪、看哪，此时发生了什么，下一步去哪，敌我各在哪、朝哪、要往哪去 | 生成器从游戏数据算出来（`export FirstLevel`），之后可以手改 |
| `SecondLevel.json` | 第二关的 4 个空间占位关键帧（流程未定稿，只放地标，不放人） | `scene SecondLevel` 一起写出 |
| `SecondLevel.scene.json` | 第二关的草稿场景：1 m 一格的高度网格 + 院落级体块 + 道路 | `scene SecondLevel` 从城区地面函数与东关数据烘出来 |

第一关的场景就是游戏里的第一关（换成白盒画法），没有单独的场景文件。

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
| `weapon` | 不写时日军三八式、国军汉阳造；机枪写 `Type11` / `Type92Hmg` / `Zb26` 会自动画射界 |
| `x` / `z` / `yawDeg` | 位置与朝向（也可以写 `faceTo`） |
| `stance` / `aim` / `state` | 站蹲卧；`aim: true` 举枪；`state: "down"` 倒地（伤或亡） |
| `arc` | 射界 `{ "halfDeg": 半角, "rangeM": 射程 }`；不写时只有机枪和战车按默认画 |
| `path` | 从**上一个关键帧**的位置走到这里的折线（不含起点）；不写就走直线，穿墙的地方要写 |
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

切到下一个关键帧时，两边都有的人沿 `path` 走过去（各按自己的速度，整段超过 8 秒就整体快进）；只在新关键帧里有的人原地出现，写了 `path` 的从 `path` 起点走进来；只在旧关键帧里有的人消失，写了 `intent` 的先走完再消失。

场景文件（`*.scene.json`）里的 `terrain.data` 是 base64 编码的高度网格：`(cols+1)×(rows+1)` 个 16 位小端整数，单位厘米，第 `iz` 行第 `ix` 列在 `iz*(cols+1)+ix`。体块不写高度位置，载入时落在脚下最低的地面上。

## 怎么改

- **人手改**：直接改 JSON，保存。编辑器每 2 秒读一次文件，发现变了就重新摆当前关键帧（不重建场景），右上角状态点闪一下蓝色、顶部提示「配置已在外部修改，已同步」。改出错误时状态点变红，悬停看是哪一处。
- **在编辑器里改**：只有一个按钮「记下当前机位」，把玩家此刻的位置、朝向、姿态写进当前关键帧的 `player`。本机预览（`node scripts/Script_LocalPreview.mjs`）下直接写回这个目录；在线上（Pages）写不了，会存在浏览器里并提供下载。
- **AI 改**：同人手改。改之前先跑一遍 `summary` 看当前状态，改完跑 `validate`。
- 改完要提交前跑校验；重新生成会覆盖手改的内容，所以生成命令默认不覆盖已有文件，确认要覆盖才加 `--force`。

## 命令

从 worktree 根运行：

```powershell
node Taierzhuang1938/Script_EditorBlockoutCli.mjs validate all                  # 校验全部配置与场景
node Taierzhuang1938/Script_EditorBlockoutCli.mjs summary FirstLevel            # 每个关键帧一行：机位、各阵营人数、推测几个、要点几个、警告
node Taierzhuang1938/Script_EditorBlockoutCli.mjs kf FirstLevel 03-2            # 看一个关键帧的全部单位与要点
node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel --force     # 从游戏数据重新生成第一关（会丢掉手改）
node Taierzhuang1938/Script_EditorBlockoutCli.mjs export FirstLevel --out=tmp/FirstLevel.json   # 生成到别处对比，不碰这里
node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene SecondLevel --force     # 重新生成第二关草稿场景与占位配置
node Taierzhuang1938/Script_EditorBlockoutConfigTest.mjs                        # 格式、生成器与这里几份文件的测试
```

`--commit=<sha>`、`--generated-at=<时间>` 可以指定写进 `source` 的提交号与生成时间（不写就取当前 git 提交与现在）。

## 第一关的数据从哪来

- 关键帧清单（站位、此时、下一步、提示文字、Notion 对照备注）在 `Data_EditorBlockoutFirstLevelStations.mjs`，原样抄自契约 §8 的表。
- 机位、下一步坐标、敌我位置由 `Script_EditorBlockoutFirstLevel.mjs` 从游戏数据算：机位表（K* / G* / NN_n）、锚点、各阶段的遭遇组与战术折线、03–05 前沿的守军与战车路线、各段的哨位表、担架队检查点、老耿一家与驴车的站位、18 对岸的日军。
- 游戏数据里没写的位置（多数是班里人在某一刻站哪）标了 `guess: true`，是按就近的路线推的，值得在编辑器里看一眼再定。
