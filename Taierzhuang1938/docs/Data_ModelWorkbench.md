# 3D 模型制作工作台

在仓库根目录运行 `node scripts/Script_LocalPreview.mjs --no-open`。用输出端口打开 [高级工具控制中心](../AdvancedTools/ControlCenter.html)，在「资产」中选 [3D 模型制作工作台](../AdvancedTools/Tool_ModelWorkbench.html)。页面和写入口仅在本地预览服务可用。

## 日常制作

1. 新建「原画局部」任务后上传原画、局部截图或圈注图。可在工作台内画框、写字和画箭头。「自行搜集」任务由 Agent 查找多个视角、附来源、判断是否补三视图。默认出图用 `OPENAI_API_KEY` 调用 GPT‑Image‑2.6 Sunburst，每视角一张原生 2048 × 2048 PNG，质量 Max。更换途径或补要求时，可返修参考图并查看旧版。
2. 核对每张参考图、来源和生成判断后，点「通过参考图并开始建模」。批准锁定该参考版本。6.2 Astra xHigh 使用 Codex Goal，在任务专用 BlenderMCP 实例内建模，并逐图提交对齐渲染、相机和细节自检。
3. 每个模型版本通过完整性检查后，工作台开一个全新的 6.2 Sol High 会话逐图验收。返修意见按位置生成带编号的红框截图，在新建模会话中连同上一版工程和批准参考图继续迭代。独立验收通过后，工具栏和任务卡显示待验收。可在工具栏授权浏览器通知，通知需要工作台页面保持打开。
4. 「模型」页可切换视角和版本，打开原图、查看 GLB、下载 GLB 与重建脚本。截图按钮抓取当前对比图，也可粘贴或导入图片。需要返修时，把文字和标注图放进会话草稿，再点「按会话草稿返修」。历史需求与验收会话可在右栏下拉列表切换。

## 本机依赖与记录

- 使用当前账户登录的 Codex CLI，两个会话模型均需可用。Python 需要 Pillow，用于原图尺寸检查、Agent 预览和验收标注。默认从 PATH 调用 `python`，可用 `MODEL_WORKBENCH_PYTHON` 指定可执行文件。
- Lovart 使用登录并选好项目的官方 Agent OpenAPI skill，可用 `MODEL_WORKBENCH_LOVART_CLI` 指向 `agent_skill.py`。有供应商付款确认时按供应商要求处理。Seedream 使用已登录的 Dreamina CLI，可用 `MODEL_WORKBENCH_SEEDREAM_CLI` 指定。内置 imagegen 需要本机 Codex 会话提供该工具。工作台按所选途径运行，失败时在任务内显示原因。
- 任务、审批、截图、生成请求和产物历史保存在 `%LOCALAPPDATA%/BlanksTools/ModelWorkbench`，也可在起服前设置 `MODEL_WORKBENCH_DATA`。独立 Blender 源工程按任务和轮次保存在 `OneDrive/AI/Models/Blender/Taierzhuang1938/ModelWorkbench` 下，可用 `MODEL_WORKBENCH_BLENDER` 指定源工程根目录。
- 回归入口为 `node scripts/Script_ModelWorkbenchTest.mjs`。测试用隔离的本地存储和替身供应商，覆盖审批闸门、证据缺漏、独立退回、带标注返修和最终用户验收。
