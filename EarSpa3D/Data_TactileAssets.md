# EarSpa3D · ear009 写实器具与材质

用户最后明确选择全套写实拟物方向，覆盖此前温馨治愈 UI 方向。固定迭代顺序仍是接触受力、材质与手法、松脱/碎裂、收集反馈、满意度经营。

## 源工程与参考

- Blender 源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/TactilePbr/Model_TactilePbr.blend`。
- `Script_BuildTactileTools.py` 由 BlenderMCP 启动独立后台 Blender，读取自己的 `NaturalEar/Model_NaturalEar.blend`，构建三套器具并另存、导出；不改变共享交互 Blender 的当前场景。
- `References/Reference_ToolsBasicThreeView.png`、`Reference_ToolsRefinedThreeView.png`、`Reference_ToolsMasterThreeView.png` 分别为每套生成的三视图，已打包进源工程的 `Reference_ThreeViewSets` 集合。生成图用作形状和工艺参考，毫米尺寸由重建脚本明确控制，不视作测量图纸。
- 三套分别对应 1、2–3、4–5 级。包含耳勺、弹性耳镊、滴管、毛刷、吸引管；中间等级通过表面工艺细化，升级继续影响原有施力效率或滴液渗透量。
- 勺头是有厚度的双面浅壳；镊臂为扁弹片与几何夹齿；滴管、吸引管有实际内孔；握柄有切削环槽。玻璃、刻线、金属、硅胶与握柄保留独立材质。
- 耳毛由 58 增加到 196 根，半径缩小、末端收细并带弯曲；合并网格，使用较浅的粗糙纤维材质。
- 对封闭网格统一修正朝外法线，避免耳垢前表面与器具在真实照明中显示黑面。

实物照片只作为本地参考，没有作为产品贴图发布：

| 结构 | 参考 | 核对内容 |
| --- | --- | --- |
| 竹耳勺 | [Wikimedia Bamboo ear pick](https://commons.wikimedia.org/wiki/File:Bamboo_ear_pick.jpg) | 细杆、浅勺沿、纤维尾部 |
| 弹性耳镊 | [ADCO 产品照片](https://adcohearing.com/cdn/shop/files/3530_1200x1200.jpg?v=1711684385) | 弹片夹臂、握持纹与细齿夹面 |
| 耳用器械夹尖 | [BR Surgical BR44-24112](https://brsurgical.com/wp-content/uploads/2021/04/BR44-24112.jpg) | 钝夹尖和细齿；本作保留弹性镊柄，不复制剪式柄 |
| 玻璃滴管 | [Wikimedia Glass Pasteur pipette](https://commons.wikimedia.org/wiki/File:Glass_pasteur_pipette.jpg) | 玻璃管壁与收细管口 |
| 吸引管 | [New Med Instruments 产品照片](https://new-medinstruments.com/image/cache/catalog/02024/Mix2/ENT%20Micro%20Suction%20tubes-2000x2000.jpg) | 弯管、开孔端面与指控握柄 |
| 清理配件 | [器具套装照片](https://m.media-amazon.com/images/I/61z6woAbKDL._AC_SL1500_.jpg) | 工具头部与握柄分段、刷具纤维排列 |

耳廓轮廓参考延续 `Data_ImmersiveAssets.md` 的实拍与解剖图。

## imagegen 资产

本轮交付的图片全部由第 1 级内置 imagegen 成功生成，未使用付费 Lovart 或即梦回退。原始文件保留在 Codex generated_images；实际输出尺寸经过 PNG IHDR 核验，没有把提示词要求的 2048 当成实际尺寸。完整提示词与落点见 `Data_TactileImagePrompts.json`。

| 文件 | 实际像素 | 用途 |
| --- | --- | --- |
| `Textures/Texture_CanalPbrAtlas.png` | 1254 × 1254 | 皮肤颜色、OpenGL 法线、粗糙度、AO |
| `Textures/Texture_WaxPbrAtlas.png` | 1254 × 1254 | 不规则干蜡层的四通道 PBR |
| `Textures/Texture_GripPbrAtlas.png` | 1254 × 1254 | 钢、胡桃木、玉质的四通道 PBR |
| `Textures/Texture_InstrumentWorkbench.png` | 1536 × 1024 | 独立器具工作台页的写实陈列背景 |
| `Textures/Texture_CustomerSideProfile.png` | 1536 × 1024 | 耳外镜头的虚构客人侧脸背景 |

图集四象限依次为左上颜色、右上法线、左下粗糙度、右下 AO。运行时通过 Canvas 解包，不生成二次派生文件；仅颜色通道走 sRGB，其余线性。握柄图集每象限再分钢、木、玉三条。程序材质和运行时参数的最终绑定在 `Script_TactileMaterials.js`；GLB 的基础材质供缺省加载，实际游戏材质由该模块控制。

贴图属于生成式美术资料，未经过物理扫描或测量标定。未采用停用的温暖小铺插画，旧图只留 `_dev/`。

## 实时渲染与物理边界

- 皮肤薄层 SSS 是单次散射近似，受灯距与角度影响；不是路径追踪或完整体积输运。
- AO 贴图、真实网格投影阴影、粗糙度、法线、湿膜 clearcoat 和环境反射共同表现接触。低档保持 AO/法线/湿膜，阴影沿用性能降级策略。
- 默认关检查灯；开灯后真实指针和触摸射线控制光斑。耳外摄影背景是静态生成图，不是实时客人视频或扫描头模。
- 干拉会在接触位置累积局部红肿与微量表面位移；软化后逐渐降低粗糙度并形成湿膜。碎裂前有受力变形，分离时细桥依次拉断，碎片通过阻尼弹簧与曲面支撑落稳。
- 工具按实际各部件的表面采样投影，位移分步扫掠，尖端、夹爪与杆身共享约束。判定曲面与 Blender 使用同一耳道 profile；验收另外用完整工具顶点与导出壁面射线检查，不能把有限采样算法宣称为无限精度的连续体仿真。
- 普通页面只暴露只读报告；`AuditTool`、固定帧步进和测试存档仅在 `debug=1` 的调试入口使用。

## 验收

在原有物理、经营、四尺寸整局、鼠标/触屏声音回归之外，新增 `Script_TactileDetailTest.mjs`：比较真实像素亮度、检查灯指向、湿膜参数、反馈历史、独立小铺、五工具升级和 40 组完整网格接触审计。截图与 JSON 只写 `_dev/`，不发布验收网页。
