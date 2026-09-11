# EarSpa3D · ear011 外耳、边缘遮蔽与工具性能

本轮沿用写实拟物方向：真实接触、受力方向、材质差异、碎裂与收集、满意度和经营。ear010 完成主要迭代；ear011-20260911 继续加入淡黄色薄角质层和浅黄微屑。浅黄材质沿用 PBR 纹理细节，重新标定底色、降低法线凹凸，并在已有受光量上近似薄片边缘散射；使用原型 UV 估算厚度，以薄层消光透明混合让薄边透出背后皮肤，厚部保持遮光；这是薄层光学近似，不是完整体积折射或自发光。薄片边缘有微量卷曲，断开后的子片继承母片颜色。

## 模型与来源

ear010 工具与内耳道源工程保留在 C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/DirectionalAnatomy/Model_DirectionalAnatomy.blend。ear011 头耳独立源工程为 C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ReferenceProfile/Model_ReferenceProfile.blend。仓库仅提交游戏使用的 GLB、profile、贴图与重建脚本。

- Script_BuildDirectionalAnatomy.py 经 BlenderMCP 启动独立后台 Blender 构建；不会保存覆盖共享 GUI 的内存场景。
- 头部使用本机 MPFB 分发的 MakeHuman base.obj（文件头明确 CC0，September 2020），取面部与颈部拓扑、细分、适配处理侧耳廓。来源：https://github.com/makehumancommunity/makehuman 。开场、取出、收款共用同一实时几何；旧静态侧脸图片已移除。
- 耳廓细分并调整耳甲与耳舟；耳道 128 周向采样，profile 首项 directionalEdition 避免重复写入增量。继续沿用 Data_ImmersiveAssets.md 的实拍和解剖参考。
- 360 根浅灰白耳毛合并为一个网格，UV.x 是根到梢权重，根部固定、末梢轻动并响应附近工具。
- 耳勺浅壳边缘和镊臂/夹齿细分圆滑；滴管保留空心管壁、独立玻璃材质、液柱和弯月面。旧款木质和磨损表面逐步升级为精细金属。
- 柔毛刷 Basic／Refined／Master 分别含 180／240／300 根弯曲细丝，每根 10 节；羽毛由真实羽轴、68／88／108 组分枝及二级绒羽组成，使用合并几何。
- 羽毛独立三视图由第 1 级内置 imagegen 生成，已落到源工程 References/Reference_FeatherWandThreeView.png 并打包进 blend。未使用 Lovart 或即梦回退。既有三套工具三视图继续沿用 Data_TactileAssets.md。

完整重建：在上述本任务源工程运行 Script_BuildDirectionalAnatomy.py；只改工具可传 --tools-only，只重建头部可传 --head-only。每次导出后必须执行：

~~~powershell
node EarSpa3D/Script_CompactModel.mjs
~~~

该步骤删除已被运行时 PBR 覆盖的旧内嵌贴图并重排 bufferViews；本轮 GLB 从约 20.4 MB 缩到 12.75 MB，几何及实际 PBR 不变。完整重建仍依赖本地原工程、MPFB 基础网格及已打包参考。

## 材质与接触

- 继续绑定 imagegen 颜色／法线／粗糙度／AO 图集。金属升级为 MeshPhysicalMaterial 的各向异性反射，保留粗糙度下限，避免图集暗值把拉丝钢变成镜面。玻璃和液柱分别使用 IOR 1.47／1.33、厚度与实时透射。
- 商店预览拥有自己渲染器生成的 PMREM 环境贴图，避免跨 WebGL 上下文复用 render target 导致金属发黑；销毁预览时释放其环境资源。
- 毛刷与羽毛使用纤维几何、双高光各向异性近似、sheen 和根梢权重。CPU 对 0.028 mm 单元内的细丝顶点建立有界包络球，先做连续弯曲，再将包络球约束到曲面；增加球半径的 1.18 倍及末梢摆动安全距离，覆盖簇内每个可见顶点；不是毛发路径追踪或完整连续体求解。
- 刚性工具按轴向薄片和 24 周向扇区采样，位移与旋转分步扫掠。最近中心线查询用包围盒树精确加速，缓存只针对未变的刚性部件；夹爪转动、几何或等级变化会更新缓存。
- 皮肤保留薄层单次 SSS 近似、AO、网格阴影与湿膜；强拉未软化耳垢会引起疼痛反馈及局部红肿。低档沿用阴影降级策略，保持清晰像素密度。

这些是 WebGL 实时近似，不是扫描标定、完整有限元或无限精度物理。完整顶点和导出壁面射线的接触审计用于约束实际误差；桌面浏览器中的移动视口测试不等同于所有实体手机的性能保证。

## 操作与游戏循环

- 右键按住连续转向，松开停止；开始旋转时按器具完整旋转包络稍作避让，再保持安全支点，不能穿入内壁。左键沿真实勺面渐进施力，勺面背向时不破坏粘附；镊子要求夹爪方向和两侧表面接触都正确。移动端选择转向／施力后单指按住。
- 每局 9 个原生大块（质量 8.1）及 12 组、每组 9 粒微屑（质量 .9），总质量保持 9。客人种子影响湿膜、长薄片和干片比例。
- 9／13 个形态锚点和 240 Hz 子步控制原生块；三角面按实际局部拉力、抓点及确定性种子切开封口，产生 2–4 片，支持三代递归。按封闭体积比分配质量，碎裂不奖励清洁度。
- 原生微屑及真正细小的切片只能羽毛工具清理，邻近微屑可随一束绒羽带出。切片须质量 ≤ .045 且最长边 ≤ .65 mm；第三代仍过大的条片继续由耳勺/镊子处理，不因代数自动归为微屑。免费初始配置羽毛，旧存档自动补齐，避免必要工具被商店资金锁住。柔毛刷负责较大的干碎片；吸引管负责软化碎片。
- 服务最长 210 秒；小铺和声音设置暂停计时。超时停止未完成收集，只按实际落盘／吸入质量和满意度结算，仍可接下一位与购买升级。

## 验证入口

~~~powershell
node EarSpa3D/Script_PeelPhysicsTest.mjs
node EarSpa3D/Script_EconomyTest.mjs
node EarSpa3D/Script_DirectionalPhysicsTest.mjs
node EarSpa3D/Script_TactileDetailTest.mjs --url=http://127.0.0.1:8082/EarSpa3D/
node EarSpa3D/Script_TactilePlayTest.mjs --url=http://127.0.0.1:8082/EarSpa3D/
node EarSpa3D/Script_TactilePlayTest.mjs --touch --url=http://127.0.0.1:8082/EarSpa3D/
node EarSpa3D/Script_ChunkPlayTest.mjs --url=http://127.0.0.1:8082/EarSpa3D/
~~~

覆盖四视口、实际鼠标／CDP 触屏、原地旋转、三代碎裂、微屑工具限制、时限及结算、存档迁移、声音起音与静音，以及六工具 48 组整件网格接触。截图和报告只留本地 _dev，并另做视觉检查。音频信号检测不能替代人的主观试听。

## ear011 收集盘修正

移除虚假的矩形桌面，按用户要求单独悬浮展示实体盘。盘子宽约 55 mm、深约 33 mm，取出镜头按用户新参考收紧为耳部、耳周皮肤和少量头发；盘子与发束分开，耳垢保留毫米尺度。盘沿材质上淡印“强迫症的SOPHIA”，跟随透视、灯光和实体深度。窄屏盘位自适应，取出时暂时隐藏底部操作控件；横屏平移取景使耳部与耳周皮肤保持主体。

## ear011 外耳与渲染

- Script_BuildReferenceProfile.py 在独立 ReferenceProfile 工程中运行，保留原内耳道和工具。使用 MakeHuman CC0 基础拓扑与 young female morphology，照片和第 1 级内置 imagegen 的 depth/clay 参考打包到工程 Image Empty；参考不是测量深度或扫描数据。原生耳廓与头部保持连续，清除与真实弯曲耳道重叠的头皮，耳甲入口为椭圆过渡。头发有曲面体积、沿流向细丝明暗与各向异性，未使用静态侧脸图。
- 外皮独立 Texture_OuterSkinPbrAtlas.png，20 mm / tile、镜像平铺避免硬接缝，四通道与耳道分离；外耳薄软骨散射近似强度 .10，耳道单次散射近似 .18，各自编译。生成提示词和来源见 Data_OuterSkinAsset.json，内置 imagegen 第 1 级成功。Blender 源工程也打包外皮图集并保留材质节点。
- Script_ContactOcclusion.js 从实际三角面光栅化 64×64 轮廓及前后表面高度，生成 24 槽接触图集。0.135 mm 接触边缘 AO 随离壁间隙衰减，最多四段短光线计算接触阴影；与原网格阴影叠加。已撤销用户否定的宽泛椭球黑晕；低档也保留局部接触遮蔽。图集缓存初始/碎裂几何轮廓，跟随实时位姿，细微弹性形变是近似。
- 裂面沿三角形切线重建独立边界环，并按凹轮廓三角化，避免跨环连接产生纸楔；外壳跨 UV 接缝平滑法线，切口保留断面法线。新增超薄凹片和独立截面回归。

## ear011 深处与性能

- 深处湿膜约 11.8 mm、硬结约 14.6 mm；真实“探查深处”按钮移动观察机位。短耳勺有效长度 8.8 mm，镊子/滴管 17.5 mm；毛刷 9.5 mm，吸引/鹅绒 18 mm。升级每级增加 .3 mm。超距拒绝抓取，深处硬结仍需软化。
- 启动期间 compileAsync 准备工具着色器与透射资源，并准备阴影开/关两档，减少滴管首次出现的停顿。
- Script_StaticRaycast.js 静态三角面 BVH 加速耳道射线；Script_ToolContact.js 用标量数学保留精确最近线段查询，减少临时向量分配。细丝使用有界包络球，未变化位姿不重复弯曲；只有使用镊子时测量夹爪间隙。
- 本机桌面自动化相同轨迹 30 次鹅绒移动：优化前约 1583 ms，优化后约 388 ms。预热后首次滴管交互约 102 ms；该数据包含自动化调度，只用于同环境对比，不是实体手机帧率保证。
- 外耳净空建模后执行 Script_CompactModel.mjs；当前完整 GLB 约 8.5 MB。内耳道几何、毫米坐标与玩法质量契约保持一致。

额外验收入口：`node EarSpa3D/Script_RenderingRegressionTest.mjs`，比较 BVH 与完整三角面搜索、局部 AO 像素、外部面数预算、材质独立及首次工具程序复用，并通过实际取出操作检查四种尺寸的悬浮盘完整入镜。

## ear012 操作与界面

- 标题、清洁进度和心情合并在左上状态组；声音开关收入设置。删除角度盘、常驻教学文案及收集后的鼓励提示，短反馈只说明工具不适用或方向受阻。
- 深浅镜头使用紧凑放大镜按钮；服务计时、检查灯、工具栏与经营入口继续可用。
- 湿膜先在约 0.3 秒内覆盖，内部软化仍约 3 秒；底色逐渐加深，粗糙度降低、清漆层增强、法线凹凸减弱。每块独立湿润参数，薄片重新映色之后也能显示变化。
- Script_InstrumentInteractionTest.mjs 验证勺面反向、镊爪方向/双面接触、按尺寸识别碎屑；Script_ControlPlayTest.mjs 用真实鼠标/CDP 触屏验收静止长按旋转、方向阻挡、羽毛拒绝大块、实际湿润像素和简化界面。截图与报告仅留 _dev。
