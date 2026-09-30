# 02 拖出与递枪（2026-09-29 改稿）

> **2026-09-30 起本文整篇作废**：不再由罗班长拖出、递枪，改成顺子自己挣出来、罗班长就地抓枪塞给他，见 [先枪伤、再刀砍、自己挣出来、班长塞枪](Data_OpeningSelfRescue20260930.md)。以下保留当时的做法。

用户原话：「班长把我拖出来有穿模，而且这一段做的有点垃圾，不知道的还以为班长在干什么，完全可以让我仰头被拉出来啊，看到自己的脚从倒塌的房子里被拖出来；其次是长按F有点怪，这里应该直接按F就可以切换（未来这个也变成通用机制，切换/捡枪都只需要单击F）」；补充：「在开局的过场动画里 我要你在这里直接做一个班长把枪递交到我手上然后直接开打的动作（BlenderMCP）而不是要我自己还要捡起来；最后这里结束动画的时候 玩家应该是站立的而不是半蹲」。

本文覆盖 [压木原地审问改稿](Data_OpeningPinnedRescue20260927.md) 第 5 节的「拖出来」和之后的 Check → KickRifle → 捡枪还权。Hold…Melee 不变。

## 0. 2026-09-30 改稿：不再翻过去再翻回来

用户原话：「现在班长把人拖出来的镜头会转180度再转回来180度，太奇怪了 优化一下；（需要的就BlednerMCP）」。

改前镜头其实转了四次大弯：翻身时画面绕视线滚 180°（仰看倒挂的罗班长）→ 越过正上方低头看脚 → 递枪开头又越顶仰回去看罗班长 → 反向滚 180° 翻回趴着。现在（第 2、3 节里被本节取代的写法已就地改掉）：

- **拖（`LuoRescueDrag`）**：身体照旧翻成仰面，头不跟着滚。翻身那 1.1 s（`RD_PAN` 0.50–1.60 s）视线**水平扫** 160°——往罗班长的另一侧（世界 +z，弹坑台阶那边）扫过去，横滚最多 12°，停在脚偏左 20°（`RD_PAN_SHORT_DEG`：扫满 180° 再加上前面看他捡枪那一眼，4 s 内同向转了 224°，超过战役探针的 200°）；拖行那几下的左右晃只晃眼位、不晃视线；朝罗班长那一侧扫时 0.2 m 内全是他的裤子。躯干抬离地面后（`RD_LIFT`）才低头顺着身体看脚（`RD_DIP` 1.60–2.05 s；平躺时就低头，上衣贴在镜头下面）。眼位沿用 09-29 那条路径（头转向罗班长时眼位跟着偏过去，1.08 s 离他前臂只有 0.8 cm），与罗班长的最近距离不变（躯干 0.115 m、前臂 0.149 m）。第一人称腿从 `drag.legsFromS` 1.6 s 起显示；脖子改成**背离骨盆**往后让（原来是「视线的反方向」，视线扫到侧面时把上衣拉成一片横在镜头前）。导演的 `dragLookWarp` / `handLookWarp` 删了。
- **递枪（`LuoHandRifle`，5.42 s）**：顺子不再翻回趴着。他坐起来（`HR_SIT` 0.15–0.85 s，顺着腿看出去，看得见刚把他拖出来的塌口和房梁），罗班长解下枪、端着沿他左侧（弹坑台阶一侧）绕过来（`HR_WALK` 0.50–1.87 s，六小步 1.65 m、右转 90°，身体压低 5 cm），他跟着往左转头（`HR_TURN_TO`，约 70°）、转身跪起（`HR_GET_UP`，2.37 s 跪直），罗班长在他面前单膝跪下递枪。之后就是 09-29 的递枪、揪肩带拽起、让到右边——整套按 `HrMove`（转 −90°、平移 `HR_SHIFT`）搬到新方位，时间整体后移 `HR_D` 0.667 s（`offered` 2.57 / `handed` 3.77 / `stood` 4.87，holdLoop 2.57–3.57）。
- **还权朝向**：站着面朝弹坑台阶（世界 +z，正是之后撤往后交通壕的方向），东边前沟在他右手边。镜头全程净转：拖时往南扫 160°、递枪时往回转 70° 看罗班长，画面不再倒转。还权那一刻罗班长按骨盆重设挂点（这条 clip 的根运动把骨盆带离挂点 2.2 m，交给 AI 时姿态混合会把骨盆一帧 0.16–0.19 m 往回拖）。
- 烘焙器：递枪这条的姿态整体在转过 90° 的坐标系里（`frameYaw`），手又握着世界坐标的枪；`p['framedGrips']` 让握点第一遍的手目标、够不着时的骨盆修正、握点那一遍的肘极点都按这个坐标系换算（只对带这个标记的 clip 生效，其余 clip 烘出来不变）。
- manifest `20260930OpeningStoryboardsV22CollarLuoNoRollBack`（与同日的 V21CollarQuestion 合并），只重烘 NRA05 的 `LuoRescueDrag`、`LuoHandRifle`；可编辑工程 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningLuoNoRollBack_20260930`。烘焙指标：递枪脚底滑移 0.35 cm（与改前同）、握点误差 2.8 cm（改前 2.4）、罗班长躯干离眼最近 0.196 m（拽起时，与改前同）。

## 1. phase 与事实

- BunkerRescue：Hold → Ask → Charge → Melee → **Lift → Check** → Released。KickRifle 删掉。
- `luoRescueComplete` 仍记在 Lift 结束（拖完）；`rifleRecovered` 改成**过场事实**，记在还权那一刻（`FirstLevelBunkerShow.Release`），同一帧把枪还到手上（`RestoreRifle`）、存检查点，流程随即进 RearTrench。`MissionRifle` 交互点删了——没有捡枪这一步。

## 2. Lift：捡枪背上、翻身、架腋拖出

- 何有田照旧到 `rescue.lift.heLift` 把塌顶木抬起（`HeLiftTimber` 保持循环），**两只脚跟都出了木头东沿 `drag.timberEastX` + `drag.dropPastM`** 才松手让木头落回，落下后 `lift.letGoS` 才去沟沿换枪（`HeTimber`，`Aftercut` 在那之前不管他）。
- 罗班长的根 `DragRoot`：压着的眼位往东 `drag.startBackM`（0.70 m）、面朝西对着他。
  1. `LuoPickUpRifleSling`：顺手把泥里那支汉阳造捡起来背到背上（道具第 0 帧就躺在 `rescue.rifleMouth`；`flags.rifleTaken` 起世界里那支隐藏）。趴着的眼睛看他弯腰拾枪：镜头压在他的手和胸口之间、仰角 ≤ 14°（原来 26° 看到的是他裆部）。
  2. 木头抬起来以后 `LuoRescueDrag`：蹲到头前把他翻成仰面、两条前臂从腋下插进去扣在胸前、倒退着拖 1.45 m、放低、松手、起身。
- **镜头全程骑在这条 clip 的 `player` 轨上**（`RescueBody` / `EyeQuaternion`）：`eye` 位置，`gaze`（头朝向 1 m 处的点）定朝向，`crown`（头顶方向 0.2 m 处的点）定横滚——翻身时画面绕视线转 180°，仰头看倒着的罗班长；他架起来时头往前低、视线越过正上方落到自己身上，**顺着自己的身体看两只脚从塌顶木底下被拖出来**。这种镜头自带旋转（`shot.quaternion`），不用 `lookAt`；转速上限用 `trackTurnRps`（9 rad/s，原 3.5 会把越顶那一下拖成最短弧乱转）。
- 第一人称身体：拖的这段（`drag.legsFromS` 起）腿和上衣按轨迹摆（`RescueLegs` → `Script_OpeningFirstPerson` 的 `LegSpecFromWorld`）：骨盆朝向用胸口法线（仰面朝上），**脖子钉在眼睛下后方**（`drag.neck`，脊柱从脖子挂下来），否则上衣被剪掉头的领口正对镜头。两只手攥住罗班长的前臂（`gripLuoArms`，伙伴抓握）。
- 拖出的两道脚跟犁痕（`MudMarks`）。
- **导演在轨迹上的取景**（`RescueView`，数据 `rescue.view`；只改朝向与眼位，身体仍是 clip 的）：
  - `dragLookWarp`：翻身后仰头看倒着的班长、越顶低头看脚，这段视线/横滚提前到 1.75 s 走完——班长 1.8 s 俯身架腋时头离眼只有 0.12 m（clip 做不到 0.30：腋下着力点贴地，他的臂长就那么点），那时镜头已经朝脚看了。
  - 拖出前看班长弯腰捡枪：视线压在他的手和胸之间、仰角 −8…10°（低眼位离他 0.7 m，抬高就只剩裆部）。
  - （2026-09-30 起：上面「翻身时画面绕视线转 180°、仰头看倒着的罗班长」「dragLookWarp」作废，见第 0 节。）

## 3. Check：跪起、递枪、拽起来站直

- `LuoHandRifle` 的根 `HandRoot` = 拖人那条的根按骨盆链到它第 0 帧（`ChainRoot`，根运动 1.7 m，`Put(...,{keep:true})`）。
- 顺子头往后仰看罗班长，再**反方向翻回趴着**、撑成四肢着地、跪直；罗班长从背上取下枪，单膝跪在他面前横端着递过来（clip 的保持循环）。`offered` 之后 `hand.lineDelayS` 起「还能打不？」，说完点头 `hand.nodS`，循环放开；`handed` 起枪归他：第一人称的枪从罗班长手里那个位姿接过（`HeldRifle` / `HeldRifleHands`，相机系里记下），`hand.carryS` 内收到 01 整装那套动作结尾的双手端枪姿势（`Script_OpeningFirstPersonGear` 的末帧，手在枪上的位置也照它），随他被**揪着肩带拽起来站直**；罗班长让到他右手边、面朝前沟。clip 播完就还权。
- 取景（`RescueView`）：（2026-09-30 起不再后仰、翻回趴着，`handLookWarp` 删了，见第 0 节）跪起时视线往班长胸口抬（`upAtLuo`，≤35°，`upAtLuoS` 1.6–2.0 s 他绕到左边时）；他端枪递过来时往下看枪（`atRifle`，平视时枪在画面下沿外）；他俯身揪肩带拽人时眼位往后让 `haulBackM`（他的头到过 0.2 m）。
- 翻身的方向：（2026-09-30 起只剩拖时的一次水平扫，见第 0 节）镜头在 4 s 内净转量不超过 200°（战役探针 `HEADING_WINDOW`）。

## 4. 还权

- **站姿**：`player.stance="stand"`、`eyeHeight=STANCE.stand.eye`（1.62），站在拖到的地方（最后一帧的眼位下面），面朝弹坑台阶（2026-09-30 起；原来面朝东看前沟）；手里是那支枪（`RestoreRifle({instant:true})`，不播掏枪——过场最后手里那支已经收到整装动作末帧的端枪姿势，大致就是游戏里端枪的位置）。开场身体、手里那份道具枪隐藏。
- 追兵（bunkerPursuit）按 `rifleRecovered` 刷，现在就是还权那一帧；何有田的沟沿位 `heCover` 东移到 (4.7,−124.25)（原位置在新还权点右前 1 m，举着的枪横在第一眼画面里）。
- 何有田若还没换完枪，直接给汉阳造、交还 AI。
- 还权迟疑（`handbackHoldFireS`）不变：40 m 内的日军 3.5 s 不开火，玩家先拿到控制权——站着比原来半蹲暴露，这 3.5 s 就是给他蹲下或开枪的。
- 还权坐位靠背（Set `rubbleMoundBack`）只在 Released 以后出现（拖腿正好拖过它那块地）。

## 5. 动作（Blender）

三条 clip 只烘 TengxianNra05（罗班长），`_import/Script_OpeningStoryboardClips.py`：`LuoPickUpRifleSling`（1.79 s）、`LuoRescueDrag`（5.0 s，拖五下各 0.29 m）、`LuoHandRifle`（4.75 s，holdLoop 1.9–2.9，`offered` 1.9 / `handed` 3.1 / `stood` 4.2）；manifest `20260929OpeningStoryboardsV19LuoRescue`，可编辑工程 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningLuoRescue_20260929`。顺子在 clip 里是一个刚体（骨盆→胸 0.64 m），翻身时班长先蹲在他左侧、翻完再挪到头后架腋；递枪时枪横在他胸前、枪口朝他左手边；枪道具从 `LuoHandRifle` 第 0 帧就在背上，3.1 s 起隐藏。`player` 轨的 part：`eye`、`gaze`、`crown`、`chest`、`chestUp`、`pelvis`、`kneeL/R`、`heelL/R`；递枪那条另有 `rifle` / `rifleMuzzle` / `rifleUp`（枪中心、往枪口 0.4 m、往枪上方 0.1 m）。距离：拖行段班长躯干离眼 ≥ 0.28 m、手和前臂全程 ≥ 0.15 m；翻身与架腋段躯干最近 0.12 m、拽起段 0.20 m（几何限制，靠上面的取景避开）。旧 `LuoDragToCover` 的毛病是镜头钻进他身体。三条都在 `Script_OpeningActorPerformance` 的 `ContactClips` 里（不叠表演层）。

clip 还没进 manifest 时导演用 `rescue.drag.standIn` / `rescue.hand.standIn`（就是交给烘焙的那份关键帧口径）顶着跑，罗班长摆旧动作。

## 6. 单击 F

拾枪 / 换枪（含地上与尸体身上的武器、P012 领枪点）一律单击 F，按下即完成；按住只留给止血、搬运、补给、拆板、接线这类「过程」交互（`Script_Interact` 文件头、`Data_Tuning_Interact`、AGENTS.md 契约 15）。

## 7. 验收

- 纯 node：`Script_OpeningStoryboardsTest`（phase 表、拖出/递枪口径、三条 clip 的 player 轨）、`Script_OpeningSetTest`、`Script_OpeningLensTest`、`Script_MissionGatesTest`、`Script_WeaponPickupTest`/`Script_CarryTest`/`Script_HudPromptTest`（单击 F）。
- 浏览器：`Script_OpeningStoryboardShots.mjs --stage=2`（SB05B_RolledOver / SB05B_Haul / SB06 / SB06_Hand / SB06_Released）、`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`（站姿还权、Lift/Check 不转圈、无需捡枪直接进 RearTrench）、`Script_OpeningHandbackBrowserTest.mjs`、`Script_OpeningClipsBrowserTest.mjs --clip=LuoPickUpRifleSling,LuoRescueDrag,LuoHandRifle`。
