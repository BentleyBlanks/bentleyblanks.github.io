# 粒子特效编辑器

入口：右下角齿轮 / **` 键 → 工具目录 → 特效预览**。

也可直接打开 `/Taierzhuang1938/?whitebox=p012&editor=vfx&quality=high`。关卡准备好后自动进入编辑器，背景游戏暂停。使用正式 VfxSystem、ParticleSystem、材质与后处理，预览不另造一套效果。

从默认白盒画质的工具目录进入时，编辑器临时保留粒子和舞台的原材质，避免白盒的“隐藏特效”规则造成空白预览；退出后恢复原规则，不修改游戏画质或本机偏好。天空与后期仍采用当前画质，完整光照和泛光需要 `quality=high`。`ParticleEditorWhiteboxTest` 使用不带 quality 的 `?phase=2&editor=tools` 入口，点击特效预览和扬尘，比较真实粒子像素并检查退出还原。

## 操作

- 顶部常驻播放、暂停、单帧、归零、停止与时间轴；时间轴可切换 10 / 30 / 60 秒，播放速度 0.1–2 倍。空格暂停/继续，右箭头逐帧，Shift+右箭头推进十帧，Home 归零。
- **效果库**：选择火、烟、爆炸、枪口焰、命中、曳光、血雾、弹壳、环境飘尘、六种体积烟场和落点预警；调整规模、风、重播间隔与随机种子。可拖动旋转、滚轮缩放，或按“适配镜头”；短促小型效果会使用较近机位。
- **粒子模块**：选择实际参与效果的粒子层，编辑 Main、Emission、Shape、Velocity、Force、Size、Color、Rotation、Noise、Renderer。曲线支持常数、随机区间、曲线、随机双曲线；拖动曲线点，双击或按按钮加点。颜色支持色标、亮度和透明度。
- 发射参数影响下一批粒子；生命周期曲线可直接作用于当前粒子。需要准确比较时按“播放”重播，或拖动时间轴按相同种子重建指定时刻。
- 事件发射通道（例如枪口烟、命中碎屑）的初始寿命、速度、尺寸是对游戏出生参数的**倍率**，不将事件的发射点改成一个虚构的固定位置。自动发射模块可叠加启用。
- 可以添加或删除自建粒子层；预置效果层可在 Renderer 中关闭显示。

## 保存

“保存到浏览器”供本机继续编辑。JSON 导入、导出和下载用于共享、提交给 agent 或接入项目。预设格式 `TengxianParticleEffect` 记录效果、种子、规模、风、各层修改及自建粒子层。

“应用参数到当前关卡同名层”是明确的应用动作：更新当前关卡的同名层，以及后续同名预设的生成参数。它不直接写项目源文件；需要永久交付时，将导出的数据落实到相应 `Data_Tuning_*` 后再验收。

## Agent 接口

```js
Tengxian.editor.Open("vfx");
const editor = Tengxian.ParticleEditor;
editor.Effects();
editor.SelectEffect("ExplosionMortar");
editor.Seek(0.35);             // 按固定种子重建并暂停
editor.Inspect();             // 当前层、粒子、预算与时间
editor.SelectLayer("channel:smoke");
editor.EditLayer({noise:{enabled:true,strength:0.3}});
const preset = editor.Export();
editor.Import(preset);
editor.Step(1);
```

进入编辑器会隔离粒子、血滴/血迹、持续源和灯光包络。暂停冻结粒子和预览灯光，退出恢复原场景对象、随机序列与原灯光集合。只有明确按“应用参数到当前关卡同名层”才把参数带回关卡。

验收 `Script_ParticleEditorControlsTest.mjs`：真实浏览器直接入口、原生按钮/下拉/数字框、曲线拖拽、时间定位、预设往返、本机保存、自建层增删、灯光暂停与退出还原；截图在已忽略的 `_shots/ParticleEditor/`。
