# 刺刀装配与白刃接线

2026-09-05 起，大刀与已装刺刀长枪的战斗采用 [通用白刃规则](Data_MeleeQte.md)，旧大刀 260 伤害、cut／thrust 即时判定与处决 QTE 不再是运行时白刃规则。

## 装配契约

中正式、汉阳造、三八式配备独立刺刀模型。其他武器不凭空增加刺刀座。数据来自 Data_Weapons.WEAPONS 的 bayonet、bayonetLengthM 与 bayonetTotalM。X 装／卸保留 0.95 秒动作与中段声音，装后刀常显，收招不藏刀；换槽保留装配状态，换关／捡枪按原装备规则重置。

Model/BayonetZhongZheng.tzm.json、BayonetHanYang.tzm.json、BayonetType38.tzm.json 独立建模，通过 socket 对齐枪口挂点。历史尺寸、模型许可仍见 _import/Data_SourceLicenses.md 及 _blender/ImportBayonets.py。不得为了动画任意缩放兵器。

第一人称通过 Script_Viewmodel._BuildBayonetProp 挂载真实刀件。第三人称共读 Soldier.bayonetFixed，weaponR／weaponL 握持挂点驱动枪线；高档用真实模型，低档保留刀片回退。没有显式装刀时不能因枪有 bayonet 属性就显示刀。

## 输入与参数

已装刺刀时左键点按短刺、蓄力松开长刺，右键瞬时拨挡，F 近身推架；有弹和空弹一致。V 为相同的攻击快捷键。X 卸刀才恢复射击与开镜。未装刺刀的枪托动作继续采用原有近战回退，不参与刀枪 QTE。

| 武器／动作 | 伤害 | 距离 | 起手／有效／恢复（秒） |
| --- | --- | --- | --- |
| 大刀轻击 | 52 | 1.58 m | .17／.13／.35 |
| 大刀重击 | 115 | 1.78 m | .32／.18／.86 |
| 刺刀短刺 | 50 | 2.16 m | .21／.12／.36 |
| 刺刀长刺 | 110 | 2.65 m | .35／.16／.92 |

以上为白盒可调参数，唯一入口 Data_MeleeCombat；重击需先蓄力 .38 秒，刺刀长刺前跨 .42 米。普通命中才扣血，落空完整收招，被拨开进入失势。F 永远没有普通伤害。

## 显示与动画

上刀后的持枪预备继续使用 BAYONET_CARRY，让细长刀身离开枪管剪影；枪身真实长度、近裁面和手臂握持补偿仍生效。攻击、拨挡、推架和挣扎采用新 Blender 动作，不再使用旧 cut／thrust 轨迹。镜头和 UI 不能以枪件 visible=true 代替实际可见性验证。

源工程、动作列表、烘焙顺序和 QTE 契约见 Data_MeleeQte.md。工程使用生产武器几何与现有骨骼，第一人称动画载体经过生产握持 IK 烘焙。

## 回归

- Script_BayonetTest.mjs：正式第二关装卸、长短刺、弹药独立、接触才伤害、换槽保留、刀身像素。
- Script_MeleeCombatTest.mjs／Script_MeleeQteTest.mjs：共用规则与真实白盒输入。
- Script_MeleeAnimationTest.mjs：源数据、蒙皮骨骼与第一人称可见性。
- Script_SprintMeleeTest.mjs：冲刺挥刀后恢复；Script_AdsSightTest.mjs：卸刀后的正常瞄具契约。

刀身像素用同姿态红／绿两拍作差，消除背景、曝光与泛光，不能退回依赖场景亮度的固定色键。
