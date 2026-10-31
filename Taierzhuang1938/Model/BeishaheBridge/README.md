# 北沙河铁路桥模块

用户已确认V52外观。本目录将它拆为可重复拼接的部件，材质与几何保持原样。没有确认1938年北沙河原桥照片，史实与设计边界仍见[资产说明](../../docs/Data_BeishaheBridge.md)。

| 文件 | 使用方式 |
| --- | --- |
| `Model_BeishaheBridgeSpan.glb` | 一个20米支承轴距的完整单跨，含钢桁、桥面、轨道、扣件和两端支座。保留14组既有木板／枕木组合场景。 |
| `Model_BeishaheBridgePier.glb` | 一个中间桥墩，含墩身、潮痕、墩帽、旧刷层和补刷，保留13组既有场景。 |
| `Model_BeishaheBridgeJoint.glb` | 一处跨界的桥板、护木与轨道接头，保留13处既有组合场景；与桥墩同位放置一次。 |
| `Model_BeishaheBridgeAbutment.glb` | 两端桥台，`scenes[0]`朝北、`scenes[1]`朝南，含翼墙与各自维护痕迹。 |

每个文件的默认 `gltf.scene` 只显示一个部件。其余 `gltf.scenes` 是可选变体，不能全部加入场景；同类变体共享文件内的几何和贴图。GLB均自包含，复制四个文件和JSON清单即可使用；原始PBR烘焙图仍在项目 `Texture/`，无需另行复制来打开GLB。

轴向为局部X横桥、Y向上、Z沿桥。统一单位米、缩放1。部件原点均为本跨中心或本支承轴处的枕木顶基准Y=0；这不是墩底或桥面板顶。单跨两个拼接点为 `(0,0,-10)` 与 `(0,0,10)`，**按20米轴距复制，不按几何包围盒长度复制**。结构伸缩缝、钢轨接缝与跨界短桥板已包含在设计内。

例如双跨：两个Span中心Z取−10、+10；中间Pier与Joint各放一个，Z=0；北桥台Z=−20，南桥台Z=+20。支座已随Span提供，不在Pier或Joint上重复。整体可再旋转或平移；不要对部件非均匀缩放。

```js
import { LoadBeishaheBridgeKit } from './Script_BeishaheBridgeKit.mjs';

// loader使用项目既有ManagedGLTFLoader。
const kit = await LoadBeishaheBridgeKit(loader);
const bridge = kit.Assemble(2); // 跨数可变，原14跨的装配为Assemble(14)
scene.add(bridge);

// 只取单跨：加载时第三参数可传['Span']，避免请求其他三类资产。
const span = kit.Create('Span', 0);
span.position.set(0, trackDatumY, 0);
// 按需要加入场景，不要与上面的示范整桥重复添加。
```

`Create(kind, variant)` 返回独立节点，重复调用共享几何与材质，可分别移动和旋转；若修改某个实例材质，应先克隆该材质。不要在单个实例移除时销毁共享纹理或几何。部件的 `userData.snapPoints` 提供局部拼接基准。

资产仍为高细节制作候选，没有新增LOD、碰撞体或自动关卡接线。使用方应按可见范围选择变体与部件，接入BuildSink合批和共享地形／碰撞后再做关卡性能验收。导入本库不发请求，调用加载函数才请求所选部件。

重建统一走仓库Blender入口运行 `_blender/Script_BuildBeishaheBridge.py`；脚本在OneDrive输出完整制作参考，随后调用 `_import/Script_BeishaheBridgeModules.mjs` 重建本目录四类资产与清单。`.blend`、备份、完整参考GLB和验收网页／截图不进入仓库。`Script_BeishaheBridgeTest.mjs` 将提交的模块在内存复原后沿用原有全部几何、桥面和材质检查，并独立检查各模块局部坐标、单／双／三跨拼接与平移旋转后的接点。
