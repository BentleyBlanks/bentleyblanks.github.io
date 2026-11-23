# 动作制作管线工作台（MotionWorkbench）

面向游戏角色定制动作的 5 阶段本地工作台 + 无服务器 GPU（Modal Serverless）视频转骨骼后端：

1. **01 文字表述**：按《视频转骨骼拍摄标准》自动组合 45° 斜侧固定机位、纯白背景、单人全身入镜提示词。
2. **02 关键帧分镜生成（可选）**：直接调用本地 `dreamina-canvas` CLI 生成首帧定妆/姿态关键帧（先报价确认积分，再执行）。
3. **03 视频生成（多次抽卡）**：直接调用 `dreamina-canvas`（支持 `seedance_2.5_flash` 等模型）多次抽卡并自动下载对比，或直接导入本地 `.mp4`。
4. **04 视频转骨骼（零空转云端 GPU）**：一键提交至 Modal Serverless L4 GPU 运行 **NVIDIA GEM-X Native77 + SOMA-X v0.3.3 + Blender 4.2**，实时回传 **GPU / 显存 / 内存 / 硬盘与阶段进度**，自动回传 `.glb` / `.fbx` / `.bvh` / `.usd` / `overlay.mp4` / `world.mp4` 并支持三画同步逐帧核对。
5. **05 骨骼动画修缮**：逐帧记录问题清单，一键生成包含 `scripts/Script_BlenderMcp.mjs` 规范的 `RefinementBrief.md`，并可直接派发本地 Codex / Antigravity CLI 操控 BlenderMCP 逐帧对照视频修缮。

---

## 为什么不会空转 GPU？

云端服务（`cloud/modal_gemx_service.py`）拆为两层：

- **CPU 轻量网关（`@modal.asgi_app()`）**：只负责接单、查进度、读硬件遥测、流式下载成品。前端每秒轮询状态**不会唤醒 GPU，也不会保活 GPU**。
- **L4 GPU Worker（`min_containers=0`, `scaledown_window=60`, `max_containers=3`）**：平时 **0 卡休眠（\$0）**；提交视频时自动拉起 L4，多任务按并发上限弹性扩容，任务结束空闲 60 秒后自动回收。

---

## 一、一次性部署云端无服务器 GPU（Modal）

> 只需做一次。完成后会得到一个永久固定 URL，以后日常使用无需再打开 Colab 或命令行。

1. 在本地 PowerShell 执行一键部署脚本：
   ```powershell
   powershell -ExecutionPolicy Bypass -File MotionWorkbench\cloud\Script_DeployModal.ps1
   ```
2. 首次运行会自动安装 `modal` CLI 并弹出浏览器完成 Modal 账号登录与授权（Modal 新账号通常带有每月免费额度，按秒计费，不跑不扣费）。
3. 部署成功后终端会输出类似地址：
   ```text
   https://<your-workspace>--gemx-mocap-serverless-web-api.modal.run
   ```
4. （可选）如果要给接口加访问密钥，可在部署前设置 Secret：
   ```powershell
   modal secret create gemx-mocap-secret MOCAP_API_TOKEN=你的随机密钥
   ```
   然后在工作台设置里填入同一个 Bearer Token。

---

## 二、日常启动工作台

方式 A（双击启动，自动打开浏览器）：
- 双击 `MotionWorkbench\Launch_Workbench.cmd`

方式 B（命令行静默启动，默认端口 `8788`）：
```powershell
node MotionWorkbench\server\Script_WorkbenchServer.mjs 8788
```
然后访问：`http://127.0.0.1:8788/`

### 首次使用配置
1. 点击右上角 **⚙ 云端 GPU 与管线配置**。
2. 填入上面部署得到的 `Modal Serverless URL`（以及可选的 API Token），点击 **测试云端连通性**。
3. 顶部状态栏会实时显示：
   - **即梦 CLI**：当前登录账号与可用积分（默认读取 `C:\Users\admin\bin\dreamina-canvas.exe`）。
   - **云端 GPU**：`0 卡休眠（零计费）` 或运行中的 L4 实例状态。
4. 可选填写**成品镜像目录**（例如 `C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼`），转骨骼完成并下载后会自动同步一份副本到该目录。

---

## 三、本地数据与仓库隔离

- 所有运行期任务数据、抽卡图片/视频、回传的 `.glb/.fbx/.bvh/.usd` 与 `RefinementBrief.md` 均保存在 `MotionWorkbench/_workspace/`（已加入 `.gitignore`，不会污染 Git 仓库）。
- 首次启动时，若本地存在已验证的 01 关测试产物（`01-1 冬瓜` 与 `01-2 罗班长`），工作台会自动导入为两条示例任务，可直接进入第 4/5 阶段体验三画同步审片与修缮任务单。
