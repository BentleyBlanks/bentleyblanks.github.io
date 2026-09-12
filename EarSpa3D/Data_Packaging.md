# EarSpa3D 单文件交付

仅在交付离线单文件或修改资产读取方式时使用。命令从本任务 worktree 根执行；源工程、报告与验收页面不提交到站点仓库。

### 打一个能双击打开的单文件版

```powershell
node EarSpa3D/Script_BuildStandalone.mjs          # 产物：EarSpa3D/_dev/EarSpa3D_Standalone.html（约 45 MB）
node EarSpa3D/Script_BuildStandalone.mjs D:/某处/采耳.html   # 也可以指定落点
```

发给没有本地服务器的人时用它。**不能**直接把目录拷过去——`file://` 下浏览器有两道墙：
ES module 的 import 走 fetch 会被判跨源，读同目录的 `.json/.glb/.png` 同样被判跨源，
两样都是整页白屏。打包器对应地做两件事：用 esbuild 把模块图摊平成一段**内联 ESM**
（内联脚本自己不需要 fetch），再把 `Audio/Models/Textures/Data_CanalProfile.json`
base64 进页面，首次取用时转成 `blob:`，并把 `fetch` / XHR / `img.src` / `innerHTML`
四个取资产的口子改道过去（图标是拼 HTML 串进 DOM 的，只改 `src` setter 盖不住）。

改了资产的引用方式（新增目录、换成 `setAttribute` 取图之类）要顺手跑一遍这个打包器并
在 `file://` 下开一次，产物里 404 是静默的，只有真打开才看得见。

常规网页验收使用 [根预览脚本](../scripts/Script_LocalPreview.mjs)；需要同一局域网手机实机测试时加 `--lan --no-open`，端口与地址以输出为准。可复用验证脚本见 [验收索引](Data_Verification.md)。
