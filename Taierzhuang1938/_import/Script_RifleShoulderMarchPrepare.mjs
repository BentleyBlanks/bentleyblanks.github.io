// Decode the in-game ZhongZheng rifle (Model/Model_ZhongZheng.tzm.json, uint16-quantised meshes) into plain
// arrays for the RifleShoulderMarch baker (Blender renders) and its gate (Script_RifleShoulderMarchTest.mjs).
// Nothing generated is shipped: the output goes to tmp/RifleShoulderMarch/Data_RifleMesh.json (git-ignored).
//   node Taierzhuang1938/_import/Script_RifleShoulderMarchPrepare.mjs
// Rifle space = the weapon's own frame: origin at gripR (the right-hand grip, runtime puts it at the knuckle
// centroid), +Y up, muzzle toward -Z, metres. The butt plate is at z = +0.255, the muzzle at z = -0.855.
import fs from 'node:fs';
import path from 'node:path';

const project = path.resolve(import.meta.dirname, '..');
const modelFile = path.join(project, 'Model/Model_ZhongZheng.tzm.json');

const Typed = (text, Type) => {
  const bytes = Buffer.from(text, 'base64');
  return new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

/** { nodes: {name: [x,y,z]}, meshes: [{ position: number[], index: number[] }] } in rifle space (metres). */
export function LoadRifleMesh() {
  const doc = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
  const world = new Map();
  doc.nodes.forEach((node, i) => {
    const parent = node.parent >= 0 ? world.get(node.parent) : [0, 0, 0];
    world.set(i, [parent[0] + node.t[0], parent[1] + node.t[1], parent[2] + node.t[2]]);   // no rotations in this model
  });
  const nodes = Object.fromEntries(doc.nodes.map((n, i) => [n.name, world.get(i).map((v) => +v.toFixed(6))]));
  const meshes = doc.meshes.map((block) => {
    const quantised = Typed(block.pos, Uint16Array);
    const index = Typed(block.idx, block.idxBits === 32 ? Uint32Array : Uint16Array);
    const position = [];
    for (let i = 0; i < block.count; i += 1) {
      for (let c = 0; c < 3; c += 1) position.push(+(block.posMin[c] + quantised[i * 3 + c] * block.posScale[c]).toFixed(6));
    }
    return { position, index: Array.from(index).slice(0, block.idxCount) };
  });
  // Every mesh sits at its node's world offset (all zero in this model, kept for honesty).
  return { source: path.relative(project, modelFile).replace(/\\/g, '/'), nodes, meshes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const rifle = LoadRifleMesh();
  const folder = path.join(project, '../tmp/RifleShoulderMarch');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Data_RifleMesh.json'), JSON.stringify(rifle));
  const all = rifle.meshes.flatMap((m) => m.position);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < all.length; i += 3) for (let c = 0; c < 3; c += 1) { lo[c] = Math.min(lo[c], all[i + c]); hi[c] = Math.max(hi[c], all[i + c]); }
  console.log('RifleShoulderMarch rifle mesh prepared:', rifle.meshes.map((m) => `${m.position.length / 3}v/${m.index.length / 3}t`).join(', '),
    'bounds', lo.map((v) => +v.toFixed(3)), hi.map((v) => +v.toFixed(3)));
}
