# 九二式重机枪外观复原

游戏内资产为 `Type92Hmg`。沿用已经进入项目的 CadNav.com 派生成品作底稿。枪身与三脚架转正，清除悬空展示件，补另一前脚并调平脚掌，重新制作前端剪影和机匣开口的遮光面。钢件、脚架和木柄分别烘焙材质。枪口朝局部 -Z，七个原节点的坐标和轴向沿用原导出。成品总长 1.156 m，19,514 个三角面，单材质批次。

| 资料 | 可对照的外观 |
| --- | --- |
| [RELAWM28834.001 枪体](https://www.awm.gov.au/collection/C310665) | 枪身侧面、两段散热片的疏密与粗细、前端侧影。目录称缺少锥形件，侧照末端仍有外凸轮廓。外凸部分的身份待查，游戏据照片保留外观。 |
| [RELAWM28834.002 配套三脚架](https://www.awm.gov.au/collection/C310666) | 馆方说明这件脚架配上条枪体。以照片核对钢制支腿、脚掌与上部支座，游戏保留原脚架支点位置。 |
| [REL/02167 枪体](https://www.awm.gov.au/collection/C235837) 与 [026540 档案照](https://www.awm.gov.au/collection/C10174) | 属于另一件藏品。馆方将其与 1942 年 9 月 7 日在米尔恩湾拍摄的后侧照对应，可对照后部木柄和脚架。黑白照片支持形态，钢色和木质另参照馆藏目录。 |

被遮挡的细节、光泽、木色、磨损和色彩层次为游戏美术复原。以上照片无法确认 1938 年滕县战场出现的具体批次和单件外观。

## 钢面近景校色

在枪械检查台沿用统一白天布光，用同机位复查翻修前后的九二式，再用同一环境下的汉阳造 173R 作质感基准。彩图用于校对冷灰发蓝钢与偏暖脚架的区别。米尔恩湾黑白照用于比对机匣暗面、散热片亮边和导轨棱口在斜光下的层次。

旧底稿的机匣两翼大面朝内。重算法线后，镜头看到的是受光的外壳，内部遮光层继续压住接缝。有代表性的长棱做实体倒角，机匣上沿及前接圈分别校准光泽。加工细纹单独进入浅法线，粗糙度以宽阔平面的发蓝层、导轨的细长高光以及脚架的斑驳反光为区分。机匣两侧的外向面检测已加入 Blender 源工程重建。第一人称通过独立的粗糙度和法线幅度校准压住大块粗斑，仍使用同一套贴图和局部反射。正式游戏里沿用原包围盒、七个挂点和同一材质批次。

## 本机重建

可编辑工程默认在 `OneDrive/AI/Models/Blender/Taierzhuang1938/Type92Hmg/SteelFinish_20261128/Model_Type92HmgExterior.blend`，原始 PNG 在相邻的 `Bakes` 下。`TZ1938_TYPE92_HMG_SOURCE` 可指定该工程所在目录。从仓库根目录执行：

```powershell
node scripts/Script_BlenderMcp.mjs start --task Type92HmgExterior
node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path('Taierzhuang1938/_blender/Script_Type92HmgExteriorBake.py')['Bake']()"
node scripts/Script_BlenderMcp.mjs exec --code "import runpy, sys; sys.argv=['BuildAll.py','--','--only','Type92Hmg']; runpy.run_path('Taierzhuang1938/_blender/BuildAll.py',run_name='__main__')"
python Taierzhuang1938/_import/Script_PackageType92HmgExterior.py
node scripts/Script_BlenderMcp.mjs stop
```

第一条 `exec` 从已登记哈希的原 TZM 重建编辑工程。使用手工编辑过的工程时直接运行第二条 `exec` 导出。手工编辑材质后，先从同一 UV 重烘 PNG，再打包RGB 贴图。1K 基色为 sRGB，1K 切线法线与 512 ORM 走线性采样。ORM 依次保存 AO、粗糙度、金属度。

本机枪械检查台入口为 `/Taierzhuang1938/AdvancedTools/Tool_WeaponInspection.html`。版权说明见 [资产来源与许可](../_import/Data_SourceLicenses.md)。
