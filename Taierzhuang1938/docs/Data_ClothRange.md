# 布料模拟测试场

入口：选章节 → 测试场景 → **布料模拟测试场**，或 `?cloth=1`。这是独立沙盒，没有敌军、武器、环境音或剧情进度写入。默认近看冬瓜厚棉被；面板切换门帘、锦旗或全景，拖动画面旋转、右键拖动平移、滚轮缩放。

## 三件试验样品

- **冬瓜厚棉被**：独立封闭双层壳，标称填充 80 mm，带棉胎起伏、绗缝、补丁和包边；默认盖在碰撞替身上。可提两角、松手、重新披覆。此处替身只用于接触观察，不是人物外观替换。
- **进门棉门帘**：标称填充 30 mm，顶边 12 点固定，推球穿过后退出，门帘靠重力和阻尼回落。
- **川军出川锦旗**：标称 4 mm 旗布，顶边固定，持续风及一次阵风预览；正面面向初始观察机位。白底黑字、红边和斜带是试验创作，非馆藏原件逐项复刻。史实背景和创作边界同步在资料馆「史实与创作对照」。

所有样品的填充厚度是**标称值**：绗缝、包边和不均匀棉胎局部更薄或更厚。源资产、真实拓扑与重建步骤见 [资产说明](../Model/ClothLab/Data_ClothLabAssets.md)。Blender 原工程保存在 OneDrive 指定目录；验收截图在忽略目录 `tmp/ClothRange/`。

## 参数与隔离

`Data_Tuning_ClothRange` 是测试场的预设和控件边界：薄布、厚棉布、填棉被、棉门帘、旗布五档。可单独调标称厚度、面密度、抗弯、抗拉、抗压缩、抗剪切、空气阻尼、接触摩擦、粗糙度、风速。面密度仅控制风压的加速度，不改变重力；厚度同时修改本实例外壳和接触间隙。暂停和单步只影响测试场；导出 JSON 是独立参数快照，不写入游戏配置或用户存档。

`Script_ClothRange` 直接创建私有 `BlanketClothRig`，每个实例复制 solver 配置、骨架、几何和材质。**没有修改** `BLANKET_CLOTH`、`BLOCKOUT_BLANKET`、旧 `Model_SingleBlanket.glb` 或白盒人物布料配置。正式被子继续沿用原行为。旧资产和代码的内容哈希在 `ClothRangeTest` 中受保护。

`Script_ClothLabSimulation.ApplyClothWind` 根据当前布面法线与相对风速施加风压；模拟固定 1/60 秒、每帧最多四步，长帧不无限追时。物理点写到骨骼，走现有不透明蒙皮与上一帧骨矩阵管线。只有修改厚度时改本实例静态壳几何并通知 camera cut，连续动画不逐顶点写几何。

这是基础 PBD 布料，**没有自碰撞或棉絮体积压缩**。极端折叠下厚壳可能相穿；本场景用于挑选外观与手感，不能据此声称已有完整厚织物体积求解器。

## 接入与检查

- `Data_ClothRange`：独立 phase、平地边界、门框与旗架；`Script_ClothRangeField` 用 BuildSink 合批静态几何。
- `Script_Main`：`?cloth=1` 才实例化运行时，接管 orbit 输入与模拟；清场 Dispose 回收监听、几何、材质和骨架。
- `Debug.ClothRange`：`State / Select / Preset / Set / Reset / Pause / Step / Gust / Action / Camera / Export / ShowPanel / Wireframe`。`State` 给出各样品真实参数、质点统计、硬钉误差、姿态校验值和模拟耗时。

```powershell
node Taierzhuang1938/Script_ClothRangeTest.mjs
node Taierzhuang1938/Script_ClothRangeBrowserTest.mjs
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=clothRange --profile=prepush
```

Node 门禁核对旧布料哈希、参数边界、风压/面密度、真实 GLB 封闭壳、217 骨、蒙皮与稳定悬挂。浏览器门禁使用真实高画质渲染，验收三样品、五预设、控件隔离、披覆/提角/落下、推帘/阵风、暂停/单步和实际蒙皮运动历史。视觉证据必须查看，数值不能代替棉被质感判断。

## 2026-10-24 验收记录

真实高画质截图保存在 `tmp/ClothRange/`，模型观察图长边 640，原始视口截图仅留本地。三件原始及调到 120 mm 后的法线/切线均通过正交、单位长度检查；V3 包边不再使用退化 UV。菜单源码/发布包、浏览器打包、资料馆、字体与模块图检查通过。

全项目快测遇到既有 `SpeakerGestureTest` 的 `FrontObservation.02` 连续手势断言；用 `origin/master d6fd24b6` 的测试与 19 份依赖原样复现。本次七关 `BootTest` 在 240 秒超时，旧关卡有爆炸检查和日军远景材质失败；未修改主检出的定向基线复测确认 phase 1 同样存在远景材质 `count=0`，phase 0 则止于既有等待超时，未取得健康数据，不能据此宣称复现其全部爆炸断言。基线证据在本地 `tmp/BaselineSpeaker/`、`tmp/BaselineBoot/`，没有削弱断言或修改这些无关业务。

最终 clothRange prepush 8 项全部通过，包含普通入口按钮、实时循环、鼠标旋转、无指针锁、暂停/单步、Esc 暂停与返回。三件最终实际游戏截图已查看。
