# IjaAlertGait：日军先头兵警戒持枪小跑

2026-09-27 用户反馈：01 开场镜头里日军先头兵（日兵甲、乙）走过来手里不拿枪——09-26 那轮把他们改成了背枪放松走（`RelaxedGait` 的 `"slung"`）。刚炮击过的敌方战壕，先头兵至少要提着枪、站直了小跑、高度警戒。

## 资产

`Animation_TengxianIjaAlertGait.json`：三条 three.js clip，绑定 TengxianHumanoidV1 共用骨架（七套 Tengxian 模型都能播），在 IJA01 上用 BlenderMCP 烘焙。

| 动作 | 腿（源循环） | 长度 | 参考速度 |
| --- | --- | --- | --- |
| IjaAlertTrot | `BackRifleRun` 小跑 ×4 循环 | 2.93 s | 2.6 m/s |
| IjaAlertWalk | `RelaxedWalk` ×3 循环 | 3.24 s | 1.35 m/s |
| IjaAlertStand | `RelaxedStand` | 4 s | — |

- 上身：胸口站直、不随骨盆摇（前倾约 1°），整体略向右侧身 8.6°（左肩前送才够得着护木），头不跟着侧身。
- 持枪：腰际低位——右手握枪颈在右胯前、枪托抵胯，左手托护木，两手握点相距 0.26 m；枪身向前偏左、枪口朝下 6–8°。手型取日兵乙 `IjaGuardPort` 相对枪身的握法，每只手在自己握点上单独映射，再用两骨 IK 解臂（肘向外后/向下）。IK 从持枪基准臂起解：从源动作摆臂起解会沿用摆臂的扭转，袖子每步拧四分之一圈（初版实测前臂循环内转 1.24 rad，修后 < 0.08）。
- 警戒：头左右各扫 38°（两端停一下），胸带 30%，枪跟着胸转——枪口跟着视线走。一次扫视跨整条 clip，所以一条 clip 是多个腿循环，接触区间按循环重复。
- 小跑保留腾空段：整条只做一次常量贴地（最低鞋底 4 mm，腾空时离地到 70 mm）；走和站逐帧贴地。
- 恒定轨（除骨盆外所有骨头的位移、手指等）只存一帧，数值保留 5 位，文件 275 KB；只有第一次有人被设成 `"alert"` 才加载。

## 生成

```powershell
node Taierzhuang1938/_import/Script_IjaAlertGaitPrepare.mjs
node scripts/Script_BlenderMcp.mjs start --task IjaAlertGait
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['IJA_ALERT_PROJECT']=r'<worktree>/Taierzhuang1938'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_IjaAlertGaitBake.py --timeout 600000
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

Prepare 把源动作（`BackRifleRun` GLB、`RelaxedGait` JSON）和 `IjaGuardPort` 第 0 帧采到 IJA01 的世界矩阵，写进忽略目录 `tmp/IjaAlertGait/`。烘焙沿用 `Script_MachineGunCaptivesBake.Bake` 的 probe（导入、IK、源帧导出），可调数在脚本顶部（`GRIP_R` `BARREL` `GRIP_SPAN` `BODY_BIAS` `SCAN_DEG` …）；`IJA_ALERT_ONLY=<clipId>` 只试一条、不写文件。每条输出实测：贴地、前倾、握距、枪身俯仰、两臂超伸倍数（必须为 0）。

可编辑工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IjaAlertGait_20260927/Scene_IjaAlertGait.blend`。

## 运行时

`Script_RelaxedGait` 的第三种模式：`SetRelaxedGait(soldier, "alert")`。与 `"slung"` 同一套替换规则（开火、蹲卧、搬运、白刃等不替换）：移动时 `RifleRun` → `IjaAlertWalk` / `IjaAlertTrot`（走/跑切换带同 `RELAXED_GAIT`），站着 `AdvanceFire` → `IjaAlertStand`；手里的枪照常显示，由原生两手挂点摆（右握点定位、朝左握点定向）。动作还没加载到时保持原来的端枪选择。

唯一消费方：01 开场导演 `WalkIn`。日兵甲、乙以 `speed.trot` 2.4 m/s 小跑入场；到拖人站位后倒放 `IjaReadyRifle`（端枪 → 背枪，1.1 s）把枪甩上背，再切 `"slung"` 放松站等拖人——拖人、抓领的动作本来就是背枪武器轨。FrontPass 超时强制到位时直接切 `"slung"`。

## 验收

```powershell
node Taierzhuang1938/Script_IjaAlertGaitTest.mjs
```

纯 Node：三条动作无缝循环；两臂零超伸且循环内各关节转角 < 0.15 rad；枪口朝前下（0…−15°）；头有扫视；前倾 < 8°；小跑腾空、走站贴地；接触区间逐循环；七套模型都能绑；运行时加载的版本号与烘焙一致；导演 `WalkIn` 用 `"alert"` + `trot` 且到位甩枪。

2026-09-27 实拍（`Script_OpeningStoryboardShots.mjs --plan`，真实流程、不跳阶段，自定机位）：Wake 到 FrontPass 甲乙全程双手持枪站直小跑、头在扫视；侧面枪平端腰前、枪口朝前微下；正面右手握枪颈、枪托抵右胯；到位后甲在 FrontPass 4.3–5.4 s 甩枪上背，乙晚约 1.5 s，拖人开始时两人枪都在背上，没有双枪或凭空消失。截图在忽略目录 `tmp/IjaAlertGait/`。
