# Frame Debugger

入口：游戏右上角齿轮 → **渲染调试（可叠加） → Frame Debugger**。独立窗口可放在另一块屏幕。
点击「启用 / 捕获当前帧」捕获一次完整的 RenderScene（含 GI、第一人称阴影和 PostPipeline），随后冻结模拟、镜头和任务时钟；「禁用 / 继续」、关闭窗口、视口改变或 context lost 会释放捕获。当前暂停/音频状态会恢复，原有 Profiler 录制在捕获期间暂停，结束后续录。

## 使用

- 左侧按真实提交顺序列 Pass 与事件，包含普通 DC、实例化、multi-draw 合批、Clear、Blit、mipmap；每一行都显示 DC 数与 CPU/GPU 毫秒，GPU 列底色按占比画热度条。父 Pass 包含子 Pass，不能把父子行再次相加。行首色块标类型：D 普通网格、I 实例化、B 合批、F 全屏、P 无源对象的原始绘制、C Clear、⇢ Blit、M/T mip 与拷贝。
- 滑条、事件编号、上一条/下一条、←/→ 或 ↑/↓（Shift 十条）、Home/End 可定位事件。单击 Pass / 分组 = 看该组最后一个事件的画面（Unity 同款），并在右侧列该组统计与最耗 GPU 的 DC；▸ 或双击展开折叠，展开状态按路径记住，重新捕获仍保留。搜索对象/材质/Shader/Pass/`#编号`，或按耗时排序，排序不会改变回放顺序。左栏宽度可拖分隔条调整。
- Output 回放到选中事件，显示当时的渲染目标；支持 MRT 颜色附件、Depth、RGBA/RGB/R/G/B/A、黑白 Levels、曝光、适应/原尺寸、PNG 保存，鼠标悬停显示源像素坐标与显示值（经 Levels 后的 8 位值，不是 HDR 原值）。默认同步到游戏画面，可取消「同步游戏画面」独立查看。
- Mesh 支持基础光照 PBR 预览、线框、UV 棋盘、UV 展开、顶点色、法线、切线、当前 blendshape 强度、鼠标旋转/缩放。没有对应顶点属性的模式禁用。蒙皮烘成当前姿态用于独立预览，不修改角色骨骼；场景相关 AO/SSR/簇光 Shader 的真实源码/参数在属性区，网格预览使用独立基础光照。
- Texture：Properties 里每个 2D 采样器都有缩略图，点它在预览区看**该 DC 读到的内容**（回放到此事件后读纹理；Levels/通道同样生效）。Cube/Array/3D/整数采样器不出图。换选事件回到 Output。
- 右侧顶部是事件标题、所属 Pass 面包屑（可点）、目标与 GPU/CPU/三角形/实例/Shader/Batch 摘要。下面按 Unity 事件信息分组折叠（展开状态跨事件保留）：
  - **Details**：Event（API 调用按枚举名还原）、Draw（拓扑、索引、图元、实例、子绘制表）、Mesh / Object（显示名及其来源、层级路径可复制、几何/材质/Shader/相机、渲染队列、材质开关、阴影）、Clear 值、Render Target 附件表、Render State（Unity 写法：Blend / BlendOp / ColorMask / ZTest / ZWrite / Cull / Offset / Stencil / Viewport / Scissor…）。
  - **Keywords**：材质 defines 与编译后 `#define`（标出只在 V / F 一个阶段出现的）。
  - **Properties**：Textures（缩略图、单元、GLSL 采样器类型、纹理名、尺寸、three 格式/类型/色彩空间、资产链接）、Ints / Floats / Vectors / Matrices 表格，数组可展开，矩阵按行列排；可按名字筛选。
  - **Buffers**：顶点属性、索引缓冲、uniform blocks。**Shader**：带行号的实际编译源码，可复制。**Raw JSON**：此事件的原始数据。

### 事件命名与分组

- DC 名按顺序取：`Object3D.name` → 本帧所在 Pass 对象（及 PostPipeline）里引用这份材质的字段名，如 `fxaa.material`、`gtao.materialTrace` → 最近的具名父节点 `父 › 几何类型` → geometry.name / material.name / 几何类型 → `类型#id`。Details 里「显示名」后注明来源。后处理共用的全屏四边形（Blitter 的 `Mesh#14`）标为 `Draw Fullscreen`。Clear / Blit 标出清的缓冲 `(Color Depth Stencil)`。
- 被关掉的 Pass 仍可能画东西（`contactShadows.Idle` 用白图重合一遍），`Prepare` 也可能上传；两者都包成 `<pass>.Idle` / `<pass>.Prepare` 分组，没提交事件的不留节点。
- 捕获结束后按提交顺序补 Unity 式分组（灰色 ◆，JSON 里 `synthetic` 字段标来源）：一次 `renderer.render` 若不是所在 Pass 的全部内容，包成 `Render <scene>`；同一次 render 里既有不透明又有透明（或 `Background*` 天空）且 ≥4 个 DC 时，拆成 `DrawOpaqueObjects` / `DrawSkybox` / `DrawTransparentObjects`；仍不在任何 Pass 里的事件按目标归成 `(Unscoped) → <target>`。分组拥有相邻兄弟之间的命令区间，所以 GPU 时间包含状态设置。
- 「定位源对象」在控制台打印实例，并暴露 `Tengxian.FrameDebugger.selection`；JSON 报告导出当前帧的元数据与耗时，报告不包含可跨设备执行的 GL 资源。

## 计时口径

**CPU** 来自捕获帧。DC 包含 `renderBufferDirect` 的材质、uniform、顶点绑定等准备及实际 GL 提交；同时保留 `cpuGlCallMs`（原始调用耗时，JSON 报告字段为 `cpuSubmitMs`）。Pass 是整个 Render 函数的提交时间。均扣除捕获器的属性检查/资源备份开销，受 `performance.now()` 分辨率和插桩影响。

**GPU** 使用 `EXT_disjoint_timer_query_webgl2`，对同一个冻结帧的原始 GL 命令流执行一次独立计时回放。查询在 Pass 边界和绘制边界分段，段互斥，不使用不合法的嵌套 TIME_ELAPSED 查询。DC 取对应提交段；Pass 汇总完整命令区间（含状态设置/纹理上传/子 Pass），整帧只累加一次每个底层段。属性检查、资源备份和预览绘制均不在这些区间内。GPU 回放不推进模拟，也不重新计算 TAA/曝光历史；缓存、驱动和查询开销可能使结果不同于未插桩的运行帧，长期趋势用 Profiler。

异步轮询结果；扩展缺失显示「扩展不可用」，时钟 disjoint 显示失效，15 秒未返回显示超时。所有不可用值均为 `null / —`，不伪造 0 或 CPU 替代值。WebGL multi-draw 是一次真实批提交，显示该批整体时间和各 sub-draw 范围，不通过拆批伪造独立耗时。

## 回放与资源生命周期

`Script_FrameDebugger` 仅在捕获时包装当前 renderer/context 实例的方法；普通运行不遍历 DC，不改全局原型或对象 draw 回调。捕获结束立即拆除逐调用钩子；冻结期间仅保留尺寸/渲染/配置变更的释放守卫，防止资源被外部编辑器替换。保存原始命令参数、初始 GL 状态/uniforms、动态 buffer、各靶首次写入之前的 GPU 内容；SSR 上一帧颜色图的生成 mip 链一并恢复。回放不调用模拟或 Post.Render，所以时域索引不重复推进。

捕获帧里第一次出现的材质会在帧内编译链接着色器、第一次上传的纹理会 `texStorage2D` 分配。这些是对象的一次性建立，不是帧内容，**不录进命令流**（`shaderSource / compileShader / attachShader / linkProgram / texStorage*` 等与 `create*` 同列）：回放再 `linkProgram` 会让 three 手里所有 uniform 位置失效 —— 那个物体在回放里消失，Resume 之后游戏里也一直画不出来，并留下 INVALID_OPERATION；对已不可变的纹理再 `texStorage2D` 同样报错。核心夹具的 `fresh` 一项覆盖这条（2026-09-30 之前的代码在这里 glError 1282、回放和继续后都丢物体）。

WebGL2 禁止向多重采样缓冲 blit。游戏的 MSAA Pass 以完整 Clear 开始，这些已失效的旧样本无需备份，回放同一个 Clear 重建它们。若未来新 Pass 要加载前一帧 MSAA 样本而非完整 Clear，捕获会明确失败并恢复运行，不能用单采样图扩展冒充原样本。GPU/参数备份上限为 768 MiB；超过时释放并提示减小视口/渲染比例，不静默截掉事件。

关闭前完整回放到原帧末尾，恢复 renderer 状态并释放备份/查询，防止调试到半帧后直接把残留数据交给下一帧。窗口关闭、重复捕获、尺寸变化、上下文丢失也走释放流程。

## 回放保真度（逐位比对）

实机检查比较「捕获帧刚画完的 backbuffer」与「EndRender 计时回放之后的 backbuffer」，要求逐位相等。2026-09-30 在本机（RTX 4070 SUPER，驱动 595.71，ANGLE-D3D11）上偶发不等，查到的结论：

- **回放没漏资源。** 这一帧（白盒 p012 第 3 步，217 事件 / 1201 条命令）帧内只有 7 次 `texSubImage2D`（骨骼纹理与一张 26×26 表），全部在第一次采样之前上传；没有 copyTex / generateMipmap / copyBufferSubData；靶都在首次写入前备份。high 档（544 事件）探针只报出 `ssrColor` 的 `generateMipmap` 在它被 `ssr.materialResolve` 采样之后，那张图正是 `_ResetReplay` 从恢复的 0 级重建 mip 的对象。
- **是 GPU 这条栈本身不逐位可复现。** 两种表现，都与 Frame Debugger 无关：
  1. **加载后的驱动窗口**：不经过 Frame Debugger，对冻结的同一场景反复 `renderer.render()` 进半精度靶，关卡加载后约 6–9 秒内浮点结果会在几种版本之间切换（每次 7–101 个分量、每个差 1 个半精度 ulp，像素集合成对固定；同步循环里也会切，说明不是 JS 改了东西），之后稳定。加载后空等 20 秒再测则完全稳定。
  2. **随 GPU 调度变**：实时帧的提交夹着 three 的 CPU 工作，回放是连续提交；在 high 档两者的地形截取（`terrainAlbedoRoughness`）等多个 Pass 系统性地差 1 ulp（6/6 次），回放彼此之间却完全一致。第一个地形 DC 前比对了 467 项输入（全部 uniform、绘制状态、各纹理单元的纹理参数与采样器、顶点属性含 generic 当前值、采样到的 2D 纹理与目标的颜色/深度）全部相同；没有纹理同时被采样和写入。**实时帧与回放都在每个事件后插一次 1×1 readPixels（同样的串行化）时逐位相同**（high 6/6）。所以差异来自执行时序，不是回放缺数据；把地形改成常量色仍不消失，说明不止一个着色器。
  分叉常落在共面 / 贴地的表面上（地形与壕沟土层、地上的枯草）。换 SwiftShader（`--use-angle=swiftshader`，计时扩展照样在、计时回放照样跑）时，实时帧与每次回放逐位相同。
- **测试的做法（断言始终逐位相等，并断言计时回放确实执行了 `replayed`，不让「没回放所以相等」混过去）：**
  - 白盒档默认跑 SwiftShader（约 2 分钟进关，整个测试约 3.5 分钟）。
  - `--quality=high` 等完整档在 SwiftShader 上 300 秒内预热不完着色器，所以走硬件 GPU；`--gpu` 让白盒也走硬件。硬件路径下被检查的那次捕获**两边同样串行化**（实时帧每个事件后、计时回放每个事件命令后各一次 1×1 readPixels），并在进关后等 12 秒避开驱动窗口。本机 high 档实测：不串行 0/7，串行不等待 2/3，串行加等待 3/3。
  - 只在测试里串行化；Frame Debugger 本身不加同步，GPU 计时照旧是连续提交。

另外查到一个与此无关、但确实存在的着色器未定义行为：`Script_Csm.mjs` 的 `CsmSunVisibility` 在逐像素早退（`csmLevel < 0`）之后才对阴影坐标求 `dFdx/dFdy`。试改成先求导后并不消除上面的差异，所以没有随本次提交，单独作为后续任务。

复现 / 取证用 `Script_FrameDebuggerReplayProbe.mjs`：按测试同样的顺序打开编辑器窗口捕获，再连续捕获若干帧；捕获期间每换一次绘制目标（或每 `--every=K` 个事件）在 GPU 上 blit 一份输出，不等时把第一份与 `Replay()` 结果不同的快照、差异像素数 / 最大差 / 范围 / 样本、以及那段事件列出来；也列出「先被采样、后被上传」的纹理。`--plain=30` 不碰 Frame Debugger，只反复重画冻结场景并打印浮点输出何时变化；`--angle=swiftshader` 换软件 GPU 对照。

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
node Taierzhuang1938/Script_FrameDebuggerTest.mjs --gpu            # 白盒实机段也走硬件 GPU（串行化比对，见「回放保真度」）
node Taierzhuang1938/Script_FrameDebuggerReplayProbe.mjs --runs=3 --captures=4 [--every=4] [--angle=swiftshader] [--plain=30]
```

核心 GPU 夹具验证逐事件差异/倒退确定性、MRT/深度、实例化/multi-draw、MSAA、GPU 扩展缺失、原始画面与回放/恢复逐像素相同、所有钩子归还；以及 Idle 分组、Opaque/Transparent 拆分、无散落事件、具名父节点与材质字段命名、采样纹理按 DC 读回、合成分组拿到 GPU 时间。夹具页用路由出的同源空白页，不再用 404 的 `/__preview/ping`（Chrome 错误页的延迟导航会撞上 setContent）。实机场景（白盒默认 SwiftShader，整个测试约 3.5 分钟；完整画质档与 `--gpu` 走硬件 GPU 并串行化比对）验证编辑器入口、冻结模拟时钟、捕获前后像素逐位相等且计时回放确实执行、网格视图及继续。截图仅存 `tmp/FrameDebugger/`，不提交。纯 JSON 报告无资源句柄，适合取证，不能当离线重放文件。

### 2026-09-30 界面细化

- 右侧 Details 从 JSON 改成上面的分组卡片 / 表格；事件命名、Idle / Prepare 分组、合成分组、纹理缩略图与 Texture 预览见「使用」。`--core-only` 与默认白盒全流程通过。
- 实机像素检查（捕获前的画面 vs 计时回放后的画面）偶发不一致：同一台机器上两次在白盒 p012 第 3 步各得到 `3863958859` ≠ 回放后值，改动前的 `0754dcc4` 同样复现；随后的两次（217 事件）逐像素相同。属于回放保真度的既有问题，没有改弱断言。（已查清：不是回放漏资源，是硬件 GPU 这条栈本身不逐位可复现，见「回放保真度」。）

- 合入 `175da4df` 后，用正式构建包（版本 `1467387267131688`）完成高画质专项：477 DC / 540 事件，捕获原始帧与计时回放的像素 hash 均为 `2099108382`。冻结时钟、窗口操作、同步游戏画面、网格预览、继续及编辑器切换释放均通过，浏览器无报错。此样本计时用于检验查询工作，不作为跨机器性能基准。
- 新增专项的 4×MSAA 夹具通过，包括完整 uniform 数组、MRT/深度、multi-draw、GPU 扩展缺失/disjoint、超预算清理、尺寸变化释放、Profiler 暂停/恢复，GL error 为 0。
- `ModuleGraphTest`、`TestRunnerTest`、`PostFrameGraphTest`、`ProfilerTest`、`ProfilerRecordingTest`、`MotionVectorContractTest`、`CarriagePropVelocityTest`、`WhiteboxQualityBrowserTest` 通过。新增入口使按钮数由 27 变成 28；已同步断言，并在编辑器复核中验证新入口存在。
- 大范围检查没有全绿。`EditorTest` 剩余的第一人称像素阈值、日军默认配枪、音效分类三条失败，在未带本功能的主检出 `1971592c` 同样重现。快速检查中的 `OpeningLensTest` 旧源码匹配、`FirstLevelVoiceAudioTest` 音频解码、`FirstLevelP012VisibilityTest` 缺少 `manualPoses` 的夹具，也在未带本功能的检出重现；没有改弱这些断言。战场声随机断言单独重跑通过。
- `BrowserBundleTest` 的白盒启动和主菜单分支通过（均为 13 个脚本请求），缺失人物的长剧情分支在整组 600 秒时限内未完成。`BootTest` 第一章通过，整组在 240 秒时限内未完成其余章节。这两组不能记作完整通过。
