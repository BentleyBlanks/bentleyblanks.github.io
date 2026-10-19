// Script_PrevizVillageClipsTest.mjs — 白盒预演「村子」占位动作库 PrevizVillage 的纯 Node 门禁（docs/Data_EditorBlockout.md §14，
// 源 _import/Script_PrevizVillageClips.py，烘焙 _import/Script_PrevizVillageBake.py，只烘 TengxianNra02）。
//   · 名单：Data_BlockoutPrevizClips 里登记了 PrevizVillage，版本与清单一致；清单里的片段名一律 Vil 开头，没有 Pv 开头的；
//   · 记录：骨名数组与开场库 TengxianNra02 的逐位相同（AddOpeningClipLibrary 按骨名并库，这是 LoadExtraClipLibraries 能并进去的前提）、
//     stride 7、每段 帧数 × 骨数 × 7 个有限数、循环片段首尾同一帧、holdLoop 在时长内；
//   · 验收数字（清单 models[] 抄自烘焙报告，运行时米）：脚滑 ≤ 2 cm（跪 / 趴 / 爬坡 / 翻墙的几段另有上限）、声明过接触点的段接触误差 ≤ 4 cm、
//     骨盆每帧 ≤ 0.2 m、膝滑 ≤ 2.5 cm（跪着的段 ≤ 7.5 cm：被拽倒那两段膝盖本来就要离地）；
//   · 成对站位：stages 里每个演员的片段都在清单里，偏移时刻 = 接触时刻之差（妮儿咬手腕 = 日军出口起点），根位移的段 root.end 对得上契约的米数。
// 用法：node Taierzhuang1938/Script_PrevizVillageClipsTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } from "./Data_BlockoutPrevizClips.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const Json = (file) => JSON.parse(fs.readFileSync(path.join(HERE, file), "utf8"));

// 1. 名单与清单
const lib = BLOCKOUT_PREVIZ_CLIP_LIBRARIES.find((l) => l.name === "PrevizVillage");
assert.ok(lib, "Data_BlockoutPrevizClips 登记了 PrevizVillage");
const manifest = Json(path.join(lib.base, lib.manifest));
assert.equal(manifest.version, lib.version, "清单版本 = 名单里的缓存戳（改动作要一起抬）");
assert.equal(manifest.schema, 2);
assert.equal(manifest.models.length, 1, "只烘一具参考身体（共用骨架）");
const names = Object.keys(manifest.clips);
assert.ok(names.length >= 30, `契约表 30 段都在（现在 ${names.length}）`);
for (const name of names) assert.ok(/^Vil[A-Z]/.test(name), `${name}：片段名一律 Vil 开头`);
const row = manifest.models[0];
assert.equal(row.id, "TengxianNra02");

// 2. 记录：共用骨架、帧数、有限数、循环接缝
const record = Json(path.join(lib.base, row.file));
const opening = Json("Animation/OpeningStoryboards/Animation_TengxianNra02OpeningStoryboards.json");
assert.equal(record.skeleton, "TengxianHumanoidV1");
assert.equal(record.stride, 7);
assert.deepEqual(record.bones, opening.bones, "骨名数组与开场库 TengxianNra02 逐位相同：AddOpeningClipLibrary 才会把它并进每具骨架");
const stride = record.bones.length * 7;
for (const name of names) {
  const meta = manifest.clips[name], c = record.clips[name];
  assert.ok(c, `记录里有 ${name}`);
  assert.equal(c.values.length, c.frameCount * stride, `${name} 帧数 × 骨数 × 7`);
  assert.equal(c.frameCount, Math.ceil(meta.duration * manifest.fps - 1e-6) + 1, `${name} 帧数 = ceil(时长 × fps) + 1`);
  assert.ok(c.values.every(Number.isFinite), `${name} 全是有限数`);
  assert.equal(!!c.loop, !!meta.loop, `${name} loop 标记清单与记录一致`);
  if (meta.loop) {
    // 姿态按周期写，首尾帧应当一样；IK 的连续性处理会让末帧差一点点（倒退拖人那段最大 1e-3），放 0.01 的口子。
    const last = c.values.length - stride;
    let seam = 0;
    for (let i = 0; i < stride; i++) seam = Math.max(seam, Math.abs(c.values[i] - c.values[last + i]));
    assert.ok(seam <= 0.01, `${name} 循环首尾同一帧（接缝 ${seam}）`);
  }
  if (meta.holdLoop) {
    const [a, b] = meta.holdLoop;
    assert.ok(a >= 0 && b <= meta.duration + 1e-9 && b - a >= 0.3, `${name} holdLoop [${a}, ${b}] 在时长 ${meta.duration} 内、至少 0.3 s`);
  }
  if (meta.referenceSpeedMps !== undefined) assert.ok(meta.referenceSpeedMps > 0 && meta.loop, `${name} 带参考速度的是原地循环`);
}

// 3. 验收数字（运行时米）
const SLIDE_LIMIT = { VilHandsUpClimbOut: 0.05, VilIjaClimbWall: 0.06, VilStabbedFall: 0.05, VilIjaBayonetThrust: 0.025 };
const KNEE_LIMIT = { VilReachPinned: 0.075, VilNraYankBack: 0.075, VilIjaPinBayonet: 0.03 };
// 占位档放宽的几段：翻墙骑在墙头那一下手离墙头 ≤ 13 cm（胳膊够不到墙头、身子已经压下去了）、班长起身挥手时右手离枪 ≤ 7 cm。
// 磕手榴弹那一下的检查点写的是手腕，指根离它正好一拳（9 cm）。
const CONTACT_LIMIT = { VilClingHem: 0.06, VilDraggedByArm: 0.06, VilIjaBayonetLiftFling: 0.06, VilIjaClimbWall: 0.13, VilNraWaveCharge: 0.07, VilIjaHelmetGrenadeLob: 0.10 };
const byClip = new Map(row.clips.map((c) => [c.clip, c]));
for (const name of names) {
  const v = byClip.get(name);
  assert.ok(v, `清单 models[] 有 ${name} 的验收数字`);
  assert.ok(v.finite, `${name} finite`);
  assert.ok(v.footSlideM <= (SLIDE_LIMIT[name] ?? 0.02) + 1e-6, `${name} 脚滑 ${v.footSlideM} m`);
  assert.ok(v.contactErrorM <= (CONTACT_LIMIT[name] ?? 0.04) + 1e-6, `${name} 接触误差 ${v.contactErrorM} m`);
  assert.ok(v.pelvisMaxStepM <= 0.2, `${name} 骨盆每帧 ${v.pelvisMaxStepM} m`);
  assert.ok((v.kneeSlideM ?? 0) <= (KNEE_LIMIT[name] ?? 0.025) + 1e-6, `${name} 膝滑 ${v.kneeSlideM} m`);
  assert.ok(v.root?.start?.length === 4 && v.root?.end?.length === 4, `${name} root.start / end`);
}

// 4. 成对站位与根位移
const S = manifest.stages;
for (const [id, stage] of Object.entries(S)) {
  for (const [role, actor] of Object.entries(stage.actors || {})) {
    if (actor.clip == null) continue;
    assert.ok(manifest.clips[actor.clip], `stages.${id}.${role} 的片段 ${actor.clip} 在清单里`);
    assert.ok(Number.isFinite(actor.x) && Number.isFinite(actor.z) && Number.isFinite(actor.yawDeg), `stages.${id}.${role} 站位是数`);
  }
}
const Contact = (clip, action) => manifest.clips[clip].contacts.find((c) => c.action === action);
// 刺刀：捅中时刻两段同一秒起（无 offsetS）
assert.equal(Contact("VilIjaBayonetThrust", "stab").t, Contact("VilStabbedFall", "stabbed").t, "捅中 = 被捅中，同一时刻");
assert.equal(S.bayonetVictim.actors.victim.offsetS, undefined);
assert.equal(S.bayonetVictim.actors.victim.yawDeg, 180, "被捅的人面对日军");
assert.ok(S.bayonetVictim.actors.victim.z < -1.5 && S.bayonetVictim.actors.victim.z > -2.2, "被捅的人在刺刀尖够得着的距离（1.4 m 枪 + 弓步）");
// 咬手腕：妮儿晚起 = 日军出口起点 − 咬的时刻
const bite = Contact("VilBiteWrist", "bite").t, bitten = Contact("VilIjaPinBayonet", "bitten").t;
assert.equal(bitten, manifest.clips.VilIjaPinBayonet.holdLoop[1], "被咬就是保持循环的出口时刻");
assert.ok(Math.abs(S.pinBite.actors.nier.offsetS - (bitten - bite)) < 1e-6, "妮儿的 offsetS = 被咬时刻 − 咬的时刻");
assert.equal(S.pinBite.actors.nier.scale, 0.62, "妮儿是 0.62 的小孩身体");
// 拽回去：同一秒揪、同一秒拽
assert.equal(Contact("VilNraYankBack", "yank").t, manifest.clips.VilReachPinned.events.find((e) => e.kind === "yanked").t);
assert.ok(S.yankBack.actors.yanker.z > 0.5, "幺娃在老耿身后");
// 背着走：同根同相位
assert.deepEqual([S.carryOnBack.actors.rider.x, S.carryOnBack.actors.rider.z, S.carryOnBack.actors.rider.yawDeg], [0, 0, 0]);
assert.equal(manifest.clips.VilNraCarryOnBack.duration, manifest.clips.VilRideOnBack.duration, "背的人与被背的人同一个循环长度");
// 拖胳膊：同一个循环长度与参考速度
assert.equal(manifest.clips.VilIjaDragByArm.duration, manifest.clips.VilDraggedByArm.duration);
assert.equal(manifest.clips.VilIjaDragByArm.referenceSpeedMps, manifest.clips.VilDraggedByArm.referenceSpeedMps);
// 根位移的段：root.end 对得上契约的米数（运行时 −z 向前）
const RootEnd = (clip) => byClip.get(clip).root.end;
const Near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}：${a} vs ${b}`);
Near(RootEnd("VilCrawlHole")[1], -S.dogHole.rootMotionM, 0.15, "钻狗洞往前爬 1.5 m");
Near(RootEnd("VilIjaClimbWall")[1], -(S.villageWall.wallFaceM + S.villageWall.wallThickM + 0.4), 0.15, "翻墙落在墙那边");
Near(RootEnd("VilIjaShoulderCharge")[1], -1.2, 0.2, "肩撞冲出 1.2 m");
Near(RootEnd("VilNraWaveCharge")[1], -0.8, 0.2, "挥手冲出 0.8 m");
Near(byClip.get("VilHandsUpClimbOut").root.start[3], byClip.get("VilHandsUpClimbOut").root.end[3] - S.cellarPit.pitDepthM, 0.2, "从 1.5 m 深的坑里爬上来（骨盆高度差）");
assert.ok(byClip.get("VilHandsUpClimbOut").root.start[1] > 1.4, "起点在坑里（根后方）");
Near(RootEnd("VilReachPinned")[1], 0.65, 0.15, "老耿被拽回约 0.65 m（坐回脚跟上）");
Near(RootEnd("VilNraYankBack")[1], 0.6, 0.15, "幺娃倒回约 0.6 m");
for (const clip of names) if (!manifest.clips[clip].rootMotion) {
  const r = byClip.get(clip).root;
  assert.ok(Math.hypot(r.end[0] - r.start[0], r.end[1] - r.start[1]) <= 0.45, `${clip} 没标 rootMotion，骨盆首尾不超过 0.45 m`);
}
// 尸体段：末帧就是尸体；慢动作 / 蹲下用得上的几段都在
assert.equal(manifest.clips.VilStabbedFall.terminal, true);
for (const clip of ["VilCrouchHold", "VilDuckProne", "VilSitEdge", "VilHugLegs", "VilCowerWhimper"]) assert.ok(manifest.clips[clip], `${clip} 在库里（12–18 也用）`);
// 背枪名单：清单标了 weaponSlung 的段都是空手 / 背枪
for (const clip of names) if (manifest.clips[clip].weaponSlung) assert.ok(/slung|back/i.test(manifest.clips[clip].weaponState || "slungBack"), `${clip} weaponSlung 与 weaponState 一致`);

console.log(`PrevizVillageClipsTest OK: ${names.length} clips, ${Object.keys(S).length} stages, version ${manifest.version}`);
