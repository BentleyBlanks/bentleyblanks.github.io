# 壕沟细节参数表（2026-11-01）

用户 2026-11-01：「护壁、踏板，甚至是土崖、土团、草根、沟沿碎土这些布设的细节，应该也是作为 PCG 的可生成选项来的，而不是默认全部都有，也应该有参数可调，方便 agent 在合适的需求地方配置合适的表现。」

每段样条沟的细节都能单独开关、调参数。数据与解析在 `Data_TrenchDetails.mjs`，生成在 `Script_TrenchPlan.PlanTrenchDressing`（构件）、`Script_TrenchEarth.BuildTrenchEarth` 与 `Script_TrenchSurface.BuildTrenchSurface`（土面细节）。场景里怎么写见 [场景文件 §9](Data_Scene.md)；现行第一关（`Data_FirstLevelMissionTrenches`）走同一套，不写就是原来的样子。

## 1. 三层取值

后面的盖前面的：

1. **缺省**（现行第一关的样子）：
   - 木护壁、踏板关（裸土，对标概念图 07）；
   - 射击位、杂物开，数值取沟型（`TRENCH_PRESETS` 的 communication / fire / evacuation / loop / sap）；
   - 土面细节全开，数值取全关那一套（`TRENCH_APPEARANCE`、`TRENCH_SURFACE`）。那边调了，没改过的段跟着变。
2. **表现套餐 `look`**：整张网写一个给所有段，段上写的盖它。
3. **段上 `details`**：只写想改的几项。
   - `true` / `false`：只开关，不改数。
   - 对象：只改写了的参数；对象里不写 `on`，就保持上一层的开关。

```json
{ "id": "FrontMid", "preset": "fire", "points": [[-18, 2.4], [30, 0.6]], "look": "fresh",
  "details": { "duckboard": false, "revetment": { "spacingM": 3.5 }, "roots": { "chance": 0.2 } } }
```

## 2. 表现套餐

| look | 名字 | 用在哪 | 改了什么 |
|---|---|---|---|
| （不写） | 缺省 | 现行第一关 | 见 §1 第 1 层 |
| `fresh` | 新挖完好 | 刚修好、有人守的沟 | 木护壁、踏板开；沟底碎土每站 6（墙脚 2）；草根概率 0.3；干草 0.06 |
| `bare` | 裸土沟 | 只要土、不要任何构件 | 木护壁、踏板、射击位、杂物全关；土面细节照常 |
| `abandoned` | 弃置旧沟 | 撤走了的旧阵地 | 构件全关；土团概率 0.6、每站另加 5；碎土 20（墙脚 8）；沟沿碎土 20；草根概率 0.9、每簇 7 根；干草 0.3；碎石 0.08 |
| `scrape` | 临时掘壕 | 仓促挖的浅沟 | 构件全关；草根关；干草 0.03；碎土 8（墙脚 4）；弃土土块 16 |

新加套餐写在 `TRENCH_LOOKS`，并在这张表补一行。

## 3. 每一项细节

**构件**类是体块：白盒、正式场景都摆，射击位**挡人**；其余构件不挡人。**土面**类只有正式场景画，不挡人。缺省值写成「沟型」的，各沟型数不同，见 `Script_TrenchPlan.TRENCH_PRESETS`。

| 键 | 名字 | 类 | 缺省 | 参数（单位，范围） |
|---|---|---|---|---|
| `revetment` | 木护壁 | 构件 | 关 | `spacingM` 间距（m，1.5–12，沟型 4–5）· `spacingJitter` 间距抖动（比例，0–0.8）· `skipChance` 缺一块的概率（0–1）· `slatsMin` / `slatsMax` 横板几块（1–6）· `postHMin` / `postHMax` 桩高（m，0.4–2）· `slatLenM` 横板长（m，1–6）· `leanRad` 歪斜（弧度，0–0.3） |
| `duckboard` | 踏板 | 构件 | 关 | `chance` 每站出现概率（0–1，沟型 0.1–0.45）· `lenM` 长（m，0.6–5）· `widthM` 宽（m，0.3–1.6） |
| `bays` | 射击位 | 构件（挡人） | 开 | `everyM` 每隔（m，6–80）· `maxCount` 最多几个（0–20，回环 / 敌方掘壕 0）· `lenMin` / `lenMax` 长（m，1–8）· `h` 高（m，0.2–1.2）· `d` 厚（m，0.4–2）· `side` 在哪侧（plus / minus） |
| `props` | 沟底杂物 | 构件 | 开 | `perM` 每米几件（0–0.2）· `kinds` 撒哪些（资产名数组；场景缺省读 `trenches.propKinds`，要用 `Prop/*`） |
| `cliffs` | 土崖（沟壁） | 土面 | 开 | 只开关。关了是平滑的地形坡面 |
| `spoilSkin` | 弃土表皮 | 土面 | 开 | 只开关 |
| `clods` | 沟壁土团 | 土面 | 开 | `chance` 每站概率（0–1，0.35）· `count` 每站另加（0–12，3）· `radiusM` 半径（m，[0.04, 0.11]）· `reliefM` 凸出（m，[0.025, 0.065]） |
| `crumbs` | 沟底碎土 | 土面 | 开 | `count` 每站（0–40，12）· `toe` 其中堆墙脚的（4）· `radiusM`（m，[0.025, 0.145]） |
| `lip` | 沟沿碎土 | 土面 | 开 | `count` 每站（0–40，14）· `radiusM`（m，[0.035, 0.22]）· `reliefM`（m，[0.035, 0.14]） |
| `spoilClods` | 弃土土块 | 土面 | 开 | `count` 每站（0–40，12）· `radiusM`（m，[0.04, 0.2]）· `reliefM`（m，[0.035, 0.16]） |
| `roots` | 草根 | 土面 | 开 | `chance` 每站概率（0–1，0.6）· `strands` 每簇几根（1–12，5）· `lengthM` 长（m，[0.32, 0.78]） |
| `grass` | 沟沿干草 | 土面 | 开 | `chance` 每站概率（0–1，0.12）· `scale` 大小（倍，[0.35, 0.6]） |
| `stones` | 碎石 | 土面 | 开 | `chance` 每站概率（0–1，0.04）· `scale` 大小（m，[0.035, 0.12]） |

- 「每站」是沿沟每米一站、两侧各算一次。
- 范围参数写 `[下限, 上限]`。超出范围、键名写错，场景校验都会报（`TrenchDetailIssues`）。

## 4. 给 agent 的用法

- **按剧情选套餐，再单改一两项。** 例：
  - 「守了几天的主阵地」：`fresh`，再关 `duckboard`；
  - 「撤下来的旧沟」：`abandoned`；
  - 「刚挖一半的交通沟」：`scrape`，`crumbs.count` 调到 20。
- **人要走的沟别开射击位**，或者先核对走位。射击位挡人，可能卡住试玩编排（`Blockout/<Level>.play.json`）和预演路线。木护壁、踏板、杂物不挡人。
- **构件在场景编辑器里能看到**（半透明盒子）；土面细节只在游戏里画（白盒编辑器换成正式场景，或者直接试玩）。
- **改了套餐、细节，只是重摆构件，不重挖地面。** 改控制点、断面、`depthAlong` / `datumAlong` / `collapses`，地面才重挖。
