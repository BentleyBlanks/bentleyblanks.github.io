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
const MCP_BASIS={sha256:'a3c6d33938aee6e1c7a547224c1e377d7ada24c52ae0aeb74cd05a33fd1e5350',
  binarySha256:'c445d10986302e6d09180efc9ced5f4ed136a73f7ce8bacb572b5e56215cc985',legacyEdits:150};
const MCP_MASS_EPSILON=1e-7; // Sum of serialized float32 MCP weights, never the non-MCP allowance.
const Mcp=name=>name.match(/([rl])finger[1-4]$/);
const Weights=(names,joints,weights)=>{const result=new Map();for(let i=0;i<4;i++)if(weights[i]>0)result.set(names[joints[i]],(result.get(names[joints[i]])||0)+weights[i]);return result;};
const SameWeights=(a,b)=>a.size===b.size&&[...a].every(([name,w])=>b.get(name)===w);

export function FpsHandSkinWeightPhases(recipe) {
  assert([1,2].includes(recipe.version),'supported weight-repair recipe version');
  assert(Array.isArray(recipe.edits)&&recipe.edits.length>0&&recipe.edits.length<=500,'localized reviewed skin repair');
  const phases=[[],[]],seen=[new Set(),new Set()];let phase=0;
  for(const edit of recipe.edits){
    assert(edit.kind===undefined||edit.kind==='McpBranchContinuity','only reviewed repair kinds');
    if(edit.kind==='McpBranchContinuity'){assert.equal(recipe.version,2,'MCP repair needs recipe v2');phase=1;}
    else assert.equal(phase,0,'all legacy repairs precede the MCP continuity phase');
    const key=[edit.meshIndex,edit.primitiveIndex,edit.vertex].join(':');
    assert(!seen[phase].has(key),'each reviewed vertex is repaired once per phase');seen[phase].add(key);phases[phase].push(edit);
  }
  if(recipe.version===2){assert.deepEqual(recipe.mcpBasis,MCP_BASIS,'MCP phase starts from the frozen published v1 asset');assert.equal(phases[0].length,MCP_BASIS.legacyEdits,'retain all150 original index/middle repairs');assert(phases[1].length>0,'v2 includes a distinct MCP phase');}
  return phases;
}

export function ValidateFpsHandSkinWeightEdit(names,edit,version=1) {
  const key=[edit.meshIndex,edit.primitiveIndex,edit.vertex].join(':'),sides=new Set();
  for(const phase of ['Before','After']){
    const joints=edit['joints'+phase],weights=edit['weights'+phase];
    assert(Array.isArray(joints)&&joints.length===4&&Array.isArray(weights)&&weights.length===4,'complete four-slot '+phase+' values');
    for(let i=0;i<4;i++){
      assert(Number.isInteger(joints[i])&&names[joints[i]],key+' valid joint');assert(Number.isFinite(weights[i])&&weights[i]>=0&&weights[i]<=1&&Math.fround(weights[i])===weights[i],key+' exact float32 weight');
      if(weights[i]>0){const match=names[joints[i]].match(/([rl])(hand|finger[0-4][12]?)$/);assert(match,key+' may only affect hand/finger skin');sides.add(match[1]);}
    }
    assert(Math.abs(weights.reduce((s,w)=>s+w,0)-1)<1e-5,'normalized weights');
  }
  assert.equal(sides.size,1,'repair cannot transfer skin to the opposite arm');
  if(edit.kind===undefined){
    assert.deepEqual(edit.weightsAfter,edit.weightsBefore,key+' must preserve every original weight value');
    for(let i=0;i<4;i++)if(edit.jointsBefore[i]!==edit.jointsAfter[i]){
      assert(edit.weightsBefore[i]>0,key+' must preserve unused joint slots');
      const before=names[edit.jointsBefore[i]],match=before.match(/([rl])finger1([12]?)$/);
      assert(match,key+' may only reassign a mistaken index-finger slot');
      assert.equal(names[edit.jointsAfter[i]],before.slice(0,match.index)+match[1]+'finger2'+match[2],key+' must retain side and phalanx on the middle finger');
    }
  }else{
    assert.equal(version,2);assert.equal(edit.kind,'McpBranchContinuity');
    const before=Weights(names,edit.jointsBefore,edit.weightsBefore),after=Weights(names,edit.jointsAfter,edit.weightsAfter),all=new Set([...before.keys(),...after.keys()]);let beforeMcp=0,afterMcp=0,changed=false;
    for(const name of all){const a=before.get(name)||0,b=after.get(name)||0;if(Mcp(name)){beforeMcp+=a;afterMcp+=b;changed ||= a!==b;}else assert.equal(b,a,key+' preserves each Hand, thumb, PIP/DIP and non-MCP bone weight exactly');}
    assert(beforeMcp>0&&changed,key+' must redistribute an existing MCP branch');
    assert(Math.abs(afterMcp-beforeMcp)<=MCP_MASS_EPSILON,key+' preserves original MCP mass within float32 serialization error');
  }
}

export function UndoFpsHandSkinWeightRepair(bytes,recipe) {
  assert.equal(Hash(bytes),recipe.output.sha256,'exact reviewed weight-repaired GLB');
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),base=28+length;
  assert.equal(Hash(bytes.subarray(base)),recipe.output.binarySha256,'complete repaired binary');
  const phases=FpsHandSkinWeightPhases(recipe),restored=Buffer.from(bytes);
  const sizes={5121:1,5123:2,5125:4,5126:4};
  const read={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
  const write={5121:'writeUInt8',5123:'writeUInt16LE',5125:'writeUInt32LE',5126:'writeFloatLE'};
  const contexts=new Map();
  function Context(edit){
    const key=[edit.meshIndex,edit.primitiveIndex,edit.vertex].join(':');
    const primitive=doc.meshes[edit.meshIndex].primitives[edit.primitiveIndex];
    assert.equal(doc.materials[primitive.material].name,'Material_HanYangScanSkin','scan skin only');
    const node=doc.nodes.find(node=>node.mesh===edit.meshIndex&&node.skin!==undefined);
    assert(node,'repair belongs to a skinned production mesh');
    const names=doc.skins[node.skin].joints.map(index=>Normalize(doc.nodes[index].name));
    const Slots=semantic=>{
      const accessor=doc.accessors[primitive.attributes[semantic==='joints'?'JOINTS_0':semantic==='weights'?'WEIGHTS_0':'POSITION']];
      const view=doc.bufferViews[accessor.bufferView],size=sizes[accessor.componentType],width=semantic==='position'?3:4;
      assert.equal(accessor.type,width===3?'VEC3':'VEC4');assert(size&&!accessor.sparse&&!accessor.normalized);assert.equal(view.buffer||0,0);
      if(semantic==='joints')assert([5121,5123,5125].includes(accessor.componentType));else assert.equal(accessor.componentType,5126);
      assert(Number.isInteger(edit.vertex)&&edit.vertex>=0&&edit.vertex<accessor.count);
      return{accessor,size,width,stride:view.byteStride||size*width,start:base+(view.byteOffset||0)+(accessor.byteOffset||0)};
    };
    return{key,primitive,names,Slots};
  }
  function Values(buffer,slot,vertex){return Array.from({length:slot.width},(_,i)=>buffer[read[slot.accessor.componentType]](slot.start+vertex*slot.stride+i*slot.size));}
  function UvConsistency(buffer,edits,phase){
    for(const edit of edits){const context=Context(edit),position=context.Slots('position'),joints=context.Slots('joints'),weights=context.Slots('weights'),key=Values(buffer,position,edit.vertex).join(','),target=Weights(context.names,Values(buffer,joints,edit.vertex),Values(buffer,weights,edit.vertex));
      const cacheKey=[edit.meshIndex,edit.primitiveIndex,phase].join(':');let group=contexts.get(cacheKey);
      if(!group){group=new Map();for(let i=0;i<position.accessor.count;i++){const k=Values(buffer,position,i).join(',');if(!group.has(k))group.set(k,[]);group.get(k).push(i);}contexts.set(cacheKey,group);}
      for(const vertex of group.get(key))assert(SameWeights(target,Weights(context.names,Values(buffer,joints,vertex),Values(buffer,weights,vertex))),context.key+' all same-position UV split vertices retain identical '+phase+' bone weights');
    }
  }
  if(phases[1].length)UvConsistency(bytes,phases[1],'MCP after');
  for(let phase=phases[1].length?1:0;phase>=0;phase--){
  for(const edit of [...phases[phase]].reverse()) {
    const {key,names,Slots}=Context(edit);ValidateFpsHandSkinWeightEdit(names,edit,recipe.version);
    for(const semantic of ['joints','weights']) {
      const slot=Slots(semantic),{accessor,size}=slot,offset=slot.start+edit.vertex*slot.stride;
      const before=edit[semantic+'Before'],after=edit[semantic+'After'];
      for(let i=0;i<4;i++) {
        assert.equal(restored[read[accessor.componentType]](offset+i*size),after[i],key+' actual phase '+phase+' '+semantic+i);
        restored[write[accessor.componentType]](before[i],offset+i*size);
      }
    }
  }
  if(phase===1){assert.equal(Hash(restored),MCP_BASIS.sha256,'MCP undo restores every published v1 byte');assert.equal(Hash(restored.subarray(base)),MCP_BASIS.binarySha256,'MCP undo protects all prior v1 binary data');UvConsistency(restored,phases[1],'MCP before');}
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
  const uniqueVertices=new Set(recipe.edits.map(edit=>[edit.meshIndex,edit.primitiveIndex,edit.vertex].join(':'))).size;
  console.log(`PASS FpsHandSkinWeights: ${recipe.edits.length} reviewed edits on ${uniqueVertices} localized vertices; exact byte restoration, side ownership and normalized weights`);
}
