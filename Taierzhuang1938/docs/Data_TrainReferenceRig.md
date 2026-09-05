# 火车参考模型与轮轨运动

现状：独立模型资产包（细化第二版），位于 `Model/TrainReference/`。源于「提取火车样式并做三视图」任务的两张已生成参考图，保留灰褐横向木板双轴敞车与黑色蒸汽货运机车外观。机车按图中实际可见的一组导轮、五组动轮建模；参考图本身是推定设计，不代表考证确认的机车型号。原参考没有煤水车，本包对应车头本体与敞车。

- 验收网页、截图、渲染图和视频只保存在本地 `_review/` / `_shots/`，不提交、不部署到 github.io。此前的验收页与视频已从当前版本移除；这不改写历史提交。
- [Blender 源工程](../Model/TrainReference/Scene_TrainReferenceRig.blend)：两模型、独立轮轴与连杆、已打包的参考图和材质、摄影灯光、动作时间轴。
- [车头 GLB](../Model/TrainReference/Model_LocomotiveRig.glb) / [车厢 GLB](../Model/TrainReference/Model_GondolaRig.glb)。
- 这一版补充铸造轮辐、工字截面连杆与油杯、板簧夹具、给水/空气管路、空气泵、汽缸压盖与排水阀、驾驶室窗框和通风盖；车厢补充槽钢立柱、铰链、轴箱导架与制动拉杆。

## 机械契约

单位为米，模型局部 **+X 为前进**。Blender Z 向上、轮轴沿 Y；glTF Y 向上、轮轴沿 -Z。不能直接套人物模型的 -Z 朝向。

唯一输入是根对象自定义属性 `TravelMeters`，表示有符号累计路径距离。每个车轮按自身 `WheelRadiusMeters` 计算转角：`angle = distance / radius + phase`。轮箍、轮辐、曲柄销和配重随轮轴转动，轴箱、板簧、制动吊架保持在车架上。

机车每侧动轮曲柄同相，对侧相差 90°。连结杆以轮距为固定长度平移；主连杆用曲柄滑块的精确几何解，滑块受直线导轨约束，连杆不伸缩。轮箍接触轨顶，内侧轮缘不用于计算滚动半径。曲柄错位依据 [E. L. Ahrons《Steam Locomotive Construction and Maintenance》第六章](https://en.wikisource.org/wiki/Steam_Locomotive_Construction_and_Maintenance/Chapter_VI)。

另有两侧回动曲柄、偏心杆、摇杆、半径杆和阀杆：采用固定设置的简化外部机构，以圆交点求解四连杆，再解水平阀杆滑块。每个杆件长度固定，接点闭合；并非完整 Walschaerts 配气装置，也不提供可变截汽率或组合杆的提前量。简化结构参考 [模型工程师 Gerv Wright 的设计说明](https://www.yorkshire.16mm.org.uk/models/simplified-walschaerts-valve-gear-for-16mm-locos/)；完整部件关系对照 [L. V. Ludy 教材所载示意图](https://trumpetb.net/loco/wdiagram.html)。

这是直线轮轨运动和主要外露传动机构的视觉绑定。没有实现完整蒸汽配气过程、转向架或真实轮轨/悬挂物理。原参考图中的不一致连杆走向已按可运动结构纠正。汽缸与导轮留有横向间隙，活塞杆的前端在整个行程内保留在汽缸内部。

## 游戏使用

GLB 保留机械轴心，导出的是静止初始姿态。Blender 驱动器不会自动成为 glTF 动画，因此不能只加载 GLB 就期待车轮自行转动。

```js
import { CreateTrainRig } from './Model/TrainReference/Script_TrainRig.mjs';
const rig = CreateTrainRig(gltf.scene, manifest); // Data_TrainRig.json
// Every update: place the root on the path, then set accumulated signed metres.
gltf.scene.position.copy(pathPosition);
gltf.scene.quaternion.copy(pathOrientation); // local +X follows tangent
rig.SetTravelMeters(signedDistanceMeters);
```

暂停时保持距离，倒车时减小距离。避免用总时间乘当前速度，否则变速会跳相；避免按帧固定角度累加。导入时保持统一比例；若缩放模型，距离必须换算到资产局部单位。当前资产包单独验收，不依赖战役关卡布景或角色流程。正式布景接入时静态部分仍应遵循 BuildSink 合批规则，机械层保留运动节点。

Blender 中选择 `Model_LocomotiveRoot` / `Model_GondolaRoot`，自定义属性 `TravelMeters` 控制平移和机械运动。时间轴已安排前进、停车、倒车、停车；手调该属性前请取消对应动作的关键帧影响。参考图位于默认隐藏的 `Scene_References` 集合。

## ImageGen PBR 材质

`Texture_TrainWoodAlbedo.png` 与 `Texture_TrainIronAlbedo.png` 由第一级 Codex CLI 内置 `image_gen__imagegen` 生成，原始贴图像素未重绘。第二版在材质层用六组 glTF `baseColorFactor` 调整木板色调，并修正旧铁 UV 的物理尺度；这些参数同时存在于 Blender 与导出材质中。提示词强调无方向光、无阴影、无构件接缝的可平铺材质。原始生成参数和 SHA256 见 `Data_TrainPbr.json` 与 `Data_ImagePrompts.txt`。

法线、粗糙度、金属度与高度是从相同基础色表面特征推导的微表面数据，不是实测扫描。木材金属度为零；旧铁的氧化处降低金属度并提高粗糙度。实际使用的基础色、法线和 ORM 已打包进 Blender 与 GLB；未连接的 Height 图单独保留，不宣称已嵌入导出文件：

| 后缀 | 通道与色彩空间 |
| --- | --- |
| `Albedo` | RGB 基础色，sRGB |
| `Normal` | OpenGL / +Y 切线法线，Non-Color |
| `Orm` | R=1（不烘全局 AO），G=粗糙度，B=金属度，Non-Color |
| `Height` | 推定微表面高度，Non-Color；供调整使用，不启用位移 |

## 重建与验证

使用独立 BlenderMCP 工程，先确认当前文件确实是本包的 `Scene_TrainReferenceRig.blend`。按顺序执行本目录的 `Script_BuildTrainReference.py`（内部执行 `Script_DetailTrainReference.py`）、`Script_FinishTrainMaterials.py`、`Script_VerifyTrainRig.py`、`Script_ExportTrainReference.py`。建模脚本会重建这个专用工程，不应在其他工作文件中执行。

游戏导出验证：

```text
node Taierzhuang1938/Model/TrainReference/Script_VerifyTrainExport.mjs
```

默认验证不依赖任何已提交的验收网页，会在被忽略的 `_shots/TrainReference/` 创建最小测试场景。已有本地交互页时可加 `--local-review --video`，帧图仍只写本地；MP4 输出也必须位于 `_review/`。

脚本使用仓库 BrowserTestKit 与 ServeRoot，检查导出后的节点矩阵、固定连杆长度、接点、轮轨接触点运动、正反向距离、WebGL 错误以及手机横向溢出。输出 `Data_TrainRigValidation.json` 与 `Data_TrainExportValidation.json`。三角面数量和节点名单以 `Data_TrainRig.json` 为准。第二版车头 78,348、车厢 32,269 三角面；16 个车轮、10 根主要连杆、两组简化阀杆机构、84 个有效 Blender 驱动器。源工程验证 248 个距离样本，GLB 验证 241 个距离样本。
