import { ValidateEncounterDocument, UpgradeEncounterDocument } from "./Script_LevelFlowEncounter.mjs";

export const ENCOUNTER_STORAGE_KEY = "tengxian1938_encounter_v2";
export const FRAME_SCHEMA = "tengxian-encounter-frame/2";

export function ValidateViewportLayout(layout) {
  const types=["plan","battle","oblique","scene","chase","eye"],modes=["stage","all","manual","follow"];
  const valid=layout&&[1,2,4].includes(layout.count)&&Number.isInteger(layout.active)&&layout.active>=0&&layout.active<layout.count
    &&Array.isArray(layout.views)&&layout.views.length===layout.count&&layout.views.every((view)=>types.includes(view.type)&&modes.includes(view.mode)
      &&Array.isArray(view.center)&&view.center.length===2&&view.center.every((value)=>Number.isFinite(value)&&Math.abs(value)<=10000)
      &&Number.isFinite(view.scale)&&view.scale>=0.1&&view.scale<=80&&Number.isFinite(view.yaw)&&Number.isFinite(view.pitch)
      &&["player","winter","luo","tank1"].includes(view.target)
      &&(view.far===undefined||Number.isFinite(view.far)&&view.far>=100&&view.far<=10000)
      &&(view.focusDistance===undefined||Number.isFinite(view.focusDistance)&&view.focusDistance>0&&view.focusDistance<=10000)
      &&(view.freeCamera==null||Array.isArray(view.freeCamera.eye)&&view.freeCamera.eye.length===3&&view.freeCamera.eye.every(value=>Number.isFinite(value)&&Math.abs(value)<=10000)
        &&Number.isFinite(view.freeCamera.yaw)&&Number.isFinite(view.freeCamera.pitch)&&Math.abs(view.freeCamera.pitch)<Math.PI/2)
      &&Number.isFinite(view.viewport?.width)&&view.viewport.width>0&&Number.isFinite(view.viewport?.height)&&view.viewport.height>0);
  if(!valid) throw new Error("多视口定位数据无效");
  return structuredClone(layout);
}

function ValidateSavedDocument(value,timeline) {
  const document=ValidateEncounterDocument(value,timeline);
  for(const annotation of document.annotations) if(annotation.viewports) ValidateViewportLayout(annotation.viewports);
  return document;
}

export class EncounterDocument {
  constructor(defaults,timeline,storage) {
    this.defaults=defaults;
    this.timeline=timeline;
    this.storage=storage;
    this.value=structuredClone(defaults);
    this.undo=[];this.redo=[];this.warning="";
    try {
      const saved=storage?.getItem(ENCOUNTER_STORAGE_KEY);
      if(saved) {
        const original=ValidateSavedDocument(JSON.parse(saved),timeline);
        this.value=ValidateSavedDocument(UpgradeEncounterDocument(original,defaults),timeline);
        if(this.value.revision!==original.revision) {this.Save();this.warning=this.warning||"已更新地面遭遇布设，保留草稿中自行修改的字段";}
      }
    } catch(error) { this.warning=`草稿未载入 · ${error.message}`; }
  }

  Replace(value) {
    const validated=ValidateSavedDocument(UpgradeEncounterDocument(value,this.defaults),this.timeline);
    this.undo.push(this.value);
    if(this.undo.length>40) this.undo.shift();
    this.redo=[];this.value=validated;this.Save();
  }

  Change(edit) {
    const candidate=structuredClone(this.value);
    edit(candidate);this.Replace(candidate);
  }

  Undo() {
    if(!this.undo.length) return false;
    this.redo.push(this.value);this.value=this.undo.pop();this.Save();return true;
  }

  Redo() {
    if(!this.redo.length) return false;
    this.undo.push(this.value);this.value=this.redo.pop();this.Save();return true;
  }

  Save() {
    this.warning="";
    try { this.storage?.setItem(ENCOUNTER_STORAGE_KEY,JSON.stringify(this.value)); }
    catch(error) { this.warning=`草稿仍在当前窗口 · 保存失败 ${error.message}`; }
  }
}

export function CreateFramePacket(document,frame,view,viewport) {
  return {
    schema:FRAME_SCHEMA,
    frameId:`L1-${frame.beat.id.toUpperCase()}-${Math.round(frame.time*1000)}`,
    context:{level:"FirstLevel",stage:frame.stage.id,beat:frame.beat.id,title:frame.beat.title,time:frame.time,
      player:[...frame.player],view:{center:[...view.center],scale:view.scale},viewport,
      bounds:view.Bounds?view.Bounds():[view.center[0]-viewport.width/(2*view.scale),view.center[0]+viewport.width/(2*view.scale),view.center[1]-viewport.height/(2*view.scale),view.center[1]+viewport.height/(2*view.scale)],
      projection:view.type||"plan",camera:view.eye?{eye:[...view.eye],aim:[...view.aim]}:null,
      mapSource:view.mapData?.source??null,
      coordinates:"X east, Z south, metres",sourceRevision:document.revision},
    document:structuredClone(document),
  };
}

export function ReadFramePacket(value,timeline) {
  if(value?.schema!==FRAME_SCHEMA) throw new Error("文件中没有可回放的帧定位");
  const context=value.context;
  const Point=(point)=>Array.isArray(point)&&point.length===2&&point.every((number)=>Number.isFinite(number)&&Math.abs(number)<=10000);
  if(!Number.isFinite(context?.time)||context.time<0||context.time>timeline.at(-1).end
    || !Point(context.player)||!Point(context.view?.center)||!Number.isFinite(context.view.scale)
    ||context.view.scale<0.1||context.view.scale>80
    ||!Number.isFinite(context.viewport?.width)||!Number.isFinite(context.viewport?.height)
    ||context.viewport.width<=0||context.viewport.height<=0) throw new Error("帧定位坐标或时间无效");
  if(context.viewports) ValidateViewportLayout(context.viewports);
  return {...value,context:structuredClone(context),document:ValidateSavedDocument(value.document,timeline)};
}

function Crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) {
    crc^=byte;
    for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

export function AddPngFrameMetadata(buffer,packet) {
  const bytes=new Uint8Array(buffer);
  if(bytes.length<20||bytes[0]!==137||bytes[1]!==80) throw new Error("无效 PNG");
  const encoder=new TextEncoder();
  const keyword=encoder.encode("EncounterFrame");
  const json=encoder.encode(JSON.stringify(packet));
  const data=new Uint8Array(keyword.length+5+json.length);
  data.set(keyword);data.set(json,keyword.length+5);
  const chunk=new Uint8Array(data.length+12);
  const view=new DataView(chunk.buffer);
  view.setUint32(0,data.length);chunk.set(encoder.encode("iTXt"),4);chunk.set(data,8);
  view.setUint32(chunk.length-4,Crc32(chunk.subarray(4,chunk.length-4)));
  let offset=8;
  const input=new DataView(buffer);
  while(offset+12<=bytes.length) {
    const length=input.getUint32(offset);
    const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(type==="IEND") break;
    offset+=length+12;
  }
  const result=new Uint8Array(bytes.length+chunk.length);
  result.set(bytes.subarray(0,offset));result.set(chunk,offset);result.set(bytes.subarray(offset),offset+chunk.length);
  return result;
}

export function ReadPngFrameMetadata(buffer) {
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),decoder=new TextDecoder();
  if(bytes.length<20||bytes[0]!==137||bytes[1]!==80) throw new Error("无效 PNG");
  let offset=8;
  while(offset+12<=bytes.length) {
    const length=view.getUint32(offset);
    if(offset+length+12>bytes.length) throw new Error("PNG 数据不完整");
    const type=decoder.decode(bytes.subarray(offset+4,offset+8));
    if(type==="iTXt") {
      const data=bytes.subarray(offset+8,offset+8+length);
      const separator=data.indexOf(0);
      if(decoder.decode(data.subarray(0,separator))==="EncounterFrame") {
        if(data[separator+1]!==0) throw new Error("不支持压缩的帧标注");
        return JSON.parse(decoder.decode(data.subarray(separator+5)));
      }
    }
    offset+=length+12;
  }
  throw new Error("这张图没有帧定位数据，请使用本工具导出的 PNG 原文件或工程 JSON");
}

export function DownloadBlob(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
