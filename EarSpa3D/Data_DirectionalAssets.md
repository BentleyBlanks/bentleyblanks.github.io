# EarSpa3D · ear010 方向受力与写实器具

本轮沿用写实拟物方向：真实接触、受力方向、材质差异、碎裂与收集、满意度和经营。版本为 ear010-20260911。

## 模型与来源

源工程保留在 C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/DirectionalAnatomy/Model_DirectionalAnatomy.blend。仓库仅提交游戏使用的 GLB、profile、贴图与重建脚本。

- Script_BuildDirectionalAnatomy.py 经 BlenderMCP 启动独立后台 Blender 构建；不会保存覆盖共享 GUI 的内存场景。
- 头部使用本机 MPFB 分发的 MakeHuman base.obj（文件头明确 CC0，September 2020），取面部与颈部拓扑、细分、适配处理侧耳廓。来源：https://github.com/makehumancommunity/makehuman 。开场、取出、收款共用同一实时几何；旧静态侧脸图片已移除。
- 耳廓细分并调整耳甲与耳舟；耳道 128 周向采样，profile 首项 directionalEdition 避免重复写入增量。继续沿用 Data_ImmersiveAssets.md 的实拍和解剖参考。
- 360 根浅灰白耳毛合并为一个网格，UV.x 是根到梢权重，根部固定、末梢轻动并响应附近工具。
- 耳勺浅壳边缘和镊臂/夹齿细分圆滑；滴管保留空心管壁、独立玻璃材质、液柱和弯月面。旧款木质和磨损表面逐步升级为精细金属。
- 柔毛刷 Basic／Refined／Master 分别含 180／240／300 根弯曲细丝，每根 10 节；羽毛由真实羽轴、68／88／108 组分枝及二级绒羽组成，使用合并几何。
- 羽毛独立三视图由第 1 级内置 imagegen 生成，已落到源工程 References/Reference_FeatherWandThreeView.png 并打包进 blend。未使用 Lovart 或即梦回退。既有三套工具三视图继续沿用 Data_TactileAssets.md。

完整重建：在上述本任务源工程运行 Script_BuildDirectionalAnatomy.py；只改工具可传 --tools-only。每次导出后必须执行：

~~~powershell
node EarSpa3D/Script_CompactModel.mjs
~~~

该步骤删除已被运行时 PBR 覆盖的旧内嵌贴图并重排 bufferViews；本轮 GLB 从约 20.4 MB 缩到 12.75 MB，几何及实际 PBR 不变。完整重建仍依赖本地原工程、MPFB 基础网格及已打包参考。

## 材质与接触

- 继续绑定 imagegen 颜色／法线／粗糙度／AO 图集。金属升级为 MeshPhysicalMaterial 的各向异性反射，保留粗糙度下限，避免图集暗值把拉丝钢变成镜面。玻璃和液柱分别使用 IOR 1.47／1.33、厚度与实时透射。
- 商店预览拥有自己渲染器生成的 PMREM 环境贴图，避免跨 WebGL 上下文复用 render target 导致金属发黑；销毁预览时释放其环境资源。
- 毛刷与羽毛使用纤维几何、双高光各向异性近似、sheen 和根梢权重。CPU 先做连续弯曲，再逐顶点约束到曲面并留出末梢摆动余量；不是毛发路径追踪或完整连续体求解。
- 刚性工具按轴向薄片和 24 周向扇区采样，位移与旋转分步扫掠。最近中心线查询用包围盒树精确加速，缓存只针对未变的刚性部件；夹爪转动、几何或等级变化会更新缓存。
- 皮肤保留薄层单次 SSS 近似、AO、网格阴影与湿膜；强拉未软化耳垢会引起疼痛反馈及局部红肿。低档沿用阴影降级策略，保持清晰像素密度。

这些是 WebGL 实时近似，不是扫描标定、完整有限元或无限精度物理。完整顶点和导出壁面射线的接触审计用于约束实际误差；桌面浏览器中的移动视口测试不等同于所有实体手机的性能保证。

## 操作与游戏循环

- 右键按住拖动原地转向；碰壁时停止继续旋转，接触点不平移。左键按住沿当前方向渐进撬起／夹起。移动端显式选择转向／施力，再单指操作。
- 每局 9 个原生大块（质量 8.1）及 12 组、每组 9 粒微屑（质量 .9），总质量保持 9。客人种子影响湿膜、长薄片和干片比例。
- 9／13 个形态锚点和 240 Hz 子步控制原生块；三角面按实际局部拉力、抓点及确定性种子切开封口，产生 2–4 片，支持三代递归。按封闭体积比分配质量，碎裂不奖励清洁度。
- 原生微屑及第三代细屑只能羽毛工具清理，邻近微屑可随一束绒羽带出。免费初始配置羽毛，旧存档自动补齐，避免必要工具被商店资金锁住。柔毛刷负责较大的干碎片；吸引管负责软化碎片。
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
