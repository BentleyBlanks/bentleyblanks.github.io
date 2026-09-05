# 白刃战系统｜大刀与刺刀

依据 [Notion 原设计](https://app.notion.com/p/3d160335331c811e84dadd826f089013)，读取版本 2026-09-04。2026-09-05 重构替换旧六套格挡／处决小游戏，旧处决规则已移除。

## 输入与普通战斗

- 左键点按：轻击；按住至少 0.38 秒后松开：重击。V 保留相同快捷输入。
- 右键：0.25 秒瞬时拨挡，随后 0.34 秒收招。按住不延长窗口，一次只能拨开一名对手；成功后敌人失势，玩家需要自行走位和攻击。
- F：仅在贴身、正面、有视线时压枪、推架，0.16 秒接触才产生位移与失衡，普通伤害为零。F 不处决，不因敌人残血获得特殊击杀。
- 大刀短程斜斩交替，重击宽而慢；刺刀短刺射程更长，重刺前跨一步，落空／被拨开有完整恢复。伤害只在有效接触时结算，一次攻击一次伤害；隔墙、背面、过远或过近均不能凭按键伤人。
- 已装刺刀的长枪，无论弹药是否为空，都使用左／右／F 的白刃输入。X 卸刀恢复射击／开镜。攻击恢复或 QTE 中不能靠换槽、装卸、装填取消惩罚。

## 两种真实触发的抵抗

站立僵持：近距离双方重击相撞，或重击撞上已蓄起的硬架，才进入武器争夺。普通刺刀命中、成功拨挡、低血量都不会自动触发 QTE。

倒地抵抗：玩家已经因平衡耗尽、近身撞击或爆炸而倒地，对手走近压制才触发。不是按 F 主动进入的处决。镜头随倒地降至约 0.28 米，对手在上方压枪，双臂震颤、枪尖下压、心跳随失势加急。

两者均重复按 F 争夺进度；我方位于进度条左端，敌方位于右端，连按使控制点向左移动，不按持续向敌方回落。3 次／秒不足以维持，5 次／秒可推进，7 次／秒达到有效上限，更多输入不增益。长按键盘自动重复不算连击；提供长按 F 和自动抵抗两档辅助，等效 6 次／秒，不改变触发与结果。

成功只推开仍活着的对手，站立恢复自由战斗，倒地经过起身恢复。失败造成受伤／失衡，低平衡可能再次倒地；伤害经现有 Player.TakeHit、出血与阵亡接管系统。测试场阵亡后停留，手动重开恢复。QTE 保持真实时间，无慢动作放大窗口。

## 独立白盒

入口 `?melee=1` 或主菜单「白刃战 · 大刀与刺刀」。14 个互相重置的项目：

| 项目 | 目的 |
| --- | --- |
| 大刀一对一／二／三 | 跨过刺刀距离、拨挡、自由走位与多敌夹击 |
| 刺刀一对一／二 | 同类兵器的短刺、长刺与恢复 |
| 大刀／刺刀贴身推架 | 独立验证 F 无伤害、推开和失衡 |
| 大刀／刺刀站立僵持 | 真实硬架产生 QTE，成功／失败后续 |
| 大刀／刺刀倒地抵抗 | 低初始平衡、敌人撞倒后接近压制 |
| 友军大刀／刺刀 | 友军与日军使用同一攻击、防守、伤害和动画 |
| 瞬时拨挡时机 | 敌人可读的重刺起手，验证早／准／迟拨挡 |

按住 Alt 释放鼠标操作面板。面板提供开始／重开、暂停对手、动作播放／逐帧、生命／体力／平衡／距离／最近事件。只有开局摆位与初始平衡是实验配置；战斗与 QTE 由正式规则驱动。

## 代码与动画源

- `Data_MeleeCombat.mjs`：集中时序、距离、伤害、体力、平衡、QTE 和场景配置。Notion 未指定的具体数值是本次可调白盒参数。
- `Script_MeleeCombat.mjs`：玩家／敌军／友军共同的纯规则状态机，依赖宿主提供物理、视线、伤害。
- `Script_MeleeQte.mjs`：两类 F 抵抗、速率封顶、辅助输入、结果；不调用 Kill。
- `Script_Main.mjs`、`Script_Ai.mjs`：真实输入、移动、生命系统和演员桥接。
- `Script_MeleeAnimation.mjs`：Blender 采样的全身动画重定向及第一人称动作载体。
- `Script_MeleeLab.mjs`：实验面板。`Data_MeleeQte.mjs` 仅保留旧关卡 id 对应的新入口。
- Blender 源工程：`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\MeleeCombat_20260905\Scene_MeleeCombat.blend`，按仓库约定仅存本地。实际国军／日军蒙皮、第一人称双臂及真实武器几何，共 126 段演员动作；游戏仓库只提交烘焙数据与重建脚本。

两种武器各 21 动作：Guard、Advance、Retreat、Light、LightAlt、Charge、Heavy、Parry、Deflected、Push、Pushed、Hit、Bind、BindWin、BindLose、Fall、Ground、GroundWin、GroundLose、Pressure、Rise。国军／日军各 42 段全身，第一人称 42 段，31 个采样帧。全身每帧 50 根骨骼；第一人称源动作包含 53 根骨骼、武器与可编辑载体轨道。

在 Blender 的 Text Editor 运行内嵌 `Script_MeleeLibrary.py`，3D 视图侧栏 Melee 选择对象、武器、动作，空格播放，时间轴逐帧检查。源文件包含全身检查和第一人称检查两个 Scene，纹理已打包。

每次 Blender MCP 调用先设置 `MELEE_PROJECT_ROOT` 为当前检出的 `Taierzhuang1938` 绝对路径。运行 `_blender/Script_MeleeAnimationBake.py`，分别设置 MELEE_FACTION=Nra/Ija，导出两份 Data_Melee*Animations.mjs。可用 MELEE_ACTIONS 列表只重烘选中动作。运行 `node Taierzhuang1938/Script_MeleeAnimationTest.mjs --bakefp` 采集实际生产握持 IK；再通过 Blender MCP 分别设置 MELEE_WEAPON=Dadao/Bayonet 运行 Script_MeleeFirstPersonBake.py，最后运行 Script_MeleeStudio.py 更新武器轨道、动作面板和打包源工程。脚本会恢复标准原点，检查摄影棚摆位不进入运行时采样。

第一人称使用当前生产版解剖手臂模型与握持 IK，刺刀载体为新版掌腕位置预留空间。倒地低镜头期间隐藏尚无仰卧动作的第一人称躯干，避免站立外套遮住低机位；起身恢复后继续使用正常低头身体与空手动作。

## 验证

`Script_MeleeCombatTest.mjs` 检查规则边界、距离、遮挡、时机、F、QTE 速率／结果、多人拨挡和取消闸门。
`Script_MeleeQteTest.mjs` 用真实输入检查接触、八组 QTE 结果、独立战斗、主动打法及可见演员／手臂，截图在 `_shots/Scene_Melee*.png`。
`Script_MeleeAnimationTest.mjs` 检查 84 段全身数据、42 段第一人称实际握持、50 根重定向骨骼、画面内手臂；逐帧锁定握点残差不超过 6 毫米、腕关节不超过 65 度。
正式关卡装卸／输入接线用 `Script_BayonetTest.mjs`，冲刺挥刀用 `Script_SprintMeleeTest.mjs`。发布前按 `Script_TestRunner.mjs --profile=prepush --changed=origin/master` 执行风险门禁。
