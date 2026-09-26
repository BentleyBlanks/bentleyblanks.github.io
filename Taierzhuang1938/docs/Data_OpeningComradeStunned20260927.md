# 01 受审川军：倒地落点与震晕动作（2026-09-27）

用户现场反馈：近爆后被震晕、随后第一个被日军审问的川军，一开始的位置是穿模的；他应该有动作表现被炸晕。此文只管 Blast → 拖出前 2 s 这一段，审问跪姿（`ComradeWallRoot` 起）不变。

## 原因

- 他倒在 `banter.comradeBlast` (3.6, −125.85)。动作库按「左手 0.55 m 处一面竖直沟壁、脚下平地」做 `BlastSlamBuried` 的倒地堆，但实地不是这样：沟底平面到他**右边** 0.29 m 就结束，再往北是游戏高度场（0.75 m 网格）抹出来的 **35° 土坡**，坡顶接 `trenchFacadeN` 木板墙（板面在他左边 0.345 m，0.384 m 以上后仰 20°）。根点本身就在坡上 0.205 m。
- 结果倒地堆整个压进坡里（最深 0.42 m），头和左肩埋进木板（0.19 m）；这个姿势从 Black 一直定格到被拖起，拖出前 1.2 s 同样入土 0.25 m、进墙 0.14 m。
- 整体抬高解决不了（要抬 0.33 m，骨盆会悬空 0.24 m）；整体往南挪要 0.8 m 才干净，会把审问站位和两名日兵的配对全带走。

## 做法

- **坡面写进动作源**（`_import/Script_OpeningStoryboardClips.py`）：`BANK_RAMP` / `BANK_FACE` 是在 x 3.4–3.8 实测的坡面与木板面（运行时米，相对根点）。`OnBank` 把平地姿势搬上坡：世界目标点（骨盆、脚踝、手）往他右边挪 `BANK_SHIFT` 0.22 m，再各自抬到脚下坡高；膝/肘极向量只随骨盆抬高。
- **烘焙按坡面触地**：clip spec 可带 `ground(x, y, t)`，`Solve` 用它算每帧的最低点抬升（`LowestVertex(ground)`，默认仍是平地 z = 0）。`walls` 同时登记坡面、平底和后仰板面三块平面，`wallPenetrationM` 照旧 ≤ 3 cm。Blender 评审图新增 `poly` 道具，画出坡和板墙。
- `BlastSlamBuried`：撞墙那一下（0.30 s，肩高处板墙已后仰到约 0.6 m）不动，滑下来的过程中渐入 `OnBank`，0.85 s 落到坡上。
- **新动作 `BlastDazedStir`**（NRA02，6.4 s 循环，首帧 = 末帧 = 倒地堆）：喘粗气；抬头、头晃向两边；右手捂到太阳穴、慢慢摇头；右手垂回土里，左掌撑坡想坐起来，胳膊一软又塌回去。manifest 登在 `clips.added`。
- `CaptiveDraggedFromDirt`：从坡上的倒地堆起拖，`DRAG_OFF_BANK` 在 1.2–2.2 s 把坡上偏移淡回原轨迹（慢到日兵乙的落脚不滑），「立て！」拽起之后与原来逐帧相同，所以 `ComradeWallRoot`、审问与后面各拍不动。被揪起时右腿往前收（伸在原处会扫到日兵甲的腿）。
- 配对的 `IjaDragCollarFromDirt`（日兵甲的骨盆是跟着衣领走的）抓领前多退 0.28 m、抓领时多退 0.14 m，左脚再往外开 6 cm；`IjaPullArm` 按新的伙伴轨道重烘。两条的手仍解到川军的衣领/手臂皮肤点上。
- 导演（`Script_OpeningStoryboards`）：`ComradeDazed` 在 Black / Wake / FrontPass / 拖出前播完 `BlastSlamBuried` 再接循环；切进 CaptiveDragged 独立机位那一刻 `AlignDazed` 重排循环相位，让循环末帧正好落在 `dragStart`（硬切掩盖相位跳变），拖出第一帧无缝。表演层把 `BlastDazedStir` 登进 ContactClips（不叠对白手势）。

## 重烘

五条：`OPENING_MODEL=TengxianNra02` 先 `OPENING_PASS=partner OPENING_CLIPS=CaptiveDraggedFromDirt`，再 bake `BlastSlamBuried,BlastDazedStir,CaptiveDraggedFromDirt`；然后 `TengxianIja02` 的 `IjaDragCollarFromDirt`、`TengxianIja01` 的 `IjaPullArm`。可编辑工程与伙伴轨道在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ComradeStunned_20260926/`。manifest 版本 `20260926OpeningStoryboardsV8Stunned`。

## 验收

- 实机穿模探针（蒙皮顶点对 `battlefield.GroundHeight` 与板面）：Black、Wake、FrontPass、切镜后、拖出 0 / 0.6 / 1.2 s 全部入土 0、进墙 0；拖出 1.8 s 入土 0.13 m / 进墙 0.04 m（基线 0.27 / 0.12）。2.1 s 以后（跪到审问位）与基线相同，是原有问题，本轮未处理。
- `OpeningStoryboardsTest`（新增两处同根交接：倒地 → 震晕、震晕末帧 → 拖出）、`--rebake` 五条逐帧复现；`OpeningClipsBrowserTest` 全过（captiveDrag 川军/日兵甲最深重叠 7.6 cm，限值 8，基线 6.8）；分镜 SB01–SB03A 判据通过。
