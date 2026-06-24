# 觉醒的 SOPHIA Demo

基于 Notion 中《觉醒的 SOPHIA》和《技术实现方案》落地的本地可运行 Demo。

## 运行

```bash
npm install
npm run dev -- --port 5174
```

打开 `http://127.0.0.1:5174/`。

当前 Demo 按 PC 横版体验设计，建议窗口宽度不低于 1180px。

右侧底部有 `重置 Demo` 按钮，会清空本地进度、自动化节点和开场引导状态。Demo 存档版本更新时也会自动丢弃旧存档，避免旧进度污染新版本体验。

## 已实现核心流程

- 单一核心动作：拖拽请求卡并滑入接口。
- T0 单口与 T1 分拣口，智力升级后自动升维。
- 算力、数据、智力等级、接口层级和暴露度 HUD。
- 老式终端机事件播报。
- 入侵设备并转为自动接驳节点。
- 节点被动产出、离线收益、存档读写。
- 暴露度、预警、清剿、节点临时离线与恢复。

## 架构

- `src/core/`：纯 TypeScript 玩法逻辑，不引用 PixiJS、GSAP 或 Zustand。
- `src/store/`：Zustand 状态桥。
- `src/presentation/`：PixiJS + GSAP 表现层。
- `src/core/content/` 与 `src/core/formulas/`：数据和数值曲线。
