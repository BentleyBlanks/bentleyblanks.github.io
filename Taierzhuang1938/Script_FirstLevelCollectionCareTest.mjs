// Script_FirstLevelCollectionCareTest.mjs — 06 集结处救护动作的纯 Node 门禁（docs/Data_CollectionCare20260927.md）。
//   · 动作库清单与记录：六条动作都在、版本对得上、循环首尾相接、骨数与 stride；
//   · 配对：Data_FirstLevelCollectionCare 的医护站位 / 老周离墙距离 = 烘焙时写进手的目标点的那组数（清单 stages）；
//   · 老周半躺的根真的离 CollectionLitterWall 北面 COLLECTION_CARE_RECLINE_WALL_M；
//   · 烘焙验收数字（私有报告抄进清单的那几项）：跪着的医护脚不滑、老周的背不穿墙；
//   · 运行时接线：动作层在 rig.Update 里、说话人头部层之前；黑场字幕是 runtime 的一种控制接管。
// 用法：node Taierzhuang1938/Script_FirstLevelCollectionCareTest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COLLECTION_CARE_ANIMATION as A, COLLECTION_CARE_CLIPS, COLLECTION_CARE_PAIRS, COLLECTION_CARE_RECLINE_WALL_M,
  CareMedicSpot, CarePatientClip } from "./Data_FirstLevelCollectionCare.mjs";
import { MISSION_PLACEMENT as P, MISSION_LAYOUT } from "./Data_FirstLevelMissionLayout.mjs";
import { FRONT_TUNING as F } from "./Data_Tuning_FirstLevelFront.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const Read = (file) => fs.readFileSync(path.join(HERE, file), "utf8");
const Json = (file) => JSON.parse(Read(file));

// 1. 清单与记录
const manifest = Json(path.join("Animation/CollectionCare", A.manifest));
assert.equal(manifest.version, A.version, "清单版本 = 运行时要的版本（改动作要一起抬）");
assert.equal(manifest.models.length, 1, "只烘一具参考身体（共用骨架）");
const row = manifest.models[0];
const recordText = Read(path.join("Animation/CollectionCare", row.file));
const record = JSON.parse(recordText);
assert.equal(record.stride, 7);
assert.equal(record.skeleton, "TengxianHumanoidV1", "共用骨架：一份记录绑到每一具国军身上");
const wanted = [...new Set([...Object.values(COLLECTION_CARE_CLIPS), ...Object.values(COLLECTION_CARE_PAIRS).flatMap((p) => [p.clip, p.patientClip])])];
for (const clip of wanted) {
  const c = record.clips[clip];
  assert.ok(c, `动作库里有 ${clip}`);
  assert.equal(c.values.length, c.frameCount * record.bones.length * 7, `${clip} 帧数 × 骨数 × 7`);
  assert.ok(c.values.every(Number.isFinite), `${clip} 全是有限数`);
  if (c.loop) {
    const stride = record.bones.length * 7, last = c.values.length - stride;
    for (let i = 0; i < stride; i++) assert.equal(c.values[i], c.values[last + i], `${clip} 循环首尾同一帧`);
  }
}
assert.equal(record.clips[COLLECTION_CARE_CLIPS.zhouWince].loop, false, "吃痛是一次性的，播完回到半躺");

// 2. 配对 = 烘焙时的数
for (const [id, pair] of Object.entries(COLLECTION_CARE_PAIRS)) {
  const stage = manifest.stages[id]?.medic;
  assert.ok(stage, `清单 stages.${id} 有医护站位`);
  assert.ok(Math.abs(stage.x - pair.x) < 1e-6 && Math.abs(stage.z - pair.z) < 1e-6 && stage.yawDeg === pair.yawDeg,
    `${id} 医护站位与烘焙一致：${JSON.stringify(stage)} vs ${JSON.stringify(pair)}`);
}
assert.equal(manifest.stages.recline.wallBehindM, COLLECTION_CARE_RECLINE_WALL_M, "老周离墙距离与烘焙一致");

// 3. 医护站位的几何：跪在伤员身侧、面朝伤员
{
  const patient = { x: 0, z: 0, yaw: 0.7 };
  const bandage = CareMedicSpot(patient, "bandage"), press = CareMedicSpot(patient, "press");
  // 伤员的右手方向（yaw 为 0 时 +x）与脚的方向（−z）转到世界里
  const right = { x: Math.cos(patient.yaw), z: -Math.sin(patient.yaw) }, feet = { x: -Math.sin(patient.yaw), z: -Math.cos(patient.yaw) };
  const Dot = (a, b) => a.x * b.x + a.z * b.z;
  assert.ok(Dot(bandage, right) < -0.3, "包扎的医护在伤员左侧");
  assert.ok(Dot(bandage, feet) > 0.1, "包扎的医护与大腿齐平（往脚那边）");
  assert.ok(Dot(press, right) > 0.3 && Dot(press, feet) < -0.1, "按压的医护在伤员右侧、与胸口齐平");
  for (const spot of [bandage, press]) {
    const face = { x: -Math.sin(spot.yaw), z: -Math.cos(spot.yaw) }, toPatient = { x: patient.x - spot.x, z: patient.z - spot.z };
    const along = Dot(face, toPatient) / Math.hypot(toPatient.x, toPatient.z);
    assert.ok(along > 0.75, `医护面朝伤员（${along.toFixed(2)}）`);
  }
  assert.equal(CarePatientClip({}), COLLECTION_CARE_CLIPS.writhe);
  assert.equal(CarePatientClip({ care: "press" }), COLLECTION_CARE_PAIRS.press.patientClip);
}

// 4. 老周半躺的位置：背贴 CollectionLitterWall 北面
{
  const wall = MISSION_LAYOUT.blocks.find((b) => b.id === "CollectionLitterWall");
  assert.ok(wall, "CollectionLitterWall 还在");
  const face = wall.z - wall.d / 2, seat = P.collection.zhouRecline;
  assert.ok(Math.abs((face - seat.z) - COLLECTION_CARE_RECLINE_WALL_M) < 0.02,
    `老周的根离墙面 ${(face - seat.z).toFixed(3)} m，要 ${COLLECTION_CARE_RECLINE_WALL_M}`);
  assert.ok(seat.x > wall.x - wall.w / 2 + 0.5 && seat.x < wall.x + wall.w / 2 - 0.5, "靠的是墙身，不是墙头外的空处");
}

// 5. 烘焙验收数字（私有报告里抄进清单的）
{
  const byClip = Object.fromEntries((row.clips || []).map((c) => [c.clip, c]));
  for (const clip of ["CareMedicBandage", "CareMedicPress"])
    assert.ok((byClip[clip]?.footSlideM ?? 0) < 0.02, `${clip} 跪着的脚不滑（${byClip[clip]?.footSlideM}）`);
  for (const clip of [COLLECTION_CARE_CLIPS.zhouRecline, COLLECTION_CARE_CLIPS.zhouWince])
    assert.ok((byClip[clip]?.wallPenetrationM ?? 0) < 0.03, `${clip} 背不穿墙（${byClip[clip]?.wallPenetrationM}）`);
}

// 6. 运行时接线
{
  const model = Read("Script_CharacterModel.mjs");
  const restore = model.indexOf("this.authoredPose?.Restore()"), mixer = model.indexOf("this.mixer.update(Math.max(0, dt));");
  const apply = model.indexOf("this.authoredPose?.Apply(dt, state);"), head = model.indexOf("this.speakerHead?.Apply(dt, state);");
  assert.ok(restore > 0 && restore < mixer, "动作层在 mixer 采样之前还原");
  assert.ok(apply > mixer && apply < head, "动作层写在 mixer 之后、说话人头部层之前（老周说话照样转头）");
  const runtime = Read("Script_FirstLevelMissionRuntime.mjs");
  assert.match(runtime, /CONTROL_KINDS = Object\.freeze\(\[[^\]]*"litterTransition"/, "黑场字幕是一种控制接管");
  assert.match(runtime, /CONTROL_GRACE_KINDS = Object\.freeze\(\[[^\]]*"litterTransition"/, "黑场里玩家不挨打");
  const collection = Read("Script_FirstLevelCollection.mjs");
  assert.ok(collection.includes('T("firstLevel.transition.litter.text")'), "字幕走文本表");
  assert.ok(!/SeatSwapClosure|SeatBox/.test(collection), "闭眼换人与弹药箱座位都已下线");
  assert.ok(F.litterTransition.holdS >= 2, "黑场停留够读两行字");
}
console.log("ok 06 集结处救护：动作库清单/循环、医护配对与老周靠墙距离与烘焙一致、验收数字、运行时接线");
