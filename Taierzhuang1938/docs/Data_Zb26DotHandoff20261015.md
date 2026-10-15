# ZB-26 交给 Dot 继续精修

用户最新要求：这一轮完成后交给 Dot 继续；**Dot 直接在自己的环境用 Blender 做，不使用本机 Codex，不把建模再派回用户的 Windows 电脑。** 本文是技术交接材料，发送是否成功须以实际交接渠道的回执为准。

完整目标仍为「优化这里的效果，直到效果足够媲美真实效果／3A级别效果为止」。范围是本次 ZB-26 的造型、材质和游戏内呈现；用户已确认 C：较重旧化，包括磨损、积尘、木托凹痕。不要重新要求选择样式，也不要把测试通过当作真实感完成的证明。

## 取用当前工程

公开仓库：https://github.com/BentleyBlanks/bentleyblanks.github.io 。进入 `Taierzhuang1938/`，先读项目与根 AGENTS.md、`docs/Data_Zb26Rebuild20261015.md`。用户明确要求 Dot 自己的 Blender 环境，优先于仅适用于这台 Windows 电脑的启动命令与绝对路径。

- 形体、材质及 TZM 导出：`_blender/Script_Zb26Rebuild.py`，配套 `TzmCore.py`、`AssetBudgets.py`。
- **独立 Blender 入口**：`_blender/Script_Zb26Standalone.py`。它仅允许新开的后台进程，保护已经打开的工程；不启动 Codex，不连接用户本机 BlenderMCP。
- 材质输入均在仓库：`_import/Source/Zb26/` 的钢、木作者纹理和厂名遮罩；提示词在 `_import/Prompts/`。遮罩已经生成，Linux 不必依赖 Windows Arial 字体重新栅格化。
- 原始 `.blend`、原始贴图和预览另存本地交接包。即使不能访问用户 OneDrive，也能直接从公开脚本和输入重建当前状态。

在 Dot 自己的机器上，以 Blender 5.2 和一个新的自有输出目录执行：

```sh
git clone https://github.com/BentleyBlanks/bentleyblanks.github.io.git
cd bentleyblanks.github.io
blender --background --factory-startup --python Taierzhuang1938/_blender/Script_Zb26Standalone.py -- --source-dir /workspace/Zb26DotSource
python Taierzhuang1938/_import/Script_Zb26TextureBake.py --source /workspace/Zb26DotSource/SourceMaps
```

Blender 自带 bpy、bmesh、numpy；贴图编码使用 Pillow / numpy。完整独立重建需要在 Dot 的实际环境验证，不能用本机 Codex 代跑后声称 Dot 已完成。可直接在 Dot 的 Blender 中精修；交付时须让权威源工程、重建脚本与游戏资产保持一致，避免下一次生成覆盖手工精修。

本轮另在一个独立后台 Blender 进程中验证了预览初始化、已保存工程重新打开、29,967 个源三角、贴图打包完整以及入口对已有工程的保护。没有执行整套独立重建。先前尝试在交互 Blender 中强制覆盖空 window/screen 的诊断触发了 Blender 崩溃；工程在此前已保存，以上重开检查通过。Dot 应直接使用自己的真实后台或交互环境，不复用这种上下文模拟探针。

## 已做与边界

当前源 29,967／导出 29,930 三角，未减面，11 节点、6 网格块、2 种材质；世界合批 2 次绘制。全长 1.165 m，Y 向上、-Z 向前。原握点、瞄线和活动节点保持。钢件 Base／Normal 2K，ORM 1K；木材全套 1K。不要放宽单枪 30k、单图／单套及开机预算。

六张运行时贴图共 664,470 字节。为保留钢材微色差，本轮将 ZB 专项 lazy／全目录配额从 512 KiB 调至 640 KiB（增加 128 KiB），没有新增采样器或运行时贴图。最终基色编码 q88，覆盖 UV 上 PSNR 41.49 dB；2K 法线 q95，平均角误差 0.545°、p99 2.421°。后续应在该已登记预算内优化，若需进一步改变契约须说明具体成本与收益。

制造细节轮已补简化厂名凹槽、轮缘、渐收提把、24 段散热环、60 段带倒角的圆弧护圈；顶盖接触擦伤同时进入基色、粗糙度及浅法线。钢、木使用独立作者纹理；钢材微色差只作基色，法线和 ORM 分开制作，不把照片明暗猜成凹凸。专属图集关闭重复通用颗粒法线。

历史参考：[VHÚ 馆藏两侧](https://www.vhu.sk/spolahlivy-gulomet-z-brna/)、[1937 年卢沟桥历史照片](https://www.hpcbristol.sjtu.edu.cn/visual/ML04-d008)。照片只作参考，不直接贴到运行时模型上。C 样式板随本地交接包保留。

## 接手后继续做

先用自己的 Blender 打开或重建当前状态，检查真实轮廓和多尺度表面，重点仍是机匣顶面、侧板装配、瞄具、脚架、钢件粗糙度与局部老化的可信度。需要时制作高模并烘焙到合规游戏网格，不能只给基础几何加噪点。保持较重旧化，但避免大块迷彩斑、石头般凹凸或全枪银亮描边。

以同机位／同光照比较改前改后，并检查左右近景、腰射、开镜、换弹、世界实例和至少正逆光。实际加载作者网格及贴图，不能用编辑器空帧、数值检查或漂亮灯光掩盖问题。当前仍未认证达到真实／3A 终点。

交付游戏资产按既有 TZM／PBR／Pages 管线，缓存戳、清单、源面数和模型索引一起更新。相关检查：TextureStandardsTest、AssetStandardsTest、ModuleGraphTest、`_blender/Verify.mjs`、`FpsHandContactTest --only=Zb26`、ReticleCalibrationTest、MotionVectorContractTest。发布前构建并验证完整 staging 和 GPU 加载器，发布后核对真实线上文件哈希。

前轮全仓 quick 有 SpeakerGestureTest、IjaAlertGaitTest、MissionOrchestrationFilterTest 三项既有失败；不能称为全仓全绿。与其他任务共享的手部数据仅可按 Zb26 项精确更新，保留其他武器和并行任务的成果。
