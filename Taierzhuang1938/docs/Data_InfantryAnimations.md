# 视频动作接入

国军与日军的 01–04 原模型各有一份 `Model/Character/Animation_Lugou<Faction>0<Variant>Infantry.glb`。这八份文件只带骨架曲线和道具轨道，复用正式人物与枪械，不重复载入研究用的人物网格。

| 动作 | 正式入口 | 播放方式 |
| --- | --- | --- |
| RifleCrouchAdvance | 持步枪、低姿移动 | 原地循环，按实际地面位移调整步频；受阻时停步 |
| StandToKneel | 持步枪、站姿转低姿静止 | 单次，接 KneelHold |
| KneelHold | 低姿警戒与射击 | 循环 |
| KneelToStand | 离开低姿 | 单次，接站姿；中途反向切换保留进度 |
| GrenadeThrow | throwing 上升沿、原有 VolleyThrow 事件 | 单次，2.15 秒脱手，收势后返回站姿 |

`Script_InfantryAnimation.mjs` 管动作衔接；CharacterModel 仍拥有整个人物的姿态优先级。卧姿、军官/手枪、机枪、救护、腾空、死亡和白刃演出保留专用路径。新增动作也列入人物动作编辑器，并提供“跪下 → 警戒 → 起身”的连续演示。投弹演示每六秒触发一次。

VolleyThrow 继续使用原有 Combat.Throw 弹道、伤害与物理规则。具备新动作的演员先完成起手，再从脱手挂点发射；恢复动作期间不继续走路或射击。没有动作库的角色保留即时投掷退路，不新增自主投弹 AI。

## 原骨架与接触

同阵营的四套人物骨段长度基本相同，但场景归中偏移最多约五厘米。离线转换按每套原始 bind 关系转换世界变形，再还原该套局部曲线。保留全部原网格、旧动画与骨架层级，包含 NRA03 的额外骨骼。IJA03 原本游离于 armature 的头盔在实例化时按静止变换挂到真实头骨。

源片的鞋底已经修正；接入时进一步对实际裤膝表面留出地面余量，同时用原长双骨链保持脚底锚点。步枪轨道在不同动作之间混合，避免旧片没有道具曲线时把枪插值到场景原点。武器保持实际尺寸，不随人物身高伸缩。

新旧片段混合时检查实际腿部蒙皮，修正旋转插值导致的短暂穿地。回到原站姿 AdvanceFire 后使用离线 120 Hz 接地曲线，避免常驻逐顶点计算。CPU 采样先刷新 SkinnedMesh 的当前绑定逆矩阵，与渲染器的更新顺序一致；修正只平移显示骨架，不修改地形或碰撞体。

## 重建与验收

`_import/Script_InfantryRuntimeBake.mjs <Deliverables目录>` 从已验证的五种动作、两军完整 GLB 重建八份游戏动作库与 Data_InfantryAnimations.json。复用原 Seedance/GVHMR 缓存，不重新生成视频。

`Script_InfantryAnimationTest.mjs` 使用游戏 ActorFactory 验证全部八套人物、四十条动作、真实蒙皮接地、循环支撑脚、步频、武器尺寸、单次脱手、姿态优先级和编辑器持续播放。实测低姿循环支撑脚的最大水平漂移约 0.42 毫米。测试图片和报告默认写入忽略目录；可用 `INFANTRY_TEST_OUTPUT` 指定本地输出目录。

本机修正源工程、预览与游戏动作库副本位于 `C:\Users\Bentl\Downloads\GVHMR\InfantryActions_20260905\GameIntegration`。`Scene_InfantryGameIntegration.blend` 保留可编辑曲线及带 `_SourceReference` 后缀的修正前动作。BlenderMCP 已核对两军十条修正动作与运行时关节位置、完整蒙皮接地一致。

来源仍为非商业研究与效果验证的 Seedance 2.5 → GVHMR → 原人物骨架工作流。本次不改变原模型、生成素材或动作恢复工具的许可；SMPL-X 模型权重、授权文件、视频和恢复缓存均不进入站点仓库。
