# 第一关 01–06 中远处轮番轰炸（2026-09-26）

用户要求：「从日军先头兵开始，中远处安排多轮次的飞机炸弹轰炸，增加战场氛围」。

## 口径

- **起点**：01 开场导演走到 `FrontPass`（先头兵沿交通壕经过洞口，`Data_OpeningStoryboards.phases.Trapped`）。
  02 以后的步骤（阶段跳转、检查点直接进来）一律算已开始。实测正常流程在进 01 后约 61 s 到这一拍。
- **终点**：06 `Orders` 结束。07 以后不起新的一轮，已在天上的那一轮照常飞完、炸弹落完。
- **节奏**：开始后 3 s 第一轮进场（约 22 s 后落弹）；一轮从进场到离场约 40–45 s，离场后隔 14–32 s 起下一轮，
  平均一分钟出头一轮。03 进来 38 s 内与开头两架日机横飞（`Data_OpeningSet0103.FLYOVER`）在天上时不起；
  到点正有对白就往后推，最多推 8 s。
- **编队**（轮换）：九七式轻轰 Ki-30 三机楔形（230 m、88 m/s、每架 4 颗）、九七式重轰 Ki-21 三机楔形
  （320 m、80 m/s、每架 6 颗）、Ki-30 双机（200 m、92 m/s、每架 4 颗）。从北、东北（日军一侧）进场，直线平飞过落区。
- **落区**：P012 外圈地面上的四块（西翼阵地、东翼阵地、东南后方、西南后方），避开外圈土丘；
  落区中心离听者 170–470 m，每颗炸点离活人与在场战车 ≥ 28 m，否则整轮换一块再挑。
- **炸弹**：离机时带着飞机的前进速度自由落体（下落时间 √(2h/g)），落地时在机腹下方、落后机身 45 m（空气阻力）。
  画面上按 2.6 倍放大成一串黑点（三百米外一颗 1 m 长的炸弹不到一个像素）。
- **纯氛围层**：不伤人、不改地形、不进压制账与 TTK、不记任务事实。

## 画面与声音

- 落地：`vfx.Explosion`（`shell` 档，半径 12–15 m）+ 每两颗一根土柱（2.2 s 喷发、11 s 寿命、升到三四十米）。
  土柱每两颗一根，是因为低画质烟源粒子池只有六十来格，一颗一根会把别处的烟挤掉。
- 引擎声：整轮一条 `planeDrone` 挂在长机上，逐帧搬位置 + 多普勒；长机进到 1400 m 内才起（再远不到 −25 dB，
  而 04 激战时引擎节点预算贴着 120，两公里外那一条一定被饿死）。起了走 `priority`，与扫射航线的引擎声同一个口径。
- 爆炸：`explosionFar` 走 `soundField`（1000 m 内不剔除），引擎按距离延迟 d/340；一串十几颗只给其中几颗出声
  （相邻两声 ≥ 0.4 s），长机头一颗加一条压到 320 Hz 以下的低频层。长机头一颗的爆炸与低频层走 `priority`
  （一轮约 18 个节点），其余几声有位才响。对白播放时炸弹声 ×0.6。
- 声部账：与前线床、场外炮击共用 `MISSION_BATTLE_SOUND.front.sharedMaxVoices`（契约 §6 的 8 条）。
  第一颗落地前 3 s 到最后一颗落地后 0.5 s 按 4 条留位（前线床这几秒不起新声），本层自身 ≤ 5 条（引擎声算一条）。
  实机 04 不留位时，一串 12 颗只响出 2 声；留位 + 长机保底后 4 声。
- 震屏：跟着声音到的一记轻震，直接加创伤（与场外炮击同一条路）；170 m 0.22 → 470 m 0.08，洞里 ×1.35；
  一串 1.2 s 里合计 ≤ 0.34。听者在洞里 / 沟里时，每架那一串之后耳边掉一阵土（`debrisFall`）。

## 模块

| 层 | 文件 |
| --- | --- |
| 数据 | `Data_FirstLevelAirRaid.mjs`（起点、各步口径、编队、落区、投弹、画面、声音、震屏） |
| 规则（纯，不 import three） | `Script_FirstLevelAirRaid.mjs`（排一轮、航迹、落地、声部、震屏、取证 `State()`） |
| 接线 | `Script_FirstLevelMissionBattleSound.mjs`：构造空袭层、起点判定 `AirRaidStarted`、落地画面 `BombVisual`、共享声部账 `SharedBusy` |
| 画面 | `Script_Aircraft.mjs`：`SetFormation(key, poses)` 从原机克隆编队（共用几何与材质，不抢 `SetManualPose` 那一架原机）、`SetBombs(key, list, look)` |

宿主没有飞机渲染层（只给 audio 的测试夹具）时不起空袭。取证：`missionRuntime.State().battleSound.airRaid`。

## 验收

- `node Taierzhuang1938/Script_FirstLevelAirRaidTest.mjs`（纯 Node，TestRunner 登记 `FirstLevelAirRaidTest`，audio 域）：
  起点、多轮次间隔、中远处与避人、炸弹航迹、留位与共享声部账、震屏封顶、03 横飞与对白推后、07 以后不起、落区不压土丘、销毁收干净。
- 实拍取证（不是门禁）：`node Taierzhuang1938/Script_FirstLevelAirRaidBrowserProbe.mjs --stage=4`
  （`--stage=1 --shot` 走正常开场到 `FrontPass`），五张截图与 `State()` 写进已忽略的 `_shots/FirstLevelAirRaid/`。
- 开机预热：`Script_Main.WarmLevel` 的代理组里挂 `aircraft.WarmProxy()`（每个已载入机型一架缩小克隆 + 一颗炸弹），
  第一轮编队 / 03 横飞进视野时不再现编材质。GLB 在预热时还没载完的机型这一趟会漏掉（载入与建场并行，通常已载完）。
