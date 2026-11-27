import { GroupPath } from "./Script_LevelFlowEncounter.mjs";
import { FLOW_GROUND } from "./Data_LevelFlow.mjs";
import { Clamp, Distance, Lerp } from "./Script_LevelFlowGeometry.mjs";
import { DrawFlowDialogue } from "./Script_LevelFlowDialogue.mjs";
import { IsMainlineLandmark, LandmarkMode } from "./Script_LevelFlowMap.mjs";
import { FLOW_FIELD_COLORS, FLOW_RENDERING, FLOW_ZOOM, FLOW_DUSK } from "../Data_Tuning_LevelFlow.mjs";
import { MakeRoadPath, GapsToRuns, SampleRun, ResolveRailwayGaps } from "../Script_RoadPath.mjs";

const LINE_CLIP_PAD=32,BASE_OVERSCAN=0.2,BASE_SCALE_TOLERANCE=0.05;
const roadSplineCache = new WeakMap();
function SplinePoints(points, step = 2.5) {
  if (!Array.isArray(points) || points.length < 3) return points;
  let cached = roadSplineCache.get(points);
  if (!cached) {
    try {
      cached = MakeRoadPath(points).Dense(step);
    } catch {
      cached = points;
    }
    roadSplineCache.set(points, cached);
  }
  return cached;
}

export const FLOW_COLORS = {player:"#ac7a16",friend:"#276d82",enemy:"#ac4031",civilian:"#72608e"};
export const FLOW_MATERIAL_COLORS={"Whitebox/Plaster":"#d8d0ba","Whitebox/Roof":"#aaa58f","Whitebox/Structure":"#beb9a5","Whitebox/Timber":"#aa8862","Whitebox/EarthDark":"#bba98b","Whitebox/Cover":"#c7b391","Whitebox/Step":"#baa482","Whitebox/Canvas":"#d0bd91","Whitebox/Metal":"#8b9186","Whitebox/Water":"#a8c5ce","Whitebox/Foliage":"#a5af85","Whitebox/Void":"#5a544a","Whitebox/Danger":"#b6614d","Whitebox/Coping":"#cbc5b3"};

export const FLOW_COVER_COLORS = {
  side: "#476d54",
  top: "#8daf8a",
  edge: "#244633",
  mark: "#fff4cf",
};

export const FLOW_AIRWALL_COLORS = {
  fill2d: "#d932383d",
  stroke2d: "#c4242b",
  stripe2d: "#ff8c90cc",
  gateFill2d: "#e66a1e4d",
  gateStroke2d: "#d95b12",
  gateStripe2d: "#ffe09ecc",
  face3d: "#e0383852",
  edge3d: "#eb4238f0",
  gateFace3d: "#f07c1e6b",
  gateEdge3d: "#ff9b2aff",
};

export function IsEncounterCover(object) {
  return !!object.cover || object.planning === true || object.material === "Whitebox/Cover";
}

export function DrawCoverSymbol(context, point) {
  const [x, y] = point;
  context.save();
  context.beginPath();
  context.moveTo(x - 5, y - 5);
  context.lineTo(x + 5, y - 5);
  context.lineTo(x + 5, y);
  context.quadraticCurveTo(x + 5, y + 4, x, y + 7);
  context.quadraticCurveTo(x - 5, y + 4, x - 5, y);
  context.closePath();
  context.fillStyle = FLOW_COVER_COLORS.edge;
  context.fill();
  context.strokeStyle = FLOW_COVER_COLORS.mark;
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
}

export function EncounterSignals(frame) {
  const signals=new Set(frame.signals||[]);
  if(frame.time>=40) signals.add("DugoutCollapsed");
  if(frame.beat.id>="04c") signals.add("L1TrunkLoaded");
  if(frame.beat.id>="05a") signals.add("CartDeparted");
  if(frame.beat.id>="06a") signals.add("Stage0105Done");
  if(frame.beat.id>="06e") signals.add("L1TrunkTossed");
  if(frame.beat.id>="06i") signals.add("L1SunkenRoadBlocked");
  if(!frame.customSignals) {
    if(frame.beat.id>="09i") signals.add("SideGateOpen");
    if(frame.beat.id>="10a") {signals.add("MgSilenced");signals.add("EastGateBurst");}
    if(frame.beat.id>="10d") signals.add("NorthYardGatesBroken");
    if(frame.beat.id>="10g") signals.add("BarrageHit");
    if(frame.beat.id>="10i") signals.add("LaneWallCollapse");
  }
  return signals;
}

export function VisibleEncounterObject(object,signals) {
  return !(object.showOn&&!signals.has(object.showOn)||object.hideOn&&signals.has(object.hideOn));
}

function SmoothLine(context,points,color,width) {
  if(points.length<2) return;
  context.beginPath();context.moveTo(...points[0]);
  for(let index=1;index<points.length-1;index++) {
    const previous=points[index-1],point=points[index],next=points[index+1];
    const incoming=Distance(previous,point),outgoing=Distance(point,next);
    const radius=Math.min(width*0.35,12,incoming*0.22,outgoing*0.22);
    if(!incoming||!outgoing) continue;
    const entry=point.map((value,axis)=>value+(previous[axis]-value)*radius/incoming);
    const exit=point.map((value,axis)=>value+(next[axis]-value)*radius/outgoing);
    context.lineTo(...entry);context.quadraticCurveTo(...point,...exit);
  }
  context.lineTo(...points.at(-1));context.lineCap="round";context.lineJoin="round";
  context.strokeStyle=color;context.lineWidth=width;context.stroke();
}

function ClipSegment(a,b,[minX,minY,maxX,maxY]) {
  const dx=b[0]-a[0],dy=b[1]-a[1];
  let t0=0,t1=1;
  const edges=[[-dx,a[0]-minX],[dx,maxX-a[0]],[-dy,a[1]-minY],[dy,maxY-a[1]]];
  for(const [p,q] of edges) {
    if(p===0) {if(q<0) return null;continue;}
    const t=q/p;
    if(p<0) {if(t>t1) return null;if(t>t0) t0=t;}
    else {if(t<t0) return null;if(t<t1) t1=t;}
  }
  return t0>t1?null:[t0,t1];
}

export function ClipPolyline(points,bounds) {
  const runs=[];
  let run=null,travelled=0;
  for(let index=1;index<points.length;index++) {
    const a=points[index-1],b=points[index];
    if(![a[0],a[1],b[0],b[1]].every(Number.isFinite)) {run=null;continue;}
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),span=ClipSegment(a,b,bounds);
    if(span) {
      const [t0,t1]=span;
      const start=t0===0?a:[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0];
      const end=t1===1?b:[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
      if(run&&t0===0) run.points.push(end);
      else {run={points:[start,end],offset:travelled+length*t0};runs.push(run);}
      if(t1<1) run=null;
    } else run=null;
    travelled+=length;
  }
  return runs;
}

export function Line(context,points,color,width=1,dash=[]) {
  if(!points.length) return;
  context.strokeStyle=color;context.lineWidth=width;
  if(context.lineClip&&dash.length) {
    context.setLineDash(dash);
    for(const run of ClipPolyline(points,context.lineClip)) {
      context.beginPath();context.moveTo(...run.points[0]);
      for(let index=1;index<run.points.length;index++) context.lineTo(...run.points[index]);
      context.lineDashOffset=run.offset;context.stroke();
    }
    context.lineDashOffset=0;context.setLineDash([]);
    return;
  }
  context.beginPath();context.moveTo(...points[0]);
  for(const point of points.slice(1)) context.lineTo(...point);
  context.setLineDash(dash);context.stroke();context.setLineDash([]);
}
export function Polygon(context,points,color,stroke) {
  if(!points.length) return;
  context.beginPath();context.moveTo(...points[0]);for(const point of points.slice(1)) context.lineTo(...point);
  context.closePath();context.fillStyle=color;context.fill();
  if(stroke) {context.strokeStyle=stroke;context.lineWidth=0.8;context.stroke();}
}
export function Circle(context,point,radius,color,stroke) {
  context.beginPath();context.arc(...point,Math.max(0.1,radius),0,Math.PI*2);context.fillStyle=color;context.fill();
  if(stroke) {context.strokeStyle=stroke;context.lineWidth=1.2;context.stroke();}
}
export function Arrow(context,a,b,color,width=2) {
  Line(context,[a,b],color,width);
  const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const size=6+width;
  Polygon(context,[b,[b[0]-Math.cos(angle-0.45)*size,b[1]-Math.sin(angle-0.45)*size],[b[0]-Math.cos(angle+0.45)*size,b[1]-Math.sin(angle+0.45)*size]],color);
}
export function Label(context,text,x,y,color="#494b3d",size=12,background=false) {
  context.font=`${size}px system-ui, Microsoft YaHei, sans-serif`;
  if(context.DepthOverlay) {
    const overlay=context.DepthOverlay,w=Math.ceil(context.measureText(text).width)+12,h=size+10;
    overlay.Billboard(["label",text,color,size,background],x-6,y-h/2,w,h,
      ctx=>Label(ctx,text,6,h/2,color,size,background),overlay.anchor,overlay.actorSlot);
    return;
  }
  context.textAlign="left";context.textBaseline="middle";
  if(background) {context.fillStyle="#faf5e8ee";context.fillRect(x-4,y-size/2-3,context.measureText(text).width+8,size+6);}
  context.lineWidth=3;context.strokeStyle="#f1eddfcc";context.strokeText(text,x,y);context.fillStyle=color;context.fillText(text,x,y);
}

function AnnotationText(context,text,anchor,width,height) {
  context.font="13px system-ui, Microsoft YaHei, sans-serif";
  const maxWidth=Math.max(80,Math.min(340,width-24)),lines=[];
  for(const paragraph of text.split("\n")) {
    let line="";
    for(const character of paragraph) {
      if(line&&context.measureText(line+character).width>maxWidth) {lines.push(line);line="";}
      line+=character;
    }
    lines.push(line);
  }
  const maxLines=Math.max(1,Math.floor((height-24)/17));
  if(lines.length>maxLines) {lines.length=maxLines;lines[maxLines-1]+="…";}
  const boxWidth=Math.max(...lines.map((line)=>context.measureText(line).width))+12,boxHeight=lines.length*17+8;
  const left=Clamp(anchor[0]+8,8,width-boxWidth-8),top=Clamp(anchor[1]-20,8,height-boxHeight-8);
  Line(context,[anchor,[left,top+12]],"#8d601bbb",1);
  context.fillStyle="#fff8e8ed";context.fillRect(left,top,boxWidth,boxHeight);
  lines.forEach((line,index)=>Label(context,line,left+6,top+12+index*17,"#81520d",13));
}

export class FlowMapView {
  constructor(canvas,mapData) {
    this.canvas=canvas;this.mapData=mapData;this.center=[52,76];this.scale=5;this.hits=[];this.hoveredActorId=null;
    this.baseCanvas=document.createElement("canvas");this.baseKey="";
    this.terrainTiles=new Map();
  }

  ProjectPath(points) {return [points.map(point=>this.ToScreen(point))];}

  BaseSource(width,height,ratio) {
    const base=this.baseView;
    if(!base||base.ratio!==ratio||Math.abs(this.scale/base.scale-1)>BASE_SCALE_TOLERANCE) return null;
    const Axis=(size,baseSize,axis)=>{
      const start=((0-size/2)/this.scale+this.center[axis]-base.center[axis])*base.scale+baseSize/2;
      return [start,size*base.scale/this.scale];
    };
    const [sx,sw]=Axis(width,base.width,0),[sy,sh]=Axis(height,base.height,1);
    const slack=1e-6;
    if(sx<-slack||sy<-slack||sx+sw>base.width+slack||sy+sh>base.height+slack) return null;
    return [sx*ratio,sy*ratio,sw*ratio,sh*ratio];
  }

  DrawPath(context,points,color,width=1,dash=[]) {
    for(const path of this.ProjectPath(points)) Line(context,path,color,width,dash);
  }

  DrawArrow(context,a,b,color,width=2) {
    const end=this.ToScreen(b);
    for(const path of this.ProjectPath([a,b])) {
      if(Distance(path.at(-1),end)<1e-6) Arrow(context,path[0],path.at(-1),color,width);
      else Line(context,path,color,width);
    }
  }

  Fit(bounds,padding=54) {
    const {width,height}=this.canvas.getBoundingClientRect();
    this.center=[(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2];
    this.scale=Clamp(Math.min((width-padding*2)/Math.max(10,bounds[1]-bounds[0]),(height-padding*2)/Math.max(10,bounds[3]-bounds[2])),FLOW_ZOOM.minScale,32);
  }

  Follow(frame) {
    const points=[frame.player,...frame.actors.filter((actor)=>actor.pose!=="dead"&&Distance(actor.p,frame.player)<115).map((actor)=>actor.p)];
    for(const group of frame.groups) if(group.start!==null&&frame.time>=group.start-8&&frame.time<group.end&&Distance(group.area.center,frame.player)<130) points.push(group.area.center);
    const xs=points.map((point)=>point[0]),zs=points.map((point)=>point[1]);
    this.Fit([Math.min(...xs)-14,Math.max(...xs)+14,Math.min(...zs)-14,Math.max(...zs)+14],62);
    this.scale=Clamp(this.scale*(this.followZoom??1),FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);
  }

  ToScreen(point) {
    const {width,height}=this.canvas.getBoundingClientRect();
    return [(point[0]-this.center[0])*this.scale+width/2,(point[1]-this.center[1])*this.scale+height/2];
  }
  ToWorld(point) {
    const {width,height}=this.canvas.getBoundingClientRect();
    return [(point[0]-width/2)/this.scale+this.center[0],(point[1]-height/2)/this.scale+this.center[1]];
  }
  Zoom(factor,point) {
    const previous=this.ToWorld(point);this.scale=Clamp(this.scale*factor,FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);const current=this.ToWorld(point);
    this.center=this.center.map((value,index)=>value+previous[index]-current[index]);
  }
  Bounds() {
    const {width,height}=this.canvas.getBoundingClientRect(),a=this.ToWorld([0,0]),b=this.ToWorld([width,height]);
    return [a[0],b[0],a[1],b[1]];
  }

  DrawTerrain(context,width,height) {
    const terrain=this.mapData.terrain;
    if(!terrain) return;
    const scale=this.scale,{tileCells:cells,minStepM,maxLevel}=FLOW_RENDERING.mapTerrain;
    // Shading is sampled on a fixed world grid per power-of-two level and only
    // stretched to the current zoom, so continuous zoom or follow framing
    // never invalidates the tiles. Crossing a level boundary builds new tiles.
    const level=Clamp(Math.round(Math.log2(Math.max(minStepM,2/scale)/minStepM)),0,maxLevel);
    if(this.tileTerrain!==terrain) {this.terrainTiles.clear();this.tileTerrain=terrain;}
    const step=minStepM*2**level,tileMetres=cells*step,tilePixels=tileMetres*scale,bounds=terrain.bounds;
    const left=(bounds.minX-this.center[0])*scale+width/2,top=(bounds.minZ-this.center[1])*scale+height/2;
    const minX=Math.max(0,Math.floor(-left/tilePixels)),minZ=Math.max(0,Math.floor(-top/tilePixels));
    const maxX=Math.min(Math.ceil((bounds.maxX-bounds.minX)/tileMetres),Math.ceil((width-left)/tilePixels));
    const maxZ=Math.min(Math.ceil((bounds.maxZ-bounds.minZ)/tileMetres),Math.ceil((height-top)/tilePixels));
    context.save();context.beginPath();
    context.rect(left,top,(bounds.maxX-bounds.minX)*scale,(bounds.maxZ-bounds.minZ)*scale);context.clip();
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality="low";
    const size=cells+2;
    for(let row=minZ;row<maxZ;row++) for(let column=minX;column<maxX;column++) {
      const tileKey=`${level}:${column},${row}`;
      let tile=this.terrainTiles.get(tileKey);
      if(!tile) {
        tile=document.createElement("canvas");tile.width=tile.height=size;
        const image=new ImageData(size,size),data=image.data,originX=bounds.minX+column*tileMetres,originZ=bounds.minZ+row*tileMetres,sample=terrain.preAt;
        // One cell of border on every side comes from the neighbouring tiles'
        // samples, so smoothed edges blend instead of fading to transparent.
        for(let z=-1;z<=cells;z++) for(let x=-1;x<=cells;x++) {
          const worldX=originX+(x+0.5)*step,worldZ=originZ+(z+0.5)*step;
          if(worldX<bounds.minX||worldX>=bounds.maxX||worldZ<bounds.minZ||worldZ>=bounds.maxZ) continue;
          const slope=(sample(worldX-step,worldZ)-sample(worldX+step,worldZ))*0.7
            +(sample(worldX,worldZ-step)-sample(worldX,worldZ+step))*0.45;
          const opacity=Math.min(0.28,Math.abs(slope)/step*0.45);
          if(opacity<0.015) continue;
          const offset=((z+1)*size+x+1)*4;
          if(slope>0) {data[offset]=255;data[offset+1]=250;data[offset+2]=218;}
          else {data[offset]=80;data[offset+1]=69;data[offset+2]=45;}
          data[offset+3]=Math.round(opacity*255);
        }
        tile.getContext("2d").putImageData(image,0,0);
      }
      // Refresh insertion order so long pans retain the most recent tiles.
      this.terrainTiles.delete(tileKey);this.terrainTiles.set(tileKey,tile);
      context.drawImage(tile,1,1,cells,cells,left+column*tilePixels,top+row*tilePixels,tilePixels,tilePixels);
    }
    // Keep the visible set even on wide single-view layouts. Evict after the
    // draw so new edge tiles cannot evict visible tiles still awaiting reuse.
    const budget=Math.max(FLOW_RENDERING.mapTerrain.maxTiles,Math.max(0,maxX-minX)*Math.max(0,maxZ-minZ));
    while(this.terrainTiles.size>budget) this.terrainTiles.delete(this.terrainTiles.keys().next().value);
    context.restore();
  }

  DrawBase(context,width,height,frame,layers={}) {
    const map=this.mapData,scale=this.scale;
    // The planar projection shares one viewport size for the entire background.
    // Reading layout for every terrain cell and scene object stalls navigation.
    const Screen=(point)=>[(point[0]-this.center[0])*scale+width/2,(point[1]-this.center[1])*scale+height/2];
    context.fillStyle="#e7e2d2";context.fillRect(0,0,width,height);
    for(const zone of map.fieldZones) {
      const corners=zone.poly.map(Screen);
      if(corners.every(point=>point[0]<0)||corners.every(point=>point[0]>width)||corners.every(point=>point[1]<0)||corners.every(point=>point[1]>height)) continue;
      context.save();context.beginPath();
      corners.forEach((point,index)=>index?context.lineTo(...point):context.moveTo(...point));
      context.closePath();context.clip();
      for(const field of map.fields.filter((item)=>item.zone===zone.id)) {
        const center=Screen([field.x,field.z]);
        const reach=Math.hypot(Math.max(...field.strips.map(strip=>Math.max(Math.abs(strip.from),Math.abs(strip.to)))),field.d/2)*scale;
        if(center[0]+reach<0||center[0]-reach>width||center[1]+reach<0||center[1]-reach>height) continue;
        context.save();context.translate(...center);context.rotate(-field.angleDeg*Math.PI/180);
        context.globalAlpha=0.48;
        for(const strip of field.strips) {
          context.fillStyle=FLOW_FIELD_COLORS[strip.kind];
          context.fillRect(strip.from*scale,-field.d*scale/2,(strip.to-strip.from)*scale,field.d*scale);
          context.strokeStyle="#91876d44";context.lineWidth=0.6;
          context.strokeRect(strip.from*scale,-field.d*scale/2,(strip.to-strip.from)*scale,field.d*scale);
        }
        context.restore();
      }
      context.restore();
    }
    for (const paint of map.paint) {
      const points = (paint.poly || paint.line).map(point => Screen([point.x,point.z]));
      if (points.every(point => point[1] < 0) || points.every(point => point[1] > height)) continue;
      context.globalAlpha = (paint.strength ?? 1) * 0.65;
      if (paint.poly) Polygon(context, points, paint.color);
      else SmoothLine(context, points, paint.color, paint.halfW * 2 * scale);
      context.globalAlpha = 1;
    }
    this.DrawTerrain(context,width,height);
    for(const path of map.footpaths) {
      const pts = SplinePoints(path, 2.5).map(Screen);
      SmoothLine(context, pts, "#9c8a6845", Math.max(1.1, scale * 0.85));
      Line(context, pts, "#7e6b4a77", Math.max(0.75, scale * 0.28), [4, 4]);
    }
    // Paint the whole bank network first, then the whole walking surface along true Catmull-Rom splines.
    // Drawing each complete segment in turn used to seal T-junctions again.
    for(const road of map.roads) {
      const pts = SplinePoints(road.points, 2.5).map(Screen);
      const borderCol = road.kind === "guandao" ? "#a6957188" : "#b3a38070";
      SmoothLine(context, pts, borderCol, (road.width + (road.kind === "guandao" ? 0.9 : 0.55)) * scale);
    }
    for(const trench of map.trenches) SmoothLine(context,trench.points.map(Screen),"#a58d6870",(trench.width+1.5)*scale);
    for(const floor of map.floors) Polygon(context,floor.points.map(Screen),"#efe3c9","#b8a68166");
    for(const road of map.roads) {
      const pts = SplinePoints(road.points, 2.5).map(Screen);
      const fillCol = road.kind === "guandao" ? "#dfd3b6"
        : road.kind === "villageAlley" ? "#d0c3a5"
          : "#e6dbc0";
      SmoothLine(context, pts, fillCol, road.width * scale);
      if (road.kind === "guandao" && scale > 1.2) {
        // Subtle cart-wheel rut center track for 2D hierarchy clarity
        SmoothLine(context, pts, "#9b896938", road.width * 0.52 * scale);
        SmoothLine(context, pts, "#dcd0b2", road.width * 0.22 * scale);
      }
    }
    for(const trench of map.trenches) SmoothLine(context,trench.points.map(Screen),"#c9b18b",(trench.width+0.35)*scale);
    for(const trench of map.trenches) SmoothLine(context,trench.points.map(Screen),"#ead9b7",Math.max(1,(trench.width-0.3)*scale));
    SmoothLine(context,map.river.map(Screen),"#9bb5ba66",10*scale);
    SmoothLine(context,map.river.map(Screen),"#a6c5cf",6*scale);
    for (const railSpec of map.railways || []) {
      if (!Array.isArray(railSpec.points) || railSpec.points.length < 2) continue;
      let path;
      try { path = MakeRoadPath(railSpec.points); } catch { continue; }
      const gauge = railSpec.gauge ?? 1.50;
      const bedHalf = railSpec.bed?.topHalf ?? 1.9;
      const bedGaps = ResolveRailwayGaps(path, railSpec.bed?.gaps, railSpec.bed?.zGaps ?? railSpec.zGaps);
      const sleeperGaps = ResolveRailwayGaps(path, railSpec.sleeperGaps, railSpec.sleeperZGaps ?? railSpec.zGaps);
      const railGaps = ResolveRailwayGaps(path, railSpec.railGaps, railSpec.railZGaps ?? railSpec.zGaps);
      // 1) 道砟床底带
      for (const [a, b] of GapsToRuns(path.length, bedGaps)) {
        const pts = SampleRun(path, a, b, 6).map((sm) => Screen([sm.x, sm.z]));
        SmoothLine(context, pts, "#7d756888", (bedHalf * 2 + 1.4) * scale);
        SmoothLine(context, pts, "#605a52cc", (bedHalf * 2) * scale);
      }
      // 2) 枕木横线（按缩放自适应步距避免缩远成一团黑）
      const tieLen = (railSpec.sleeper?.length ?? 2.54) * 0.5;
      const baseSpacing = railSpec.sleeper?.spacing ?? 0.68;
      const step = Math.max(baseSpacing, 3.2 / Math.max(0.2, scale));
      context.strokeStyle = "#4d3a29";
      context.lineWidth = Math.max(0.9, Math.min(2.6, 0.24 * scale));
      context.beginPath();
      for (const [a, b] of GapsToRuns(path.length, sleeperGaps)) {
        for (let s = a; s <= b; s += step) {
          const p = path.At(s);
          const nx = p.tz, nz = -p.tx;
          const p0 = Screen([p.x - nx * tieLen, p.z - nz * tieLen]);
          const p1 = Screen([p.x + nx * tieLen, p.z + nz * tieLen]);
          if (Math.max(p0[0], p1[0]) < -8 || Math.min(p0[0], p1[0]) > width + 8
            || Math.max(p0[1], p1[1]) < -8 || Math.min(p0[1], p1[1]) > height + 8) continue;
          context.moveTo(p0[0], p0[1]);
          context.lineTo(p1[0], p1[1]);
        }
      }
      context.stroke();
      // 3) 双钢轨（暗钢轮廓 + 轨面高光）
      for (const [a, b] of GapsToRuns(path.length, railGaps)) {
        const samples = SampleRun(path, a, b, 6);
        for (const side of [-1, 1]) {
          const off = side * gauge * 0.5;
          const pts = samples.map((sm) => Screen([sm.x + sm.tz * off, sm.z - sm.tx * off]));
          Line(context, pts, "#2c2f32", Math.max(1.2, 0.16 * scale));
          Line(context, pts, "#b4bcc2", Math.max(0.6, 0.07 * scale));
        }
      }
    }
    const signals=EncounterSignals(frame);
    for(const object of map.objects) {
      if(!VisibleEncounterObject(object,signals)||/Lintel/.test(object.id)) continue;
      if(object.meta?.waterRibbon) {
        if(/^Pond_/.test(object.id)) {
          const rows = object.meta.waterRibbon;
          const outline = [
            ...rows.map(([rx, north]) => Screen([rx, north])),
            ...[...rows].reverse().map(([rx, , south]) => Screen([rx, south])),
          ];
          Polygon(context, outline, "#8cb5c2b8", "#5d7d8280");
        }
        continue;
      }
      const [x,,z]=object.pos,[w,h,d]=object.size||[1,1,1],point=Screen([x,z]);
      const radius=Math.max(w,d)*scale;
      if(point[0]+radius<0||point[1]+radius<0||point[0]-radius>width||point[1]-radius>height) continue;
      if(object.material==="Whitebox/Foliage") {
        const crown = h >= FLOW_RENDERING.tree.minHeightM ? Math.min(FLOW_RENDERING.tree.crownMaxM,h*FLOW_RENDERING.tree.crownWidthRatio) : 0;
        Circle(context,point,Math.max(1.1,Math.max(Math.min(w,d),crown)*scale*0.5),"#7d986252","#74875144");continue;
      }
      if (object.meta?.obstacle === "barbedWire") {
        context.save();context.translate(...point);context.rotate(-(object.yawDeg||0)*Math.PI/180);
        const half = w*scale/2, reach = Math.max(2,d*scale/2);
        Line(context,[[-half,-reach],[half,-reach]],"#5c6354",1);
        Line(context,[[-half,reach],[half,reach]],"#5c6354",1);
        for (let offset=-half;offset<half;offset+=Math.max(5,scale*1.3)) {
          Line(context,[[offset-2,-reach],[offset+2,reach]],"#535c4c",1);
          Line(context,[[offset-2,reach],[offset+2,-reach]],"#535c4c",1);
        }
        context.restore();continue;
      }
      if(scale<4&&Math.max(w,d)<1.5) continue;
      context.save();context.translate(...point);context.rotate(-(object.yawDeg||0)*Math.PI/180);
      const overhead=object.material==="Whitebox/Roof"||/Roof|Lintel|Bridge/.test(object.id);
      context.globalAlpha=overhead?0.18:object.material==="Whitebox/Step"?0.55:1;
      context.fillStyle=FLOW_MATERIAL_COLORS[object.material]||"#c1b59c";
      context.fillRect(-w*scale/2,-d*scale/2,Math.max(0.7,w*scale),Math.max(0.7,d*scale));
      context.strokeStyle=object.material==="Whitebox/Roof"?"#706c5d":"#8b80666f";
      context.lineWidth=object.material==="Whitebox/Plaster"&&h>1?1.1:0.7;
      context.strokeRect(-w*scale/2,-d*scale/2,Math.max(0.7,w*scale),Math.max(0.7,d*scale));
      const cover = IsEncounterCover(object);
      if (cover) {
        const left = -w * scale / 2, top = -d * scale / 2;
        const boxWidth = Math.max(2, w * scale), boxDepth = Math.max(2, d * scale);
        context.globalAlpha = 1;
        context.fillStyle = FLOW_COVER_COLORS.top;
        context.fillRect(left, top, boxWidth, boxDepth);
        context.save();
        context.beginPath();
        context.rect(left, top, boxWidth, boxDepth);
        context.clip();
        for (let offset = -boxDepth; offset < boxWidth; offset += 8) {
          Line(context, [[left + offset, top + boxDepth], [left + offset + boxDepth, top]], FLOW_COVER_COLORS.mark, 1.5);
        }
        context.restore();
        context.strokeStyle = FLOW_COVER_COLORS.edge;
        context.lineWidth = 1.6;
        context.strokeRect(left, top, boxWidth, boxDepth);
      }
      context.restore();
      if (cover && radius >= 8) DrawCoverSymbol(context, point);
    }
    if(scale>1.2) for(const marker of map.markers) {
      const point=Screen(marker.p);
      Line(context,[[point[0]-3,point[1]],[point[0]+3,point[1]]],marker.kind==="window"?"#487e9e":"#9b6329",2);
    }
    if(layers.airWalls!==false&&map.airWalls?.length) {
      this.DrawAirWalls2D(context,width,height,signals);
    }
  }

  DrawAirWalls2D(context,width,height,signals) {
    const map=this.mapData,scale=this.scale;
    const Screen=(point)=>[(point[0]-this.center[0])*scale+width/2,(point[1]-this.center[1])*scale+height/2];
    for(const wall of map.airWalls||[]) {
      if(!VisibleEncounterObject(wall,signals)) continue;
      const [x,,z]=wall.pos,[w,,d]=wall.size||[1,6,0.4],point=Screen([x,z]);
      const radius=Math.max(w,d)*scale+6;
      if(point[0]+radius<0||point[1]+radius<0||point[0]-radius>width||point[1]-radius>height) continue;
      const dynamic=!!(wall.hideOn||wall.showOn);
      const boxW=Math.max(3.2,w*scale),boxD=Math.max(3.2,d*scale);
      const left=-boxW/2,top=-boxD/2;
      context.save();
      context.translate(point[0],point[1]);
      context.rotate(-(wall.yawDeg||0)*Math.PI/180);
      context.fillStyle=dynamic?FLOW_AIRWALL_COLORS.gateFill2d:FLOW_AIRWALL_COLORS.fill2d;
      context.fillRect(left,top,boxW,boxD);
      if(Math.max(boxW,boxD)>=10) {
        context.save();
        context.beginPath();context.rect(left,top,boxW,boxD);context.clip();
        const span=Math.max(boxW,boxD),step=Math.max(5,Math.min(10,scale*1.5));
        context.strokeStyle=dynamic?FLOW_AIRWALL_COLORS.gateStripe2d:FLOW_AIRWALL_COLORS.stripe2d;
        context.lineWidth=1.1;
        context.beginPath();
        for(let o=-span;o<span;o+=step) {
          context.moveTo(left+o,top+boxD);context.lineTo(left+o+boxD,top);
        }
        context.stroke();
        context.restore();
      }
      context.strokeStyle=dynamic?FLOW_AIRWALL_COLORS.gateStroke2d:FLOW_AIRWALL_COLORS.stroke2d;
      context.lineWidth=dynamic?1.8:1.4;
      if(dynamic) context.setLineDash([5,3]);
      context.strokeRect(left,top,boxW,boxD);
      context.setLineDash([]);
      context.restore();
    }
  }

  DrawScreenMarks(context,width,height,layers) {
    if(this.scale>1.4) for(const road of this.mapData.roads) for(const cap of road.caps||[]) {
      const point=this.ToScreen(cap==="from"?road.points[0]:road.points.at(-1));
      if(point[0]<10||point[0]>width-35||point[1]<20||point[1]>height-20) continue;
      Line(context,[[point[0]-4,point[1]-4],[point[0]+4,point[1]+4]],"#a7503f",1.5);
      Line(context,[[point[0]-4,point[1]+4],[point[0]+4,point[1]-4]],"#a7503f",1.5);
      if(LandmarkMode(layers)==="all") Label(context,"死巷",point[0]+7,point[1]-9,"#94513c",10,true);
    }
    const landmarkMode=LandmarkMode(layers);
    if(landmarkMode!=="none") this.DrawLandmarks(context,width,height,landmarkMode);
  }

  DrawLandmarks(context,width,height,mode="all") {
    const occupied=[];
    const Priority=landmark=>landmark.detail?0:landmark.kind==="area"?6:landmark.kind==="hole"?5:landmark.kind==="pit"?4:2;
    const source=mode==="important"?(this.mapData.labels||[]).filter(IsMainlineLandmark):(this.mapData.labels||[]);
    const labels=[...source].sort((a,b)=>Priority(b)-Priority(a));
    const displayed=[];this.visibleLandmarks=displayed;
    for(const landmark of labels) {
      if(this.eye) {
        const range=Math.hypot(landmark.p[0]-this.eye[0],landmark.p[1]-this.eye[2]);
        const height=Math.max(0,this.eye[1]-this.Ground([this.eye[0],this.eye[2]]));
        if(range>(landmark.detail?32:Math.max(85,height*4)))continue;
      }
      const anchor=this.LandmarkAnchor?.(landmark);
      if(anchor&&(anchor.depth<this.near||anchor.depth>this.far))continue;
      const point=anchor?[anchor.x,anchor.y]:this.ToScreen(landmark.p);
      if(point[0]<12||point[0]>width-45||point[1]<24||point[1]>height-24) continue;
      const [x,z]=landmark.p;
      const groundPoint=this.ToScreen(landmark.p);
      const labelScale=this.type?Math.max(Distance(groundPoint,this.ToScreen([x+1,z])),Distance(groundPoint,this.ToScreen([x,z+1]))):this.scale;
      if(landmark.detail&&labelScale<9)continue;
      if(landmark.kind==="pit"&&landmark.w<5&&labelScale<4)continue;
      if(labelScale<0.8&&landmark.kind!=="area"&&!['防炮洞','干沟集结处','耿家庄','村南口'].includes(landmark.name)&&!landmark.name.startsWith("旧")) continue;
      const overlay=context?.DepthOverlay;
      const hidden=!overlay&&anchor&&this.raster.Occluded(anchor);
      if(hidden&&(this.type==="eye"||landmark.detail))continue;
      const labelWidth=landmark.name.length*12;
      let position,box;
      for(const offset of [-15,7,-37,29]) {
        const candidate=[Clamp(point[0]+8,8,width-labelWidth-8),point[1]+offset],rect=[candidate[0],candidate[1]-9,labelWidth+8,18];
        if(rect[1]<8||rect[1]+18>height-8||occupied.some(other=>rect[0]<other[0]+other[2]&&rect[0]+rect[2]>other[0]&&rect[1]<other[1]+other[3]&&rect[1]+rect[3]>other[1]))continue;
        position=candidate;box=rect;break;
      }
      if(!position)continue;
      occupied.push(box);
      if(!context||this.raster?.collectingDepth)continue;
      displayed.push({id:landmark.id,name:landmark.name,hidden:!!hidden});
      if(overlay) this.landmarkAnchors.push({anchor,hide:this.type==="eye"||landmark.detail});
      context.save();context.globalAlpha=hidden?.35:1;
      const color=['pit','hole'].includes(landmark.kind)?"#285d68":"#62543d";
      if(overlay) {
        overlay.anchor=[anchor.x,anchor.y,anchor.depth,this.type==="eye"||landmark.detail?0:.35];
        overlay.Disk(anchor,3,color,1,overlay.anchor);
        overlay.Line(anchor,{x:position[0]-4,y:position[1],depth:anchor.depth},color,.8,1,overlay.anchor);
      } else {Circle(context,point,3,color);Line(context,[point,[position[0]-4,position[1]]],color,.8);}
      Label(context,landmark.name,...position,color,12,true);context.restore();
      if(overlay) overlay.anchor=undefined;
    }
  }

  DrawSmokeColumns(context, frame) {
    const columns = this.mapData.smokeColumns;
    if (!columns?.length) return;
    for (const col of columns) {
      const p = this.ToScreen([col.x, col.z]);
      const radius = Clamp((col.options?.sizeEnd || 6) * 0.42 * this.scale, 5, 22);
      const fire = (col.options?.fire || 0) > 0;
      Circle(context, p, radius, "#3a352f44", "#2e292366");
      if (fire) Circle(context, p, Math.max(2.5, radius * 0.34), "#d97a32bb", "#f5be5b");
    }
  }
  DrawActor(context,actor,frame) {
    const p=this.ToScreen(actor.p),color=FLOW_COLORS[actor.side];
    if(actor.tetherTo) Line(context,[p,this.ToScreen(actor.tetherTo)],"#75613e",1.5);
    if(actor.id==="liu" && frame.stealth?.pulling) this.DrawPath(context,[actor.p,frame.player],"#75613e",2.5);
    if (actor.pose !== "dead" && actor.kind === "person" && !actor.firing
      && Number.isFinite(actor.gazeYaw) && Math.abs(actor.gazeYaw) > 0.14 && this.scale >= 4.5) {
      const baseHeading = Number.isFinite(actor.marchHeading) ? actor.marchHeading : (Number.isFinite(actor.heading) ? actor.heading : 0);
      const lookHeading = baseHeading - actor.gazeYaw;
      const screenAngle = lookHeading - Math.PI / 2;
      const coneLen = Clamp(this.scale * 1.45, 11, 23);
      const halfSpread = 0.26;
      const kind = actor.gazeKind || "scan";
      const fillStyle = kind === "poi" ? "rgba(230, 179, 76, 0.28)"
        : (kind === "leaderCheck" || kind === "social") ? "rgba(91, 192, 217, 0.25)"
        : "rgba(118, 184, 118, 0.23)";
      const strokeStyle = kind === "poi" ? "rgba(208, 146, 36, 0.56)"
        : (kind === "leaderCheck" || kind === "social") ? "rgba(64, 160, 188, 0.52)"
        : "rgba(84, 146, 84, 0.48)";
      context.save();
      context.beginPath();
      context.moveTo(p[0], p[1]);
      context.arc(p[0], p[1], coneLen, screenAngle - halfSpread, screenAngle + halfSpread);
      context.closePath();
      context.fillStyle = fillStyle;
      context.fill();
      context.beginPath();
      context.moveTo(p[0], p[1]);
      context.lineTo(p[0] + Math.cos(screenAngle) * coneLen * 0.92, p[1] + Math.sin(screenAngle) * coneLen * 0.92);
      context.strokeStyle = strokeStyle;
      context.lineWidth = 1.1;
      context.stroke();
      context.restore();
    }
    if(actor.pose==="dead") {Line(context,[[p[0]-3,p[1]-3],[p[0]+3,p[1]+3]],color+"66",1.3);Line(context,[[p[0]-3,p[1]+3],[p[0]+3,p[1]-3]],color+"66",1.3);}
    else if(actor.kind==="tank"||actor.kind==="cart") {
      context.save();context.translate(...p);context.rotate(actor.heading||0);context.fillStyle=actor.pose==="burn"?"#74432c":"#6c7258";context.strokeStyle=color;context.lineWidth=1.4;
      const size=Clamp(this.scale,4,9);context.fillRect(-size,-size*1.5,size*2,size*3);context.strokeRect(-size,-size*1.5,size*2,size*3);
      if(actor.kind==="tank") {context.rotate((actor.turret||0)-(actor.heading||0));Circle(context,[0,0],size*0.55,"#87856a",color);Line(context,[[0,0],[0,-size*1.8]],color,2);}
      else {Circle(context,[-size-2,0],2.5,color);Circle(context,[size+2,0],2.5,color);}
      context.restore();
    } else if(actor.kind==="quilt"||actor.kind==="donkey") {
      context.save();context.translate(...p);context.rotate(actor.heading||0);
      context.fillStyle=color;context.strokeStyle="#f1e9ca";context.fillRect(-3,-6,6,12);context.strokeRect(-3,-6,6,12);
      if(actor.kind==="donkey") Line(context,[[0,-5],[0,-9]],color,3);
      context.restore();
    } else if(actor.heavy) {
      Circle(context,p,4.5,color,"#111c17");Line(context,[[p[0]-6,p[1]+4],[p[0]+6,p[1]+4]],color,2);Line(context,[[p[0],p[1]],[p[0],p[1]-11]],color,3);
    } else Circle(context,p,actor.side==="player"?6:actor.side==="enemy"?4:4.5,color,"#111c17");
    if (actor.carryingAmmo) {
      context.fillStyle="#94774f";context.strokeStyle="#493d2b";
      context.fillRect(p[0]-4,p[1]+3,8,5);context.strokeRect(p[0]-4,p[1]+3,8,5);
    }
    if (actor.evadingArtillery) {
      context.save();
      context.beginPath();
      context.arc(p[0], p[1], 8.5, 0, Math.PI * 2);
      context.strokeStyle = "#e24734cc";
      context.lineWidth = 1.6;
      context.setLineDash([3, 2]);
      context.stroke();
      context.restore();
    }
  }

  DrawArtillery2D(context, effect, width, height) {
    const center = this.ToScreen(effect.p);
    const outerR = Math.max(9, (effect.radius || 6) * this.scale);
    if (center[0] + outerR + 120 < 0 || center[0] - outerR - 120 > width
      || center[1] + outerR + 120 < 0 || center[1] - outerR - 120 > height) {
      return;
    }
    const dodge = effect.role === "dodge";
    if (effect.kind === "artilleryCrater") {
      const craterR = Math.max(4, outerR * 0.38);
      context.save();
      context.globalAlpha = Clamp(effect.alpha ?? 0.4, 0, 1) * 0.65;
      const g = context.createRadialGradient(center[0], center[1], 0, center[0], center[1], craterR);
      g.addColorStop(0, "rgba(38, 30, 22, 0.85)");
      g.addColorStop(0.65, "rgba(62, 50, 36, 0.45)");
      g.addColorStop(1, "rgba(62, 50, 36, 0)");
      context.fillStyle = g;
      context.beginPath();
      context.arc(center[0], center[1], craterR, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(48, 38, 28, 0.5)";
      context.lineWidth = 1;
      context.setLineDash([3, 3]);
      context.stroke();
      context.restore();
      return;
    }
    if (effect.kind === "artilleryBlast") {
      const t = Clamp(effect.age / Math.max(0.1, effect.duration || 1.6), 0, 1);
      const shockR = outerR * (0.45 + 0.85 * Math.pow(t, 0.65));
      const flashAlpha = Clamp(1 - effect.age / 0.48, 0, 1);
      const smokeAlpha = Clamp(1 - t, 0, 1) * 0.72;
      context.save();
      const dustGrad = context.createRadialGradient(center[0], center[1], 0, center[0], center[1], outerR * (0.55 + t * 0.55));
      dustGrad.addColorStop(0, `rgba(74, 58, 42, ${(smokeAlpha * 0.85).toFixed(3)})`);
      dustGrad.addColorStop(0.55, `rgba(116, 86, 54, ${(smokeAlpha * 0.48).toFixed(3)})`);
      dustGrad.addColorStop(1, "rgba(116, 86, 54, 0)");
      context.fillStyle = dustGrad;
      context.beginPath();
      context.arc(center[0], center[1], outerR * (0.55 + t * 0.55), 0, Math.PI * 2);
      context.fill();
      if (flashAlpha > 0.02) {
        const coreR = Math.max(5, outerR * (0.42 + (1 - flashAlpha) * 0.25));
        const fireGrad = context.createRadialGradient(center[0], center[1], 0, center[0], center[1], coreR);
        fireGrad.addColorStop(0, `rgba(255, 246, 200, ${(flashAlpha * 0.96).toFixed(3)})`);
        fireGrad.addColorStop(0.45, `rgba(244, 128, 42, ${(flashAlpha * 0.82).toFixed(3)})`);
        fireGrad.addColorStop(1, "rgba(205, 56, 26, 0)");
        context.fillStyle = fireGrad;
        context.beginPath();
        context.arc(center[0], center[1], coreR, 0, Math.PI * 2);
        context.fill();
      }
      context.beginPath();
      context.arc(center[0], center[1], shockR, 0, Math.PI * 2);
      context.strokeStyle = dodge ? `rgba(232, 74, 52, ${((1 - t) * 0.92).toFixed(3)})` : `rgba(232, 152, 54, ${((1 - t) * 0.88).toFixed(3)})`;
      context.lineWidth = 2.2;
      context.stroke();
      context.restore();
      return;
    }
    if (effect.kind !== "artilleryWarn") return;

    const strokeCol = dodge ? "#cf2e22" : "#c67717";
    const fillCol = dodge ? "rgba(218, 48, 34, 0.16)" : "rgba(212, 128, 28, 0.13)";
    const ringCol = dodge ? "#ff5b42" : "#f2a63a";
    const progress = Clamp(effect.progress ?? 0, 0, 1);

    // 1. Northern incoming trajectory & descending shell head
    if (effect.from) {
      const tailWorld = [Lerp(effect.from[0], effect.p[0], 0.55), Lerp(effect.from[1], effect.p[1], 0.55)];
      const tail = this.ToScreen(tailWorld);
      Line(context, [tail, center], dodge ? "#cf2e2299" : "#c6771790", 1.8, [6, 4]);
      const midArrow = [Lerp(tail[0], center[0], 0.55), Lerp(tail[1], center[1], 0.55)];
      const prevArrow = [Lerp(tail[0], center[0], 0.42), Lerp(tail[1], center[1], 0.42)];
      Arrow(context, prevArrow, midArrow, strokeCol, 1.8);
      const shellPt = [Lerp(tail[0], center[0], progress), Lerp(tail[1], center[1], progress)];
      const streakStart = [Lerp(tail[0], center[0], Math.max(0, progress - 0.18)), Lerp(tail[1], center[1], Math.max(0, progress - 0.18))];
      Line(context, [streakStart, shellPt], ringCol, 3);
      Circle(context, shellPt, 4.2, "#fff2c6", strokeCol);
    }

    // 2. Danger zone outer boundary & shrinking impact reticle
    context.save();
    context.beginPath();
    context.arc(center[0], center[1], outerR, 0, Math.PI * 2);
    context.fillStyle = fillCol;
    context.fill();
    context.strokeStyle = strokeCol;
    context.lineWidth = dodge ? 2.1 : 1.6;
    context.setLineDash(dodge ? [7, 4] : [5, 5]);
    context.stroke();
    context.setLineDash([]);

    const innerR = Math.max(3, outerR * (1 - progress));
    context.beginPath();
    context.arc(center[0], center[1], innerR, 0, Math.PI * 2);
    context.strokeStyle = ringCol;
    context.lineWidth = dodge ? 2.4 : 1.8;
    context.stroke();

    // Center crosshair
    const ch = Math.min(7, outerR * 0.35);
    Line(context, [[center[0] - ch, center[1]], [center[0] + ch, center[1]]], strokeCol, 1.5);
    Line(context, [[center[0], center[1] - ch], [center[0], center[1] + ch]], strokeCol, 1.5);
    Circle(context, center, 2.5, ringCol, "#1c120d");
    context.restore();

    // 3. Crisp callout badge & hover tooltip hit target
    const rem = (effect.remainingS ?? 0).toFixed(1);
    const caption = dodge
      ? `⚠ ${effect.label} · 躲避 ${rem}s`
      : `北来炮弹 ${rem}s · ${effect.label}`;
    const lx = Clamp(center[0] + outerR + 6, 8, Math.max(8, width - caption.length * 11 - 14));
    const ly = Clamp(center[1] - 4, 14, height - 14);
    Label(context, caption, lx, ly, dodge ? "#9e1c14" : "#8b4f0b", 11.5, true);

    const tipParts = [
      `${effect.label}（${effect.caliber || "75mm"} · ${dodge ? "需躲避" : "远程压制"}）`,
      `预计落地 ${rem}s · 杀伤半径 ${effect.radius}m`,
      effect.dodgeHint ? `建议：${effect.dodgeHint}` : null,
      effect.note || null,
    ].filter(Boolean);
    this.hits.push({
      type: "artillery",
      id: effect.id,
      screen: center,
      radius: Math.max(14, outerR),
      text: tipParts.join(" · "),
    });
  }

  DrawScale(context,width,height) {
    const metres=this.scale<2?50:10;
    Line(context,[[18,height-30],[18+metres*this.scale,height-30]],"#655e4b",2);
    Label(context,`${metres} m`,18,height-43,"#655e4b",10);
  }

  DrawCompass(context,width,height) {
    const direction=this.NorthDirection?.()||[0,-1],length=Math.hypot(...direction)||1;
    const center=[width-28,height-31],tip=[center[0]+direction[0]/length*13,center[1]+direction[1]/length*13];
    Arrow(context,center,tip,"#655e4b",1);Label(context,"N",center[0]-4,center[1]+17,"#655e4b",10);
  }

  DrawArea(context,area,color,label,selection,hit) {
    const p=this.ToScreen(area.center),w=area.size[0]*this.scale,h=area.size[1]*this.scale;
    context.setLineDash(selection?[]:[5,4]);context.lineWidth=selection?2:1.2;context.strokeStyle=color;context.fillStyle=color+"12";
    context.beginPath();if(area.shape==="circle") context.arc(...p,w/2,0,Math.PI*2);else context.rect(p[0]-w/2,p[1]-h/2,w,h);
    context.fill();context.stroke();context.setLineDash([]);
    this.hits.push({...hit,screen:p,radius:Math.max(10,Math.min(w,h)/2),area});
    if(label) Label(context,label,p[0]+Math.max(w/2,7)+5,p[1]-h/2-5,color,11,true);

  }

  SpeechAnchor(actor) {
    const point = this.ToScreen(actor.p);
    return [point[0], point[1] - 10];
  }

  Draw(frame,layers,selection,annotations=[],draft=null,viewport=null,trace=null) {
    const cpu=trace?.cpu;
    cpu?.Begin("画布准备");
    const rect=viewport||this.canvas.getBoundingClientRect();
    this.BeforeDraw?.(frame,rect);
    const ratio=Math.min(2,window.devicePixelRatio||1),width=rect.width,height=rect.height;
    const pixelWidth=Math.max(1,Math.round(width*ratio)),pixelHeight=Math.max(1,Math.round(height*ratio));
    if(this.canvas.width!==pixelWidth||this.canvas.height!==pixelHeight) {this.canvas.width=pixelWidth;this.canvas.height=pixelHeight;}
    const context=this.canvas.getContext("2d");context.setTransform(ratio,0,0,ratio,0,0);
    context.lineClip=[-LINE_CLIP_PAD,-LINE_CLIP_PAD,width+LINE_CLIP_PAD,height+LINE_CLIP_PAD];
    const planar=!this.raster;
    const nightStep=Math.round((frame.nightBlend||0)*FLOW_DUSK.steps);
    const showAirWalls=layers.airWalls!==false;
    const key=planar
      ?JSON.stringify([pixelWidth,pixelHeight,frame.beat.id,this.cameraKey,frame.signals,nightStep,showAirWalls])
      :JSON.stringify([pixelWidth,pixelHeight,this.center,this.scale,frame.beat.id,this.cameraKey,LandmarkMode(layers),frame.signals,nightStep,showAirWalls]);
    cpu?.End();
    let source=null;
    if(planar&&!trace?.redrawBase&&key===this.baseKey) source=this.BaseSource(width,height,ratio);
    if(!source&&(trace?.redrawBase||key!==this.baseKey||planar)) {
      cpu?.Begin(planar?"2D 底图":"3D 底图");
      const started=trace?.capturing?performance.now():0;
      const marginX=planar?Math.round(width*BASE_OVERSCAN):0,marginY=planar?Math.round(height*BASE_OVERSCAN):0;
      const baseWidth=width+marginX*2,baseHeight=height+marginY*2;
      const basePixelWidth=planar?Math.max(1,Math.round(baseWidth*ratio)):pixelWidth,basePixelHeight=planar?Math.max(1,Math.round(baseHeight*ratio)):pixelHeight;
      if(this.baseCanvas.width!==basePixelWidth||this.baseCanvas.height!==basePixelHeight) {this.baseCanvas.width=basePixelWidth;this.baseCanvas.height=basePixelHeight;}
      const background=this.baseCanvas.getContext("2d");background.setTransform(ratio,0,0,ratio,0,0);
      background.lineClip=[-LINE_CLIP_PAD,-LINE_CLIP_PAD,baseWidth+LINE_CLIP_PAD,baseHeight+LINE_CLIP_PAD];
      // Fractional CSS sizes leave a partially covered last pixel. Clear the
      // full backing surface without reallocating it, preventing edge trails.
      background.clearRect(0,0,basePixelWidth/ratio,basePixelHeight/ratio);
      this.DrawBase(background,baseWidth,baseHeight,frame,layers,trace);this.baseKey=key;
      if(planar) this.baseView={center:[...this.center],scale:this.scale,width:baseWidth,height:baseHeight,ratio};
      cpu?.End();
      if(trace?.capturing&&planar) trace.Canvas("绘制 2D 底图",this.baseCanvas,started);
      if(planar) source=this.BaseSource(width,height,ratio);
    }

    let started=trace?.capturing?performance.now():0;
    cpu?.Begin("合成底图");
    if(source) context.drawImage(this.baseCanvas,...source,0,0,width,height);
    else context.drawImage(this.baseCanvas,0,0,pixelWidth,pixelHeight,0,0,width,height);
    this.hits=[];
    if(planar) this.DrawScreenMarks(context,width,height,layers);
    cpu?.End();
    if(trace?.capturing) {trace.Canvas("合成视口底图",this.canvas,started);started=performance.now();}
    this.BeginOverlay?.(context);
    cpu?.Begin("路线与区域");
    const Screen=(point)=>this.ToScreen(point),relevant=(item)=>item.beat.slice(0,2)===frame.stage.id||item.endBeat.slice(0,2)===frame.stage.id;
    if(layers.airWalls!==false&&frame.missionArea?.polygons?.length) {
      for(const poly of frame.missionArea.polygons) {
        if(!poly.points?.length) continue;
        const closed=[...poly.points,poly.points[0]];
        this.DrawPath(context,closed,"#1c150955",3.4,[8,6]);
        this.DrawPath(context,closed,"#d88c1ecc",1.8,[8,6]);
      }
    }
    if(layers.routes) {
      this.DrawPath(context,frame.stage.beats.flatMap((beat)=>beat.p),"#9c731b9c",2,[6,5]);
      if(Number(frame.stage.id)>=3&&Number(frame.stage.id)<=6) this.DrawPath(context,FLOW_GROUND.road,"#ad453499",2,[7,5]);
      if(this.mapData.playCorridor?.length && Number(frame.stage.id)>=8) {
        this.DrawPath(context,this.mapData.playCorridor,"#496f8278",1.6,[9,6]);
      }
    }
    if(layers.triggers) for(const trigger of frame.triggers.filter(relevant)) {
      const selected=selection?.type==="trigger"&&selection.id===trigger.id;
      this.DrawArea(context,trigger.area,trigger.active?"#277b9a":"#54889b",selected?`${trigger.mode==="time"?"◷ ":""}${trigger.label}`:"",selected,{type:"trigger",id:trigger.id,text:`${trigger.label} · ${trigger.firedAt===null?"路线未经过":trigger.active?"已触发":"等待触发"}`});
    }
    for(const group of frame.groups.filter(relevant)) {
      const selected=selection?.type==="group"&&selection.id===group.id,color=group.side==="friend"?FLOW_COLORS.friend:FLOW_COLORS.enemy;
      if(layers.spawns) {
        this.DrawArea(context,group.area,color,selected?group.label:"",selected,{type:"group",id:group.id,text:`${group.label} · 已出 ${group.spawned}/${group.count} · 在场 ${group.live}`});
        const p=Screen(group.area.center);Polygon(context,[[p[0],p[1]-6],[p[0]-5,p[1]+4],[p[0]+5,p[1]+4]],"#fcf4e4",color);
      }
      if(layers.routes||selected) {
        for(let index=0;index<(group.memberPlans?.length||0);index++) {
          const path=GroupPath(group,index);this.DrawPath(context,path,color+"99",selected?2:1,[5,4]);
          if(path.length>1) this.DrawArrow(context,path.at(-2),path.at(-1),color+"bb",1);
        }
        const route=[group.area.center,...group.route.slice(1)];
        if(!group.memberPlans || group.memberPlans.length<Math.min(group.count,group.maxAlive) || selected) {
          this.DrawPath(context,route,color+"77",selected?2:1,[5,4]);
          if(route.length>1) this.DrawArrow(context,route.at(-2),route.at(-1),color+"99",1);
        }
      }
    }
    if(layers.fire) for(const effect of frame.effects.filter((item)=>item.kind==="fire")) {
      if(this.DrawFire) {this.DrawFire(context,effect,frame);continue;}
      const a=Screen(effect.a),b=Screen(effect.b),color=FLOW_COLORS[effect.side]||FLOW_COLORS.enemy;
      Line(context,[a,b],color+"45",effect.heavy?1.6:0.8,[4,7]);
      const tip=[Lerp(a[0],b[0],0.82),Lerp(a[1],b[1],0.82)];Arrow(context,[Lerp(a[0],b[0],0.72),Lerp(a[1],b[1],0.72)],tip,color+"ae",1);
      if(effect.phase<0.25) {Line(context,[[Lerp(a[0],b[0],effect.phase*3),Lerp(a[1],b[1],effect.phase*3)],b],color,1.5);Circle(context,a,2.5,"#edb445");}
    }
    const winter=frame.actors.find((actor)=>actor.id==="winter"),he=frame.actors.find((actor)=>actor.id==="he");
    if(frame.actors[0].pose==="drag") this.DrawPath(context,[frame.player,winter.p,he.p],"#776740",1.5);
    if(layers.routes) for(const ramp of this.mapData.ramps) {
      this.DrawArrow(context,ramp.points[0],ramp.points.at(-1),"#687a50",1.5);
    }
    cpu?.End();
    cpu?.Begin("人物与姓名");
    const labelBoxes=[];
    for(const actor of this.OrderActors?.(frame.actors)||frame.actors) {
      const p=this.ActorScreen?this.ActorScreen(actor):Screen(actor.p),color=FLOW_COLORS[actor.side],selected=selection?.type==="actor"&&(selection.ids||[selection.id]).includes(actor.id);
      if(this.ActorInView?!this.ActorInView(actor):p[0]<-20||p[0]>width+20||p[1]<-20||p[1]>height+20) continue;
      if(this.VisibleActor&&!this.VisibleActor(actor)) continue;
      const overlay=context.DepthOverlay,hovered=this.hoveredActorId===actor.id;
      const showName=layers.names&&actor.pose!=="dead"&&(!actor.groupId||selected||hovered);
      if(overlay&&(showName||hovered||selected||frame.dialogue?.some(line=>line.actorId===actor.id))) overlay.TrackActor(actor.id);
      this.DrawActor(context,actor,frame);
      if(overlay) {
        overlay.probeActor=-1;
        const v=this.LabelVertex(actor);
        overlay.anchor=[v.x,v.y,v.depth,this.type==="eye"&&!this.freeCamera?0:.22];
        overlay.actorSlot=overlay.actorSlots.get(actor.id);
      }
      context.save();context.globalAlpha=!overlay&&this.ActorLabelOpacity?this.ActorLabelOpacity(actor):1;
      const Highlight=(ctx,x,y)=>{
        if(hovered) {
          ctx.beginPath();
          for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
            ctx.moveTo(x+dx*8,y+dy*16);ctx.lineTo(x+dx*13,y+dy*16);ctx.lineTo(x+dx*13,y+dy*11);
          }
          ctx.lineWidth=4;ctx.strokeStyle="#fff9";ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle=color;ctx.stroke();
        }
        if(selected) Circle(ctx,[x,y],12,"#e7d49a12","#e8d19a");
      };
      if(hovered||selected) {
        if(overlay) overlay.Billboard(["unitHighlight",color,hovered,selected],p[0]-16,p[1]-19,32,38,
          ctx=>Highlight(ctx,16,19),overlay.anchor,overlay.actorSlot);
        else Highlight(context,...p);
      }
      const hit={type:"actor",id:actor.id,screen:p,radius:9};
      this.hits.push(hit);
      if(showName) {
        const text=actor.status?`${actor.name} · ${actor.status}`:actor.name,labelWidth=text.length*12+8;
        for(const offset of [[11,-10],[11,13],[-labelWidth-10,-10],[-labelWidth-10,13],[11,-28],[11,30]]) {
          const box=[p[0]+offset[0],p[1]+offset[1]-8,labelWidth,16];
          if(box[0]<3||box[0]+box[2]>width-3||box[1]<3||box[1]+16>height-3) continue;
          if(labelBoxes.some((other)=>box[0]<other[0]+other[2]&&box[0]+box[2]>other[0]&&box[1]<other[1]+other[3]&&box[1]+box[3]>other[1])) continue;
          labelBoxes.push(box);Label(context,text,box[0],box[1]+8,color,12,true);
          hit.labelBounds=[box[0]-4,box[1]-1,context.measureText(text).width+8,18];
          if(hovered) {
            context.lineWidth=1.5;context.strokeStyle=color;
            if(overlay) {
              const [x,y,w,h]=hit.labelBounds;
              overlay.Billboard(["nameFrame",color],x-1,y-1,w+2,h+2,ctx=>{
                ctx.lineWidth=1.5;ctx.strokeStyle=color;ctx.strokeRect(1,1,w,h);
              },overlay.anchor,overlay.actorSlot);
            } else context.strokeRect(...hit.labelBounds);
          }
          break;
        }
      }
      context.restore();
      if(overlay) {overlay.anchor=undefined;overlay.actorSlot=-1;}
    }
    this.EndOverlay?.(context);
    cpu?.End();
    cpu?.Begin("特效与标注");
    this.DrawSmokeColumns(context, frame);
    for(const effect of frame.effects) {
      if(effect.kind==="artilleryCrater"||effect.kind==="artilleryWarn"||effect.kind==="artilleryBlast") {
        if(this.DrawArtilleryEffect) this.DrawArtilleryEffect(context,effect,frame,width,height);
        else this.DrawArtillery2D(context,effect,width,height);
        continue;
      }
      if(effect.kind==="blast") Circle(context,Screen(effect.p),(1+effect.age*2)*this.scale,"#dfa56822","#e3ab63");
      if(effect.kind==="grenade") {const p=Screen([Lerp(effect.a[0],effect.b[0],effect.phase),Lerp(effect.a[1],effect.b[1],effect.phase)]);p[1]-=Math.sin(effect.phase*Math.PI)*16;this.DrawPath(context,[effect.a,effect.b],effect.side==="enemy"?"#a6443480":"#b7944b80",1,[3,5]);Circle(context,p,3.5,effect.side==="enemy"?"#a64434":"#f2da98");}
      if(effect.kind==="plane") {
        const p=this.EffectScreen?this.EffectScreen(effect):Screen(effect.p);
        if(p) {Line(context,[[p[0]-8,p[1]],[p[0]+8,p[1]]],"#d2d7c5",2);Line(context,[[p[0],p[1]-5],[p[0],p[1]+7]],"#d2d7c5",2);}
      }
      if(effect.kind==="column"||effect.kind==="runner") Circle(context,Screen(effect.p),3,"#f3957b");
    }
    this.BeginOverlay?.(context,true);
    const overlay=context.DepthOverlay;
    this.speechBubbles = DrawFlowDialogue(context,this,frame,width,height,overlay?.Speech.bind(overlay));
    for(const annotation of [...annotations,...(draft?[draft]:[])]) {
      if(Math.abs(annotation.time-frame.time)>0.06) continue;
      const a=Screen(annotation.a),b=Screen(annotation.b),color="#8d5d11";
      if(annotation.kind==="arrow") this.DrawArrow(context,annotation.a,annotation.b,color,2.5);
      if(annotation.kind==="rect") {
        const corners=[annotation.a,[annotation.b[0],annotation.a[1]],annotation.b,[annotation.a[0],annotation.b[1]],annotation.a];
        this.DrawPath(context,corners,color,2);
      }
      if(annotation.text&&(b[0]!==-100000||b[1]!==-100000)) AnnotationText(context,annotation.text,b,width,height);
      Circle(context,a,3,"#8d5d11");this.hits.push({type:"annotation",id:annotation.id,screen:a,radius:10,text:annotation.text||annotation.kind});
      if(selection?.type==="annotation"&&selection.id===annotation.id) for(const [handle,screen] of [["a",a],["b",b]]) {
        context.fillStyle="#8d5d11";context.fillRect(screen[0]-4,screen[1]-4,8,8);
        this.hits.push({type:"annotationHandle",id:annotation.id,handle,screen,radius:9});
      }
    }
    if(layers.hud) {
      const legendHeight=this.canvas.parentElement?.querySelector(".lfMapLegend")?.offsetHeight||0;
      this.DrawScale(context,width,height-legendHeight);
      this.DrawCompass(context,width,height);
    }
    cpu?.End();
    this.EndOverlay?.(context);
    if(trace?.capturing) trace.Canvas("场景叠层与视口输出",this.canvas,started);
  }
}
