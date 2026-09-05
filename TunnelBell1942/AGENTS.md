# TunnelBell1942 项目入口

《地道战 · 钟声》为 Three.js 2.5D 横版叙事冒险白盒，使用长焦透视相机。仓库协作与交付见 [根 AGENTS.md](../AGENTS.md)。

## 产品与技术契约

- 三幕为「钟声 / 翻口 / 转移」：第一幕高老忠敲钟后牺牲，后两幕高传宝组织转移；不把第一幕改成打赢。玩家没有独立攻击键，敲晕、放冷枪、拉地雷等行动通过有位置与局势前提的环境互动完成。
- 地道提供主动调动、绕行、封路和掩护；潜伏等待不是唯一解法。挖掘保留时间、声音、弃土证据的代价，真正改变可通行地形与画面，不能绕过叙事必然。
- `Data_Levels.mjs`、`Data_Story.mjs`、`Script_Rules.mjs` 保持纯 Node 可运行，不 import three；`Script_Render.mjs` 与 `Script_Actor.mjs` 只读玩法 state。
- 第三方依赖仅使用本地 vendor/three。美术程序化生成，音频 WebAudio 现场合成，不加载外部图片或音频文件；音频不可用时不阻塞游戏。
- X 向右、Y 向上、Z 向观众，单位米；与仓库中其他游戏的坐标约定独立。详细相机与舞台规则见参考第 2 节。
- `StepPlay` 保持确定性，随机走 `Data_Contract.NextRandom`；存档键 `tunnelbell1942_v1` 与其他项目隔离。
- 模块表约束职责和依赖；本次未分配并行文件所有权时，可修改所需模块，包括 Data_Contract 与 Script_Main，并同步接口和验收。

## 按任务查阅

完整数据格式、API、设计与验收断言保留在 [Data_ModuleReference.md](Data_ModuleReference.md)，沿用原 AGENTS.md 的章节编号：

| 改动 | 对应参考章节 |
| --- | --- |
| 玩法、挖掘、叙事 | 0、3、4、5 |
| 模块接线、依赖与事件 | 1、5.3、8 |
| 坐标、镜头、渲染 | 2、6 |
| 角色动画 | 5.2、7 |
| 音频 | 7.2 |
| 通关与存档验收 | 9 |

阅读涉及章节并核对实现即可，不要求每次通读全部参考，也不限制诊断时查看其他模块。

## 验证与交付

- 运行时改动执行 `node TunnelBell1942/Script_SmokeTest.mjs`。
- 渲染改动追加 `node TunnelBell1942/Script_RenderHealthTest.mjs`，结合 GL 错误、渲染统计和像素分布检查；截图入口 `node TunnelBell1942/Script_Screenshot.mjs`。
- 页面脚本或资源变化在提交前更新 index.html 的 `?v=`；先本地验收，再按根流程交付 master。
- 纯指令或文档整理检查迁移内容、引用与 diff，不启动游戏回归。
