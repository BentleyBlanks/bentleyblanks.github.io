# 06 背坡伤员集结处：伤员、医护、老周与上担架黑场（2026-09-27）

用户要求：担架起行之前集结处的伤员按 Notion「游戏概念参考图」06（担架空着排开、伤员躺在坡脚草上、医护跪在旁边包扎）与 06B（老周半躺、伤腿缠着带血的绷带、叼烟）来做，场景本身不对标；要有基础的医护包扎、伤员疼得挣扎的动作（用 Blender）；伤员从地上到担架上用简单的黑屏加文字说明过渡。

## 现在的样子

| 谁 | 在哪 | 做什么 |
|---|---|---|
| 伤员 ×5 | `MISSION_PLACEMENT.collection.wounded`：西坡脚一列、四副空担架以南一列，都头朝西躺在草垫上 | 带 `care` 的正被包扎（`CareLieTreated`：左腿伸直、右膝立着、抬头看腿、拉紧绷带那一下吃痛），没有的在挣扎（`CareLieWrithe`：膝盖猛地收起、弓背、翻身、一手捂肚子一手抓草）。腿上缠一截带血的白布 |
| 医护 ×3 | 由伤员位置与 `COLLECTION_CARE_PAIRS` 推：`bandage` 跪在伤员左侧与左大腿齐平，`press` 跪在右侧与右胸齐平 | `CareMedicBandage`（右手拿绷带卷绕大腿、左手按住、每圈末尾一拽，一圈 2 秒）/ `CareMedicPress`（双手叠着按住敷料、身体压上去，一轮抬头往肩后看一眼）。左上臂红十字袖标 |
| 担架 ×4 | `collection.litters`（不变） | 起初空着（概念图 06）；黑场里三个包扎好的伤员依次上去 |
| 搬运人员 ×4 | `collection.bearers`（不变） | 原来的程序化蹲/站 |
| 老周 | `collection.zhouRecline`：背贴 `CollectionLitterWall` 北面 0.43 m | `CareZhouRecline`：坐在地上背靠矮土墙，左腿（伤腿）伸直、右膝立起、右小臂搭在膝上、左手放在大腿上；借火的 `wince` 那一拍播 `CareZhouWince`（牵到伤腿，双手捂住大腿弯下去，喘口气靠回墙上）。头仍由说话人头部层转向玩家，嘴照常对口型，卷烟照常叼在两片唇骨中间 |

旧的「老周坐在弹药箱上（lifePose.sit）」与「换身体时玩家闭一下眼（SeatSwapClosure）」已下线。

## 上担架的黑场

`zhouOnLitter`（担架员「上担架再抽！」老周「催命嗦。」播完）那一刻，`FirstLevelCollection.BeginLitterTransition` 开一次 `litterTransition` 控制接管（运行时 `CONTROL_KINDS`，同 `nightTransition` 一样锁手、不挨打、用同一个 `FirstLevelTransition` 黑场字幕）：

1. 淡出 0.8 s（`FRONT_TUNING.litterTransition`），同时把视线转向老周那副担架在队列里的落点；
2. 全黑那一刻：活人老周下场（摘掉动作层与绷带，AI 演员是复用的），烘焙躺姿的那一副直接放到后送路线上他靠的墙根的投影处；集结处三个包扎好的伤员上担架（`CollectionDressing` 的 `litter`），医护改为蹲着歇；
3. 黑场停 2.8 s，字幕 `firstLevel.transition.litter.text`；
4. 淡入 0.9 s 后才记 `ZhouLiftComplete`，后送队起行（`columnDeparted` 仍按真实移动判）。

## 动作怎么来的

- 作者脚本 `_import/Script_CollectionCareClips.py`（姿态工具包、IK、逐帧贴地与验收沿用开场动作库那一套，`_import/Script_OpeningStoryboardClips.py` 一个字没改），烘焙入口 `_import/Script_CollectionCareBake.py`（走 `_import/Script_OpeningStoryboardBake.py` 的帧循环；那边新增 `OPENING_LIBRARY` / `OPENING_LIBRARY_NAME` / `OPENING_LIBRARY_MODELS` 三个环境变量，默认值不变）。
- 只烘参考身体 TengxianNra02：所有国军身体都是同一副 TengxianHumanoidV1 骨架，一份 `Animation/CollectionCare/Animation_TengxianNra02CollectionCare.json` 按骨名绑到任何一具 NRA 身上。
- 通过 BlenderMCP 烘：

  ```powershell
  node scripts/Script_BlenderMcp.mjs start --task CollectionCare
  node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['OPENING_PROJECT']=r'<worktree>/Taierzhuang1938'; os.environ['OPENING_RENDER']='1'"
  node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_CollectionCareBake.py
  node scripts/Script_BlenderMcp.mjs stop
  ```

  `OPENING_CLIPS=<逗号列表>` 只重烘几条；审查图在 `tmp/CollectionCare/BlenderReview`，可编辑工程在 OneDrive `AI/Models/Blender/Taierzhuang1938/CollectionCare_20260927`。
- 配对数字（医护站位、老周离墙）同时写在 `_import/Script_CollectionCareClips.py`（烘进医护的手的目标点）与 `Data_FirstLevelCollectionCare.mjs`（运行时摆人），改一处要重烘，`Script_FirstLevelCollectionCareTest` 对账。

## 运行时

- `Script_CollectionCareAnimation.mjs`：动作库在 02 摆位时才取（1.6 MB），到之前草垫上的人不画；`CareClipLayer` 挂在 `rig.authoredPose`，`LugouCharacterRig.Update` 开头 `Restore`、说话人头部层之前 `Apply`（采样与交叉淡入借 `CutscenePerformer`）；绷带、袖标、草垫是共用画布贴图的小网格。
- `MissionPeople.Person` 新增 `perform`（播作者动作，y 是草垫厚度）与 `dress`（第一次建人时挂袖标/绷带）。
- 镜头离集结处锚点超过 `careDrawM`（90 m）不再报这些人。

## 回归口

- `Script_FirstLevelCollectionCareTest`（纯 node）：动作库清单与循环、配对与老周离墙距离对烘焙、医护脚不滑、老周背不穿墙、运行时接线顺序。
- `Script_FirstLevelFrontTest`：摆位人数（伤员 + 医护 + 搬运）、上担架一人一副、医护与伤员同相位、借火位前不躺人；上担架的黑场时序（全黑前不动人、全黑时已放进队列、字幕没退不放行）。
- `Script_CharacterSpeechBrowserTest`：06 老周播 `CareZhouRecline`、头在半躺高度、嘴仍跟台词。
- 实机：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=6 --stage-to=6`。
