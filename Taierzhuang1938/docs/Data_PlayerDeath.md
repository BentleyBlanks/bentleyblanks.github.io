# 玩家阵亡演出

2026-09-23：第一人称沿中弹当帧的机位与手部姿势接入倒地，先失去支撑、枪与手臂下垂，再侧倒触地、轻微回弹停稳。站姿约 1.3 秒，低姿态按眼高缩短；停稳后才淡入阵亡选项，过渡中隐藏的按钮不接受键盘、鼠标或调试激活。景深也延后到触地前后，不提前遮住动作。

共用入口为 `Script_PlayerDeath.mjs`，时序与幅度只在 `Data_Tuning_PlayerDeath.mjs`。`PlayerController.Kill` 捕获真实相机；`Viewmodel.BeginDeath/UpdateDeath` 驱动现有武器与手臂 IK，不生成第二套模型或改变伤害规则。摄像机沿共享 `GroundProbe/GroundHeight` 支撑面落地，横向射线阻止穿墙，墙边仍允许向下落。最后姿势保持，不循环、漂移或反复回弹。

第一关失败时只推进死亡演出，任务、AI、物资与世界时钟继续冻结。触地音效只播放一次。开场的闭眼遮罩和隐藏第一人称手部的演出接管在玩家死亡后退出，防止阵亡画面被开场黑屏盖住。检查点、换枪、重开通过原有入口清除临时姿态。关键队友死亡但玩家存活仍显示普通任务失败，不播放玩家倒地。

验收入口：

- `Script_PlayerDeathTest.mjs`：站/蹲/卧、上下看、左右倒、平地/斜坡/结构台面/墙边共 72 组；死亡首帧连续、接地、终帧保持、不同帧率一致。
- `Script_DeathMenuTest.mjs`：真实第一关致死链、逐帧画面、手臂与步枪下垂、菜单延后、独立冻结、检查点与键盘恢复、蹲卧触地、队友失败与桌面/竖屏菜单。
- `Script_DeathViewTest.mjs`：旧切片死亡卡、低机位、景深与收枪回归。
- `Script_FirstPersonEmbodimentTest.mjs`、`Script_MotionVectorContractTest.mjs`：原手臂握持和渲染契约。

截图与报告留在忽略目录 `_shots/DeathMenu/`，属于定向死亡夹具，不作为整关通关记录。
