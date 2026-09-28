# 北沙河铁路桥：模型与 18「奉令毁桥」（2026-09-28）

用户要求：把最后那座桥的模型（BlenderMCP）和炸桥场面做得宏大一点。
本文件是这座桥**模型、坍塌动画与起爆演出**的唯一口径；18 的编排（等人走净、尾队、夜行军）仍以
[15–18 口径](Data_FirstLevelEnd20260919.md) 为准，共用爆炸感知规则见 [通用近爆反馈](Data_BlastFeedback.md)。

## 1. 桥

单孔铆接钢桁架下承桥：普拉特式、折线上弦（桁高 5.4 / 6.0 / 6.2 m），跨 23.2 m（6 个节间 × 3.87 m），
两片桁架中面在 x = ±2.95（就是原来桁架碰撞盒的位置）。津浦线北段是德国人修的，一九一〇年前后
这一档河面常见的就是这种钢桁架配料石桥台；具体构造为游戏改编。

* 桁架：箱形下弦 + 底盖板 + 上沿角钢；端斜杆与折线上弦带盖板；吊杆两块扁钢；2/3/4 号竖杆是
  缀条连起来的两根槽钢；眼杆成对的主斜杆、跨中两格带花篮螺栓的反斜杆；每个节点两面节点板。
* 两片之间：工字钢横梁与纵梁、下平联、上弦每节点一道缀条横撑、上平联交叉撑、2/3/4 号节点的
  横联隅撑，两端门架（缀条门架梁 + 隅撑 + 铭牌）。
* 桥面：枕木（顶 0.53）、纵铺木板与钢轨头齐平在 **0.66 = `MISSION_RAIL_BRIDGE.deckTopY`**，
  所以原来的桥面可走面一点不用改；引道上的枕木跟着地面走，钢轨在 |z| = 16 处接上轨道样条的断口。
* 料石桥台：八皮错缝料石前墙（块面随机凸出 0–5 cm、灰缝 15 cm 深）、转角隅石、外挑帽石、
  桥座、背墙与道砟、八字翼墙（顶随岸坡降下）；北端支座留在桥台上，南端支座与帽石是可飞的件。
* 18 专用：跨中下弦与竖杆、南端支座上捆的药包，沿下弦拉到南桥台的导爆索，顺路堤肩拉到安全区的
  地面导线与起爆器（`END_TUNING.exploderAt`，东边爆破手撤到它后面蹲下）。

约 1.47 万三角、44 个节点、GLB 0.89 MB（不带法线，运行时按面现算；后台懒载）。

### 材质

运行时按 GLB 材质名换成材质库配方 + 线性色调（`Data_RailBridgeDemolition.RAIL_BRIDGE_MODEL.materials`）：

| 件 | 配方 | 说明 |
| --- | --- | --- |
| 钢 | `CarriageFloorSteel` × 1.8，金属度 0.12 | **不用 `Steel`**：那是枪械发蓝钢（底图均值 45/255、满金属度），挂在桥上一片黑 |
| 料石 | `CityWallStonePbr` × 0.86 | |
| 枕木 / 板 | `HandcartWood` × 0.9 | `WoodBeam` 底图太暗，远看是黑的 |
| 药包 / 导线 | `WoodCrate` / 暗钢 | |

纯 three 材质（没过材质补丁）在这条管线里同样出黑，所以兜底也只在材质库里找。

## 2. 坍塌（Blender 里程序算的关键帧，30 fps × 6 s）

* 0 s 跨中两团主药包：整个中间节间（|z| < 1.93）炸飞成两片桁架块、横梁、上平联、6 簇桥面、
  4 截钢轨、10 块钢屑；0.12 s 南端支座药包把两块支座和九块帽石掀进河。
* 北半孔以北桥台前沿为铰折进河里（V 的一条臂，约 24°），2.25 s 自由端砸到河底。
* 南半孔整孔往北滑出桥座、贴着前墙刮下去落进河槽（1.2 s 北端先触底、1.75 s 南端落到河滩）。
  **从南岸（安全区几乎顺着桥轴看）只有这样才读得出来**：只让它绕南端折，离玩家最近的门架
  原地不动，炸完从南边看跟没炸一样（实拍踩过）。
* 碎件按抛体 + 自旋积分，落在从游戏导出的高度场上（`_blender/Data_RailBridgeTerrain.json`）；
  进水减速沉底、陡岸上顺坡滑、停稳后把最短轴扳竖直（一块板、一片桁架不会立着落地）。
* 入水 / 落地 / 砸底的时刻与位置写进件表 `events`，运行时照表演水花、扬尘、闷震与钢件轰响。

节奏故意放慢（真实下落约 0.7 s）：大结构看着就该慢，而且要等火球散开一点才看得见桥身在动。

## 3. 起爆（运行时）

`Script_FirstLevelBridge`（零 three）管判定：药装好、玩家退到安全区、爆破区里一个己方都没有 →
再等玩家把脸转向桥（水平夹角 ≤ 30°，**最多 3.5 s**，不是计时器闸门：人没走净照样一直等）→
蹲在起爆器后面的爆破手压杆（记 `exploderPressed`）→ 0.45 s 后 `Fire`：
`railBridgeSet.Detonate()` 演全套；`Combat.BlastFeedback` 仍然**只调一次**（半径
`bridgeBlastRadiusM` 16：48 m 外创伤约 0.5，耳鸣伸不到安全区）；军官「往滕县！跟上前队！」挪到
起爆后 6.5 s（两个半孔都砸进河之后）。模型没装好就退回一发普通爆炸，白盒桥照样翻闸门。

`Script_RailBridgeSet` 的时间线（数值在 `RAIL_BRIDGE_BLAST`）：

| t | 发生什么 |
| --- | --- |
| 0 / 0.05 / 0.12 | 六个药包各一团火（跨中两团炮弹档 9.5 m，竖杆与支座两档小一点） |
| 0.03 | 药包下面河面掀起两根水柱（浑水灰白，14–30 m/s） |
| 0.06 | 桁架顶上 7.5 m 处最大那团火球（战车档，黑烟往上翻、不压在桥身上） |
| 0–0.1 | 钢件切断的火星雨、两岸尘环、河面水雾环；两个烟源开喷（黑烟柱 + 贴河面的土黄扬尘） |
| 0.5 | 钢梁扭弯的尖啸 |
| 1–3 | 按件表：碎件入水的水花、落岸的扬尘与按材质的撞击声、半孔砸底的水墙 / 土团 + 闷震 + 钢件轰响 |
| 1.5 起 | 断口一直烧着冒黑烟、河面扬尘 26 s、落在岸上的木件各一小堆火 |
| 0–5 | 玩家看着桥时任务 FOV 收到 0.76 倍（像目光被钉住），转开或演完慢慢放回 |

炸药包与桥上导爆索只在 18 前三步露面；起爆器与地面导线从接令到夜行军都在；夜景落位后这边的烟火全部收掉。
另外的爆炸声一声不放（爆炸声只走共用感知入口）。

### 状态只看事实

`bridgeDestroyed` 为假 → 完好；在场起爆 → 坍塌（逐件节点）→ 6 s 后换残骸合批；读档或阶段跳转
直接落在炸后 → 直接是残骸、一条特效都不重放；回跳清掉事实 → 桥自己回来。
完好桥身、桥台、残骸各合成按材质的几份：平时与炸后都不按件出 draw call；坍塌那 6 s 多约 150 个
（整帧约 1000 → 1160，实拍）。碰撞与信号生命周期一概不动：原来的桥面 / 桁架 / 钢轨 / 残骸闸门件
外观从场景里摘掉，碰撞照旧；桥台碰撞盒顶收到 `abutmentTopY` 埋进料石；河里的白盒桥墩删了。

## 4. 重建

1. 地形或桥位变了先重导地形快照：`node Taierzhuang1938/_blender/Script_ExportRailBridgeTerrain.mjs`
2. 在本任务独立的 Blender 里烘（BlenderMCP；只关自己起的实例）：

```powershell
node scripts/Script_BlenderMcp.mjs start --task RailBridge
node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path(r'<worktree>/Taierzhuang1938/_blender/Script_BuildRailBridge.py', run_name='__main__')"
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

产物：`Model/Model_RailBridge.glb`、`Model/Data_RailBridge.json`；源工程与审查渲染在
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/RailBridge/`（`RAIL_BRIDGE_SOURCE_DIR` 可改），
`RAIL_BRIDGE_RENDER=0` 跳过审查渲染。重烘之后把 `RAIL_BRIDGE_MODEL.url / dataUrl` 的 `?v=` 一起 +1。

两个导出坑（都已在运行时兜住，门禁守着）：Blender 5.1 的 glTF「场景」模式**不合并**动画，按物体
各出一段 —— 要全挂上；three 的 `LoopOnce + clampWhenFinished` 一旦摆到末帧会把动作标成暂停，
之后 `setTime` 全部失效 —— 只当采样器用、时间自己夹。

## 5. 验收

```powershell
node Taierzhuang1938/Script_RailBridgeTest.mjs          # 纯 Node：烘焙产物 + 真 GLB 真时间线 + 粒子预算
node Taierzhuang1938/Script_FirstLevelEndTest.mjs       # 18 判定（等人走净、只炸一次、只调一次感知）
node Taierzhuang1938/Script_FirstLevelSpaceTest.mjs     # 撤出折线净空、07+ 结构指纹
node Taierzhuang1938/Script_RailBridgeShots.mjs --views=safe,cover,side   # 实拍取证，出图到 _shots/RailBridge
node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-jumps --stage-from=18
```

`Script_RailBridgeShots` 在真关卡里走正常的压杆 → Fire 路径，按固定时间点从安全区 / 南岸射位 / 东南岸
三个机位出图并记 draw call、震屏、FOV；截图只留本地忽略目录，不算通关证据。
