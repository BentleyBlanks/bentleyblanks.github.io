# 八九式中战车乙型（馆藏外形复原）

当前交付为 **GeometryV54 / SurfaceV12**：游戏版 **417130 三角、9 材质、25 张内嵌贴图**；可编辑高源 1462012 三角、游戏源 419856 三角。运行文件 SHA-256：`b24618b4b24b922ae2b4869e1ae25ba7bc8310e5b8eb47737e1120ed584d429a`。

按用户授权作为可选资产接入。入口是「高级工具 → 构件库预览 → 模型 → 八九式中战车乙型」，选中后才加载；`Data_VehicleAssets.mjs` 的 `campaignEnabled:false` 保留当前关卡战车配置。

构件库提供「全部联动」「履带与轮组」「炮塔与主炮」「两挺机枪」「停止复位」。左右各 81 个履带节、15 个轮组保持独立节点；炮塔整周回转，主炮俯仰／后坐、两挺机枪及舱盖保留各自轴心。展示期间车体固定在展台上。

车首门打开时，车首机枪先转到避让姿态；关门后恢复独立指向。这是经过几何净空检查的展示联动，原车操作程序尚未确证。机枪止挡、演示速度、隐藏厚度和内构均为复原参数。

装甲保留 4K 底色／8K 法线／4K ORM，另有细漆膜颗粒、浅铸纹和独立反射层。材质使用标准 glTF 扩展；AO 修正只限侧观察盖及框的 ORM 红通道。无损打包核对实际 RGB，透明排气罩保留有效 RGBA。

外形采用土浦同一保存车的 2007 年照片状态，并以 2025 年多机位照片辅助；保存车配色不代表 1938 年原漆。细颗粒、铸纹、旧损和接触带材质属于推定。照片透视、局部比例和原厂尺寸仍有不确定性，本件不是扫描级复刻，也不证明八九式参加滕县城内攻城。详见 [参考契约](Data_ReferenceContract.json)、[来源](Data_References.md)及[活动部件依据](Data_ArticulationEvidence.json)。

## 重建与源工程

原工程、完整高模、原始贴图及历史版本位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank`；仓库保留游戏 GLB、参数、生成器和验收脚本。验收网页、截图及诊断只留本地忽略目录。

```powershell
node Taierzhuang1938/_blender/Script_RebuildType89MediumTank.mjs
```

此命令成对重建高／低源，再完成材质、微表面、侧盖 AO、切线保持、无损打包、源重开、实际运动及浏览器检查。结果保存在本地候选目录，供视觉复核。已有完整宏观烘焙可用 `--finish-from=<Data_Pbr...Build.json>` 继续；参数见 `--help`。

## 运行接口

```javascript
import {Type89Motion} from './Script_Type89Motion.mjs';
const path = await fetch('./Data_TrackPath.json').then(response => response.json());
const motion = new Type89Motion(gltf.scene, path);
motion.Update(deltaSeconds, leftMetersPerSecond, rightMetersPerSecond);
motion.SetPose({turretYaw:.5, mainGunPitch:.1, bowMachineGunYaw:.1, bowMachineGunPitch:.05});
motion.Reset();
```

角度为弧度，距离为米，Y-up／-Z 车头。GLB 与履带路径必须成套使用。

## 验收

```powershell
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=type89MediumTank --profile=prepush
```

最终高／低 GLB 分别复测轮轨、固定件、维护姿态及机枪／车首门运动，保留 1 毫米穿入门槛；每组轮与底盘的 210 对整周净空另有连续几何证明。源工程实际重开为 9 材质／25 张 packed 图；实际导出、材质通道及浏览器加载分别核对。证据与边界记录在 [导出验收](Data_ExportAudit.json)、[几何审查](Data_GeometryReviewV3.json)和[材质审查](Data_MaterialReview.json)。
