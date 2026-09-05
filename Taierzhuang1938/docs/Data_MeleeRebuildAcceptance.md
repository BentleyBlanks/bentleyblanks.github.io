# 白刃战重构验收

来源：[白刃战系统｜大刀与刺刀](https://app.notion.com/p/3d160335331c811e84dadd826f089013)，读取版本 2026-09-04。
本次替换旧六题 QTE 白盒。正常攻击不进入 QTE；F 是推架，所有 QTE 成功都不自动击杀。

## 工作清单
- [x] 读取 Notion 原文、建立独立 worktree
- [x] 集中规则、轻重攻击、有效距离、拨挡与推架
- [x] 站立僵持和倒地抵抗的成功、失败与恢复
- [x] 玩家、敌军和友军接同一规则
- [x] Blender MCP 独立源工程、第三人称和第一人称动作导出
- [x] 独立战斗白盒和真实输入
- [x] 白刃逻辑、真实输入与动画视觉专项验收
- [x] 正式关卡整机回归（无新增失败，既有基线见下）

发布与线上版本核验记录维护在 [Notion 验收页](https://app.notion.com/p/3d260335331c81baac5bd72139ff3061?pvs=204)。

文档未定死的伤害、距离、恢复、体力、平衡和 AI 节奏集中在 Data_MeleeCombat。
大刀或已装刺刀的长枪使用相同左/右/F 输入，卸刀恢复射击。
场景启动可以配置摆位和初始平衡，QTE 必须由真实近距离武器接触或倒地压制产生。

## 已取得的专项证据

- 21 项纯规则边界测试通过。
- 84 段全身、42 段第一人称动画采样通过；50 根全身骨骼、53 根第一人称骨骼实际接线。
- 2 武器 × 站立／倒地 × 成功／失败共 8 组真实输入通过；成功不杀敌，失败实际扣血，倒地后镜头恢复。
- 主动走位／攻击打通大刀 1v1、1v2、1v3 和刺刀 1v1；站着不动会阵亡。
- 长按／自动辅助、低血量失败死亡及重开恢复通过。
- 实际场景下拉框、开始按钮和 F 输入通过；松开 Alt 后离开面板焦点并恢复战斗输入。
- 装填中按 F 不会绕过输入限制或造成伤害。
- 正式第二关刺刀装卸、短长刺接触、弹药独立和刀身像素通过。
- 旧综合靶场射击、长刺、大刀重击、投弹、复位通过。
- Blender 保存后读取源文件确认 126 段演员动作、2 个 Scene、5 个内嵌脚本、全部纹理打包。
- 合并新版解剖手臂后重新通过 Blender MCP 烘焙；42 段第一人称动作逐帧通过可见性、6 毫米握点残差和 65 度腕关节限制。
- 源工程按仓库规则保存在 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\MeleeCombat_20260905\Scene_MeleeCombat.blend`，不提交网站仓库。
- 整机回归发现的 AI 据枪权重跳变已改为平滑退出，AiBehaviorTest 复测通过；首关装填模拟补齐近战接口后，FirstLevelP012OpeningTest 通过。
- BootStallTest 通过：单张资源挂起仍能有界完成开机。
- 七章 BootTest、完整 EditorTest、PropPcgEditorTest、DestructionEditorTest、MenuTest、VoiceTest 通过。
- 真实 QTE 全程的握点、腕关节与进度条方向检查通过；控制点连按时向左侧我方推进。最后的 MeleeQteTest、SprintMeleeTest、FirstPersonEmbodimentTest 再次通过。
- PlayTest 完成长跑，无新增红；仅命中已登记的三条历史基线：两条六十秒火力计数阈值（实测 154／120 发），以及 Esc 指针锁释放（blur／pagehide／hidden 三条释放正常）。本次没有把这些历史问题描述为已修复。
- GeoTest 通过。相关门禁按原 prepush 清单与合并后受影响部分分批执行，包含补跑的 BootStallTest。
- 合并后的 TrainLibraryTest 通过，构件库仍能正确加载和检查现有火车资产。
