# 白刃 QTE 机制（Data_MeleeQte）

## 一句话口径

日军上刺刀冲到玩家面前时，正片的真实刺刀命中可以被短时慢动作 QTE 接管；格挡成功、敌人重伤或被强压制后，玩家可在贴身正面按 `F` 触发“踹开 → 终结”的处决 QTE。专用沙盒 `?melee=1` 只负责把六种样式并排摆出来，正片与沙盒使用同一规则控制器。

## 文件与依赖方向

- `Data_MeleeQte.mjs`：六套 pattern、时间、距离、失败伤害、六工位和测试章数据；纯数据，不 import three。
- `Script_MeleeQte.mjs`：输入、进度、成功/失败、慢动作倍率、处决候选和辅助模式；纯规则，不 import three。
- `Script_Ai.mjs`：刺刀命中前调用 `BeginBlock`，QTE 期间停止 Think / 导航 / 开火，把姿态快照喂给 Actor。
- `Script_Actor.mjs`：三种敌人枪线、腰肩、腿步与受踹姿态；仍是既有程序化骨骼。
- `Script_Viewmodel.mjs`：玩家第一人称双臂、大刀/刺刀的六种轨迹。
- `Script_Hud.mjs` + `Style_Game.css`：按键、完成度、真实时间条、定时亮区和结果卡。
- `Script_Main.mjs`：真实时间 / 玩法时间双时钟、伤害与死亡桥、F 提示、训练目标和 `Debug.MeleeQte`。
- `Script_RangeField.mjs`：`MeleeQte` 关卡 id 下构建六工位场地；仍实现与正片相同的战场查询接口。

依赖只能沿上面方向走。Actor、Viewmodel、HUD 只读 `View()` / `ViewPose()`，不得各自重算输入成功条件。

## 触发条件

### 格挡

1. 日军处于真实刺刀冲锋链：已上刺刀、有玩家目标、距离进入原 `TryBayonet` 的 2 m 命中线；
2. 玩家活着，当前手持大刀，或当前长枪已经安装刺刀；
3. 场上没有另一场白刃 QTE。

满足时原 46 点刺刀命中暂缓，`BeginBlock` 接管。玩家没带可格挡武器、QTE 正忙或规则拒绝时，原命中照常结算，不给免费免伤。

### 处决

候选必须同时满足：活着的日军、距离不超过 2.35 m、在玩家正面、玩家当前持大刀或已装刺刀长枪，并命中以下任一特殊条件：

- 刚被玩家格挡成功，五秒窗口尚未过；
- 剩余生命不超过 35；
- 压制不低于 0.80；
- `?melee=1` 的专用处决训练目标。

有候选时情境提示出现 `F`“踹开处决”。`F` 先问处决，再落回既有拾取/分弹等通用交互。

## 六套输入与动作

| 类别 | 样式 | 输入 | 动作区别 |
|---|---|---|---|
| 格挡 | 连击顶开 | 快速按 `V` 六次 | 双手正面架牢，顶开刺刀 |
| 格挡 | 左右拨架 | 交替 `A / D` 六次 | 枪线和腰肩随左右输入换边 |
| 格挡 | 节奏反击 | `V → F → V → F` | 两次短促接触后反拨 |
| 处决 | 正踹直劈 | 亮区内按 `V` | 正面踹开，武器从上方直落 |
| 处决 | 侧踹横斩 | `A → D → V` | 换脚侧踹，横向走刀 |
| 处决 | 抵枪突刺 | 按住 `V` 0.52 秒后松开 | 抵住枪线，踹开后直刺 |

三套处决的叙事结果一致，但输入、第一人称轨迹和敌人骨架都不同。日军在终结动作 0.48 秒才进入 `Soldier.Kill`，保证“先踹开、再落刀”，随后继续使用既有布娃娃、掉落、阵亡事件和兵员池链。

## 双时钟与输入所有权

- QTE 窗口按传入 `Frame` 的真实 `dt` 结算；格挡约 1.95—2.20 秒，处决约 2.20—2.45 秒。
- 输入阶段玩法时间倍率 `0.28`，结算动作倍率 `0.46`；玩家、AI、弹道、特效与叙事都吃同一份缩放后 `dt`。
- QTE 活跃时 `A / D / V / F` 在 `InputRouter.Capture` 被独占，移动、开火、开镜、蹲卧清零。不能一边拨架一边横移，也不能按 `F` 同时把尸体上的枪捡起来。

禁止拿缩放后的 `dt` 递减 QTE 时间；否则 1.95 秒窗口会被放大到近七秒。

## 辅助输入

默认 `?qteAssist=tap` 保留原快速输入。两条等价辅助只降低输入负担，不改距离、武器、伤害、动画或死亡链：

- `?qteAssist=hold`：需要连按/序列时，按住当前提示键可按节拍自动推进；定时与蓄力题仍保留各自语义。
- `?qteAssist=auto`：自动完成输入，供无法快速反复按键的玩家使用。

运行时取证/测试也可调用 `Debug.MeleeQte.SetAssist("tap" | "hold" | "auto")`。

## 专用测试章

- 入口：主菜单“选章”末尾的“刃 · 白刃战 QTE 测试场”，或直接打开 `?melee=1`。
- 左侧三个工位：连击、拨架、节奏格挡；走到目标约 2 m 内会自动触发指定样式。
- 右侧三个工位：正踹、侧踹、抵枪处决；面向目标按 `F`。
- `1 / 3` 可切换已装刺刀的汉阳造与大刀；正式 Actor、正式命中/死亡/布娃娃链不降级。
- 目标死亡三秒后原位复立；测试章钉住，不进正片七关、进度、继续或史实时间线。

取证口：`Debug.MeleeQte.State / Targets / GoTo / TriggerBlock / TriggerExecution / MakeExecutable / SetAssist / Reset`。

## 动画实现选择

本机制没有引入 Blender 蒙皮资产。现有 `Script_Actor` 是程序化分件骨骼，项目明确不使用战斗 `SkinnedMesh`（SSAO 深度法线预通道的 overrideMaterial 不带 skinning，会让蒙皮塌到原点）。因此六套动作直接在现有 chest / neck / hips / thigh / knee / weaponMount 层完成，第一人称则驱动 Viewmodel 的 actionPivot / swingPivot；这与场上现有 Actor 合批和渲染契约一致。

## 回归

```powershell
node Taierzhuang1938/Script_MeleeQteTest.mjs
node Taierzhuang1938/Script_MeleeQteTest.mjs --shot
node Taierzhuang1938/Script_TestRunner.mjs --domain=combat
```

`Script_MeleeQteTest` 锁定六具正式 Actor、三格挡、三处决、0.28 慢动作、46 点失败伤害、HUD、敌我骨骼动作与两条辅助输入。截图落在 gitignored 的 `_shots/MeleeQte.png`，进程成功不替代人工看图。
