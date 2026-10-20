# Sichuan Blanket Pack — V9 Reference Wear

V8 的实际视觉被用户否决：布料与附件旧化不协调，草席卷与草鞋仍偏离第二版参考。本轮继续高模细化，当前未进行游戏减面，也未覆盖历史 V6 GLB。

## Source

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV9/Scene_SichuanPackReferenceWearV9.blend`

V7/V8 源工程保留。米制、贴背平面与居中轴心、独立席卷/草鞋/短褂部件组继续沿用。Blender 原生 Z-up；最终 glTF 的 Y-up 转换及低模烘焙尚待进行。

## Construction

- 内置 imagegen 根据已确认的第二版参考生成整幅旧棉布材质。唯一 38×30 cm 布面直接使用整图，不再把大污渍抹平后反复平铺。其宽范围汗泥、洗白和不规则旧纤维保留；法线只由高频纤维技术衍生。
- 补丁从实际被包/前布层表面拟合。首次冻结现有可见形态，删除旧补丁时校验保留顶点坐标与 UV 附着哈希；另建约 53.5×54 mm 薄补片、28 针疏密不齐的粗手缝及两处线头。
- 布带、草编和靛蓝短褂使用同一哑光尘土范围，脏污坐标随独立部件移动。布带有局部磨白与折痕，避免均匀炭黑带与亮白被面之间的过强反差。
- 草席使用真实卷片与交压扁草束，端面由短而挤压不齐的粗草束覆盖，不使用光滑连续宽带切面。草鞋采用杯状鞋底、圆卷粗边和压实不齐的草束，鞋长缩短 14%，纤维深浅与局部磨白分开。可见稀疏纤维分别附着原部件，隐藏或抽出原件时跟随。
- 布纽扣向外移到短褂表面之外，避免原先被衣角遮成一个小黑点；原布结与扣眼局部加宽 22%、加高 45%，提高洗旧靛蓝的可读性。

棉布源：[生成提示](Data_OldCottonV09Prompt.txt)、[PBR 来源与哈希](Data_SichuanOldCottonV09.json)。三张技术图均为 1024，独立源图保存在上述资产工程的 `Source/MaterialAtlasV09/`。

## Rebuild

```powershell
py Taierzhuang1938/_import/Script_SichuanOldCottonV9.py --source C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/Source/MaterialAtlasV09/Image_SichuanOldCottonV09.png --output Taierzhuang1938/Model/SichuanBlanketPack
node scripts/Script_BlenderMcp.mjs start C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV8/Scene_SichuanPackStrawWearV8.blend --task SichuanBlanketPack
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_SichuanPackReferenceWearV9.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

构建入口只修改本任务工程，保存到新 V9 文件，打包材质图及对应脚本文本。实际 Blender 渲染、参考对照和源工程检查报告留在忽略目录 `tmp/SichuanBlanketPack/Review/`。技术检查通过不能代替视觉确认。

尚未最终确认视觉效果；高模三角数不作为原始 ≤3000 游戏目标的达成证据，游戏减面与最终 1024 PBR 转移仍未完成。

独立实渲复核确认：布面/灰带旧化关系、草鞋格栅感与偏长比例、草席连续大 V 和纸带端面均有实质改善。端面局部暗缝及粗束形态仍与生成参考存在差异，因此本记录不宣称外观完全一致，也不以技术检查替代用户最终视觉判断。
