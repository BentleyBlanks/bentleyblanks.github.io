// Independently verify the reviewed scan-weight repair, then recover the exact
// pre-repair bytes for the existing append-only grip-corrective audit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const project=path.dirname(fileURLToPath(import.meta.url));
const Hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const Normalize=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');

export function UndoFpsHandSkinWeightRepair(bytes,recipe) {
  assert.equal(Hash(bytes),recipe.output.sha256,'exact reviewed weight-repaired GLB');
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),base=28+length;
  assert.equal(Hash(bytes.subarray(base)),recipe.output.binarySha256,'complete repaired binary');
  assert(recipe.edits.length>0&&recipe.edits.length<=500,'localized reviewed skin repair');
  const restored=Buffer.from(bytes),seen=new Set();
  const sizes={5121:1,5123:2,5125:4,5126:4};
  const read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
  const write={5121:'writeUInt8',5123:'writeUInt16LE',5125:'writeUInt32LE',5126:'writeFloatLE'};
  for(const edit of recipe.edits) {
    const key=[edit.meshIndex,edit.primitiveIndex,edit.vertex].join(':');
    assert(!seen.has(key),'each reviewed vertex is repaired once');seen.add(key);
    const primitive=doc.meshes[edit.meshIndex].primitives[edit.primitiveIndex];
    assert.equal(doc.materials[primitive.material].name,'Material_HanYangScanSkin','scan skin only');
    const node=doc.nodes.find(node=>node.mesh===edit.meshIndex&&node.skin!==undefined);
    assert(node,'repair belongs to a skinned production mesh');
    const names=doc.skins[node.skin].joints.map(index=>Normalize(doc.nodes[index].name));
    assert.deepEqual(edit.weightsAfter,edit.weightsBefore,key+' must preserve every original weight value');
    const sides=new Set();
    for(const semantic of ['joints','weights']) {
      const accessor=doc.accessors[primitive.attributes[semantic==='joints'?'JOINTS_0':'WEIGHTS_0']];
      const view=doc.bufferViews[accessor.bufferView],size=sizes[accessor.componentType];
      assert.equal(accessor.type,'VEC4');assert(size&&!accessor.sparse&&!accessor.normalized);
      assert(Number.isInteger(edit.vertex)&&edit.vertex>=0&&edit.vertex<accessor.count);
      const offset=base+(view.byteOffset||0)+(accessor.byteOffset||0)+edit.vertex*(view.byteStride||size*4);
      const before=edit[semantic+'Before'],after=edit[semantic+'After'];
      assert.equal(before.length,4);assert.equal(after.length,4);
      for(let i=0;i<4;i++) {
        assert.equal(bytes[read[accessor.componentType]](offset+i*size),after[i],key+' actual '+semantic+i);
        assert(Number.isFinite(before[i])&&Number.isFinite(after[i]));
        if(semantic==='joints') {
          assert(Number.isInteger(before[i])&&Number.isInteger(after[i])&&names[after[i]]&&names[before[i]]);
          if(before[i]!==after[i]){
            assert(edit.weightsBefore[i]>0,key+' must preserve unused joint slots');
            const match=names[before[i]].match(/([rl])finger1([12]?)$/);
            assert(match,key+' may only reassign a mistaken index-finger slot');
            assert.equal(names[after[i]],names[before[i]].slice(0,match.index)+match[1]+'finger2'+match[2],key+' must retain side and phalanx on the middle finger');
          }
        } else {
          assert(before[i]>=0&&after[i]>=0);
          for(const phase of ['Before','After'])if(edit['weights'+phase][i]>0) {
            const name=names[edit['joints'+phase][i]],match=name.match(/([rl])(hand|finger[0-4][12]?)$/);
            assert(match,key+' may only affect hand/finger skin');sides.add(match[1]);
          }
        }
        restored[write[accessor.componentType]](before[i],offset+i*size);
      }
      if(semantic==='weights')for(const row of [before,after])assert(Math.abs(row.reduce((sum,w)=>sum+w,0)-1)<1e-5,'normalized weights');
    }
    assert.equal(sides.size,1,'repair cannot transfer skin to the opposite arm');
  }
  assert.equal(Hash(restored),recipe.basis.sha256,'undo restores every original GLB byte');
  assert.equal(Hash(restored.subarray(base)),recipe.basis.binarySha256,'all other binary bytes are protected');
  return restored;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const recipe=JSON.parse(fs.readFileSync(path.join(project,'Model/Data_FpsHandSkinWeights.json')));
  const bytes=fs.readFileSync(path.join(project,recipe.asset));
  const restored=UndoFpsHandSkinWeightRepair(bytes,recipe);
  const archived=spawnSync('git',['show',`${recipe.basis.git.commit}:${recipe.basis.git.path}`],
    {cwd:path.resolve(project,'..'),windowsHide:true,maxBuffer:32*1024*1024});
  if(archived.status===0)assert(restored.equals(archived.stdout),'actual Git basis compares byte for byte');
  const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
  assert.throws(()=>UndoFpsHandSkinWeightRepair(corrupt,recipe),/reviewed weight-repaired/,'unrelated data corruption is rejected');
  console.log(`PASS FpsHandSkinWeights: ${recipe.edits.length} localized vertices; exact byte restoration, side ownership and normalized weights`);
}
