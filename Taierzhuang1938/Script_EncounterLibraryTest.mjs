import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {ImportCastModel} from "./AdvancedTools/Script_EncounterLibrary.mjs";
import {Pack,ModelView} from "./Script_StrictTexturePublish.mjs";
import {ReadPublishModel} from "./Script_PublishAssetPaths.mjs";
import {TerrainLibraryKey} from "./AdvancedTools/Script_LevelFlowTerrainKey.mjs";
import {PackTerrainSnapshot,UnpackTerrainSnapshot} from "./AdvancedTools/Script_TerrainSnapshot.mjs";
import {WatchEncounterImports} from "../scripts/Script_EncounterImportWatch.mjs";

const root=await fs.mkdtemp(path.join(os.tmpdir(),"EncounterLibrary-"));
try {
  const file=path.join(root,"Source.glb"),dir=path.join(root,"Library");
  const positions=Buffer.from(new Float32Array([1,2,3]).buffer);
  const png=await sharp({create:{width:2052,height:513,channels:4,background:"#79472680"}}).png().toBuffer();
  const source=Pack({asset:{version:"2.0"},bufferViews:[{},{}],images:[{mimeType:"image/png",bufferView:1}],
    textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}]},[positions,png]);
  await fs.writeFile(file,source);
  const first=await ImportCastModel(file,dir,2048);
  assert.equal(first.hit,false);
  assert.deepEqual(await fs.readFile(file),source,"Importer must preserve authoring bytes");
  const target=path.join(dir,first.entry.file);
  const {doc,bin}=ReadPublishModel(await fs.readFile(target),target);
  assert.deepEqual(ModelView(doc,[bin],0),positions);
  const meta=await sharp(ModelView(doc,[bin],1)).metadata();
  assert.deepEqual([meta.width,meta.height,meta.hasAlpha],[2048,512,true]);
  assert.equal((await ImportCastModel(file,dir,2048)).hit,true);
  await fs.writeFile(target,Buffer.alloc(first.entry.bytes));
  assert.deepEqual(await ImportCastModel(file,dir,2048),first,"Repair a same-length corrupted artifact");
  assert.notEqual((await ImportCastModel(file,dir,1024)).entry.file,first.entry.file);
  doc.asset.generator="edited model";
  await fs.writeFile(file,Pack(doc,[positions,png]));
  assert.notEqual((await ImportCastModel(file,dir,2048)).entry.file,first.entry.file);

  const nodes=new Float64Array([1.25,-3.5,48]);
  const input={format:2,nodes,sub:nodes.subarray(1),leafIds:new Uint32Array([2]),mask:new Uint8Array([1,2,3])};
  const fileBytes=Uint8Array.from(Buffer.concat(PackTerrainSnapshot(input)));
  const output=UnpackTerrainSnapshot(fileBytes.buffer);
  assert.deepEqual(output,input);assert.equal(output.sub.buffer,output.nodes.buffer);
  assert.equal(output.sub.byteOffset-output.nodes.byteOffset,8);
  assert.throws(()=>UnpackTerrainSnapshot(fileBytes.buffer.slice(0,16)));
  const key=(focus,data,recipe)=>TerrainLibraryKey({id:"scene"},[Uint8Array.of(data)],{},focus,async()=>recipe);
  const original=await key([0,0],1,"one");
  for(const other of [key([1,0],1,"one"),key([0,0],2,"one"),key([0,0],1,"two")])assert.notEqual(await other,original);
  for(const dir of ["Model/Character","AdvancedTools","Scenes/FirstLevelEncounter"])await fs.mkdir(path.join(root,dir),{recursive:true});
  let wake;
  const changes=new Promise(resolve=>{wake=resolve;});
  const observed=new Set();
  const close=WatchEncounterImports(root,async type=>{
    observed.add(type);
    if(observed.size===2)wake();
  });
  let timeout;
  try {
    await fs.writeFile(path.join(root,"Model/Character/Model_Example.glb"),source);
    await fs.writeFile(path.join(root,"Scenes/FirstLevelEncounter/Example.height.bin"),Uint8Array.of(1));
    await Promise.race([changes,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error("Source change was missed")),7000);})]);
    assert.deepEqual(observed,new Set(["cast","terrain"]));
  } finally {clearTimeout(timeout);close();}
  console.log("ok  Source preservation, sized RGBA, unchanged mesh, disk reuse, corruption repair, source/settings invalidation, terrain precision and dependency keys");
} finally {await fs.rm(root,{recursive:true,force:true});}
