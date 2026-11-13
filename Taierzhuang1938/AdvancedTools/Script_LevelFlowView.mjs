import { GroupPath } from "./Script_LevelFlowEncounter.mjs";
import { FLOW_GROUND } from "./Data_LevelFlow.mjs";
import { Clamp, Distance, Lerp } from "./Script_LevelFlowGeometry.mjs";

export const FLOW_COLORS = {player:"#ac7a16",friend:"#276d82",enemy:"#ac4031",civilian:"#72608e"};
const fieldColors={wheat:"#d5ddbc",plowed:"#dfd0b8",fallow:"#e1dcc9"};
export const FLOW_MATERIAL_COLORS={"Whitebox/Plaster":"#d8d0ba","Whitebox/Roof":"#aaa58f","Whitebox/Structure":"#beb9a5","Whitebox/Timber":"#aa8862","Whitebox/EarthDark":"#bba98b","Whitebox/Cover":"#c7b391","Whitebox/Step":"#baa482","Whitebox/Canvas":"#d0bd91","Whitebox/Metal":"#8b9186","Whitebox/Water":"#a8c5ce","Whitebox/Foliage":"#a5af85"};

export const FLOW_COVER_COLORS = {
  side: "#476d54",
  top: "#8daf8a",
  edge: "#244633",
  mark: "#fff4cf",
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
  const signals=new Set();
  if(frame.time>=40) signals.add("DugoutCollapsed");
  if(frame.beat.id>="04c") signals.add("L1TrunkLoaded");
  if(frame.beat.id>="05a") signals.add("CartDeparted");
  if(frame.beat.id>="06e") signals.add("L1TrunkTossed");
  if(frame.beat.id>="06i") signals.add("L1SunkenRoadBlocked");
  if(frame.beat.id>="09i") signals.add("SideGateOpen");
  if(frame.beat.id>="10a") {signals.add("MgSilenced");signals.add("EastGateBurst");}
  if(frame.beat.id>="10d") signals.add("NorthYardGatesBroken");
  if(frame.beat.id>="10g") signals.add("BarrageHit");
  if(frame.beat.id>="10i") signals.add("LaneWallCollapse");
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

export function Line(context,points,color,width=1,dash=[]) {
  if(!points.length) return;
  context.beginPath();context.moveTo(...points[0]);
  for(const point of points.slice(1)) context.lineTo(...point);
  context.strokeStyle=color;context.lineWidth=width;context.setLineDash(dash);context.stroke();context.setLineDash([]);
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
  context.font=`${size}px system-ui, Microsoft YaHei, sans-serif`;context.textAlign="left";context.textBaseline="middle";
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
    this.canvas=canvas;this.mapData=mapData;this.center=[52,76];this.scale=5;this.hits=[];
    this.baseCanvas=document.createElement("canvas");this.baseKey="";
  }

  Fit(bounds,padding=54) {
    const {width,height}=this.canvas.getBoundingClientRect();
    this.center=[(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2];
    this.scale=Clamp(Math.min((width-padding*2)/Math.max(10,bounds[1]-bounds[0]),(height-padding*2)/Math.max(10,bounds[3]-bounds[2])),0.15,32);
  }

  Follow(frame) {
    const points=[frame.player,...frame.actors.filter((actor)=>actor.pose!=="dead"&&Distance(actor.p,frame.player)<115).map((actor)=>actor.p)];
    for(const group of frame.groups) if(group.start!==null&&frame.time>=group.start-8&&frame.time<group.end&&Distance(group.area.center,frame.player)<130) points.push(group.area.center);
    const xs=points.map((point)=>point[0]),zs=points.map((point)=>point[1]);
    this.Fit([Math.min(...xs)-14,Math.max(...xs)+14,Math.min(...zs)-14,Math.max(...zs)+14],62);
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
    const previous=this.ToWorld(point);this.scale=Clamp(this.scale*factor,0.15,40);const current=this.ToWorld(point);
    this.center=this.center.map((value,index)=>value+previous[index]-current[index]);
  }
  Bounds() {
    const {width,height}=this.canvas.getBoundingClientRect(),a=this.ToWorld([0,0]),b=this.ToWorld([width,height]);
    return [a[0],b[0],a[1],b[1]];
  }

  DrawBase(context,width,height,frame) {
    const map=this.mapData,Screen=(point)=>this.ToScreen(point),scale=this.scale;
    context.fillStyle="#e7e2d2";context.fillRect(0,0,width,height);
    for(const paint of map.paint) {
      const points=paint.poly.map((point)=>Screen([point.x,point.z]));
      if(points.every((point)=>point[1]<0)||points.every((point)=>point[1]>height)) continue;
      context.globalAlpha=0.15;Polygon(context,points,"#aeb48c");context.globalAlpha=1;
    }
    for(const zone of map.fieldZones) {
      context.save();context.beginPath();
      zone.poly.map(Screen).forEach((point,index)=>index?context.lineTo(...point):context.moveTo(...point));
      context.closePath();context.clip();
      for(const field of map.fields.filter((item)=>item.zone===zone.id)) {
        const center=Screen([field.x,field.z]);
        context.save();context.translate(...center);context.rotate(field.angleDeg*Math.PI/180);
        context.globalAlpha=0.48;
        for(const strip of field.strips) {
          context.fillStyle=fieldColors[strip.kind];
          context.fillRect(strip.from*scale,-field.d*scale/2,(strip.to-strip.from)*scale,field.d*scale);
          context.strokeStyle="#91876d44";context.lineWidth=0.6;
          context.strokeRect(strip.from*scale,-field.d*scale/2,(strip.to-strip.from)*scale,field.d*scale);
        }
        context.restore();
      }
      context.restore();
    }
    if (map.terrain) {
      const step = Math.max(0.5, 2 / scale), bounds = this.Bounds();
      const minX = Math.max(map.terrain.bounds.minX, bounds[0]), maxX = Math.min(map.terrain.bounds.maxX, bounds[1]);
      const minZ = Math.max(map.terrain.bounds.minZ, bounds[2]), maxZ = Math.min(map.terrain.bounds.maxZ, bounds[3]);
      for (let z = minZ; z < maxZ; z += step) for (let x = minX; x < maxX; x += step) {
        const sample = map.terrain.preAt;
        const slope = (sample(x-step,z)-sample(x+step,z))*0.7 + (sample(x,z-step)-sample(x,z+step))*0.45;
        const opacity = Math.min(0.28, Math.abs(slope) / step * 0.45);
        if (opacity < 0.015) continue;
        const point = Screen([x,z]);
        context.fillStyle = slope > 0 ? `rgba(255,250,218,${opacity})` : `rgba(80,69,45,${opacity})`;
        context.fillRect(point[0],point[1],step*scale+0.5,step*scale+0.5);
      }
    }
    for(const path of map.footpaths) Line(context,path.map(Screen),"#a38e6455",Math.max(0.7,scale*0.35),[3,4]);
    // Paint the whole bank network first, then the whole walking surface.
    // Drawing each complete segment in turn used to seal T-junctions again.
    for(const road of map.roads) SmoothLine(context,road.points.map(Screen),"#bdad8880",(road.width+0.8)*scale);
    for(const trench of map.trenches) SmoothLine(context,trench.points.map(Screen),"#a58d6870",(trench.width+1.5)*scale);
    for(const floor of map.floors) Polygon(context,floor.points.map(Screen),"#efe3c9","#b8a68166");
    for(const road of map.roads) SmoothLine(context,road.points.map(Screen),"#f2ebd5",road.width*scale);
    for(const trench of map.trenches) SmoothLine(context,trench.points.map(Screen),"#c9b18b",(trench.width+0.35)*scale);
    for(const trench of map.trenches) SmoothLine(context,trench.points.map(Screen),"#ead9b7",Math.max(1,(trench.width-0.3)*scale));
    SmoothLine(context,map.river.map(Screen),"#9bb5ba66",10*scale);
    SmoothLine(context,map.river.map(Screen),"#a6c5cf",6*scale);
    const signals=EncounterSignals(frame);
    for(const object of map.objects) {
      if(!VisibleEncounterObject(object,signals)||/Lintel/.test(object.id)) continue;
      const [x,,z]=object.pos,[w,h,d]=object.size||[1,1,1],point=Screen([x,z]);
      const radius=Math.max(w,d)*scale;
      if(point[0]+radius<0||point[1]+radius<0||point[0]-radius>width||point[1]-radius>height) continue;
      if(object.material==="Whitebox/Foliage") {
        Circle(context,point,Math.max(1.1,Math.min(w,d)*scale*0.5),"#7d986252","#74875144");continue;
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
    if(scale>1.4) for(const road of map.roads) for(const cap of road.caps||[]) {
      const point=Screen(cap==="from"?road.points[0]:road.points.at(-1));
      if(point[0]<10||point[0]>width-35||point[1]<20||point[1]>height-20) continue;
      Line(context,[[point[0]-4,point[1]-4],[point[0]+4,point[1]+4]],"#a7503f",1.5);
      Line(context,[[point[0]-4,point[1]+4],[point[0]+4,point[1]-4]],"#a7503f",1.5);
      Label(context,"死巷",point[0]+7,point[1]-9,"#94513c",10,true);
    }
    const occupied=[];
    for(const landmark of map.labels) {
      const point=Screen(landmark.p);
      if(point[0]<12||point[0]>width-45||point[1]<24||point[1]>height-24) continue;
      if(scale<0.8&&!['防炮洞','干沟集结处','耿家庄','村南口'].includes(landmark.name)&&!landmark.name.startsWith("旧")) continue;
      const labelWidth=landmark.name.length*12;
      const position=[Clamp(point[0]+8,8,width-labelWidth-8),point[1]-15];
      const box=[position[0],position[1]-8,labelWidth,16];
      if(occupied.some((other)=>box[0]<other[0]+other[2]&&box[0]+box[2]>other[0]&&box[1]<other[1]+other[3]&&box[1]+box[3]>other[1])) continue;
      occupied.push(box);Label(context,landmark.name,...position,"#62543d",12,true);
    }
  }

  DrawActor(context,actor,frame) {
    const p=this.ToScreen(actor.p),color=FLOW_COLORS[actor.side];
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

  Draw(frame,layers,selection,annotations=[],draft=null) {
    this.BeforeDraw?.(frame);
    const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),width=rect.width,height=rect.height;
    const pixelWidth=Math.max(1,Math.round(width*ratio)),pixelHeight=Math.max(1,Math.round(height*ratio));
    if(this.canvas.width!==pixelWidth||this.canvas.height!==pixelHeight) {this.canvas.width=pixelWidth;this.canvas.height=pixelHeight;}
    const context=this.canvas.getContext("2d");context.setTransform(ratio,0,0,ratio,0,0);
    const key=JSON.stringify([pixelWidth,pixelHeight,this.center,this.scale,frame.beat.id,this.cameraKey]);
    if(key!==this.baseKey) {
      if(this.baseCanvas.width!==pixelWidth||this.baseCanvas.height!==pixelHeight) {this.baseCanvas.width=pixelWidth;this.baseCanvas.height=pixelHeight;}
      const background=this.baseCanvas.getContext("2d");background.setTransform(ratio,0,0,ratio,0,0);
      // Fractional CSS sizes leave a partially covered last pixel. Clear the
      // full backing surface without reallocating it, preventing edge trails.
      background.clearRect(0,0,pixelWidth/ratio,pixelHeight/ratio);
      this.DrawBase(background,width,height,frame);this.baseKey=key;
    }
    context.drawImage(this.baseCanvas,0,0,pixelWidth,pixelHeight,0,0,width,height);this.hits=[];
    const Screen=(point)=>this.ToScreen(point),relevant=(item)=>item.beat.slice(0,2)===frame.stage.id||item.endBeat.slice(0,2)===frame.stage.id;
    if(layers.routes) {
      Line(context,frame.stage.beats.flatMap((beat)=>beat.p).map(Screen),"#9c731b9c",2,[6,5]);
      if(Number(frame.stage.id)>=3&&Number(frame.stage.id)<=6) Line(context,FLOW_GROUND.road.map(Screen),"#ad453499",2,[7,5]);
    }
    if(layers.triggers) for(const trigger of frame.triggers.filter(relevant)) {
      const selected=selection?.type==="trigger"&&selection.id===trigger.id;
      this.DrawArea(context,trigger.area,trigger.active?"#277b9a":"#54889b",selected?`${trigger.mode==="time"?"◷ ":""}${trigger.label}`:"",selected,{type:"trigger",id:trigger.id,text:`${trigger.label} · ${trigger.firedAt===null?"路线未经过":trigger.active?"已触发":"等待触发"}`});
    }
    if(layers.spawns) for(const group of frame.groups.filter(relevant)) {
      const selected=selection?.type==="group"&&selection.id===group.id,color=group.side==="friend"?FLOW_COLORS.friend:FLOW_COLORS.enemy;
      this.DrawArea(context,group.area,color,selected?group.label:"",selected,{type:"group",id:group.id,text:`${group.label} · 已出 ${group.spawned}/${group.count} · 在场 ${group.live}`});
      const p=Screen(group.area.center);Polygon(context,[[p[0],p[1]-6],[p[0]-5,p[1]+4],[p[0]+5,p[1]+4]],"#fcf4e4",color);
      if(layers.routes||selected) {
        for(let index=0;index<(group.memberPlans?.length||0);index++) {
          const path=GroupPath(group,index);Line(context,path.map(Screen),color+"99",selected?2:1,[5,4]);
          if(path.length>1) Arrow(context,Screen(path.at(-2)),Screen(path.at(-1)),color+"bb",1);
        }
        const route=[group.area.center,...group.route.slice(1)];
        if(!group.memberPlans || group.memberPlans.length<Math.min(group.count,group.maxAlive) || selected) {
          Line(context,route.map(Screen),color+"77",selected?2:1,[5,4]);
          if(route.length>1) Arrow(context,Screen(route.at(-2)),Screen(route.at(-1)),color+"99",1);
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
    if(frame.actors[0].pose==="drag") Line(context,[Screen(frame.player),Screen(winter.p),Screen(he.p)],"#776740",1.5);
    if(layers.routes) for(const ramp of this.mapData.ramps) {
      Arrow(context,Screen(ramp.points[0]),Screen(ramp.points.at(-1)),"#687a50",1.5);
    }
    const labelBoxes=[];
    for(const actor of this.OrderActors?.(frame.actors)||frame.actors) {
      const p=this.ActorScreen?this.ActorScreen(actor):Screen(actor.p),color=FLOW_COLORS[actor.side],selected=selection?.type==="actor"&&selection.id===actor.id;
      if(this.ActorInView?!this.ActorInView(actor):p[0]<-20||p[0]>width+20||p[1]<-20||p[1]>height+20) continue;
      if(this.VisibleActor&&!this.VisibleActor(actor)) continue;
      this.DrawActor(context,actor,frame);
      context.save();context.globalAlpha=this.ActorLabelOpacity?this.ActorLabelOpacity(actor):1;
      if(selected) Circle(context,p,12,"#e7d49a12","#e8d19a");
      this.hits.push({type:"actor",id:actor.id,screen:p,radius:9,text:`${actor.name} · X ${actor.p[0].toFixed(1)}  Z ${actor.p[1].toFixed(1)}${actor.status?` · ${actor.status}`:""}`});
      if(layers.names&&actor.pose!=="dead"&&(!actor.groupId||selected)) {
        const text=actor.status?`${actor.name} · ${actor.status}`:actor.name,labelWidth=text.length*12+8;
        for(const offset of [[11,-10],[11,13],[-labelWidth-10,-10],[-labelWidth-10,13],[11,-28],[11,30]]) {
          const box=[p[0]+offset[0],p[1]+offset[1]-8,labelWidth,16];
          if(box[0]<3||box[0]+box[2]>width-3||box[1]<3||box[1]+16>height-3) continue;
          if(labelBoxes.some((other)=>box[0]<other[0]+other[2]&&box[0]+box[2]>other[0]&&box[1]<other[1]+other[3]&&box[1]+box[3]>other[1])) continue;
          labelBoxes.push(box);Label(context,text,box[0],box[1]+8,color,12,true);break;
        }
      }
      context.restore();
    }
    for(const effect of frame.effects) {
      if(effect.kind==="blast") Circle(context,Screen(effect.p),(1+effect.age*2)*this.scale,"#dfa56822","#e3ab63");
      if(effect.kind==="grenade") {const p=Screen([Lerp(effect.a[0],effect.b[0],effect.phase),Lerp(effect.a[1],effect.b[1],effect.phase)]);p[1]-=Math.sin(effect.phase*Math.PI)*16;Line(context,[Screen(effect.a),Screen(effect.b)],effect.side==="enemy"?"#a6443480":"#b7944b80",1,[3,5]);Circle(context,p,3.5,effect.side==="enemy"?"#a64434":"#f2da98");}
      if(effect.kind==="plane") {const p=Screen(effect.p);Line(context,[[p[0]-8,p[1]],[p[0]+8,p[1]]],"#d2d7c5",2);Line(context,[[p[0],p[1]-5],[p[0],p[1]+7]],"#d2d7c5",2);}
      if(effect.kind==="column"||effect.kind==="runner") Circle(context,Screen(effect.p),3,"#f3957b");
    }
    for(const annotation of [...annotations,...(draft?[draft]:[])]) {
      if(Math.abs(annotation.time-frame.time)>0.06) continue;
      const a=Screen(annotation.a),b=Screen(annotation.b),color="#8d5d11";
      if(annotation.kind==="arrow") Arrow(context,a,b,color,2.5);
      if(annotation.kind==="rect") {
        const corners=[annotation.a,[annotation.b[0],annotation.a[1]],annotation.b,[annotation.a[0],annotation.b[1]],annotation.a].map(Screen);
        Line(context,corners,color,2);
      }
      if(annotation.text) AnnotationText(context,annotation.text,b,width,height);
      Circle(context,a,3,"#8d5d11");this.hits.push({type:"annotation",id:annotation.id,screen:a,radius:10,text:annotation.text||annotation.kind});
      if(selection?.type==="annotation"&&selection.id===annotation.id) for(const [handle,screen] of [["a",a],["b",b]]) {
        context.fillStyle="#8d5d11";context.fillRect(screen[0]-4,screen[1]-4,8,8);
        this.hits.push({type:"annotationHandle",id:annotation.id,handle,screen,radius:9});
      }
    }
    this.DrawScale(context,width,height);
    this.DrawCompass(context,width,height);
  }
}
