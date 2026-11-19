// Local derived data. Only content-addressed products and the last complete
// manifest live in Library/. Running the importer twice is safe across processes.
import fs from "node:fs/promises";
import {createWriteStream,createReadStream,watch} from "node:fs";
import {fork} from "node:child_process";
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
import {EvaluateFlow} from "./Script_LevelFlowModel.mjs";

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

async function BuildTerrain() {
  const dir=path.join(library,"Terrain");await fs.mkdir(dir,{recursive:true});
  const sceneDir=path.join(project,"Scenes/FirstLevelEncounter");
  const scene=JSON.parse(await fs.readFile(path.join(sceneDir,"Scene_FirstLevelEncounter.json"),"utf8"));
  const map=BuildEncounterMap(scene);
  map.source={scene:"Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json",sha256:Hash(JSON.stringify(map))};
  const bytes=await Promise.all([scene.terrain.file,scene.trenches?.datum?.file].filter(Boolean).map(file=>fs.readFile(path.join(sceneDir,file))));
  const focus=EvaluateFlow(0).player;
  const key=await TerrainLibraryKey(scene,bytes,map,focus,url=>fs.readFile(url,"utf8"));
  const target=path.join(dir,key+".bin.gz"),recordFile=target+".json";
  if(await Valid(target,await ReadRecord(recordFile))){console.log("Terrain: cached",key);return;}
  const terrain=BuildEncounterTerrain(scene,bytes[0],bytes[1],map);
  const chunks=PackTerrainSnapshot(terrain.prepareSnapshot(focus));
  await Atomic(target,tmp=>pipeline(Readable.from(chunks),createGzip({level:1}),createWriteStream(tmp)));
  await WriteRecord(recordFile,{bytes:(await fs.stat(target)).size,sha256:await DigestFile(target)});
  console.log("Terrain: imported",key);
}

// Optional companion for ordinary static file servers. Start watching first so
// edits made during an import are picked up in a fresh process after it finishes.
function WatchLibrary() {
  const pending=new Set(["cast","terrain"]);
  let active=false,timer;
  async function Drain() {
    if(active)return;
    active=true;
    try {
      while(pending.size) {
        const type=pending.size===2?"all":[...pending][0];
        pending.clear();
        const child=fork(fileURLToPath(import.meta.url),[type],{stdio:["ignore","inherit","inherit","ipc"],windowsHide:true});
        await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>{
          if(code!==0)console.error("Encounter Library import failed:",code);
          resolve();
        });});
      }
    } catch(error) {console.error(error.message);}
    finally {active=false;}
  }
  for(const dir of ["Model/Character","Scenes/FirstLevelEncounter","AdvancedTools","."]) {
    watch(path.join(project,dir),(_event,file)=>{
      if(!file)return;
      if(dir==="Model/Character"&&file.endsWith(".glb"))pending.add("cast");
      if(dir==="Scenes/FirstLevelEncounter"&&/\.(?:bin|json|mjs)$/.test(file))pending.add("terrain");
      if((dir==="."||dir==="AdvancedTools")&&file.endsWith(".mjs")){
        pending.add("terrain");
        if(["Script_EncounterLibrary.mjs","Script_StrictTexturePublish.mjs","Script_PublishAssetPaths.mjs",
          "Data_XBotCharacters.mjs","Data_Tuning_EncounterPlayStartup.mjs"].includes(file))pending.add("cast");
      }
      if(pending.size){clearTimeout(timer);timer=setTimeout(Drain,350);}
    });
  }
  console.log("Watching encounter imports in",library);
  void Drain();
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const type=process.argv[2]||"all";
  if(!["all","cast","terrain","watch"].includes(type))throw Error("Usage: node Script_EncounterLibrary.mjs [all|cast|terrain|watch]");
  if(type==="watch")WatchLibrary();
  else {
    if(type!=="terrain")await BuildCast();
    if(type!=="cast")await BuildTerrain();
  }
}
