# 01 日兵甲翻越塌顶木、从木头底下拖出顺子（2026-09-27）

> **已被取代**：2026-09-27 改稿（[压在塌木下原地审问、反冲锋白刃战](Data_OpeningPinnedRescue20260927.md)）起日兵甲不再翻越塌顶木、不再把顺子拖出来；本文只作历史。

用户反馈：「日军从外面走进来怎么能直接进的，至少有个翻越动作吧。拖动的动作也还是很奇怪，修好」。

## 原来的问题（实机取证）

- 塌顶木（`Data_OpeningSet0103` 的 `roofTimberDown`，Reach 时塌下）横在洞口，距顺子的眼睛 0.3 m，木头 x 0.65–0.95，顶面离地 0.80 m，底面 0.52 m，架在两端的土垫上。日兵甲的胯高约 0.785 m，这个高度只能撑着翻过去。
- Found：日兵甲直着身子从木头里走进坑（第一人称看到的是腿从木头下面穿过来）。
- DragOut：他转身背对顺子，套旧的 `CollarDrag` 上半身、腿用原生走路，以 1.7 m/s 往前快走，左手靠 IK 往身后够领口，路线又从木头里穿出去。第一人称看到的是他的屁股和腿在前面晃。
- Drag：揪住领口那一帧，镜头往远离他的方向跳了 0.42 m。原因是揪领位的领口轨迹比 Found 的眼位靠后 0.4 m。

## 现在的做法

采用稿写的是「顺子的身体从断木下面被拖出来」，按这句来做：

| 拍 | 动作（`Animation/OpeningStoryboards`，只烘 IJA02） | 导演 |
|---|---|---|
| Found | `IjaVaultTimberIn`：走到木头前，侧身朝南，右手撑木头、左手把枪举开，蹲跳收腿，翻上木头后落进坑里（落点在眼位西南 0.35 m），换回双手端枪，两步挪到揪领位 | `foundRoute` 走到 `ija.vaultIn` (1.42,−124.95)，在那里播动作。根运动结束时正好站在揪领位，之后 `Put(…,{keep:true})` |
| Drag | 不变；镜头只跟着领口的位移走，起点偏移在 `snagShot.settleS` 1.2 s 内慢慢消掉 | `SnagEye0` |
| DragOut 前半 | `IjaVaultTimberOut`：第 0 帧就是 `IjaKickBeam` 的末帧。松开领口，起身转向南，左手撑木头翻出洞外，再转身面向顺子 | 在揪领位播。顺子同时往前爬到木头底下（`ija.crawl`），左手伸出木头东沿 |
| DragOut 后半 | `IjaHaulForearmUnder`：右膝跪地、胸口压低，右手攥住顺子伸出来的左手腕，猛拽起身，然后弯腰、面朝顺子倒退七步，把人从木头底下拖出 1.8 m 到枪托位置 | `HaulRoot`：面朝 `ija.dragOutRoute` 的反方向，使动作第 0 帧的 head 轨落在路线起点。眼位就是 head 轨。拖完把根挪回胯下（keep），再进 Butt |

- 两次翻越都走木头南端土垫北侧那条线。翻进走 z −124.95：顺子从木头底下能看到他走近、脚离地消失、落进坑里；在 z −124.72 时这些都被土垫挡住了。门楣在这条线上方约 1.4 m，翻越时头是朝落地一侧探过去的。翻出走 z −124.72。
- 翻越镜头 `ija.vaultShot`：翻越那几拍看他的胯部，仰角不超过 12°，落地或跪下后再抬到看脸。原来直接看头会被 30° 仰角上限卡住，画面只剩木头底面，一片黑。 2026-09-27 起看头那一半的方位改按骨盆算（`LookAtBody`），头从眼睛正上方掠过时不再甩，见 [开场分镜口径](Data_OpeningStoryboards20260923.md)「01 被日兵甲拖那几拍的镜头」。
- 第一人称：DragOut 里左手先抓在他手上（grasp），他松手后撑泥往前爬（`reachLeft`）。他攥住手腕那一刻（1.917 + 0.375 s）左手反握住他的右前臂（`EXTRA_HAND_POSES.gripHaul`）。

## 烘焙

- `_import/Script_OpeningStoryboardClips.py` 的 `VAULT_*` / `HAUL_*` 是各动作根坐标系里的几何（运行时米），要与 `Data_OpeningStoryboards.ija.vaultIn`、`dragOutRoute` 以及 Set 的塌顶木一致，测试会核对。
- 新增 spec 键 `groundWeight(t)`（0–1）：翻越时双脚离地、靠手撑在木头上，这几帧不贴地（贴地会把人拽下来穿过木头）。跪地那几帧也不贴地：解出来的膝盖陷进泥里几厘米，贴地会把整个人顶高 6 cm，另一只脚就被带着滑动。上游的 `ground(x, y, t)`（不平地面高度）与它并存。
- 翻越时身体转向，着地的那只脚不跟着拧（`PlantedFeet`）；不这样处理，第一次烘焙脚尖绕脚跟滑了 5–12 cm。
- 翻出只在开头 0.46 s 沿用踹木的「够不着就拉骨盆」补偿，撑木头那段用默认补偿的一半。沿用整条的话，松手时骨盆一帧会跳 0.23 m。
- 重烘：`OPENING_MODEL=TengxianIja02 OPENING_CLIPS=IjaVaultTimberIn,IjaVaultTimberOut,IjaHaulForearmUnder`，可编辑工程在 OneDrive `AI/Models/Blender/Taierzhuang1938/OpeningVaultDrag_20260927`。

## 回归口

- `Script_OpeningStoryboardsTest`（纯 node）的「2026-09-27」一段检查以下几项：
  - 两个根与 Set 木头的几何一致；
  - 翻进终点就是揪领位；
  - 两次翻越逐帧检查，胯、脚踝、脚尖都不进木头（要么在上方，要么在下方）；
  - 踹木末帧与翻出第 0 帧无缝；
  - 倒拖的眼位终点落在枪托位置，穿过木头时在木头底面以下；
  - 翻出末帧与倒拖首帧站在同一处；
  - 第一人称抓握时刻与抓腕时刻对齐。
- `Script_OpeningSetTest`：`DESIGNED_CONTACTS` 为塌顶木和门楣登记了 `ija.dragOutRoute`。那条线是顺子趴着时眼睛的位置（离地 0.3 m），不是站立胶囊。
- 实机：`Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3`、`Script_OpeningClipsBrowserTest.mjs --clip=IjaVaultTimberIn,IjaVaultTimberOut,IjaHaulForearmUnder`、`Script_OpeningStoryboardShots.mjs --shots=SB04`。
