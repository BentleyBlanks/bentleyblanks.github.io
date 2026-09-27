# RelaxedGait：背枪走 / 空手走与放松站姿

2026-09-26 按用户反馈加：开场里日军、翻译从远处走来走去都是端枪的步态（生产步态只有 `RifleRun` 与站姿据枪 `AdvanceFire`，没带枪的翻译也在空手「端枪」）。日军走动应当背枪，翻译应当空手走或小跑。

## 资产

- `Animation_TengxianHumanoidV1RelaxedGait.json`：两条 three.js clip（`AnimationClip.toJSON` 格式，轨道名为 GLTFLoader 净化后的骨名），绑定 TengxianHumanoidV1 共用骨架，七套 Tengxian 模型都能直接播。
  - `RelaxedWalk`：原地走路循环，1.08 s，参考速度 1.35 m/s，步幅 1.46 m；脚跟着地→全脚掌→脚尖蹬离（脚尖支点）、摆动腿先收后展，骨盆起伏/侧移/转动/侧倾，肩背反扭，双臂与腿反向摆动、手掌朝大腿、手指放松半握。
  - `RelaxedStand`：4 s 放松站姿循环（膝微屈、呼吸、轻微重心摆动、双手自然下垂）。
- `Data_RelaxedGait.json`：生成参数、源模型哈希、实测接触区间（与 `_import/Script_LocomotionProfileBake.mjs` 同法：脚尖关节贴地且向后走）、骨盆高度、逐帧鞋底高度范围与超伸帧数。
- 跑步沿用 `Animation/BackRifleRun` 的 `BackRifleRun`（同一骨架）；背上那支枪与背带挂在该 GLB 的 `Socket_BackRifle` 上。

## 生成与验收

```text
node Taierzhuang1938/_import/Script_RelaxedGaitBake.mjs            # 重烘两条 clip 与清单
node Taierzhuang1938/_import/Script_RelaxedGaitBake.mjs --verify   # 清单/clip 是否过期
node Taierzhuang1938/Script_RelaxedGaitTest.mjs                    # 纯 node 门禁（quick 层，animation / openingStoryboards 域）
```

生成器是纯 Node：从 `Model_TengxianNra02.glb` 读绑定姿态与蒙皮，程序化解腿（两骨 IK）、脚的滚动（脚跟/脚掌支点）、上身与手指，每帧用真实蒙皮鞋底顶点把站立脚压回地面（3 次迭代），骨盆高度取「所有帧腿都够得着」的最高值。不复制任何现有动作曲线。

门禁：烘焙未过期；每条轨首尾一致（无缝循环）；腿、臂确有摆动而站姿安静；站立期鞋底贴地（−2…12 mm）、摆动期不入地；零超伸帧；脚尖在接触期按参考速度后移（不滑步）；双脚支撑占比 > 45%（是走不是跑）；七套模型都有全部轨道的骨头；导演的步速落在走/跑切换带两侧。

## 运行时

`Script_RelaxedGait.mjs`：`SetRelaxedGait(soldier, "slung" | "unarmed" | "alert" | null)`（`"alert"` 是 2026-09-27 加的警戒持枪小跑，资产与口径见 [IjaAlertGait](../IjaAlertGait/Data_IjaAlertGait.md)）。装上后 rig 仍按状态选动作，只替换「端枪」那几个选择：`RifleRun` → `RelaxedWalk`（< `walkBelowMps`）/ `BackRifleRun`（> `runAboveMps`，中间保持原步态，变化须持续 `switchFrames` 帧；走/跑按调用方下达的步速 `soldier.relaxedGaitPaceMps` 判，没有才用实测位移速度——动画降频更新时实测速度会连续几帧虚高），`AdvanceFire` → `RelaxedStand`；开火、蹲/卧、搬运、白刃、投掷、伸手时不替换。`"slung"` 隐藏手里的枪、在背后挂一支同款复制件（带背带）；动作片段自带武器轨时手里的枪接管，缓入从背上的位置起。数值在 `Data_Tuning_ActorLocomotion.RELAXED_GAIT`。

当前消费方只有 01–02 开场导演（`Script_OpeningStoryboards`），见 [01 洞口过场修订](../../docs/Data_OpeningCinematic20260926.md)「背枪走、空手走与喊翻译」。
