# CLAUDE.md · EarSpa3D

硬规矩与模块地图在 [`AGENTS.md`](./AGENTS.md)，跨模块接口在
[`Data_Contract.md`](./Data_Contract.md)。改任何东西之前先读这两份。

最小上手：

```powershell
# 1. 起本地预览（worktree 根；主检出占了 8080，本树落在 8081）
node scripts/Script_LocalPreview.mjs --no-open
#    打开 http://127.0.0.1:8081/EarSpa3D/index.html

# 2. 验收（截图证明不了「没报错」，一律走 CDP 探针）
node EarSpa3D/_dev/Script_Probe.mjs --url "http://127.0.0.1:8081/EarSpa3D/index.html" --wait 12000
```

三条最容易踩的（详见 AGENTS.md）：

1. 1 世界单位 = **1 毫米**；灯光强度按毫米尺度标定。
2. `canal` 的 `PointAt/NormalAt/FrameAt` 返回**缓存向量**，用完必须立刻拷贝。
3. 耳道里不透光——耳道视角下房间与角色整组不渲染，照明交给相机头灯。

看画面时不要等 rAF（无头下被压到 ~1fps，动画永远停在半路）：
`window.__EarSpaDebug.StepFrames(n)` 主动推进，再截图。
