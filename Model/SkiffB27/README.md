# B27 木船

独立可复用的战损木船资产，没有关卡布设。已验收资产保留原船型、主要侧舷破口与 **49,944 三角面 / 4 primitive / 4 材质 / 9 张内嵌 PBR**。游戏 GLB 为 7,333,052 字节，82,666 个顶点记录；源冷开、独立实体支承、逐字节复建与 16 视角真实 WebGL/鼠标交互验收全部通过。机器契约见 [Data_Asset.json](Data_Asset.json)。

原档完整保留于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/DotsAcceptance20261020/SkiffB27/Restored/Skiff_B18-B27_49944tri/`，只读使用；其中 `README_B27_交付.txt`、`Data_FinalDelivery.json` 与 `SHA256_MANIFEST.json` 记录 B18–B27 来源及历史。当前修复工程目标为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/SkiffB27Repair20261020/Scene_SkiffB27.blend`，不把 `.blend` 放入仓库。

运行坐标为米制 Y-up，长轴 Z；目标长 × 宽 × 高为 **4.6000 × 1.5283 × 1.1006 m**。船首 **−Z** 来自原始顶点实测：`BowStem` 的 Z 为 −2.3000…−1.7355 m，`TransomCap` 为 +2.0775…+2.3000 m，横艉板同在 +Z 端。

本轮配方平移 108 个既有金属钉件；独立三角交叉与实体包含检查确认全部 201 个金属连通件接合。`KeelSole` 利用原顶点调整宽度，目标越过两侧最低船板内缘 5 mm；底视与品红背景原修对照已确认两条中央透空长缝消失，不作水密性宣称。端纹沿用材质槽 3 的身份 `Material_StrandedSkiffBareInnerWood`，原槽 3 长侧面改用槽 2 `Material_StrandedSkiffWeatheredWood`，槽 3 用于选中的短断面。

`StrandedSkiffA` 的 302 个资产 mesh 保留原对象矩阵、顶点和多边形连接；地面、展示件不进游戏模型。导出逐面消费内嵌原 B27 模板并记录角点来源，保留原三角面与绕序，不使用普通重导替换作者法线/切线。源材质槽已按原运行三角来源同步，保留六张原纹理绑定。源内嵌 `Data_SkiffB27Template`、`Data_SkiffB27Correspondence`、脚本和活跃贴图，Windows 默认导出只需保存后的工程与本目录脚本。

UV 保留原运行文件与源的既有偏差，叠加源 loop 改变量；肋骨长面 UV 均匀放大 1.85 倍，选中断面采用源中的平面 UV。除龙骨外保留作者运行法线；龙骨按分段线性变形的精确 Jacobian 处理法线和切线，端纹按最终三角位置/UV 重算切线与手性并按需拆记录。龙骨源角点法线使用 Blender 5.2 原生 `FLOAT_VECTOR custom_normal`，避免实测旧 `INT16_2D` 存储产生约 0.2° 量化误差；没有新增修改器。冷开审计只核验龙骨的源/运行逆转置变形，不宣称原有全部源法线与运行法线一致。更改拓扑、端面选择或超出声明范围的法线策略时，须同步更新配方、来源映射与校验。

三套木材仍各为 Base1024 / Normal512 / ORM512，Base 用 sRGB，数据图用 Non-Color，ORM 为 R 遮蔽 / G 粗糙 / B 金属。外皮与侧纹两套原图保留；端纹母图由**内置 imagegen** 生成，提示摘要为风化船木端纹、不同生长环与纤维裂缝、中性光、无文字，再由 Blender 原生烘焙 Base/Normal/ORM。微法线从母图亮度推导，并非扫描高度；Normal/ORM 从原生 PNG 无损编码为 WebP。母图、原生烘焙和可编辑材质留在 OneDrive 工程目录。船型、损伤与端纹均按本资产作创作复原，不作具体船种、年代工艺或史料真实性、第三方授权状态宣称。

## 重建与校验

以下从本任务 worktree 根执行，预览截图和 JSON 过程报告放在忽略的 `tmp/SkiffB27/`。参数文件用 Node 写 UTF-8，避免 Windows PowerShell 的 BOM 影响 `--batch-args`。

保存后的源默认导出，不重新运行初始化、生成图片或烘焙：

```powershell
node -e "const fs=require('node:fs'),p=require('node:path');fs.mkdirSync('tmp/SkiffB27',{recursive:true});fs.writeFileSync('tmp/SkiffB27/Data_ExportArgs.json',JSON.stringify(['--source','C:/Users/Bentl/OneDrive/AI/Models/Blender/SkiffB27Repair20261020/Scene_SkiffB27.blend','--output',p.resolve('Model/SkiffB27')]));"
node scripts/Script_BlenderMcp.mjs start --batch Model/SkiffB27/Script_SkiffB27Bake.py --batch-args tmp/SkiffB27/Data_ExportArgs.json --task SkiffB27Export --json
```

批处理由统一入口登记并等待退出，不常驻 MCP。默认导出从源取坐标、UV 和内嵌资料，产出 `Model_SkiffB27.glb`、`Data_CornerProvenance.json` 与 `Data_Build.json`。需要从只读原档重做初始化时，另传 `--initialize --template <原B27 GLB> --recipe <本目录 Data_NailRepairRecipe.json> --endgrain-master <OneDrive母图> --save-source <本任务工程>`；`--source` 指向本任务的原源副本，保存到独立工程，禁止覆盖原档。

独立运行文件校验使用 Python + NumPy/Pillow，显式读取原档基线和角点来源，不调用构建器：

```powershell
python Model/SkiffB27/Script_SkiffB27Verify.py --model Model/SkiffB27/Model_SkiffB27.glb --baseline "C:/Users/Bentl/OneDrive/AI/Models/Blender/DotsAcceptance20261020/SkiffB27/Restored/Skiff_B18-B27_49944tri/B27/Model_B27.glb" --provenance Model/SkiffB27/Data_CornerProvenance.json --report tmp/SkiffB27/Data_IndependentVerify.json
```

冷开源审计另起 Blender 批处理，读取已保存源而不运行构建器，核对对象/拓扑/矩阵、使用中顶点、逐角 UV、材质、活跃 packed PBR 与龙骨法线策略：

```powershell
node -e "const fs=require('node:fs'),p=require('node:path');fs.mkdirSync('tmp/SkiffB27',{recursive:true});fs.writeFileSync('tmp/SkiffB27/Data_SourceAuditArgs.json',JSON.stringify(['--source','C:/Users/Bentl/OneDrive/AI/Models/Blender/SkiffB27Repair20261020/Scene_SkiffB27.blend','--model',p.resolve('Model/SkiffB27/Model_SkiffB27.glb'),'--provenance',p.resolve('Model/SkiffB27/Data_CornerProvenance.json'),'--report',p.resolve('tmp/SkiffB27/Data_ColdSourceAudit.json')]));"
node scripts/Script_BlenderMcp.mjs start --batch Model/SkiffB27/Script_SkiffB27SourceAudit.py --batch-args tmp/SkiffB27/Data_SourceAuditArgs.json --task SkiffB27ColdAudit --json
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

另向本地临时目录执行一次默认导出，与候选逐字节核对；不能只用同一构建日志证明可复建。使用真实 `ManagedGLTFLoader` 检查双侧、双端、底部、主要破口、所有存疑钉件与端纹，进行旋转/平移/缩放和原版切换。后台浏览器显式 `--mute-audio`，观察图长边不超过 640；原尺寸证据可以本地保留。验收网页、截图、视频及临时报告不入库。

最终源工程 SHA256：`16533064d2e6a450bebf62303d71dbbb4ea90c2a787d4ff91d33b00437739315`。GLB SHA256：`282ed4ede609a157302c4a472dbecec1240f6d4612f9c9b4d89540046cdd6b81`。独立验证零翻面、零新增近零面积；冷开源审计 60 项通过，全部 9 张活跃 packed PBR 逐角色匹配。原 1,900 个孤立源顶点与既有运行/源 UV 偏差按基线保留。

实际证据外置在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/SkiffB27Repair20261020/Acceptance`；验收页面与截图不入库。模型按固定米制独立交付，未测试或宣称浮力、水密性及关卡布设。
