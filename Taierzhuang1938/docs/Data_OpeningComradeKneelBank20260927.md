# 01 受审川军：跪姿贴坡（2026-09-27）

接 [倒地落点与震晕动作](Data_OpeningComradeStunned20260927.md)：那一轮只管到拖出前 2 s。本轮管拖出 1.8 s 以后到尸体终帧——被拽起跪下（`CaptiveDraggedFromDirt` 后半）、`CaptiveWallBrace`、`CaptiveKneelMud`（审问）、`CaptiveHeadPulledBack` / `CaptiveThroatCut` / `CaptiveClutchThroat`（揪领、割喉、嘲讽）、`CaptiveWallSlideTwitch`（倒墙到尸体）。

## 改前实测

实机探针（蒙皮顶点经 `applyBoneTransform` 对 `battlefield.GroundHeight`，板面按 z = −126.195 − max(0, h − 0.384)·tan20°，h 为离 floorAt 的高度）：

- 拖出 2.1 s 起入土 0.27 m，2.4 s 起 0.45 m，一直到尸体终帧都在 0.40–0.46 m；入土的几乎全是**两只脚（脚掌、脚趾）**，小腿只有 0.06–0.10 m。
- 跪着时脚趾伸到板墙后面 0.2 m（埋在坡里）；背部（Spine1/2）压进板墙 0.06–0.11 m；倒墙那段脊柱和右上臂进墙 0.1–0.17 m、上身也入土 0.1 m。

## 原因

跪点 R3（旧位置 4.057, −125.905）本身就在北壁坡上。游戏地面在这里是：沟底（R3 地面下 0.222 m）到 R3 前方 0.36 m 为止，往北是 32° 的坡，一直升到 `trenchFacadeN` 板墙底（R3 后 0.29 m、高 0.196 m），再往北 64°。动作库却按「平地、身后 0.49 m 一面竖直墙」做跪坐：脚背平贴地面伸在身后，正好落在坡最陡、板墙最近的地方；背靠的是 0.49 m 处的假想竖墙，而真板墙底部只在 0.29 m、0.3 m 以上才往后仰。

## 做法（`_import/Script_OpeningStoryboardClips.py`）

- **跪点南移**：`KNEEL_SHIFT` 0.131（源米，运行时 0.12 m），落在 `DRAG_END`。`ComradeWallRoot` 由拖出末帧与撑墙首帧的骨盆交接链出，自动跟着移到 (4.057, −125.785)；日兵甲的各段站位都挂在 R3 上，一起移动，相对关系不变。
- **坡面数据**：`KNEEL_BANK` 是 x 4.057 处实测的地面剖面（离旧 R3 往北的距离 → 离旧 R3 地面的高度），`KNEEL_BANK_WEST` 是往西每米升 0.035 m。`R3Bank`（R3 坐标）和 `DragBank`（拖出坐标）是同一块地；`KNEEL_FACE` 是板墙（按上面那条立面公式，比实际建出的板子保守约 3 cm）。R3 各条动作的 bake spec 带 `ground`（按坡面落地）和 `walls`（`R3Walls`：竖直段 + 后仰段两块平面，`PlankWalls`）。manifest 的 env 相应改成 `{wallBehindM: .41, wallLeanFromM: .496, wallLeanDeg: 20}`（`KNEEL_WALL_ENV`，`R3Clip` 核对它与 `R3WallEnv` 一致）。
- **坡上跪姿**：
  - `KNEEL_FEET`：脚踝最多在身后 0.22 m，脚尖内扣 40°（像坐在两脚跟之间），脚尖停在板墙前 ~2 cm。
  - `BankLegs`：脚踝按「脚下地面比膝盖着地处高多少」抬起，脚掌按坡度顺坡放平。
  - `BankKneelSpot` / `KneelSpot`：膝关节位置按小腿长度反解（小腿从膝关节正好够到抬高后的脚踝）；小腿顺坡时着地的是膝盖前侧，在关节后 `KNEE_CONTACT` 0.10 m，脚踝抬高以这里为准。
  - `BankKneel`：小腿顺坡后脚跟比膝盖高 ~0.2 m，平地的跪坐骨盆够不着；大腿保持原角度，除非膝盖折得小于 `KNEE_MIN_DEG` 25°，那时大腿立起（骨盆往前、往上，坐在高处的脚跟上）。骨盆每往前 0.42 m 躯干后仰 1 rad（`KNEEL_RECLINE_M`），肩背仍靠在板墙上。所有帧用同一段大腿长度，骨盆起落时膝盖不动。
  - 结果：他是「跪在坡上、小腿顺坡、身体后仰靠着板墙」，不再是平地上坐在脚跟上。
- **拖出**（`CaptiveDraggedFromDirt`）：1.2 s 以后落地面从震晕那堆的坡（`BankHeight`）渐变到真实坡面（`DragBank`），脚按同样的 `BankLegs` 放；2.45 s 起骨盆按 R3 的 `BankKneel` 算，末帧就是撑墙的首帧。1.7→2.0 s 两只脚随骨盆一起被拖向南边（原来停在坡上、贴着板墙，被拽起时甩进板墙后面 0.18 m——这一段旧版不查墙，是原有问题）。2.2 s 前的帧与原来相同。
- **撑墙**：左掌拍的是真实板面（按手的高度算板面位置，`R3WallY`）。
- **割喉、捂喉**：躯干后仰后双手相对喉咙偏前 3–4 cm，`THROAT_R / THROAT_L` 往后收 4.5 cm。
- **倒墙到尸体**：坡上两脚跟比座位能落到的高度还高，平地版「从脚跟上滑坐到右侧地上」会让膝盖、脚掌在下落途中穿坡、身体跳起 10–15 cm。改成**跪着死去**：两脚不动，骨盆只往右塌 0.1 m，躯干沿板墙往右下滑；三下抽动改成脚往两侧踢（往坡上抬会把膝盖甩进坡里）。
- **日兵甲擦刀**（`IjaWipeSheathBayonet`）：尸体跪着，左大腿只剩离地 ~0.2 m，蹲下去擦时日兵甲膝盖着地、被顶起、脚滑 3.4 cm。擦刀部位改成尸体左肩（`shoulderL`），下蹲量 `WIPE_SQUAT` 减小。
- **日兵乙拖臂**（`IjaPullArm`）：拽起那一下（2.1–2.8 s）站近 4 cm，右上臂不再超出够得着的距离。

## 改后实测

同一探针：拖出 1.8 / 2.1 / 2.4 / 2.8–4.35 s、撑墙、审问、揪领、割喉、嘲讽、倒墙、SB03A 的尸体，**入土全部为 0**；最低点离地 0–1.7 cm（没有悬空）。背部贴板墙：按上面那条立面公式最深 3 cm（撑墙的左掌 2.3 cm，是故意拍在墙上），按实际建出的板子（0.3 m 以上后仰）≈ 0。日兵甲站的沟底比川军跪点低 0.15 m（原来 0.22 m）。

## 重烘

NRA02：`OPENING_PASS=partner` 再 bake `CaptiveDraggedFromDirt,CaptiveWallBrace,CaptiveKneelMud,CaptiveHeadPulledBack,CaptiveThroatCut,CaptiveClutchThroat,CaptiveWallSlideTwitch`；IJA02：`IjaDragCollarFromDirt,IjaShoveToWall,IjaHairGrabPull,IjaDrawBayonet,IjaThroatSlash,IjaWipeSheathBayonet,IjaReadyRifle`；IJA01：`IjaPullArm`。可编辑工程与伙伴轨道在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ComradeKneelBank_20260927/`（伙伴轨道起点拷自 `OpeningExecution_20260926`）。manifest 版本 `20260927OpeningStoryboardsV12KneelBank`。调试：`OPENING_LOWDBG=1` 现在每帧还打印两膝、两踝和骨盆位置。

## 验收

- `Script_OpeningStoryboardsTest`（env 允许 `wallLeanFromM` / `wallLeanDeg`）与 `--rebake`（上面 15 条逐帧一致）。
- `Script_OpeningClipsBrowserTest`（贴墙量尺支持后仰板墙）：全过；captiveDrag 川军/日兵甲最深重叠 7.6 cm（限 8），captiveWall 3.9 cm，割喉各段 0–0.2 cm。
- `Script_OpeningStoryboardShots --shots=SB03_Drag,SB03,SB03_Slash,SB03_FlagKick,SB03_FlagDown,SB03A`（连带 SB03_Blade）判据全过。
- `Script_OpeningSetTest` 4b 的头位按新流程重量（SB03 川军头 (4.064, −126.207)，SB03A/SB04 尸体头 (3.87, −126.121)）。
- `Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`。
- `Script_OpeningActorPerformanceBrowserTest`（2026-09-28 补改）：尸体终帧原来断言「骨盆 < 0.25 m、坐塌在泥里」，是平地版的口径，本轮以后必红（实测 0.371 m）。改成按跪姿查：终帧骨盆高度与 `CaptiveWallSlideTwitch` 的 clip root 末帧 `pelvisHeight`（0.368 m）相差 < 0.04 m，且不高于滑前跪姿（0.386 m）、终帧后不再抬起；尸体不动、滑落每帧 < 4 cm 两条不变。

## 未处理

- 配对动作仍按「两人站在同一平面」烘：日兵甲站在沟底，比川军跪点低 0.15 m，揪领时拳头比衣领低约 0.1 m（原来约 0.18 m）。要彻底对上，需要给 stage 加高差、重烘日兵甲各段。
- 嘲讽阶段（`Taunt`）日兵甲左手离川军衣领约 1.8 m：当前 master（不含本轮改动）同样如此，改前的 472d077f 上是 0.18 m，是其后别处引入的，本轮未查。
