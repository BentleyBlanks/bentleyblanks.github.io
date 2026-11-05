// Exact reversal of the nail-only layer keeps all earlier hand audits intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const project=path.dirname(fileURLToPath(import.meta.url));
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const FPS_NAIL_REPAIR_RECIPE='Model/Data_FpsHanYangNailSurfaceRepair.json';
export function LoadFpsNailRepair(){return JSON.parse(fs.readFileSync(path.join(project,FPS_NAIL_REPAIR_RECIPE),'utf8'));}
export function UndoFpsNailRepair(bytes,asset,recipe=LoadFpsNailRepair()){
  if(asset!==recipe.asset||Hash(bytes)===recipe.inputSha256)return bytes;
  const inputJsonLength=bytes.readUInt32LE(12);
  if(!JSON.parse(bytes.subarray(20,20+inputJsonLength)).asset?.extras?.nailSurfaceRepair)return bytes;
  assert.equal(recipe.version,1);assert.equal(recipe.mode,'nailsOnly');
  assert.equal(Hash(bytes),recipe.outputSha256,'exact reviewed nail-repair asset');
  const jsonLength=bytes.readUInt32LE(12),base=28+jsonLength,doc=JSON.parse(bytes.subarray(20,20+jsonLength));
  const json=Buffer.from(recipe.restoration.jsonChunkBase64,'base64'),old=JSON.parse(json);
  const binary=bytes.subarray(base,base+recipe.restoration.binaryLength);
  assert.equal(Hash(binary),recipe.restoration.binarySha256,'all prior binary bytes remain exact');
  const expected=structuredClone(doc);
  expected.meshes[recipe.nailMeshIndex]=old.meshes[recipe.nailMeshIndex];
  const material=old.meshes[recipe.nailMeshIndex].primitives[0].material;
  expected.materials[material]=old.materials[material];
  expected.accessors=expected.accessors.slice(0,old.accessors.length);
  expected.bufferViews=expected.bufferViews.slice(0,old.bufferViews.length);
  expected.buffers=old.buffers;
  delete expected.asset.extras.nailSurfaceRepair;
  assert.deepEqual(expected,old,'only nails, appended arrays and repair metadata may change');
  const restored=Buffer.alloc(28+json.length+binary.length);
  restored.writeUInt32LE(0x46546c67,0);restored.writeUInt32LE(2,4);restored.writeUInt32LE(restored.length,8);
  restored.writeUInt32LE(json.length,12);restored.writeUInt32LE(0x4e4f534a,16);json.copy(restored,20);
  restored.writeUInt32LE(binary.length,20+json.length);restored.writeUInt32LE(0x004e4942,24+json.length);binary.copy(restored,28+json.length);
  assert.equal(Hash(restored),recipe.inputSha256,'undo restores every previous GLB byte');
  return restored;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const recipe=LoadFpsNailRepair(),asset=path.join(project,recipe.asset),bytes=fs.readFileSync(asset);
  assert.equal(Hash(bytes),recipe.outputSha256,'production asset contains the reviewed nail repair');
  const restored=UndoFpsNailRepair(bytes,recipe.asset,recipe);
  const corrupt=Buffer.from(bytes);corrupt[corrupt.length-5]^=1;
  assert.throws(()=>UndoFpsNailRepair(corrupt,recipe.asset,recipe),/reviewed nail-repair/,'unrelated corruption is rejected');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'FpsNailRepair-'));
  try{
    const baseline=path.join(folder,'Baseline.glb');fs.writeFileSync(baseline,restored);
    const run=spawnSync('python',['-B',path.join(project,'Script_FpsNailSurfaceTest.py'),'--asset',asset,'--baseline',baseline,'--nails-only'],{encoding:'utf8',windowsHide:true});
    assert.equal(run.status,0,run.stderr||run.stdout);
    const report=JSON.parse(run.stdout);assert.equal(report.passed,true);
    console.log(`PASS FpsNailRepair: exact byte restoration, unchanged body/rig, ${report.nails.reduce((n,r)=>n+r.sampleCount,0)} surface samples, no penetration`);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
}
