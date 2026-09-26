// 视频转骨骼 clip 的脚掌翻正（CarryStretcherRear、WoundedLimp）。
//
// 现象：后位担架员、伤员走路时鞋底朝上、脚尖插地，侧面看是两片尖刀
// （2026-09-27 实机截图，第一关抬担架的后位）。
// 根因：Script_MocapRetargetClips 的 Foot() 只拿骨盆横轴定脚的滚转，这两段素材在
// 那一步落到了反向解上——脚骨相对小腿拧了 160°–180°（其余 16 条卢沟源动作与
// CarryStretcherFront 都在 60° 以内，人的脚踝也拧不过 90°）。踝→趾方向本身是对的，
// 所以只量关节位置的审计一个也没报。
// 修法：① 整条轨道 q ← q · R(踝→趾轴, 180°)，趾骨头位置不动，只把鞋底翻回去；
// ② 翻完仍拧过 90° 的帧（Rear 有十来帧连踝→趾方向都估反了）用前后好帧球面插值补；
// ③ 鞋底翻下来后原来逐帧贴地的 GroundRoot 修正轨道就不准了（最多陷 1.7 cm、飘 4 cm），
//    按原烘焙的契约重做：每个关键帧把变形后网格的最低顶点放回 Y=0；
// ④ 清单 Data_TengxianCharacterManifest.json 里这两条 clip 的 animationAudit
//    （骨盆高度带、最大陷地量）按修后的 GLB 实测回写——CharacterModelTest 拿它交叉核对。
//
// 就地改 Model_Tengxian*.glb 里这两条 clip 的 Foot 旋转访问器（只动浮点值，
// 文件长度与其余字节不变），不走 Blender 导出，免得把整套模型的浮点噪音重烘一遍。
// 判据是「脚骨相对静止姿势（≈小腿延长线）的局部转角」。修完的轨道均值与每帧都
// 落在阈值内，重复跑不改文件。
//
// 用法：node Taierzhuang1938/_import/Script_FixMocapFootRoll.mjs [--check]
//   --check  只报告，不写文件；有未翻正的 clip 时退出码 1。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LoadGlb, PoseScene, BuildSkin, MinSkinnedY } from "./Script_LugouGlbPose.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const characterDir = path.join(project, "Model", "Character");
const manifestPath = path.join(characterDir, "Data_TengxianCharacterManifest.json");
const manifestText = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const CLIPS = ["CarryStretcherRear", "WoundedLimp"];
const FLIPPED_TRACK_DEG = 120;   // 其余 17 条动作的脚踝转角均值都在 60° 以内
const BAD_KEY_DEG = 90;          // 人的脚踝拧不过 90°
const check = process.argv.includes("--check");

function ReadGlb(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw Error(`${file}: not a GLB`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binHeader = 20 + jsonLength;
  return { bytes, json, binStart: binHeader + 8 };
}

function QuatMultiply(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function Slerp(a, b, t) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const to = dot < 0 ? b.map(v => -v) : b;
  dot = Math.abs(dot);
  if (dot > 0.9995) {
    const q = a.map((v, c) => v + (to[c] - v) * t), n = Math.hypot(...q);
    return q.map(v => v / n);
  }
  const theta = Math.acos(dot), s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s, wb = Math.sin(t * theta) / s;
  return a.map((v, c) => v * wa + to[c] * wb);
}

function ReadScalars(bytes, json, binStart, accessorIndex) {
  const accessor = json.accessors[accessorIndex], view = json.bufferViews[accessor.bufferView];
  const offset = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return Array.from({ length: accessor.count }, (_, k) => bytes.readFloatLE(offset + k * 4));
}

function AngleDeg(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
}

// 骨盆高度带与陷地量：关键帧与相邻关键帧中点都量，比 CharacterModelTest 的 9 帧密。
function Audit(bytes, record, animationName) {
  const glb = LoadGlb(bytes), scene = new PoseScene(glb), parts = BuildSkin(glb);
  const clip = scene.AnimationIndex(animationName), pelvis = scene.NodeIndex(record.boneRoles.pelvis);
  const channel = scene.animations[clip].channels.find(c => c.node === pelvis && c.path === "translation");
  const keys = Array.from(channel.input), times = keys.flatMap((t, k) => k ? [(keys[k - 1] + t) / 2, t] : [t]);
  let low = Infinity, high = -Infinity, lowest = Infinity;
  for (const time of times) {
    scene.Apply(clip, time);
    const y = scene.WorldY(pelvis);
    low = Math.min(low, y); high = Math.max(high, y); lowest = Math.min(lowest, MinSkinnedY(scene, parts));
  }
  const audit = record.animationAudit[animationName];
  audit.pelvisHeightMeters = [low, high];
  audit.maxGroundPenetrationMeters = Math.max(0, -lowest);
}

function Reground(name, bytes, json, binStart, animation) {
  const glb = LoadGlb(bytes), scene = new PoseScene(glb), parts = BuildSkin(glb);
  const clip = scene.AnimationIndex(animation.name);
  const channel = animation.channels.find(c => c.target.path === "translation" && json.nodes[c.target.node].name === "GroundRoot");
  if (!channel) throw Error(`${name}: ${animation.name} has no GroundRoot translation track`);
  const sampler = animation.samplers[channel.sampler];
  const accessor = json.accessors[sampler.output], view = json.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126 || accessor.type !== "VEC3" || (view.byteStride && view.byteStride !== 12))
    throw Error(`${name}: unexpected GroundRoot accessor`);
  const offset = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const times = ReadScalars(bytes, json, binStart, sampler.input);
  const parent = scene.parent[channel.target.node];
  const lows = times.map(time => { scene.Apply(clip, time); return MinSkinnedY(scene, parts); });
  const scaleY = parent >= 0 ? Math.hypot(scene.world[parent][4], scene.world[parent][5], scene.world[parent][6]) : 1;
  lows.forEach((low, k) => {
    const at = offset + (k * 3 + 1) * 4;
    bytes.writeFloatLE(bytes.readFloatLE(at) - low / scaleY, at);
  });
  console.log(`${name} ${animation.name} 重新贴地：最低点 ${Math.min(...lows).toFixed(3)}..${Math.max(...lows).toFixed(3)} m → 0`);
}

let pending = 0;
const files = fs.readdirSync(characterDir).filter(name => /^Model_Tengxian\w+\.glb$/.test(name)).sort();
for (const name of files) {
  const file = path.join(characterDir, name);
  const { bytes, json, binStart } = ReadGlb(file);
  let changed = false;
  const regrounds = new Set();
  for (const animation of json.animations || []) {
    if (!CLIPS.includes(animation.name)) continue;
    for (const channel of animation.channels) {
      const node = json.nodes[channel.target.node];
      if (channel.target.path !== "rotation" || !/ (L|R) Foot$/.test(node.name || "")) continue;
      const toe = (node.children || []).map(i => json.nodes[i]).find(child => /Toe0$/.test(child.name || ""));
      if (!toe?.translation) throw Error(`${name}: ${node.name} has no Toe0 child`);
      const sampler = animation.samplers[channel.sampler];
      const accessor = json.accessors[sampler.output];
      const view = json.bufferViews[accessor.bufferView];
      if (accessor.componentType !== 5126 || accessor.type !== "VEC4" || accessor.sparse
          || (view.byteStride && view.byteStride !== 16)) throw Error(`${name}: unexpected rotation accessor`);
      const shared = json.animations.some(other => other.samplers.some(s => s !== sampler && s.output === sampler.output));
      if (shared) throw Error(`${name}: ${animation.name} ${node.name} rotation accessor is shared`);
      const offset = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
      const rest = node.rotation || [0, 0, 0, 1];
      const keys = [];
      for (let k = 0; k < accessor.count; k += 1) {
        keys.push([0, 1, 2, 3].map(c => bytes.readFloatLE(offset + (k * 4 + c) * 4)));
      }
      const length = Math.hypot(...toe.translation);
      const half = toe.translation.map(v => v / length);   // sin(90°)·axis, w = cos(90°) = 0
      const roll = [half[0], half[1], half[2], 0];
      // ① 整条轨道拧过 120° = 管线横轴取反，整条翻（逐帧挑会把同一段步态拆成两种解）。
      const meanOf = list => list.reduce((sum, q) => sum + AngleDeg(q, rest), 0) / list.length;
      const rolled = meanOf(keys) > FLIPPED_TRACK_DEG;
      let fixed = rolled ? keys.map(q => { const r = QuatMultiply(q, roll), n = Math.hypot(...r); return r.map(v => v / n); }) : keys;
      // ② 翻完还拧过 90° 的帧是踝→趾方向本身估反了（Rear 有十来帧），没法再靠翻滚救，
      //    用前后最近的好帧球面插值补上；clip 是循环步态，首尾相接着找。
      const good = fixed.map(q => AngleDeg(q, rest) <= BAD_KEY_DEG);
      const times = ReadScalars(bytes, json, binStart, sampler.input);
      const period = times.at(-1) - times[0];
      let bridged = 0;
      if (good.some(Boolean)) fixed = fixed.map((q, k) => {
        if (good[k]) return q;
        bridged += 1;
        let i = k, j = k;
        do i = (i - 1 + fixed.length) % fixed.length; while (!good[i]);
        do j = (j + 1) % fixed.length; while (!good[j]);
        const t0 = times[i] - (i > k ? period : 0), t1 = times[j] + (j < k ? period : 0);
        return Slerp(fixed[i], fixed[j], t1 > t0 ? (times[k] - t0) / (t1 - t0) : 0);
      });
      // 相邻帧保持同半球，插值不绕远路。
      fixed = fixed.map(q => q.slice());
      for (let k = 1; k < fixed.length; k += 1) {
        if (fixed[k].reduce((sum, v, c) => sum + v * fixed[k - 1][c], 0) < 0) fixed[k] = fixed[k].map(v => -v);
      }
      const changedKeys = rolled || bridged;
      console.log(`${name} ${animation.name} ${node.name}: mean ${meanOf(keys).toFixed(1)}° → ${meanOf(fixed).toFixed(1)}°`
        + `（max ${Math.max(...fixed.map(q => AngleDeg(q, rest))).toFixed(0)}°）${rolled ? "，整条翻滚" : ""}${bridged ? `，补 ${bridged}/${keys.length} 帧` : ""}`);
      if (!changedKeys) continue;
      pending += 1;
      if (check) continue;
      fixed.forEach((q, k) => q.forEach((v, c) => bytes.writeFloatLE(v, offset + (k * 4 + c) * 4)));
      regrounds.add(animation);
      changed = true;
    }
  }
  const record = manifest.models.find(model => model.url.endsWith("/" + name));
  for (const animation of regrounds) {
    Reground(name, bytes, json, binStart, animation);
    if (record) Audit(bytes, record, animation.name);
  }
  if (changed) fs.writeFileSync(file, bytes);
}
if (!check && pending) {
  // 保持检出里原来的换行风格（仓库存 LF，Windows 检出是 CRLF）。
  const eol = manifestText.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2).replace(/\n/g, eol) + eol);
}
if (check && pending) {
  console.error(`${pending} mocap foot tracks still flipped`);
  process.exit(1);
}
console.log(check ? "mocap feet ok" : `flipped ${pending} tracks`);
