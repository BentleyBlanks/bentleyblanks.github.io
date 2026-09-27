# 第一关友军俯身蹲走与低位提枪

2026-09-27 用户要求：蹲走上身不摇晃、身体前俯；护送和交谈时可以单手低位提枪。

## 资产与重建

五条共用 TengxianHumanoidV1 的 NRA 动作：

| 动作 | 用途 |
| --- | --- |
| AllyCrouchReady | 俯身、稳住肩线的持枪蹲走 |
| AllyCrouchCarry | 右手低位提枪蹲走，左臂自由 |
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

可编辑工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/AllyGait_20260927/Scene_AllyGait.blend`。
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

2026-09-27 本次实测：五条动作的循环、蒙皮接地与骨长通过；蹲行前倾约 16°，
完整支撑阶段脚部锚点误差小于 0.001 mm；已查看正面、侧面与三个步态相位截图。
`AllyGaitBrowserTest`、`ActorLocomotionTest`、`FirstLevelP012ActorTest`、
`FirstLevelMissionTest`、`MotionVectorContractTest`、`ModuleGraphTest`、测试注册检查通过。
`AllyGaitMissionTest` 从 06 连续走到 08 入口，07 正常南行实测 56 秒；
罗班长与三个队员都安装成功，记录 385 个提枪更新帧，开火误用提枪为 0，枪与右掌贴合。
关卡截图和 JSON 留在忽略的 `_shots/FirstLevelWhitebox0618_AllyGait` / `_shots/L1Front`。

完整 prepush 不能标为全绿：通用 `BootTest` 的 phase 1/2 报告「日军远景辨识材质未接全 count=0」，
随后到达 240 秒限时；在未修改的主检出 `3a46204d` 单独运行其原 phase 1 断言，同样复现 count=0。
这是本次确认的既有失败，未修改门禁或登记豁免。51 项静态预检查与上述专项通过。
