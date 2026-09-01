# 视频转骨骼动画流水线（现状口径，2026-09-02 落地）

AI 生成实拍视频 → 3D 姿态估计 → 反解到卢沟桥 Biped 骨架 → 追加进十套角色 GLB。
首批产物：`CarryStretcherFront` / `CarryStretcherRear`（抬担架前/后位走循环）与
`WoundedLimp`（伤员跛行循环），三条都已进 `POSE_CLIPS`（语义键
`carryFront` / `carryRear` / `woundedWalk`）并接进后送队（EscortColumn）。

## 三级流水线

```
① 素材生成（付费，异步）
   起手图：codex exec + image_gen__imagegen（AGENTS.md 生图三级回退的第 1 级）
   图生视频：dreamina image2video --model_version=seedance2.5 --video_resolution=720p
② 关键点提取（本地免费，CPU）
   PYTHONUTF8=1 python Taierzhuang1938/_import/Script_MocapVideoExtract.py <mp4> \
       --name X --people N --cycle auto --fps 15
   → _import/_mocap/X[_pN].mocap.json + 叠帧 QC 图
③ 反解 + 写入 GLB（本地）
   node Taierzhuang1938/_import/Script_MocapRetargetClips.mjs \
       --clip ClipName=..._mocap/X.mocap.json [--clip ...] [--models ...] [--dry-run]
   → 十套 Model/Character/*.glb 追加 clip + 清单审计
联系图验收：node Taierzhuang1938/Script_MocapClipShot.mjs（_shots/actor_pose/MocapClips.png）
```

## 素材生成的硬要求（②③级能不能做全看这一步）

- **照片写实**。姿态估计模型（RTMW3D）是真人照片训练的，风格化画面提不动。
- **纯侧面（步态类）或 3/4 面**、镜头横向平移跟随、无切换无变焦、全身含脚入画、
  素背景匀光、衣物不遮四肢轮廓。提示词模板见 `_import/Script_MocapVideoExtract.py` 头注上方
  的调用记录（本轮三条视频的提示词都在会话工作目录）。
- 双人同框可行（担架前后位就是一条视频提出来的两个人），**并排走（搀扶）不行**——
  侧视里远者被全遮。搀扶类要么拆开单人拍，要么等管线支持多视角。
- 时长 8 s 起（≥2 个完整步态周期）；慢动作素材用 `--time-scale` 提速。
- 生成一条 160 积分（720p 8s Seedance 2.5）。**同一动作预算 2–3 条**，挑提取质量
  最好的一条；判据是叠帧 QC 图 + 步态周期自相关 r 值（≥0.7 才算干净）。

## ② 提取器的四条硬账（改脚本前读）

1. **左右肢按连续性重新配对，且必须在时间平滑之前**：侧视里两腿/两臂交叉时估计
   器会认反左右；先平滑会把认反那几帧的两条腿平均成一条（TunnelLight
   Script_MocapTrack.py 的老账，这里是 3D 版）。
2. **深度轴（z）只信低频**（重度平滑）且**符号按「左胯必须在 +X」自动校正**——
   单目深度分不清镜像。
3. 步态周期靠两踝前后差的自相关；搜索窗上限 4 s（跛行/负重一个整周期能到
   3.66 s，窗小了会抓到噪声峰——WoundedLimp 第一版就截出过 0.37 s）。
4. 输出坐标已经摆成 GLB 骨架空间的口径：**Y 上、面朝 +Z、左 +X、米制、地面 Y=0**，
   并带逐帧置信度（`confKeys`，反解侧的遮挡回退靠它）。

## ③ 反解器的取舍（为什么这么解）

- **两轴对齐**（骨向 + 弯曲平面法线）逐骨求世界旋转，父逆得局部四元数；脊柱链
  Spine/Spine1/Spine2/Neck 按 0.25/0.5/0.75/1.0 在骨盆姿态与肩线姿态之间 slerp
  分配（**锁骨挂在 Neck 下**，肩线必须在 Neck 闭合）。
- **躯干/头的偏航硬夹**：胯线、肩线、耳线的偏航几乎全来自左右关节深度差——单目
  最弱的一路，个别帧整根反号。硬规矩：横轴 X 分量必须为正、偏航/侧倾设上限，
  脸必须朝前。lerp 阻尼救不了反向，别退回去。
- **远侧臂遮挡回退**：逐帧置信度 <0.35 的臂用好臂的世界增量跨矢状面镜像
  （四元数 y/z 取反）；两臂都坏保持上一帧。
- **手与手指不走 mocap**（单目视频里没有信息量）：`hands=grip` 从 RifleRun 抄一帧
  握姿常量（握步枪 ≈ 握担架杆）。
- **贴地标定与写入方式照抄 Script_RestoreLugouPelvisTracks.mjs**：逐帧蒙皮最低点
  中位数移到 0，常数写 GroundRoot；新数据只往 BIN 尾追加；清单序列化走
  `Script_LugouManifestJson.mjs`（往返自检守着）。
- **54 节点全带 T+R+S 通道**（未驱动的写单关键帧静止常量）：缺通道的骨头会在
  AnimationMixer 换 clip 时停在上一条的姿势上。
- `--replace` 重烘同名 clip 会留孤儿字节；正式交付前 `git checkout -- Model/Character`
  再一次干净烘。

## 运行时接线（新增点名单）

- `Script_CharacterModel.mjs`：`LUGOU_ANIMATION_IDS`（16→19）、LABELS、
  `SOLDIER_ACTION_IDS`、`POSE_CLIPS`（carryFront/carryRear/woundedWalk）、
  `_ActionForState`（`state.carryRole = "front"|"rear"` 优先于开火与姿态；
  `state.woundedWalk` 仅在移动时生效）、`ASSET_VERSION` 4→5。
- `Script_Ai.mjs`：actor state 透传 `carryRole` / `woundedWalk`（摆点层钉在 soldier 上）。
- `Script_Actor.mjs`：characterRig 分支里负重时隐藏 `weaponGroup`（旗清了还原）。
- `Script_MissionSetpieces.mjs` EscortColumn：担架员成对纵列（前后隔 1.9 m）、
  `litters` 担架实体逐帧跟在两人中间（`host.MoveProp`，高度 = 垂手握杆 0.62 m，
  白布伤员再 +0.22）；任一担架员倒下 → 担架落地、幸存者清旗松手。
- `Script_Main.mjs`：宿主回调新增 `MoveProp(id, {x,y,z,rotationY})`。
- 守着它们的：`Script_CharacterModelTest`（19 条 clip 逐套核对）、
  `Script_CutscenePoseTest`（三条新姿态的高度带）、`Script_ActorPoseTest` /
  `Script_PlayTest`（clip 数 19）、`Script_MissionSetpiecesTest`、
  联系图 `Script_MocapClipShot.mjs`。

## 已知边界（下一轮再啃）

- 步态与实际移动速度不同步（clip 固定节奏，AI 走多快是另一回事）——背景 NPC
  可接受，抠细节时给 action.timeScale 接 moveSpeed。
- 担架实体是盒子占位（`MakeSetpieceProp` 的 stretcher/shroudedBody），手没有 IK
  到杆上，靠「垂手握杆高度 = 0.62 m」对齐；要真扣手得做挂点 IK。
- 「担架员跌倒 + 伤员滑落」（CH5 必要演出一）还没做成 clip：一次性演出、多人
  接触戏，等这条流水线的一次性（非循环）模式跑一遍再定。
- 搀扶行走（双人）视频已生成未提取（并排遮挡），素材在会话 scratchpad。
