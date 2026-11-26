// Local derived data. Only content-addressed products and the last complete
// manifest live in Library/. Running the importer twice is safe across processes.
import fs from "node:fs/promises";
import {createWriteStream,createReadStream} from "node:fs";
import {fork} from "node:child_process";
import {WatchEncounterImports} from "../../scripts/Script_EncounterImportWatch.mjs";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash,randomUUID} from "node:crypto";
import {createGzip} from "node:zlib";
import {pipeline} from "node:stream/promises";
import {Readable} from "node:stream";
import {XBOT_CHARACTERS} from "../Data_XBotCharacters.mjs";
import {ENCOUNTER_PLAY_STARTUP} from "../Data_Tuning_EncounterPlayStartup.mjs";
import {ReadPublishModel} from "../Script_PublishAssetPaths.mjs";
import {TerrainLibraryKey} from "./Script_LevelFlowTerrainKey.mjs";
import {PackTerrainSnapshot} from "./Script_TerrainSnapshot.mjs";
import {BuildEncounterMap} from "./Script_LevelFlowMap.mjs";
import {BuildEncounterTerrain} from "./Script_LevelFlowTerrain.mjs";
import {ENCOUNTER_VARIANTS,CompileEncounterVariant} from "../Script_EncounterVariants.mjs";
import {SceneDir,SceneFileName,DecodeSceneHeights,FlatSceneHeights,IsFlatTerrain} from "../Script_SceneDoc.mjs";
import {DecodeTrenchDatum} from "../Script_SceneTrenches.mjs";
import {ResolveInheritedScene,EncodeResolvedSceneBinary} from "../Script_SceneInherit.mjs";

const project=fileURLToPath(new URL("../",import.meta.url)), library=path.join(project,"AdvancedTools/Library");
const Hash=bytes=>createHash("sha256").update(bytes).digest("hex");
async function ReadRecord(file) {
  try {return JSON.parse(await fs.readFile(file,"utf8"));} catch {return null;}
}
async function DigestFile(file) {
  const hash=createHash("sha256");
  for await(const bytes of createReadStream(file))hash.update(bytes);
  return hash.digest("hex");
}
async function Valid(file, record) {
  try {return !!record && (await fs.stat(file)).size===record.bytes && await DigestFile(file)===record.sha256;}
  catch {return false;}
}
async function Atomic(file,write) {
  const temp=file+"."+randomUUID()+".tmp";
  try {await write(temp);await fs.rename(temp,file);} finally {await fs.rm(temp,{force:true});}
}
const WriteRecord=(file,record)=>Atomic(file,tmp=>fs.writeFile(tmp,JSON.stringify(record)));

export async function ImportCastModel(sourcePath,dir,maxSize) {
  const {default:sharp}=await import("sharp");
  const {Pack,ModelView,ImageUses}=await import("../Script_StrictTexturePublish.mjs");
  const recipe=Hash(JSON.stringify([maxSize,sharp.versions,ImportCastModel.toString(),Pack.toString(),ModelView.toString(),ImageUses.toString()]));
  await fs.mkdir(dir,{recursive:true});
  const source=await fs.readFile(sourcePath),sourceHash=Hash(source);
  const key=Hash(recipe+sourceHash),name=key+".glb",target=path.join(dir,name),recordFile=target+".json";
  let record=await ReadRecord(recordFile);
  const hit=await Valid(target,record);
  if(!hit) {
    const {doc,bin}=ReadPublishModel(source,sourcePath);
    if(doc.buffers.length!==1||doc.buffers[0].uri)throw Error("Expected embedded character model: "+sourcePath);
    const chunks=doc.bufferViews.map((_,index)=>ModelView(doc,[bin],index));
    const uses=ImageUses(doc);
    for(const [index,image] of (doc.images||[]).entries()) {
      if(!Number.isInteger(image.bufferView))throw Error("Expected embedded character image: "+sourcePath);
      const input=sharp(chunks[image.bufferView],{ignoreIcc:true}),meta=await input.metadata();
      if(Math.max(meta.width,meta.height)<=maxSize)continue;
      const resized=input.resize({width:maxSize,height:maxSize,fit:"inside",withoutEnlargement:true});
      // Current cast files use EXT_texture_webp. Preserve alpha, and use the
      // near-lossless RGB encoder for packed channels and tangent normals.
      const color=uses.get(index)?.has("srgb")&&!uses.get(index).has("linear");
      if(meta.format==="webp")resized.webp({quality:color?90:85,nearLossless:!color,alphaQuality:100,effort:3});
      else if(meta.format==="png")resized.png();
      else if(meta.format==="jpeg")resized.jpeg({quality:95,chromaSubsampling:"4:4:4"});
      else throw Error("Unsupported embedded character texture: "+meta.format);
      chunks[image.bufferView]=await resized.toBuffer();
    }
    const output=Pack(doc,chunks);
    await Atomic(target,tmp=>fs.writeFile(tmp,output));
    record={bytes:output.length,sha256:Hash(output)};
    await WriteRecord(recordFile,record);
  }
  return {hit,entry:{sourceHash,file:name,bytes:record.bytes,sha256:record.sha256}};
}

async function BuildCast() {
  const dir=path.join(library,"Cast"),maxSize=ENCOUNTER_PLAY_STARTUP.castTextureMaxSize,models={};
  let built=0;
  for(const {file,ownMaterial} of Object.values(XBOT_CHARACTERS)) {
    if(!ownMaterial||models[file])continue;
    const {hit,entry}=await ImportCastModel(path.join(project,file),dir,maxSize);
    models[file]=entry;
    if(!hit)built++;
  }
  const manifest=path.join(library,"Data_Cast.json"),next={version:1,maxSize,models};
  if(JSON.stringify(await ReadRecord(manifest))!==JSON.stringify(next))await WriteRecord(manifest,next);
  console.log("Cast:",built,"imported,",Object.keys(models).length-built,"cached");
}

async function ReadSingleSceneNode(sceneId) {
  const dir=path.join(project,SceneDir(sceneId));
  const doc=JSON.parse(await fs.readFile(path.join(dir,SceneFileName(sceneId)),"utf8"));
  const heightBuf=IsFlatTerrain(doc.terrain)?null:await fs.readFile(path.join(dir,doc.terrain.file));
  const heights=heightBuf?DecodeSceneHeights(heightBuf.buffer.slice(heightBuf.byteOffset,heightBuf.byteOffset+heightBuf.byteLength),doc.terrain):FlatSceneHeights(doc.terrain);
  const datumBuf=doc.trenches?.datum?.file?await fs.readFile(path.join(dir,doc.trenches.datum.file)):null;
  const datum=datumBuf?DecodeTrenchDatum(doc.trenches.datum,datumBuf.buffer.slice(datumBuf.byteOffset,datumBuf.byteOffset+datumBuf.byteLength)):[];
  return {doc,heights,datum,heightBuf,datumBuf};
}

async function ReadResolvedSceneNode(sceneId) {
  const own=await ReadSingleSceneNode(sceneId);
  if(!own.doc.inherit) {
    const bytes=[own.heightBuf,...(own.datumBuf?[own.datumBuf]:[])];
    return {doc:own.doc,bytes};
  }
  const base=await ReadSingleSceneNode(own.doc.inherit.scene);
  const resolved=ResolveInheritedScene(own.doc,own.heights,own.datum,base);
  const {heightBytes,datumBytes}=EncodeResolvedSceneBinary(resolved);
  const bytes=[Buffer.from(heightBytes.buffer,heightBytes.byteOffset,heightBytes.byteLength),
    ...(datumBytes?[Buffer.from(datumBytes.buffer,datumBytes.byteOffset,datumBytes.byteLength)]:[])];
  return {doc:resolved.doc,bytes};
}

async function PruneStaleTerrain(dir,keepKeys) {
  let entries=[];
  try {entries=await fs.readdir(dir);} catch {return;}
  for(const name of entries) {
    const match=/^([a-f0-9]{64})\.bin\.gz(?:\.json)?$/.exec(name);
    if(match&&!keepKeys.has(match[1])) await fs.rm(path.join(dir,name),{force:true}).catch(()=>{});
  }
}

async function BuildTerrain({onlyKey=null}={}) {
  const dir=path.join(library,"Terrain");await fs.mkdir(dir,{recursive:true});
  const seenScenes=new Set(),targets=[];
  for(const spec of ENCOUNTER_VARIANTS) {
    if(seenScenes.has(spec.scene))continue;
    seenScenes.add(spec.scene);
    const variant=CompileEncounterVariant(spec.id);
    const {doc:scene,bytes}=await ReadResolvedSceneNode(spec.scene);
    const map=BuildEncounterMap(scene,{sceneId:spec.scene,variantSpec:spec});
    map.source={scene:`${SceneDir(spec.scene)}/${SceneFileName(spec.scene)}`,sha256:Hash(JSON.stringify(map))};
    const focus=variant.evaluate(0,variant.defaultDocument).player;
    const key=await TerrainLibraryKey(scene,bytes,map,focus,url=>fs.readFile(url,"utf8"));
    targets.push({sceneId:spec.scene,scene,bytes,map,focus,key});
  }
  const activeKeys=new Set(targets.map(item=>item.key));
  const selected=onlyKey?targets.filter(item=>item.key===onlyKey):targets;
  if(onlyKey&&!selected.length){console.log("Terrain: unmatched key",onlyKey);return;}
  for(const {sceneId,scene,bytes,map,focus,key} of selected) {
    const target=path.join(dir,key+".bin.gz"),recordFile=target+".json";
    if(await Valid(target,await ReadRecord(recordFile))){console.log("Terrain: cached",sceneId,key);continue;}
    const heightAb=bytes[0].buffer.slice(bytes[0].byteOffset,bytes[0].byteOffset+bytes[0].byteLength);
    const datumAb=bytes[1]?bytes[1].buffer.slice(bytes[1].byteOffset,bytes[1].byteOffset+bytes[1].byteLength):null;
    const terrain=BuildEncounterTerrain(scene,heightAb,datumAb,map);
    const chunks=PackTerrainSnapshot(terrain.prepareSnapshot(focus));
    await Atomic(target,tmp=>pipeline(Readable.from(chunks),createGzip({level:1}),createWriteStream(tmp)));
    await WriteRecord(recordFile,{bytes:(await fs.stat(target)).size,sha256:await DigestFile(target)});
    console.log("Terrain: imported",sceneId,key);
  }
  if(!onlyKey)await PruneStaleTerrain(dir,activeKeys);
}

// Optional companion for ordinary static file servers. Start watching first so
// edits made during an import are picked up in a fresh process after it finishes.
async function WatchLibrary() {
  const run=type=>new Promise((resolve,reject)=>{
    const child=fork(fileURLToPath(import.meta.url),[type],{stdio:["ignore","inherit","inherit","ipc"],windowsHide:true});
    child.once("error",reject);
    child.once("exit",code=>code===0?resolve():reject(Error("Import failed: "+code)));
  });
  // Queue startup and edit-triggered imports in the same order.
  let ready=run("all");
  WatchEncounterImports(project,type=>{ready=ready.catch(()=>{}).then(()=>run(type));return ready;});
  console.log("Watching encounter imports in",library);
  await ready;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const type=process.argv[2]||"all";
  const keyArgIndex=process.argv.indexOf("--key");
  const onlyKey=keyArgIndex>=0?process.argv[keyArgIndex+1]||null:null;
  if(!["all","cast","terrain","watch"].includes(type))throw Error("Usage: node Script_EncounterLibrary.mjs [all|cast|terrain|watch] [--key <sha256>]");
  if(type==="watch")await WatchLibrary();
  else {
    if(type!=="terrain")await BuildCast();
    if(type!=="cast")await BuildTerrain({onlyKey});
  }
}
