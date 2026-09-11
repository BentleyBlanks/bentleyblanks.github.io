# MotionVector 接入规范

适用于所有现有和新增可渲染对象，包括加载器生成的 Mesh、SkinnedMesh（对应其他引擎的 SkinnedMeshRenderer）、骨骼挂件、运行时异步装配和模型替换。渲染入口统一由 `Script_PostPrepass.mjs` 的 `PrepassPass` 决定；资产工厂不能再靠逐件调用 `MarkDynamicPrepass` 决定是否获得运动矢量。

## 写入规则

| 对象 / 情形 | RT1 应写什么 | 接入方式 |
| --- | --- | --- |
| 世界中的普通 Mesh，包括静态物体、移动父节点、帽子、背包、背枪、手持物 | 当前与上一帧真实屏幕位置之差；世界静止也包含相机运动 | 自动记录逐对象世界矩阵，无需标记，无需安装对象回调 |
| 世界中的 SkinnedMesh | 上一帧骨骼形变与上一帧蒙皮到世界变换共同决定的速度 | 自动发现骨骼和实际绘制对象；支持 AttachedBindMode / DetachedBindMode，不用刚体历史覆盖骨骼形变 |
| Bone 下新增的普通 Mesh | 该挂件自己的世界矩阵历史 | 与其他普通 Mesh 相同；不能因为父对象蒙皮，就省略挂件自己的历史 |
| 第一人称前景树中的不透明 Mesh / SkinnedMesh | **明确写零速度**，同时写真实法线、常数前景深度 | 对稳定根节点调用 `MarkForegroundPrepass(root)`；后续新子孙自动继承。移出该树后恢复世界规则 |
| 天空、半透明、加性粒子、烟、水面等不属于不透明几何的对象 | **不参与预通道**；不能把自身颜色误写成法线 / 深度 / 速度 | `MarkNoPrepass(material)`；整棵排除用 `root.userData.skipNormalDepth = true`。前景树内新加的半透明子件自动排除 |
| 世界变换和逐实例矩阵均静止的 InstancedMesh / BatchedMesh | 相机速度 | 既有静态合批路径 |
| 会动的实例、会变的 morph target、自定义顶点位移 | 现有实现没有完整的前帧形变历史 | 不得作为新增近景角色 / 手持物 / 骨骼附件的实现；先实现相应历史和真实几何 GPU 对照，或改为受支持路径 |

“写零”与“不写”是不同的渲染语义。世界物体不能因为容易糊而冒充前景；相机运动时，世界静止物体的速度也不等于零。不得通过关闭 TAA / MotionBlur、调低画质、改快门或锐化来替代正确的 RT1。

既有远景 ActorBatch 与部分布设实例仍仅有相机速度，是尚未实现逐实例历史的限制，不是新资产的默认豁免。透明材质和不透明材质不要混在同一 Mesh 的材质组：当前 MRT 排除以整个对象为单位。AlphaTest 前景仍按现有排除路径处理；新增世界镂空 / 自定义变形材质须同时验证预通道轮廓和主场景轮廓一致。

## 历史与回调

- 速度为无 TAA 抖动的 `currentUv - previousUv`，单位 UV。只有读取方换算像素；验收同时检查速度方向与大小，不能只检查“不超过钳位”。
- 整条管线首帧、相机切换 / 历史失效帧写零。单个对象首次绘制、隔帧重新出现、更换 skeleton 或 bindMatrix 时，丢弃其旧物体 / 骨骼历史，保留当前相机运动；下一连续绘制帧恢复完整运动。
- 历史属于 pass 私有 WeakMap，不放到可复制的模型 userData 中。多材质组完成后再推进对象历史；骨骼历史由 `Script_Post.Render` 整帧结束时统一快照，共享 skeleton 不能逐 draw 提前覆盖。
- 动画、装配与父节点变换在预通道之前完成，同一帧的预通道和主场景使用同一姿态；不要在逐 draw 回调中推进动画或移动对象，也不要在两条 pass 之间才挂上可见模型，否则颜色与运动历史不再对应同一帧。
- 前景根标记允许保存在 userData；叶节点 `foregroundPrepass` 只是当前路由的诊断值。渲染器每帧继承根策略，因此异步挂载、换父节点不依赖重新遍历打标。现有重复 `MarkForegroundPrepass` 调用兼容且幂等。
- 统一绑定使用覆盖材质的 `onBeforeRender`，保留对象已有的 `onBeforeRender / onAfterRender`，不接管破口等钩子。`MarkDynamicPrepass` 只保留旧调用方的兼容诊断，不是开关。
- 骨纹理升级失败必须给出诊断，并禁止读取不存在的前帧区域；当前安全退回相机速度。它不是通过验收的完整蒙皮效果，发布新增模型前必须排除该诊断。重建后期管线可复用已有的双高度骨纹理。
- 瞬移 / 切镜头走 `post.NotifyCameraCut()`；不要通过伪造旧矩阵消除正常运动。动态 morph、变更 bindMode、骨骼拓扑或自定义蒙皮实现需要自己的补充像素验收，不能仅凭 isSkinnedMesh 推断全部变形都受支持。

## 必须执行的门禁

`Script_MotionVectorContractTest.mjs` 直接使用生产 Prepass 和本仓 Three.js，读取 RT1 像素。覆盖普通骨骼挂件、双骨骼非刚性拉伸、Attached / Detached 绑定、父节点与骨骼叠加、相机同行 / 独立移动、停止、新增共享骨骼 renderer、隐藏重现、管线重建、动态前景继承、移出前景、透明 / 显式排除，以及原对象钩子仍执行。

该测试登记在 `Script_TestRunner` 的 `motionVector` 域与浏览器测试集。`--changed --profile=prepush` 对项目内 Script / Data 模块及 GLB / glTF 变更自动追加它，不依赖已知道具文件名。`Script_TestRunnerTest` 用尚不存在的工厂名验证这一选择规则，纯 Markdown 文档仍不启动浏览器。

真实近景资产还须保留针对其实际几何的检查。`Script_CarriagePropVelocityTest.mjs` 继续验收 high 画质车厢、腊肉和背包；通用夹具不能代替新资产自己的轮廓、骨权重和运动接入验收。旧关卡 / 剧情重构不得顺手删除通用速度门禁。

```powershell
node Taierzhuang1938/Script_TestRunner.mjs --only=MotionVectorContractTest,CarriagePropVelocityTest --fail-fast
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast
```

排查时查看调试面板的 **“速度缓冲（RT1）” / `velocity`**。`motionVector` 是保留的深度反投影相机速度视图，不能用它判断骨骼 / 挂件运动是否写入。背景全黑或前景为零只说明这些区域的预期值，必须让对象、骨骼、相机分别运动后比对读数。

实现位置与消费链见 [渲染管线 §1.6](Data_TechRenderPipeline.md)，历史事故和实际道具证据见 [车厢复发调查](Data_CarriagePropVelocity.md)。
