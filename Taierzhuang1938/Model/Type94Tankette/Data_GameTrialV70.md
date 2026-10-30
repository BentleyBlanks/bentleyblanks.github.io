# Type94 game PBR checkpoint V70

本地候选从 V68 的最新材质与 V64 几何派生，79,580 三角、237 网格所有者、292 控制节点、每侧 80 独立履带片。正式游戏 V12 未替换，未推送。整体参考形态、最终材质依据和最终游戏验收仍未通过。

低模重新展开 UV，以实际高模的导出三角化作投射面，烘焙 Paint 4K、Track/Steel 2K、Rubber 1K 的 Base/ORM/Normal 共 12 图。漆层有效像素约 54.9%。9,648 个直接投射漏射像素通过最近真实高表面的原着色器重新采样；世界法线按低模 Mikk 切线框架转换，不伪造颜色或平法线。保存补投前 PNG、采样数据与逐像素重放证据。

旧游戏候选只在实际高、低表面均精确一致时复用连续距离证明。车体 202 分块重新生成、认证，并在最终源重开后独立复核。八件悬挂槽保留前、后及凹底平面，平面剖面沿用 2 微米数值门槛；圆顶游戏近似受原 3 毫米表面门槛约束。剖面检查 56 项通过，实际世界表面上界 2.997994 毫米。尺寸与不可见截面仍属重建推定。

实测：实际 GLB 检查、237/237 高低源与导出表面、12 图像素与材质绑定重开、39 项原生运动、128 行走轮姿态、32 完整履带相位、24 项全转角间隙、937 项浏览器机构、29 项材质 UI、6 组同机位高低模切换通过。当前侧罩与行走机构预览已人工观察。八件新槽的冷重建表面签名一致；完整十二图冷重建现已由 [V72 独立重建审查](Data_GameRebuildV72.md) 验证。

预览：[本地 V70](http://127.0.0.1:8114/tmp/Type94GameReviewV70/)，可切换 V68 高模。预览页、图片、`.blend` 与完整 GLB 留本地；源和证据位于 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\Type94Tankette\GameTrialV70`。精确身份及检查报告见 [Data_GameTrialV70.json](Data_GameTrialV70.json)。

重建：`node Taierzhuang1938/_blender/Script_BuildType94GameV70.mjs`；先用 `--dry-run` 查看阶段，`--phase` 单阶段、`--from` 续跑。入口使用本仓 Blender 生命周期管理器，源输入为保留的 V68/V56/V59 哈希检查点，需本机 Python、NumPy、Pillow。几何继承需这些显式检查点，不声称无依赖重建。对应脚本与代码依赖副本保存在 `Rebuild/` 用于复核，实际运行仓库入口。Blender 无本任务残留的实测命令为 `node scripts/Script_BlenderMcp.mjs status --scan --json`，原始输出保存在 `Acceptance/Data_OwnedBlenderCleanupV70.json`。
