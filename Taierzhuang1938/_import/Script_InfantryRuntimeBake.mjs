// Convert the validated research GLBs to mesh-free, per-variant game animation libraries.
// Usage: node .../Script_InfantryRuntimeBake.mjs <Deliverables directory>
// Licensed SMPL-X/GVHMR files and videos are never copied into the game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoadGlb, SerializeGlb, PoseScene, BuildSkin, MinSkinnedY } from './Script_LugouGlbPose.mjs';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = fs.readFileSync(path.join(project, 'vendor/three/build/three.core.js'));
const { Matrix4, Vector3, Quaternion } = await import(`data:text/javascript;base64,${core.toString('base64')}`);
const sourceDir = path.resolve(process.argv[2]);
const catalog = JSON.parse(fs.readFileSync(path.join(sourceDir, 'Data_AnimationCatalog.json')))
  .filter(row => !row.clip.endsWith('RootMotion'));
const outDir = path.join(project, 'Model/Character');
const matrix = values => new Matrix4().fromArray(values);
const pos = m => new Vector3().setFromMatrixPosition(m);
function RotateSegment(world, index, child, start, end) {
  const before = pos(world[child]).sub(pos(world[index])).normalize();
  const after = end.clone().sub(start).normalize();
  const rotation = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(before, after));
  world[index].premultiply(rotation).setPosition(start);
}
function PlantLeg(world, hip, knee, ankle, toe, target) {
  const start = pos(world[hip]), oldKnee = pos(world[knee]), oldFoot = pos(world[ankle]);
  const a = start.distanceTo(oldKnee), b = oldKnee.distanceTo(oldFoot);
  const axis = target.clone().sub(start); let distance = axis.length(); axis.normalize();
  if (distance > a + b + .0001) return false;
  distance = Math.min(distance, a + b - 1e-9);
  target = start.clone().addScaledVector(axis, distance);
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const pole = oldKnee.clone().sub(start); pole.addScaledVector(axis, -pole.dot(axis)).normalize();
  const bend = start.clone().addScaledVector(axis, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
  RotateSegment(world, hip, knee, start, bend);
  RotateSegment(world, knee, ankle, bend, target);
  const offset = target.clone().sub(oldFoot);
  world[ankle].setPosition(target); world[toe].setPosition(pos(world[toe]).add(offset));
  return true;
}
function FootSkin(parts, nodes, side) {
  return parts.map(part => {
    const selected = [];
    for (let v = 0; v < part.count; v++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (new RegExp(` ${side} (Foot|Toe0)$`).test(nodes[part.joints[part.jointIndex[v * 4 + k]]]?.name)) weight += part.weight[v * 4 + k];
      if (weight > .55) selected.push(v);
    }
    return { ...part, count: selected.length,
      position: Float32Array.from(selected.flatMap(v => [...part.position.slice(v * 3, v * 3 + 3)])),
      jointIndex: Uint32Array.from(selected.flatMap(v => [...part.jointIndex.slice(v * 4, v * 4 + 4)])),
      weight: Float32Array.from(selected.flatMap(v => [...part.weight.slice(v * 4, v * 4 + 4)])) };
  });
}
function Rest(scene) {
  const world = [];
  for (const i of scene.order) {
    const local = new Matrix4().compose(new Vector3(...scene.baseT[i]),
      new Quaternion(...scene.baseR[i]), new Vector3(...scene.baseS[i]));
    world[i] = scene.parent[i] < 0 ? local : world[scene.parent[i]].clone().multiply(local);
  }
  return world;
}
function Accessor(json, chunks, values, type) {
  const data = Float32Array.from(values), bytes = Buffer.from(data.buffer);
  const byteOffset = chunks.reduce((n, b) => n + b.length, 0);
  json.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length }); chunks.push(bytes);
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126,
    count: data.length / width, type, ...(type === 'SCALAR' ? { min: [data[0]], max: [data.at(-1)] } : {}) });
  return json.accessors.length - 1;
}
const audit = { version: 1, source: 'Seedance 2.5 → GVHMR → contact-corrected original rigs', models: [] };
for (const faction of ['Nra', 'Ija']) {
  const sources = catalog.filter(row => row.faction === faction).map(row => {
    const glb = LoadGlb(path.join(sourceDir, row.file));
    const scene = new PoseScene(glb);
    return { row, scene, rest: Rest(scene) };
  });
  for (let variant = 1; variant <= 4; variant++) {
    const id = `Lugou${faction}0${variant}`;
    const target = LoadGlb(path.join(outDir, `Model_${id}.glb`));
    const scene = new PoseScene(target), rest = Rest(scene), skin = BuildSkin(target);
    const feet = ['L', 'R'].map(side => ({ skin: FootSkin(skin, scene.nodes, side),
      joints: ['Thigh', 'Calf', 'Foot', 'Toe0'].map(part => scene.FindNode(new RegExp(` ${side} ${part}$`))) }));
    const json = { asset: { version: '2.0', generator: 'Script_InfantryRuntimeBake' }, scene: target.json.scene,
      scenes: structuredClone(target.json.scenes), nodes: target.json.nodes.map(n => {
        const node = structuredClone(n); delete node.mesh; delete node.skin; delete node.camera; delete node.extensions;
        return node;
      }), animations: [], bufferViews: [], accessors: [], buffers: [] };
    const helpers = ['InfantryRifle', 'InfantryGrenade'].map(name => {
      json.nodes.push({ name }); const i = json.nodes.length - 1;
      json.scenes[json.scene || 0].nodes.push(i); return i;
    });
    const legacyStand = scene.AnimationIndex('AdvanceFire');
    const standFrames = Math.ceil(scene.animations[legacyStand].duration * 120), standFloor = [];
    for (let i = 0; i <= standFrames; i++) {
      scene.Apply(legacyStand, i / 120); standFloor.push(MinSkinnedY(scene, skin));
    }
    json.scenes[json.scene || 0].extras = { infantryStandFloor: { fps: 120, values: standFloor } };
    const chunks = [], modelAudit = { id, file: `Animation_${id}Infantry.glb`, clips: [] };
    const ground = scene.NodeIndex('GroundRoot');
    for (const { row, scene: src, rest: srcRest } of sources) {
      const prefix = faction === 'Nra' ? 'Bip002' : 'Bip001';
      const pelvis = scene.NodeIndex(`${prefix} Pelvis`), sourcePelvis = src.NodeIndex(`${prefix} Pelvis`);
      const offset = pos(rest[pelvis]).sub(pos(srcRest[sourcePelvis]));
      // The four skins share bone lengths to <0.1 mm; their scene centring differs by up to 5 cm.
      // Transfer skin deformation in world space, then recover each target's own local TRS.
      const links = scene.order.filter(i => scene.nodes[i].name?.startsWith(prefix) || i === ground);
      const map = new Map(links.map(i => [i, src.NodeIndex(scene.nodes[i].name)]));
      const correction = new Map(links.filter(i => map.get(i) >= 0).map(i => [i,
        srcRest[map.get(i)].clone().invert().multiply(rest[i].clone().setPosition(pos(rest[i]).sub(offset)))]));
      const tracked = [...links, ...helpers], values = new Map(tracked.map(i => [i, { translation: [], rotation: [], scale: [] }]));
      const times = [], floors = []; let maxSegmentError = 0;
      const frames = Math.round(row.durationSeconds * row.gltfSampleRate);
      for (let frame = 0; frame <= frames; frame++) {
        const time = frame / row.gltfSampleRate; times.push(time); src.Apply(0, time);
        const world = rest.map(m => m.clone());
        for (const i of scene.order) {
          if (correction.has(i)) world[i] = matrix(src.world[map.get(i)]).multiply(correction.get(i));
          else if (scene.parent[i] >= 0) {
            const localRest = rest[scene.parent[i]].clone().invert().multiply(rest[i]);
            world[i] = world[scene.parent[i]].clone().multiply(localRest);
          }
        }
        world.forEach((m, i) => scene.world[i].set(m.elements));
        const floor = MinSkinnedY(scene, skin); let lift = .003 - floor; floors.push(floor);
        if (row.clip.includes('Kneel') && lift > .0001) {
          // The source cleanup checked soles; the NRA trouser knee still intersected the floor.
          // Raise the pelvis while solving both original-length legs back onto their sole anchors.
          const base = world.map(m => m.clone());
          const anchors = feet.map(foot => {
            const point = pos(world[foot.joints[2]]), sole = MinSkinnedY(scene, foot.skin);
            if (sole < .003) point.y += .003 - sole;
            return point;
          });
          lift = 0;
          for (let iteration = 0; iteration < 30; iteration++) {
            for (let i = 0; i < world.length; i++) world[i].copy(base[i]);
            for (const i of links) world[i].elements[13] += lift;
            for (let f = 0; f < feet.length; f++) {
              if (!PlantLeg(world, ...feet[f].joints, anchors[f])) throw new Error(`${id}/${row.clip} frame=${frame} iteration=${iteration} lift=${lift}: unreachable planted leg`);
            }
            world.forEach((m, i) => scene.world[i].set(m.elements));
            const remaining = .003 - MinSkinnedY(scene, skin);
            if (remaining < .00005) break;
            lift += remaining * 1.5;
          }
        } else for (const i of links) world[i].elements[13] += lift;
        for (let p = 0; p < helpers.length; p++) {
          const si = src.NodeIndex(`Socket_${faction}Infantry${p ? 'Grenade' : 'Rifle'}`);
          world[helpers[p]] = si >= 0 ? matrix(src.world[si]) : new Matrix4().makeScale(.0001, .0001, .0001);
          world[helpers[p]].multiply(new Matrix4().makeRotationX(-Math.PI / 2));
          world[helpers[p]].elements[13] += lift;
        }
        for (const i of tracked) {
          const parent = i < scene.count ? scene.parent[i] : -1;
          const local = parent < 0 ? world[i] : world[parent].clone().invert().multiply(world[i]);
          const t = new Vector3(), q = new Quaternion(), s = new Vector3(); local.decompose(t, q, s);
          const v = values.get(i), last = v.rotation.slice(-4);
          if (last.length && q.dot(new Quaternion(...last)) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
          v.translation.push(...t); v.rotation.push(...q); v.scale.push(...s);
          if (parent >= 0 && links.includes(parent) && i !== pelvis && !/Footsteps/.test(scene.nodes[i].name)) {
            maxSegmentError = Math.max(maxSegmentError,
              Math.abs(pos(world[i]).distanceTo(pos(world[parent])) - pos(rest[i]).distanceTo(pos(rest[parent]))));
          }
        }
      }
      const animation = { name: row.clip, channels: [], samplers: [], extras: {
        loop: row.loop, referenceSpeedMps: row.referenceSpeedMps, releaseTimeSeconds: row.releaseTimeSeconds } };
      const input = Accessor(json, chunks, times, 'SCALAR');
      for (const i of tracked) for (const property of ['translation', 'rotation', 'scale']) {
        const data = values.get(i)[property], width = property === 'rotation' ? 4 : 3;
        // Constant tracks retain both endpoints so changing from historical clips resets every bone.
        const constant = data.every((v, k) => Math.abs(v - data[k % width]) < 1e-7);
        const output = Accessor(json, chunks, constant ? [...data.slice(0, width), ...data.slice(0, width)] : data,
          property === 'rotation' ? 'VEC4' : 'VEC3');
        animation.channels.push({ sampler: animation.samplers.length, target: { node: i, path: property } });
        animation.samplers.push({ input: constant ? Accessor(json, chunks, [0, row.durationSeconds], 'SCALAR') : input,
          output, interpolation: 'LINEAR' });
      }
      json.animations.push(animation);
      modelAudit.clips.push({ id: row.clip, duration: row.durationSeconds, loop: row.loop,
        referenceSpeedMps: row.referenceSpeedMps, releaseTimeSeconds: row.releaseTimeSeconds,
        maxSegmentErrorMeters: maxSegmentError, uncorrectedFloorRange: [Math.min(...floors), Math.max(...floors)] });
      if (maxSegmentError > .0005) throw new Error(`${id}/${row.clip}: bone lengths changed ${maxSegmentError}`);
    }
    const bin = Buffer.concat(chunks); json.buffers = [{ byteLength: bin.length }];
    fs.writeFileSync(path.join(outDir, modelAudit.file), SerializeGlb(json, bin));
    audit.models.push(modelAudit); console.log(id, (bin.length / 1048576).toFixed(2), 'MiB');
  }
}
fs.writeFileSync(path.join(outDir, 'Data_InfantryAnimations.json'), JSON.stringify(audit, null, 2) + '\n');
