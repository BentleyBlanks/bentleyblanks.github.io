# 3D 模型制作工作台

在仓库根目录运行 `node scripts/Script_LocalPreview.mjs --no-open`。用输出端口打开 [高级工具控制中心](../AdvancedTools/ControlCenter.html)，在「资产」中选 [3D 模型制作工作台](../AdvancedTools/Tool_ModelWorkbench.html)。页面和写入口仅在本地预览服务可用。

## 日常制作

1. 新建「原画局部」任务后上传原画、局部截图或圈注图。可在工作台内画框、写字和画箭头。「自行搜集」任务由 Agent 查找多个视角、附来源、判断是否补三视图。默认出图用 `OPENAI_API_KEY` 调用 GPT‑Image‑2.6 Sunburst，每视角一张原生 2048 × 2048 PNG，质量 Max。更换途径或补要求时，可返修参考图并查看旧版。
2. 核对每张参考图、来源和生成判断后，点「通过参考图并开始建模」。批准锁定该参考版本。6.2 Astra xHigh 使用 Codex Goal，在任务专用 BlenderMCP 实例内建模，并逐图提交对齐渲染、相机和细节自检。
   参考图含明确的正面和至少一个侧面或背面时，也可点「通过参考图并用 Tripo MCP 建模（消耗积分）」。工作台上传这些批准的视图，通过已授权的 Tripo Studio 生成 HD PBR 基础模型，把 GLB 和 Studio 任务、模型 ID 保存在本轮 Blender 工程目录。建模会话继续精修，沿用独立验收和返修流程。重复取回使用原任务。
3. 每个模型版本通过完整性检查后，工作台开一个全新的 6.2 Sol High 会话逐图验收。返修意见按位置生成带编号的红框截图，在新建模会话中连同上一版工程和批准参考图继续迭代。独立验收通过后，工具栏和任务卡显示待验收。可在工具栏授权浏览器通知，通知需要工作台页面保持打开。
4. 「模型」页可切换视角和版本，打开原图、查看 GLB、下载 GLB 与重建脚本。截图按钮抓取当前对比图，也可粘贴或导入图片。需要返修时，把文字和标注图放进会话草稿，再点「按会话草稿返修」。历史需求与验收会话可在右栏下拉列表切换。

## 本机依赖与记录

- 使用当前账户登录的 Codex CLI，两个会话模型均需可用。Python 需要 Pillow，用于原图尺寸检查、Agent 预览和验收标注。默认从 PATH 调用 `python`，可用 `MODEL_WORKBENCH_PYTHON` 指定可执行文件。
- Tripo 途径使用本机 Codex 中名为 `tripo` 的 Studio MCP。首次配置运行 `codex mcp add tripo --url https://msapi.tripo3d.ai/mcp --oauth-client-id studio-codex` 并完成浏览器授权。授权过期后运行 `codex mcp login tripo`。生成使用 Studio 积分，每张参考图上限 20 MiB。
- Lovart 使用登录并选好项目的官方 Agent OpenAPI skill，可用 `MODEL_WORKBENCH_LOVART_CLI` 指向 `agent_skill.py`。有供应商付款确认时按供应商要求处理。Seedream 使用已登录的 Dreamina CLI，可用 `MODEL_WORKBENCH_SEEDREAM_CLI` 指定。内置 imagegen 需要本机 Codex 会话提供该工具。工作台按所选途径运行，失败时在任务内显示原因。
- 工作台任务状态和页面附件缓存在 `%LOCALAPPDATA%/BlanksTools/ModelWorkbench`，可用 `MODEL_WORKBENCH_DATA` 指定。新任务自动在 `OneDrive/AI/Models/Blender/Taierzhuang1938/<资产代号>/ModelTask_<YYYYMMDD>_<短ID>` 建目录。可用 `MODEL_WORKBENCH_BLENDER` 指定项目目录。资产代号可在新建时填写，留空用 `Asset_<短ID>`。已有任务继续读取原路径。
- `Data_Task.json` 索引参考图、轮次、导出、审批和原会话。服务准备 `References/`、`Models/Rxxx/`、`Textures/Rxxx/`、`Review/Rxxx/`、`Exports/Rxxx/` 与 `_Scratch/`。Agent 将正式贴图写入本轮 `Textures`，Blender 用相对路径引用。服务把通过交付检查的导出和对照图归档。任务停下后，先检查正式工程的贴图依赖，再手动清理 `_Scratch/`，保留需要追溯的请求和验收记录。
- 存量任务用 `node scripts/Script_ModelWorkbenchImport.mjs <本机任务索引 JSON>` 接入。输入可为一条或多条记录，每条包含 `threadId`、`title`、`assetCode`、`date`（`YYYYMMDD`）、`brief`、`request`、`created`（毫秒时间戳）、`projectFiles`、`attachments`、`evidence` 和 `messages`。前三个文件数组的元素使用 `{ name, file }`，`messages` 使用 `{ role, text, time }`。重复导入按原会话 ID 更新记录。原项目文件以路径关联，截图与会话摘录归档到 `Review/Imported/`。页面从原会话入口继续原任务。已有工程要转成可独立交付的规范目录时，先复制并重连依赖，再从新位置回导验证。
- 回归入口为 `node scripts/Script_ModelWorkbenchTest.mjs`。测试用隔离的本地存储和替身供应商，覆盖审批闸门、证据缺漏、独立退回、带标注返修和最终用户验收。
