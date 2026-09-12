# EarSpa3D 项目入口

3D 拟物采耳 ASMR 与轻经营游戏，入口 `EarSpa3D/index.html`。协作、资产生成和发布遵循 [根规范](../AGENTS.md)。

## 当前入口与定位

| 文件 | 当前职责 |
| --- | --- |
| `index.html`、`Script_ChunkGame.js`、`Style_Chunk.css` | 启动、UI、实际输入、营业与设置接线 |
| `Script_Core.js`、`Script_ImmersiveScene.js` | 渲染核心、实时耳部场景、器具与物理装配 |
| `Script_PeelPhysics.mjs`、`Script_SoftWaxPhysics.mjs`、`Script_FractureGeometry.js` | 块体状态、薄壳形变与断口 |
| `Script_SlimePhysics.mjs`、`Script_SlimeConstraints.mjs` | 油耳凝胶与体积约束 |
| `Script_InstrumentInteraction.mjs`、`Script_WaxEdgeContact.mjs` | 工具真实工作端与边缘接触 |
| `Script_Shop.js`、`Script_InstrumentShop.js`、`Script_CollectionTray.js` | 经营、器具小铺与跨客收集盘 |
| `Script_Audio.js`、`Script_ContactFriction.mjs`、`Script_LandingSound.mjs` | 声音调度、接触门控与落盘分档 |

旧 `Script_Main/Hand/Wax/Ui` 是兼容参考，不是当前装配入口。需要追因时正常跨模块查看实现。

## 按任务查阅

- 改输入、接口、空间、物理或经营，读 [当前契约](Data_Contract.md) 涉及章节，再按其路由查分项；单点文案无需通读旧 API。
- 改外耳、工具或材质，按 [分项契约](Data_SystemContracts.md) 定位对应资产说明与源工程。
- 选测、截图及交互证据见 [验收索引](Data_Verification.md)；单文件交付见 [打包说明](Data_Packaging.md)。

## 始终保留的边界

- 毫米尺度、真实工作端碰撞和质量守恒；缓存空间向量在下一次查询前复制。
- 已确认写实器具与暖黑 UI；女声停用，已试听的音频成品不擅自替换或变速。
- CSS、JS 或资源引用变化在提交前更新相应 `?v=`；验收图、报告和单文件产物留在忽略的 `_dev/`，复用的检查脚本放在项目目录并跟踪。
- 页面变化在本任务预览中验证实际输入／渲染并查看截图；纯说明整理只检查内容、引用、命令和 diff。按影响选测，共享基础设施扩大检查，已有通过结果不无故重复。

从 worktree 根运行 `node scripts/Script_LocalPreview.mjs --no-open`，端口以输出为准，用 `/__preview/ping` 核对根目录。检查命令显式传本任务 URL，不沿用其他会话端口。
