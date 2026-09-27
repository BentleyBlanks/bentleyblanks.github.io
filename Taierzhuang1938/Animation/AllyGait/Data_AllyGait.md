# 第一关友军俯身蹲走与枪口向上提枪

2026-09-27 用户要求：蹲走上身不摇晃、身体前俯；护送和交谈时可以提枪。
当日复核：初版把提枪做成低位、枪口向前下方，用户指出同行与交谈时的枪口风险。
V2 将四条提枪动作改为右侧贴体、枪口约向上 84°，手腕随之重做，食指伸直离开扳机。

## 携枪参考与适用范围

- [加拿大国防部 C19 操枪手册 §11–15](https://www.canada.ca/en/services/defence/caf/military-identity-system/drill-manual/chapter-5.html)：短距离行进的 short trail 要求枪身竖直、贴近身体；该手册说明动作沿用并调整自 Lee-Enfield 操枪法。
- [美国海军陆战队 MCRP 3-01A 第三章](https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/MCRP%203-1A%20Rifle%20Marksmanship.pdf)：安全原则要求控制枪口、不指向无意射击的人或物、食指离开扳机；无立即威胁的 tactical carry 枪口上扬，alert carry 则可向下。

以上是现代操枪与枪口控制参考，不是对 1938 年国军制式动作的考证结论。
游戏这次采用单手近竖直携行，适用于近距离护送和交谈；不照搬队列正步或枪托仅离地 2 cm 的规定。
向上不等于任何环境都安全，本次验收覆盖移动、转身时的方向、枪托离地和手指姿势；不声称增加了场景动态枪口避让系统。

## 资产与重建

五条共用 TengxianHumanoidV1 的 NRA 动作：

| 动作 | 用途 |
| --- | --- |
| AllyCrouchReady | 俯身、稳住肩线的持枪蹲走 |
| AllyCrouchCarry | 右手贴体、枪口向上提枪蹲走，左臂自由 |
| AllyCarryWalk | 正常速度提枪走 |
| AllyCarryStand | 站立提枪待机 / 交谈 |
| AllyCrouchCarryStand | 停下后保持低姿提枪 |

步幅源自现有 RelaxedGait，蹲走缩短到 62%，骨盆下沉并用双腿 IK 保留原脚的滚动。
胸部采用稳定世界朝向，头部仍向前看；稳枪双臂参考 NRA02 的 KneelHold。
Blender 原身体、蒙皮和骨段长度不变。右手握住枪，左臂不再对着虚拟前握点。
JSON 是 Three.js clips，动作有独立 uuid，武器轨与身体轨一起重烘。

从本任务独占 worktree 执行：

```powershell
node Taierzhuang1938/_import/Script_AllyGaitPrepare.mjs
node scripts/Script_BlenderMcp.mjs start --task AllyCrouchCarry
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['ALLY_GAIT_PROJECT']=r'<worktree>/Taierzhuang1938'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_AllyGaitBake.py --timeout 600000
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

V2 可编辑工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/AllyGait_20260927/Upright/Scene_AllyGait.blend`；上一版保留在父目录。
原始采样和验收截图在忽略目录 `tmp/AllyGait/`，不提交。

## 播放规则

`InstallP012ActorMotion` 在背枪层安装完成后安装 `Script_AllyGait`，只作用于 NRA 共用骨架的步枪兵。
无可见威胁的走路、站立/蹲姿等候使用提枪；看见真实目标、受压制、避雷或开火时立即恢复备战，
威胁消失后保留短暂准备窗口，避免反复举放。记忆目标不要求一直端枪；剧情禁止开火时允许提枪交谈。
数值在 `Data_Tuning_AllyGait`。跑步继续使用原跑步/背枪动作。

导演动作、强制动作、卧姿、跪姿、投弹、白刃、伸手、望远镜、伤员、抬担架、空手和死亡仍拥有姿态优先级。
位移、碰撞、AI 决策和任务条件保持原有归属。步频按实际位移和各自参考速度驱动，受阻不原地踏步。
提枪时屏蔽遗留 aim 值对双臂的二次抬枪；枪跟随真实右掌，左手仍能做说话手势。

## 验收

```powershell
node Taierzhuang1938/Script_AllyGaitTest.mjs
node Taierzhuang1938/Script_AllyGaitBrowserTest.mjs
node Taierzhuang1938/Script_TestRunner.mjs --profile=prepush --domain=allyGait --fail-fast
```

纯 Node 独立采样交付曲线与真实蒙皮，检查循环、前倾、胸部稳定、脚底和骨长；浏览器用
NRA02/NRA05 的真实模型及中正式、汉阳造、三八式检查提枪、开火接管、左右视图，截图在 `tmp/AllyGait/Review`。
浏览器测试结果与截图必须实际查看，不以烘焙报告替代视觉验收。

2026-09-27 V1 既有结果（不作为 V2 枪口姿势通过的依据）：五条动作的循环、蒙皮接地与骨长通过；蹲行前倾约 16°，
完整支撑阶段脚部锚点误差小于 0.001 mm；已查看正面、侧面与三个步态相位截图。
`AllyGaitBrowserTest`、`ActorLocomotionTest`、`FirstLevelP012ActorTest`、
`FirstLevelMissionTest`、`MotionVectorContractTest`、`ModuleGraphTest`、测试注册检查通过。
`AllyGaitMissionTest` 从 06 连续走到 08 入口，07 正常南行实测 56 秒；
罗班长与三个队员都安装成功，记录 385 个提枪更新帧，开火误用提枪为 0，枪与右掌贴合。
关卡截图和 JSON 留在忽略的 `_shots/FirstLevelWhitebox0618_AllyGait` / `_shots/L1Front`。

完整 prepush 不能标为全绿：通用 `BootTest` 的 phase 1/2 报告「日军远景辨识材质未接全 count=0」，
随后到达 240 秒限时；在未修改的主检出 `3a46204d` 单独运行其原 phase 1 断言，同样复现 count=0。
这是本次确认的既有失败，未修改门禁或登记豁免。51 项静态预检查与上述专项通过。

V2 增补门禁：交付曲线和真实武器在所有采样帧、24 个朝向下均须距竖直向上不足 10°；
实际枪口高于握点至少 0.5 m，枪托离地大于 0.08 m。另拍手部近景，检查枪颈、手掌与伸直食指。
V2 本次 `AllyGaitTest`、`AllyGaitBrowserTest`、`ModuleGraphTest` 均通过；真实武器上向分量最低 0.99452（距竖直约 6°），
枪托离地最低 0.337 m，枪口高于握点至少 0.860 m。已查看正面、侧面、手部近景；开火接管及原接地门禁同时通过。
移动、任务与动作选择逻辑未在 V2 中改动；06–07 连续关卡结果仍指上面的 V1 实测。
