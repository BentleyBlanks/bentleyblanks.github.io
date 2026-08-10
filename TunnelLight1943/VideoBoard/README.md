# 《地道里的光》剧情资产导演台

这是序章的外部剧情资产工作台，不是单一成片播放器。项目按“项目 → 章 → 场 → 镜头”组织，图片、提示词、视频和 AI 旁白分别保留稳定资产 ID、版本与依赖；26 个短视频节点继续保留播放顺序、时间码和转场，`Pro_All.mp4` 只作为两分钟审片备份。

## 版本与发布规则

- 重新生成只增加候选，不会覆盖当前采用版，也不会自动改游戏。
- 候选必须手动采用；旧采用版继续保留，可随时回退。未采用候选可以归档并恢复。
- 提示词有独立版本链。原始 Dreamina 任务提示词只读保存，用于审计，不直接作为当前生成配方。
- 参考图采用新版本后，只把下游视频标记为待检查，不会自动重生成。
- 工作区和发布清单使用独立存储键。发布清单是不可回写的深拷贝快照，包含层级、镜头顺序、采用版本、生成来源、提示词版本、参考图版本、旁白版本、转场和 BT.709 显示合同。

## 启动本机生成桥接

在仓库根目录运行：

```powershell
node TunnelLight1943/VideoBoard/Script_VideoBoardServer.mjs
```

默认监听 `127.0.0.1:47821`，页面地址为 <http://127.0.0.1:47821/TunnelLight1943/VideoBoard/>。`GET /api/health` 可检查桥接状态。服务硬编码只监听本机，不能通过参数改成公网代理。

线上导演台可以浏览、编辑、保存、预览和导出；当前本机直连生成器只负责视频候选。图片和旁白已经进入资产谱系与版本快照，但页面不会伪装它们已接通付费生成服务。

## 生成与积分确认

页面一次只提交当前视频资产。`POST /api/generate` 缺少 `confirmCredits:true` 时只返回 409 提醒，不会启动 Dreamina；用户在积分确认框中确认后才提交一次任务。成功结果只进入候选栏，必须再次手动采用。

桥接会同时校验节点 ID、该节点绑定的生成命令、参考图、模型、720p 和时长，防止把页面变成任意付费代理。时间线片段可短于生成时长，但生成时长不得短于时间线片段。

2026-08-09 依据本机 CLI 帮助复核：`image2video` 与 `frames2video` 没有 Seedance 2.5，故按用户指定的后备方案使用 `seedance2.0_vip + 720p`。不能仅凭未来模型名把 2.5 放进付费白名单；CLI 真正支持后再单独更新。

## 文件与裁切边界

- `Reference/` 是允许提交的参考图根目录；真实路径解析不得越界。可用 `VIDEO_BOARD_REFERENCE_ROOT` 指向另一个受控根目录。
- `Animation/` 保存 26 个当前视频版本，`Texture/` 保存预览海报。生成桥接不会自动覆盖这些已采用文件。
- Dreamina 查询结果可能先以远程 URL 成为候选。发布清单会标记媒体是否已持久化；正式部署前仍需下载、校验画风/人物连续性，并以本地版本替换候选 URL。
- 26 个现有 MP4 均为 1280×720、30fps、H.264、BT.709 limited、无音轨。部分文件尾部多 1–2 帧，导演台必须按节点 `duration` 裁切；直接无裁切串接会比 120 秒多约 1 秒。
- 旁白和配乐不得封进节点 MP4；它们保持独立资产和独立版本。

## 安全边界

- Dreamina 使用 `child_process.spawn` 参数数组和 `shell:false`；提示词不会拼进 shell 字符串。
- 只允许项目白名单中的 26 个节点、绑定命令/参考图、已由 CLI 证明可用的 Seedance 2.0 family、720p 和 4–15 秒生成时长。
- CORS 只允许 `https://bentleyblanks.github.io`、`http://127.0.0.1:*` 与 `http://localhost:*`，并支持浏览器 Private Network Access 预检。
- 服务只开放静态导演台、`/api/health`、`/api/generate` 和 `/api/task/:id`，不接受远程上传或任意文件路径。

## 无付费回归测试

```powershell
node TunnelLight1943/VideoBoard/Script_VideoBoardTest.mjs
node TunnelLight1943/VideoBoard/Script_VideoBoardServerTest.mjs
```

服务器测试使用假的子进程和嵌套成功响应，不会提交 Dreamina 任务或消耗积分。
