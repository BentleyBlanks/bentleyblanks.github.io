# Frame Debugger

入口：游戏右上角齿轮 → **渲染调试（可叠加） → Frame Debugger**。独立窗口可放在另一块屏幕。
点击「启用 / 捕获当前帧」捕获一次完整的 RenderScene（含 GI、第一人称阴影和 PostPipeline），随后冻结模拟、镜头和任务时钟；「禁用 / 继续」、关闭窗口、视口改变或 context lost 会释放捕获。当前暂停/音频状态会恢复，原有 Profiler 录制在捕获期间暂停，结束后续录。

## 使用

- 左侧按真实提交顺序列 Pass 与事件，包含普通 DC、实例化、multi-draw 合批、Clear、Blit、mipmap；每一行都显示 CPU/GPU 毫秒。父 Pass 包含子 Pass，不能把父子行再次相加。
- 滑条、事件编号、上一条/下一条、←/→（Shift 十条）、Home/End 可定位事件。双击 Pass 标题跳到该 Pass 末尾。搜索对象/材质/Shader/Pass，或按耗时排序，排序不会改变回放顺序。
- Output 回放到选中事件，显示当时的渲染目标；支持 MRT 颜色附件、Depth、RGBA/R/G/B/Alpha、黑白 Levels、曝光、适应/原尺寸、PNG 保存。默认同步到游戏画面，可取消「同步游戏画面」独立查看。
- Mesh 支持基础光照 PBR 预览、线框、UV 棋盘、UV 展开、顶点色、法线、切线、当前 blendshape 强度、鼠标旋转/缩放。没有对应顶点属性的模式禁用。蒙皮烘成当前姿态用于独立预览，不修改角色骨骼；场景相关 AO/SSR/簇光 Shader 的真实源码/参数在属性区，网格预览使用独立基础光照。
- 属性区含源对象路径、材质/几何/相机、实际 GL API、索引/实例/子绘制、附件尺寸/格式/MSAA、Blend/Depth/Stencil/Raster 状态、GLSL defines、实际编译源码、当前 uniforms（整数/浮点/向量/矩阵/采样器）、纹理绑定与资产来源、顶点/索引缓冲描述、uniform blocks。
- 「定位源对象」在控制台打印实例，并暴露 `Tengxian.FrameDebugger.selection`；JSON 报告导出当前帧的元数据与耗时，报告不包含可跨设备执行的 GL 资源。

## 计时口径

**CPU** 来自捕获帧。DC 包含 `renderBufferDirect` 的材质、uniform、顶点绑定等准备及实际 GL 提交；同时保留 `cpuGlCallMs`（原始调用耗时，JSON 报告字段为 `cpuSubmitMs`）。Pass 是整个 Render 函数的提交时间。均扣除捕获器的属性检查/资源备份开销，受 `performance.now()` 分辨率和插桩影响。

**GPU** 使用 `EXT_disjoint_timer_query_webgl2`，对同一个冻结帧的原始 GL 命令流执行一次独立计时回放。查询在 Pass 边界和绘制边界分段，段互斥，不使用不合法的嵌套 TIME_ELAPSED 查询。DC 取对应提交段；Pass 汇总完整命令区间（含状态设置/纹理上传/子 Pass），整帧只累加一次每个底层段。属性检查、资源备份和预览绘制均不在这些区间内。GPU 回放不推进模拟，也不重新计算 TAA/曝光历史；缓存、驱动和查询开销可能使结果不同于未插桩的运行帧，长期趋势用 Profiler。

异步轮询结果；扩展缺失显示「扩展不可用」，时钟 disjoint 显示失效，15 秒未返回显示超时。所有不可用值均为 `null / —`，不伪造 0 或 CPU 替代值。WebGL multi-draw 是一次真实批提交，显示该批整体时间和各 sub-draw 范围，不通过拆批伪造独立耗时。

## 回放与资源生命周期

`Script_FrameDebugger` 仅在捕获时包装当前 renderer/context 实例的方法；普通运行不遍历 DC，不改全局原型或对象 draw 回调。捕获结束立即拆除逐调用钩子；冻结期间仅保留尺寸/渲染/配置变更的释放守卫，防止资源被外部编辑器替换。保存原始命令参数、初始 GL 状态/uniforms、动态 buffer、各靶首次写入之前的 GPU 内容；SSR 上一帧颜色图的生成 mip 链一并恢复。回放不调用模拟或 Post.Render，所以时域索引不重复推进。

WebGL2 禁止向多重采样缓冲 blit。游戏的 MSAA Pass 以完整 Clear 开始，这些已失效的旧样本无需备份，回放同一个 Clear 重建它们。若未来新 Pass 要加载前一帧 MSAA 样本而非完整 Clear，捕获会明确失败并恢复运行，不能用单采样图扩展冒充原样本。GPU/参数备份上限为 768 MiB；超过时释放并提示减小视口/渲染比例，不静默截掉事件。

关闭前完整回放到原帧末尾，恢复 renderer 状态并释放备份/查询，防止调试到半帧后直接把残留数据交给下一帧。窗口关闭、重复捕获、尺寸变化、上下文丢失也走释放流程。

## Unity 功能对应与平台边界

参照 [Unity Frame Debugger 窗口](https://docs.unity3d.com/6000.0/Documentation/Manual/frame-debugger-window.html) 与 [事件信息](https://docs.unity3d.com/6000.0/Documentation/Manual/frame-debugger-window-event-information.html)。

| Unity 能力 | 本游戏对应 |
| --- | --- |
| Enable/Disable、事件层级、滑条、逐事件步进 | 独立窗口 + 冻结/恢复 + 实际 GL 事件 |
| RenderTarget/MRT、通道、Levels、输出预览 | GPU 命令回放 + 颜色/深度附件 |
| Mesh 各预览模式 | 独立 WebGL context 的几何检查 |
| 对象/Shader/材质定位、keywords 与属性 | 源对象引用、编译后的 GLSL、实际 uniform 与纹理绑定 |
| 绘制/缓冲/Blend/Depth/Stencil 等状态 | WebGL 实际状态与 draw 参数 |
| Batch cause | 相邻提交的材质/几何/Pass/目标差异；WebGL 不提供 Unity SRP 的内部合批决策，未知原因明确标出 |
| Editor/原生远程 Player 目标 | 当前游戏页面；**未实现跨设备/跨标签远程附加** |
| SRP Batcher、Compute/Geometry/Tessellation Shader、memoryless 与显式 load/store | 此游戏的 WebGL2 管线没有这些接口，不伪造 Unity 专属字段 |
| 每个 DC/Pass 的整体耗时（额外需求） | CPU 提交 + 冻结帧 GPU 命令回放计时，口径如上 |

这是本游戏 WebGL2 管线的对应工具，不能宣称与 Unity 原生编辑器所有平台功能完全等价。

## 开发与验收

模块：`Script_FrameDebugger`（捕获/查询/回放）、`Script_FrameDebugGl`（GL 状态/附件）、`Script_FrameDebugMesh`（几何预览）、`Script_EditorFrameDebugger`（独立窗口）。Main 仅接入帧边界、暂停守卫及音频恢复；PostPipeline 的既有 Pass 不改变。

```powershell
node Taierzhuang1938/Script_FrameDebuggerTest.mjs
node Taierzhuang1938/Script_FrameDebuggerTest.mjs --quality=high
node Taierzhuang1938/Script_FrameDebuggerTest.mjs --quality=high --bundle
node Taierzhuang1938/Script_FrameDebuggerTest.mjs --core-only --samples=4
```

核心 GPU 夹具验证逐事件差异/倒退确定性、MRT/深度、实例化/multi-draw、MSAA、GPU 扩展缺失、原始画面与回放/恢复逐像素相同、所有钩子归还。实机场景验证编辑器入口、冻结模拟时钟、捕获前后像素、网格视图及继续。截图仅存 `tmp/FrameDebugger/`，不提交。纯 JSON 报告无资源句柄，适合取证，不能当离线重放文件。

### 2026-09-30 回归记录

- 合入 `175da4df` 后，用正式构建包（版本 `1467387267131688`）完成高画质专项：477 DC / 540 事件，捕获原始帧与计时回放的像素 hash 均为 `2099108382`。冻结时钟、窗口操作、同步游戏画面、网格预览、继续及编辑器切换释放均通过，浏览器无报错。此样本计时用于检验查询工作，不作为跨机器性能基准。
- 新增专项的 4×MSAA 夹具通过，包括完整 uniform 数组、MRT/深度、multi-draw、GPU 扩展缺失/disjoint、超预算清理、尺寸变化释放、Profiler 暂停/恢复，GL error 为 0。
- `ModuleGraphTest`、`TestRunnerTest`、`PostFrameGraphTest`、`ProfilerTest`、`ProfilerRecordingTest`、`MotionVectorContractTest`、`CarriagePropVelocityTest`、`WhiteboxQualityBrowserTest` 通过。新增入口使按钮数由 27 变成 28；已同步断言，并在编辑器复核中验证新入口存在。
- 大范围检查没有全绿。`EditorTest` 剩余的第一人称像素阈值、日军默认配枪、音效分类三条失败，在未带本功能的主检出 `1971592c` 同样重现。快速检查中的 `OpeningLensTest` 旧源码匹配、`FirstLevelVoiceAudioTest` 音频解码、`FirstLevelP012VisibilityTest` 缺少 `manualPoses` 的夹具，也在未带本功能的检出重现；没有改弱这些断言。战场声随机断言单独重跑通过。
- `BrowserBundleTest` 的白盒启动和主菜单分支通过（均为 13 个脚本请求），缺失人物的长剧情分支在整组 600 秒时限内未完成。`BootTest` 第一章通过，整组在 240 秒时限内未完成其余章节。这两组不能记作完整通过。
