import { Clamp, Distance, Lerp } from "./Script_LevelFlowGeometry.mjs";

export const FLOW_COLORS = {player:"#f1d18a",friend:"#87c4c0",enemy:"#f3957b",civilian:"#c4b4e2"};
const fieldColors={wheat:"#424e35",plowed:"#574938",fallow:"#565541"};
const materialColors={"Whitebox/Plaster":"#99947d","Whitebox/Roof":"#666652","Whitebox/Structure":"#777866","Whitebox/Timber":"#927651","Whitebox/EarthDark":"#5e503d","Whitebox/Cover":"#8e8265","Whitebox/Step":"#887a60","Whitebox/Canvas":"#97895e","Whitebox/Metal":"#61645b","Whitebox/Water":"#527e89"};

function Line(context,points,color,width=1,dash=[]) {
  if(!points.length) return;
  context.beginPath();context.moveTo(...points[0]);
  for(const point of points.slice(1)) context.lineTo(...point);
  context.strokeStyle=color;context.lineWidth=width;context.setLineDash(dash);context.stroke();context.setLineDash([]);
}
function Polygon(context,points,color,stroke) {
  if(!points.length) return;
  context.beginPath();context.moveTo(...points[0]);for(const point of points.slice(1)) context.lineTo(...point);
  context.closePath();context.fillStyle=color;context.fill();
  if(stroke) {context.strokeStyle=stroke;context.lineWidth=0.8;context.stroke();}
}
function Circle(context,point,radius,color,stroke) {
  context.beginPath();context.arc(...point,Math.max(0.1,radius),0,Math.PI*2);context.fillStyle=color;context.fill();
  if(stroke) {context.strokeStyle=stroke;context.lineWidth=1.2;context.stroke();}
}
function Arrow(context,a,b,color,width=2) {
  Line(context,[a,b],color,width);
  const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const size=6+width;
  Polygon(context,[b,[b[0]-Math.cos(angle-0.45)*size,b[1]-Math.sin(angle-0.45)*size],[b[0]-Math.cos(angle+0.45)*size,b[1]-Math.sin(angle+0.45)*size]],color);
}
function Label(context,text,x,y,color="#e4e2cd",size=12,background=false) {
  context.font=`${size}px system-ui, Microsoft YaHei, sans-serif`;context.textAlign="left";context.textBaseline="middle";
  if(background) {context.fillStyle="#151b17e8";context.fillRect(x-4,y-size/2-3,context.measureText(text).width+8,size+6);}
  context.lineWidth=3;context.strokeStyle="#252b22dc";context.strokeText(text,x,y);context.fillStyle=color;context.fillText(text,x,y);
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
  Line(context,[anchor,[left,top+12]],"#ffe29888",1);
  context.fillStyle="#151b17eb";context.fillRect(left,top,boxWidth,boxHeight);
  lines.forEach((line,index)=>Label(context,line,left+6,top+12+index*17,"#ffe298",13));
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
    context.fillStyle="#30372a";context.fillRect(0,0,width,height);
    for(const paint of map.paint) {
      const points=paint.poly.map((point)=>Screen([point.x,point.z]));
      if(points.every((point)=>point[1]<0)||points.every((point)=>point[1]>height)) continue;
      const color=/road|path|lane/i.test(paint.id)?"#766e52":paint.color;
      context.globalAlpha=0.36;Polygon(context,points,color,"#bcb49430");context.globalAlpha=1;
    }
    for(const zone of map.fieldZones) {
      context.save();context.beginPath();zone.poly.map(Screen).forEach((point,index)=>index?context.lineTo(...point):context.moveTo(...point));context.closePath();context.clip();
      for(const field of map.fields.filter((item)=>item.zone===zone.id)) {
        const center=Screen([field.x,field.z]);context.save();context.translate(...center);context.rotate(field.angleDeg*Math.PI/180);
        for(const strip of field.strips) {context.fillStyle=fieldColors[strip.kind];context.fillRect(strip.from*scale,-field.d*scale/2,(strip.to-strip.from)*scale,field.d*scale);context.strokeStyle="#aaa27c55";context.lineWidth=0.7;context.strokeRect(strip.from*scale,-field.d*scale/2,(strip.to-strip.from)*scale,field.d*scale);}
        context.restore();
      }
      context.restore();
    }
    for(const path of map.footpaths) Line(context,path.map(Screen),"#a092684c",Math.max(0.6,scale*0.6),[3,3]);
    for(const road of map.roads) {Line(context,road.points.map(Screen),"#a59a7180",(road.width+1)*scale);Line(context,road.points.map(Screen),"#79775b",road.width*scale);}
    Line(context,map.river.map(Screen),"#6a8f8970",12*scale);Line(context,map.river.map(Screen),"#55818c",6*scale);
    for(const trench of map.trenches) {Line(context,trench.points.map(Screen),"#8d896055",(trench.width+3)*scale);Line(context,trench.points.map(Screen),"#20271f",trench.width*scale);Line(context,trench.points.map(Screen),"#afa37833",1);}
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
    for(const object of map.objects) {
      if(object.showOn&&!signals.has(object.showOn)||object.hideOn&&signals.has(object.hideOn)) continue;
      if(/Lintel/.test(object.id)) continue;
      const [x,,z]=object.pos,[w,,d]=object.size||[1,1,1],p=Screen([x,z]);
      const radius=Math.max(w,d)*scale;
      if(p[0]+radius<0||p[1]+radius<0||p[0]-radius>width||p[1]-radius>height) continue;
      if(object.material==="Whitebox/Foliage") {Circle(context,p,Math.max(1.2,Math.min(w,d)*scale*0.6),"#6f845a9c");continue;}
      context.save();context.translate(...p);context.rotate(-(object.yawDeg||0)*Math.PI/180);
      context.fillStyle=materialColors[object.material]||"#7b7961";
      context.fillRect(-w*scale/2,-d*scale/2,Math.max(0.7,w*scale),Math.max(0.7,d*scale));
      if(w*scale>3&&d*scale>3) {context.strokeStyle="#21251cba";context.lineWidth=0.7;context.strokeRect(-w*scale/2,-d*scale/2,w*scale,d*scale);}
      context.restore();
    }
    if(scale>2) for(const marker of map.markers) {const p=Screen(marker.p);Line(context,[[p[0]-3,p[1]],[p[0]+3,p[1]]],marker.kind==="window"?"#9cc6e5":"#e4c27a",2);}
    if(scale>0.9) for(const landmark of map.labels) {
      const p=Screen(landmark.p);if(p[0]<15||p[0]>width-50||p[1]<25||p[1]>height-25) continue;
      Label(context,landmark.name,p[0]+8,p[1]-13,"#dedcc4",scale>4?12:11);
    }
    if(scale>3) {
      const bounds=this.Bounds();
      for(let x=Math.ceil(bounds[0]/10)*10;x<bounds[1];x+=10) Line(context,[Screen([x,bounds[2]]),Screen([x,bounds[3]])],"#e3ddc709",1);
      for(let z=Math.ceil(bounds[2]/10)*10;z<bounds[3];z+=10) Line(context,[Screen([bounds[0],z]),Screen([bounds[1],z])],"#e3ddc709",1);
    }
  }

  DrawArea(context,area,color,label,selection,hit) {
    const p=this.ToScreen(area.center),w=area.size[0]*this.scale,h=area.size[1]*this.scale;
    context.setLineDash(selection?[]:[5,4]);context.lineWidth=selection?2:1.2;context.strokeStyle=color;context.fillStyle=color+"12";
    context.beginPath();if(area.shape==="circle") context.arc(...p,w/2,0,Math.PI*2);else context.rect(p[0]-w/2,p[1]-h/2,w,h);
    context.fill();context.stroke();context.setLineDash([]);
    this.hits.push({...hit,screen:p,radius:Math.max(10,Math.min(w,h)/2),area});
    if(label) Label(context,label,p[0]+Math.max(w/2,7)+5,p[1]-h/2-5,color,11,true);
    if(selection) {
      for(const [index,point] of [[0,area.center],[1,[area.center[0]+area.size[0]/2,area.center[1]+area.size[1]/2]]]) {
        const screen=this.ToScreen(point);context.fillStyle="#f0d395";context.fillRect(screen[0]-4,screen[1]-4,8,8);
        this.hits.push({...hit,objectType:hit.type,type:"areaHandle",handle:index,screen,radius:9});
      }
    }
  }

  Draw(frame,layers,selection,annotations=[],draft=null,editing=false) {
    const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),width=rect.width,height=rect.height;
    const pixelWidth=Math.max(1,Math.round(width*ratio)),pixelHeight=Math.max(1,Math.round(height*ratio));
    if(this.canvas.width!==pixelWidth||this.canvas.height!==pixelHeight) {this.canvas.width=pixelWidth;this.canvas.height=pixelHeight;}
    const context=this.canvas.getContext("2d");context.setTransform(ratio,0,0,ratio,0,0);
    const key=JSON.stringify([pixelWidth,pixelHeight,this.center,this.scale,frame.beat.id]);
    if(key!==this.baseKey) {
      this.baseCanvas.width=pixelWidth;this.baseCanvas.height=pixelHeight;
      const background=this.baseCanvas.getContext("2d");background.setTransform(ratio,0,0,ratio,0,0);this.DrawBase(background,width,height,frame);this.baseKey=key;
    }
    context.drawImage(this.baseCanvas,0,0,pixelWidth,pixelHeight,0,0,width,height);this.hits=[];
    const Screen=(point)=>this.ToScreen(point),relevant=(item)=>item.beat.slice(0,2)===frame.stage.id||item.endBeat.slice(0,2)===frame.stage.id;
    if(layers.routes) {
      Line(context,frame.stage.beats.flatMap((beat)=>beat.p).map(Screen),"#e7ce8b8c",2,[6,5]);
      if(frame.stage.id==="05"||frame.stage.id==="06") {const approach=[[175,-40],[105,50],[88,112],[83,161],[83,182],[85,218]];Line(context,approach.map(Screen),"#f3957b77",2,[7,5]);}
    }
    if(layers.triggers) for(const trigger of frame.triggers.filter(relevant)) {
      const selected=selection?.type==="trigger"&&selection.id===trigger.id;
      this.DrawArea(context,trigger.area,trigger.active?"#7bc6dd":"#75a9b8",selected?`${trigger.mode==="time"?"◷ ":""}${trigger.label}`:"",selected,{type:"trigger",id:trigger.id,text:`${trigger.label} · ${trigger.firedAt===null?"路线未经过":trigger.active?"已触发":"等待触发"}`});
    }
    if(layers.spawns) for(const group of frame.groups.filter(relevant)) {
      const selected=selection?.type==="group"&&selection.id===group.id,color=group.side==="friend"?FLOW_COLORS.friend:FLOW_COLORS.enemy;
      this.DrawArea(context,group.area,color,selected?group.label:"",selected,{type:"group",id:group.id,text:`${group.label} · 已出 ${group.spawned}/${group.count} · 在场 ${group.live}`});
      const p=Screen(group.area.center);Polygon(context,[[p[0],p[1]-6],[p[0]-5,p[1]+4],[p[0]+5,p[1]+4]],"#263025",color);
      if(layers.routes||selected) {
        const route=[group.area.center,...group.route.slice(1)];Line(context,route.map(Screen),color+"77",selected?2:1,[5,4]);
        if(route.length>1) Arrow(context,Screen(route.at(-2)),Screen(route.at(-1)),color+"99",1);
        if(selected) for(let index=1;index<route.length;index++) {
          const screen=Screen(route[index]);Circle(context,screen,4,color,"#132017");this.hits.push({type:"routeHandle",id:group.id,index,screen,radius:9});
        }
      }
    }
    if(layers.fire) for(const effect of frame.effects.filter((item)=>item.kind==="fire")) {
      const a=Screen(effect.a),b=Screen(effect.b),color=FLOW_COLORS[effect.side]||FLOW_COLORS.enemy;
      Line(context,[a,b],color+"45",effect.heavy?1.6:0.8,[4,7]);
      const tip=[Lerp(a[0],b[0],0.82),Lerp(a[1],b[1],0.82)];Arrow(context,[Lerp(a[0],b[0],0.72),Lerp(a[1],b[1],0.72)],tip,color+"ae",1);
      if(effect.phase<0.25) {Line(context,[[Lerp(a[0],b[0],effect.phase*3),Lerp(a[1],b[1],effect.phase*3)],b],color,1.5);Circle(context,a,2.5,"#ffe8ae");}
    }
    const winter=frame.actors.find((actor)=>actor.id==="winter"),he=frame.actors.find((actor)=>actor.id==="he");
    if(frame.actors[0].pose==="drag") Line(context,[Screen(frame.player),Screen(winter.p),Screen(he.p)],"#e3dcc1",1.5);
    const labelBoxes=[];
    for(const actor of frame.actors) {
      const p=Screen(actor.p),color=FLOW_COLORS[actor.side],selected=selection?.type==="actor"&&selection.id===actor.id;
      if(p[0]<-20||p[0]>width+20||p[1]<-20||p[1]>height+20) continue;
      if(selected) Circle(context,p,12,"#e7d49a12","#e8d19a");
      if(actor.pose==="dead") {Line(context,[[p[0]-3,p[1]-3],[p[0]+3,p[1]+3]],color+"66",1.3);Line(context,[[p[0]-3,p[1]+3],[p[0]+3,p[1]-3]],color+"66",1.3);}
      else if(actor.kind==="tank"||actor.kind==="cart") {
        context.save();context.translate(...p);context.rotate(actor.heading||0);context.fillStyle=actor.pose==="burn"?"#74432c":"#6c7258";context.strokeStyle=color;context.lineWidth=1.4;
        const size=Clamp(this.scale,4,9);context.fillRect(-size,-size*1.5,size*2,size*3);context.strokeRect(-size,-size*1.5,size*2,size*3);
        if(actor.kind==="tank") {context.rotate((actor.turret||0)-(actor.heading||0));Circle(context,[0,0],size*0.55,"#87856a",color);Line(context,[[0,0],[0,-size*1.8]],color,2);}
        else {Circle(context,[-size-2,0],2.5,color);Circle(context,[size+2,0],2.5,color);}
        context.restore();
      } else if(actor.kind==="quilt") {
        context.fillStyle=color;context.strokeStyle="#f1e9ca";context.fillRect(p[0]-3,p[1]-6,6,12);context.strokeRect(p[0]-3,p[1]-6,6,12);
      } else Circle(context,p,actor.side==="player"?6:actor.side==="enemy"?4:4.5,color,"#111c17");
      this.hits.push({type:"actor",id:actor.id,screen:p,radius:9,text:`${actor.name} · X ${actor.p[0].toFixed(1)}  Z ${actor.p[1].toFixed(1)}`});
      if(layers.names&&actor.pose!=="dead"&&(!actor.groupId||selected)) {
        const text=actor.name,labelWidth=text.length*12+8;
        for(const offset of [[11,-10],[11,13],[-labelWidth-10,-10],[-labelWidth-10,13],[11,-28],[11,30]]) {
          const box=[p[0]+offset[0],p[1]+offset[1]-8,labelWidth,16];
          if(box[0]<3||box[0]+box[2]>width-3||box[1]<3||box[1]+16>height-3) continue;
          if(labelBoxes.some((other)=>box[0]<other[0]+other[2]&&box[0]+box[2]>other[0]&&box[1]<other[1]+other[3]&&box[1]+box[3]>other[1])) continue;
          labelBoxes.push(box);Label(context,text,box[0],box[1]+8,color,12,true);break;
        }
      }
    }
    for(const effect of frame.effects) {
      if(effect.kind==="blast") Circle(context,Screen(effect.p),(1+effect.age*2)*this.scale,"#dfa56822","#e3ab63");
      if(effect.kind==="grenade") {const p=Screen([Lerp(effect.a[0],effect.b[0],effect.phase),Lerp(effect.a[1],effect.b[1],effect.phase)]);p[1]-=Math.sin(effect.phase*Math.PI)*16;Circle(context,p,3.5,"#f2da98");}
      if(effect.kind==="plane") {const p=Screen(effect.p);Line(context,[[p[0]-8,p[1]],[p[0]+8,p[1]]],"#d2d7c5",2);Line(context,[[p[0],p[1]-5],[p[0],p[1]+7]],"#d2d7c5",2);}
      if(effect.kind==="column"||effect.kind==="runner") Circle(context,Screen(effect.p),3,"#f3957b");
    }
    for(const annotation of [...annotations,...(draft?[draft]:[])]) {
      if(Math.abs(annotation.time-frame.time)>0.06) continue;
      const a=Screen(annotation.a),b=Screen(annotation.b),color="#ffe298";
      if(annotation.kind==="arrow") Arrow(context,a,b,color,2.5);
      if(annotation.kind==="rect") {context.strokeStyle=color;context.lineWidth=2;context.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);}
      if(annotation.text) AnnotationText(context,annotation.text,b,width,height);
      Circle(context,a,3,"#ffe298");this.hits.push({type:"annotation",id:annotation.id,screen:a,radius:10,text:annotation.text||annotation.kind});
      if(selection?.type==="annotation"&&selection.id===annotation.id) for(const [handle,screen] of [["a",a],["b",b]]) {
        context.fillStyle="#ffe298";context.fillRect(screen[0]-4,screen[1]-4,8,8);
        this.hits.push({type:"annotationHandle",id:annotation.id,handle,screen,radius:9});
      }
    }
    const scaleMeters=this.scale<2?50:10;
    Line(context,[[18,height-30],[18+scaleMeters*this.scale,height-30]],"#d4d2b8",2);Label(context,`${scaleMeters} m`,18,height-43,"#c4c7b3",10);
    Label(context,"N ↑",width-35,height-25,"#c4c7b3",12);
  }
}
