import { FLOW_WORLD } from "./Data_LevelFlow.mjs";
import { CameraAt, Clamp, Distance, Lerp } from "./Script_LevelFlowModel.mjs";

export const FLOW_COLORS = { player:"#edca83", friend:"#86b8b0", enemy:"#e9816b", civilian:"#b1a1cd" };

function ResizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2,window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width*ratio));
  const height = Math.max(1, Math.round(rect.height*ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width=width; canvas.height=height; }
  const context = canvas.getContext("2d");
  context.setTransform(ratio,0,0,ratio,0,0);
  return {context,width:rect.width,height:rect.height};
}

function Polyline(context, points, stroke, width, dash = []) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.strokeStyle=stroke; context.lineWidth=width; context.setLineDash(dash);
  context.stroke(); context.setLineDash([]);
}

function Polygon(context,points,fill,stroke) {
  if (!points.length) return;
  context.beginPath(); context.moveTo(...points[0]);
  for (const point of points.slice(1)) context.lineTo(...point);
  context.closePath(); context.fillStyle=fill; context.fill();
  if (stroke) {context.strokeStyle=stroke;context.lineWidth=1;context.stroke();}
}

function Circle(context,point,radius,fill,stroke) {
  context.beginPath(); context.arc(...point,Math.max(0.1,radius),0,Math.PI*2);
  context.fillStyle=fill; context.fill();
  if (stroke) {context.strokeStyle=stroke;context.lineWidth=1.2;context.stroke();}
}

function Text(context,text,x,y,color="#afb39f",align="left") {
  context.font="11px system-ui, Microsoft YaHei, sans-serif";
  context.textAlign=align; context.textBaseline="middle";
  context.lineWidth=3; context.strokeStyle="#11140ff0"; context.strokeText(text,x,y);
  context.fillStyle=color; context.fillText(text,x,y);
}

export class FlowMapView {
  constructor(canvas) {
    this.canvas=canvas;
    this.center=[60,70]; this.scale=5; this.hits=[];
  }

  Fit(bounds) {
    const rect=this.canvas.getBoundingClientRect();
    this.center=[(bounds[0]+bounds[1])/2,(bounds[2]+bounds[3])/2];
    this.scale=Math.max(0.2,Math.min((rect.width-90)/(bounds[1]-bounds[0]),(rect.height-105)/(bounds[3]-bounds[2])));
    // The inset occupies the top-right, so leave the playing space slightly left.
    this.center[0]+=(rect.width>500 ? 55 : 0)/this.scale;
  }

  ToScreen(point) {
    const rect=this.canvas.getBoundingClientRect();
    return [(point[0]-this.center[0])*this.scale+rect.width/2,(point[1]-this.center[1])*this.scale+rect.height/2];
  }

  ToWorld(point) {
    const rect=this.canvas.getBoundingClientRect();
    return [(point[0]-rect.width/2)/this.scale+this.center[0],(point[1]-rect.height/2)/this.scale+this.center[1]];
  }

  Zoom(factor,screenPoint) {
    const before=this.ToWorld(screenPoint);
    this.scale=Clamp(this.scale*factor,0.35,36);
    const after=this.ToWorld(screenPoint);
    this.center[0]+=before[0]-after[0]; this.center[1]+=before[1]-after[1];
  }

  Draw(frame,layers,selection) {
    const {context,width,height}=ResizeCanvas(this.canvas);
    const Screen=(point)=>this.ToScreen(point);
    context.clearRect(0,0,width,height); context.fillStyle="#11140f";context.fillRect(0,0,width,height);
    const northWest=this.ToWorld([0,0]),southEast=this.ToWorld([width,height]);
    const spacing=this.scale<1.3 ? 50 : 10;
    for(let x=Math.floor(northWest[0]/spacing)*spacing;x<southEast[0];x+=spacing) Polyline(context,[Screen([x,northWest[1]]),Screen([x,southEast[1]])],"#b6bba00b",1);
    for(let z=Math.floor(northWest[1]/spacing)*spacing;z<southEast[1];z+=spacing) Polyline(context,[Screen([northWest[0],z]),Screen([southEast[0],z])],"#b6bba00b",1);
    const river=[[30,365],[38,395],[34,426],[41,459],[36,491],[42,540]];
    Polyline(context,river.map(Screen),"#273b3d",Math.max(3,8*this.scale));
    for(const path of FLOW_WORLD.paths) {
      const points=path.points.map(Screen), road=path.kind === "road";
      Polyline(context,points,road?"#2c2c20":"#444737",(path.width+3.2)*this.scale);
      Polyline(context,points,road?"#49452d":"#252b22",path.width*this.scale);
      Polyline(context,points,"#93987818",1,[3,7]);
    }
    for(const building of FLOW_WORLD.buildings) {
      const [x,z,w,d]=building.rect;
      const corners=[[x,z],[x+w,z],[x+w,z+d],[x,z+d]].map(Screen);
      Polygon(context,corners,"#33382c","#74775a");
    }
    if(layers.covers) for(const cover of FLOW_WORLD.covers) {
      if(cover.stage !== frame.stage.id) continue;
      const [x,y]=Screen(cover.p),w=Math.max(5,cover.size[0]*this.scale),h=Math.max(5,cover.size[1]*this.scale);
      context.fillStyle="#a99a6860";context.fillRect(x-w/2,y-h/2,w,h);context.strokeStyle="#b7a577";context.strokeRect(x-w/2,y-h/2,w,h);
      Text(context,cover.name,x+8,y+12,"#b9ac87");
    }
    for(const landmark of FLOW_WORLD.landmarks) {
      const [x,y]=Screen(landmark.p);
      if(x<10||y<35||x>width-20||y>height-20) continue;
      Text(context,landmark.name,x+7,y-15,"#a6ad91");
    }
    if(layers.routes) {
      const path=frame.stage.beats.flatMap((beat)=>beat.p).map(Screen);
      Polyline(context,path,"#edca8348",2,[5,7]);
      for(const spawn of frame.spawns) Polyline(context,spawn.route.map(Screen),"#e9816b50",1.5,[3,5]);
    }
    this.hits=[];
    if(layers.zones) for(const beat of frame.stage.beats.filter((entry)=>entry.zone)) {
      const p=Screen(beat.zone.slice(0,2)),radius=Math.max(12,beat.zone[2]*this.scale);
      const arrived=Distance(frame.player,beat.zone)<beat.zone[2];
      const passed=frame.time>=beat.end || (frame.beat.id===beat.id && arrived);
      const color=frame.beat.id===beat.id?"#8fc2e9":"#79b6e470";
      context.setLineDash(passed?[]:[4,4]);Circle(context,p,radius,passed?"#79b6e41b":"#79b6e408",color);context.setLineDash([]);
      if(frame.beat.id === beat.id || !passed) Text(context,beat.id.toUpperCase(),p[0]+radius+5,p[1]-radius,color);
      this.hits.push({screen:p,radius:radius+6,text:`${beat.id}  ${beat.gate}`});
    }
    if(layers.spawns) for(const spawn of frame.spawns) {
      const [x,y]=Screen(spawn.source);
      Polygon(context,[[x,y-9],[x-8,y+6],[x+8,y+6]],"#11140f","#e9816b");
      Text(context,`△ ${spawn.label}`,x+12,y-10,"#e9816b");
      const born=frame.actors.find((actor)=>actor.wave===spawn.id && frame.time-actor.born<1.4);
      if(born) Circle(context,[x,y],10+(frame.time-born.born)*15,"#e9816b0a","#e9816b");
      this.hits.push({screen:[x,y],radius:15,text:spawn.repeat});
    }
    if(layers.camera) {
      const angle=Math.atan2(frame.look[1]-frame.player[1],frame.look[0]-frame.player[0]);
      const origin=Screen(frame.player),length=22*this.scale;
      const a=[origin[0]+Math.cos(angle-0.6)*length,origin[1]+Math.sin(angle-0.6)*length];
      const b=[origin[0]+Math.cos(angle+0.6)*length,origin[1]+Math.sin(angle+0.6)*length];
      Polygon(context,[origin,a,b],"#edca830a","#edca8333");
    }
    if(layers.fire) for(const effect of frame.effects.filter((fx)=>fx.kind === "fire")) {
      const from=Screen(effect.a),to=Screen(effect.b),color=FLOW_COLORS[effect.side]??FLOW_COLORS.enemy;
      if(effect.heavy) {
        const dx=to[0]-from[0],dy=to[1]-from[1],len=Math.max(1,Math.hypot(dx,dy));
        const side=[-dy/len*8,dx/len*8];
        Polygon(context,[from,[to[0]+side[0],to[1]+side[1]],[to[0]-side[0],to[1]-side[1]]],color+"11");
      }
      Polyline(context,[from,to],color+"34",1,[3,6]);
      const angle=Math.atan2(to[1]-from[1],to[0]-from[0]);
      const tip=[Lerp(from[0],to[0],0.8),Lerp(from[1],to[1],0.8)];
      Polygon(context,[tip,[tip[0]-Math.cos(angle-0.5)*6,tip[1]-Math.sin(angle-0.5)*6],[tip[0]-Math.cos(angle+0.5)*6,tip[1]-Math.sin(angle+0.5)*6]],color+"88");
      if(effect.phase<0.28) {
        Polyline(context,[[Lerp(from[0],to[0],effect.phase*3),Lerp(from[1],to[1],effect.phase*3)],to],color+"dd",effect.heavy?2:1.5);
        Circle(context,from,3,"#ffe1a6"); Circle(context,to,2,"#e5ad76");
      }
    }
    if(frame.beat.pose === "drag") {
      const winter=frame.actors.find((actor)=>actor.id === "winter");
      const he=frame.actors.find((actor)=>actor.id === "he");
      Polyline(context,[Screen(frame.player),Screen(winter.p),Screen(he.p)],"#d1d6b7",1.5);
    }
    for(const actor of frame.actors) this.DrawActor(context,actor,frame.time,actor.id===selection);
    for(const effect of frame.effects) {
      if(effect.kind === "grenade") {
        const p=[Lerp(effect.a[0],effect.b[0],effect.phase),Lerp(effect.a[1],effect.b[1],effect.phase)];
        const screen=Screen(p);screen[1]-=Math.sin(effect.phase*Math.PI)*18;
        Polyline(context,[Screen(effect.a),Screen(p)],"#efce9470",1,[2,3]);Circle(context,screen,4,"#f4d79b");
      }
      if(effect.kind === "blast") {
        const p=Screen(effect.p),radius=(1+effect.age*4)*this.scale;
        Circle(context,p,radius,"#dc9a4a22","#edb875");
        for(let i=0;i<9;i++) {
          const angle=i*2.4;
          Polyline(context,[[p[0]+Math.cos(angle)*radius*0.4,p[1]+Math.sin(angle)*radius*0.4],[p[0]+Math.cos(angle)*radius,p[1]+Math.sin(angle)*radius]],"#edbd7677",1);
        }
      }
      if(effect.kind === "plane") {
        const [x,y]=Screen(effect.p);
        Polyline(context,[[x-10,y],[x+10,y]],"#bdb7a6",2);Polyline(context,[[x,y-7],[x,y+8]],"#bdb7a6",2);
      }
      if(effect.kind === "runner" || effect.kind === "column") {
        const p=Screen(effect.p);
        Circle(context,p,effect.kind === "column"?2.7:4,"#e9816b");
        if(effect.kind === "column") Circle(context,[p[0]-4,p[1]+4],4,"#c1a26813");
        else Text(context,"喊援",p[0]+8,p[1]-6,"#e9816b");
      }
    }
    if(layers.labels) this.DrawLabels(context,frame.actors,selection,width,height);
    Text(context,"N ↑",width-23,height-22,"#9fa58e","center");
    const scaleMeters=this.scale<2?50:10;
    Polyline(context,[[20,height-54],[20+scaleMeters*this.scale,height-54]],"#aab298",2);
    Text(context,`${scaleMeters} m`,20,height-65,"#9fa58e");
  }

  DrawActor(context,actor,time,selected) {
    const p=this.ToScreen(actor.p),color=FLOW_COLORS[actor.side];
    context.save();context.translate(...p);
    if(selected) Circle(context,[0,0],13,"#edca8308","#edca83");
    if(actor.pose === "dead") {
      Polyline(context,[[-4,-4],[4,4]],color+"80",1.5);Polyline(context,[[-4,4],[4,-4]],color+"80",1.5);
    } else if(actor.kind === "tank") {
      const size=Clamp(this.scale,3.8,9);
      context.rotate(actor.heading);context.fillStyle=actor.pose === "burn"?"#4b3626":"#494b38";context.strokeStyle=color;
      context.fillRect(-size*0.8,-size*1.5,size*1.6,size*3);context.strokeRect(-size*0.8,-size*1.5,size*1.6,size*3);
      context.fillStyle="#797762";
      context.fillRect(-size,-size*1.5,size*0.3,size*3);context.fillRect(size*0.7,-size*1.5,size*0.3,size*3);
      context.rotate(actor.turret-actor.heading);Circle(context,[0,0],size*0.55,"#79735a",color);
      Polyline(context,[[0,0],[0,-size*1.7]],color,2);
      if(actor.pose === "burn") for(let i=0;i<3;i++) Circle(context,[Math.sin(time*3+i)*3,-size-i*6],5+i*2,i===0?"#da9b50bb":"#7d766b77");
    } else if(actor.kind === "cart") {
      context.fillStyle="#6a5940";context.strokeStyle=color;context.fillRect(-6,-10,12,18);context.strokeRect(-6,-10,12,18);
      Circle(context,[-8,1],3,"#b1a1cd");Circle(context,[8,1],3,"#b1a1cd");
      Polyline(context,[[0,8],[0,17]],"#b1a1cd",1);context.fillStyle="#97836a";context.fillRect(-3,15,6,9);
    } else if(actor.kind === "quilt") {
      context.rotate(0.12);context.fillStyle="#aeb7a5";context.strokeStyle="#dde1c6";
      context.fillRect(-4,-7,8,16);context.strokeRect(-4,-7,8,16);Circle(context,[0,-5],2.5,"#d5c4a4");
    } else {
      Circle(context,[0,0],actor.side === "player"?6:actor.kind === "child"?3.3:4.5,color,"#12160f");
      if(["shoot","retreat"].includes(actor.pose)) Polyline(context,[[2,-2],[9,-7]],color,2);
      if(actor.pose === "drag") Polyline(context,[[-3,0],[-8,5],[0,9],[7,4]],color,1.5);
    }
    context.restore();
    this.hits.push({screen:p,radius:12,text:`${actor.name} · ${actor.pose === "dead"?"倒下":actor.kind === "tank"?"机枪塔旋转":"点位"} · (${actor.p.map((n)=>n.toFixed(1)).join(", ")})`,actor:actor.id});
  }

  DrawLabels(context,actors,selection,width,height) {
    const occupied=[];
    const sorted=[...actors].sort((a,b)=>Number(b.id===selection||b.side==="player")-Number(a.id===selection||a.side==="player"));
    for(const actor of sorted) {
      if(actor.pose === "dead" || (actor.side === "enemy" && actor.kind === "person" && actor.id!==selection)) continue;
      const p=this.ToScreen(actor.p);
      if(p[0]<0||p[0]>width||p[1]<0||p[1]>height) continue;
      const text=actor.id === "winter"?"冬瓜 · 单被":actor.name;
      const length=text.length*11+8;
      for(const offset of [[12,-9],[12,10],[-length-10,-10],[-length-10,13],[12,-26],[12,28]]) {
        const rect=[p[0]+offset[0],p[1]+offset[1]-7,length,14];
        if(occupied.some((other)=>rect[0]<other[0]+other[2] && rect[0]+rect[2]>other[0] && rect[1]<other[1]+other[3] && rect[1]+rect[3]>other[1])) continue;
        occupied.push(rect);Polyline(context,[p,[rect[0],rect[1]+7]],"#969b8240",1);
        Text(context,text,rect[0]+2,rect[1]+7,FLOW_COLORS[actor.side]);break;
      }
    }
  }
}

function Projector(camera,width,height) {
  const delta=camera.aim.map((value,index)=>value-camera.eye[index]);
  const yaw=Math.atan2(delta[0],delta[2]),pitch=Math.atan2(delta[1],Math.hypot(delta[0],delta[2]));
  const focal=width/(2*Math.tan(camera.fov*Math.PI/360));
  return (point)=>{
    const dx=point[0]-camera.eye[0],dy=point[1]-camera.eye[1],dz=point[2]-camera.eye[2];
    const horizontal=dx*Math.cos(yaw)-dz*Math.sin(yaw);
    const forward=dx*Math.sin(yaw)+dz*Math.cos(yaw);
    const depth=forward*Math.cos(pitch)+dy*Math.sin(pitch);
    const vertical=dy*Math.cos(pitch)-forward*Math.sin(pitch);
    if(depth<0.2) return null;
    return {p:[width/2+horizontal/depth*focal,height*0.48-vertical/depth*focal],depth};
  };
}

export function DrawFlowCamera(canvas,frame,mode) {
  const {context,width,height}=ResizeCanvas(canvas);
  const camera=CameraAt(frame,mode),project=Projector(camera,width,height);
  const gradient=context.createLinearGradient(0,0,0,height);
  gradient.addColorStop(0,"#50574b");gradient.addColorStop(0.48,"#a3a38c");gradient.addColorStop(0.49,"#454b39");gradient.addColorStop(1,"#252b20");
  context.fillStyle=gradient;context.fillRect(0,0,width,height);
  const items=[];
  const Face=(points,color,stroke="#b4b59b33")=>{
    const projected=points.map(project);
    if(projected.some((p)=>!p)) return;
    items.push({depth:projected.reduce((sum,p)=>sum+p.depth,0)/points.length,points:projected.map((p)=>p.p),color,stroke});
  };
  const Box=(x,z,w,d,h,color,y=0)=>{
    Face([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],color);
    Face([[x+w,y,z],[x+w,y,z+d],[x+w,y+h,z+d],[x+w,y+h,z]],color);
    Face([[x+w,y,z+d],[x,y,z+d],[x,y+h,z+d],[x+w,y+h,z+d]],color);
    Face([[x,y,z+d],[x,y,z],[x,y+h,z],[x,y+h,z+d]],color);
    Face([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]],color);
  };
  for(const path of FLOW_WORLD.paths.filter((path)=>path.kind !== "road")) {
    for(let index=1;index<path.points.length;index++) {
      const a=path.points[index-1],b=path.points[index];
      if(Math.min(Distance(a,frame.player),Distance(b,frame.player))>100) continue;
      const length=Distance(a,b),normal=[-(b[1]-a[1])/length,(b[0]-a[0])/length];
      const half=path.width/2;
      Face([[a[0]+normal[0]*half,0,a[1]+normal[1]*half],[b[0]+normal[0]*half,0,b[1]+normal[1]*half],[b[0]-normal[0]*half,0,b[1]-normal[1]*half],[a[0]-normal[0]*half,0,a[1]-normal[1]*half]],"#393d2c");
      if(["交通沟","支沟","凹路"].includes(path.name)) for(const side of [-1,1]) {
        const offset=half*side,wall=mode === "player"?(path.name === "凹路"?2:1.5):0.45;
        Face([[a[0]+normal[0]*offset,0,a[1]+normal[1]*offset],[b[0]+normal[0]*offset,0,b[1]+normal[1]*offset],[b[0]+normal[0]*offset,wall,b[1]+normal[1]*offset],[a[0]+normal[0]*offset,wall,a[1]+normal[1]*offset]],"#5a5b42");
      }
    }
  }
  for(const building of FLOW_WORLD.buildings) {
    if(Distance([building.rect[0],building.rect[1]],frame.player)>95) continue;
    if(building.name === "防炮洞" && frame.stage.id === "01") continue;
    const [x,z,w,d]=building.rect;
    const inside=camera.eye[0]>x && camera.eye[0]<x+w && camera.eye[2]>z && camera.eye[2]<z+d;
    if(inside || (building.name === "老耿家北屋" && frame.beat.id === "09j")) continue;
    Box(...building.rect,mode === "player"?building.height:Math.min(building.height,1.2),"#656855");
  }
  for(const cover of FLOW_WORLD.covers.filter((cover)=>cover.stage === frame.stage.id)) Box(cover.p[0]-cover.size[0]/2,cover.p[1]-cover.size[1]/2,...cover.size,0.9,"#777052");
  for(const actor of frame.actors) {
    if(actor.id === "player" && mode === "player") continue;
    const [x,z]=actor.p,color=FLOW_COLORS[actor.side];
      const elevation=actor.elevation??0;
      const projected=project([x,0.8+elevation,z]);
    if(!projected || projected.depth>95) continue;
    if(actor.kind === "tank") {
      Box(x-0.81,z-1.54,1.62,3.08,0.95,actor.pose === "burn"?"#6a4531":"#73755a");
      Box(x-0.5,z-0.4,1,1,0.65,"#7e7c5f",0.95);
      const end=[x+Math.sin(actor.turret)*2,1.35,z-Math.cos(actor.turret)*2];
      const a=project([x,1.35,z]),b=project(end);
      if(a&&b) items.push({depth:projected.depth,draw:()=>Polyline(context,[a.p,b.p],color,3)});
    } else if(actor.kind === "cart") {
      Box(x-0.8,z-1.3,1.6,2.6,0.7,"#897052",0.4);
      Box(x-0.4,z+2.3,0.8,1.2,1,"#817760");
    } else if(actor.kind === "quilt") {
      Box(x-0.45,z-0.9,0.9,1.8,0.14,"#bac0a2",0.06);
      Box(x-0.22,z-0.75,0.44,0.35,0.22,"#cfb993",0.2);
    } else {
      const down=actor.pose === "dead",child=actor.kind === "child",h=child?1.05:1.65;
      const crouch=["drag","kneel","down"].includes(actor.pose)?0.55:1;
      const gait=["run","walk","drag"].includes(actor.pose)?Math.sin(frame.time*6+x)*0.22:0;
      const segments=down ? [[[x-0.6,0.1,z],[x+0.6,0.1,z]]] : [
        [[x,0.5*crouch,z],[x,h*0.82*crouch,z]],
        [[x,0.5*crouch,z],[x-0.17,0,z+gait]],[[x,0.5*crouch,z],[x+0.17,0,z-gait]],
        [[x,1.15*crouch,z],[x-0.35,0.85*crouch,z+0.2]],[[x,1.15*crouch,z],[x+0.35,0.85*crouch,z+0.2]],
      ];
      items.push({depth:projected.depth,draw:()=>{
        for(const segment of segments) {const a=project([segment[0][0],segment[0][1]+elevation,segment[0][2]]),b=project([segment[1][0],segment[1][1]+elevation,segment[1][2]]);if(a&&b) Polyline(context,[a.p,b.p],color,Math.max(1.5,10/projected.depth));}
        const head=project([x,h*0.94*crouch+elevation,z]);if(head&&!down) Circle(context,head.p,Clamp(width/projected.depth*0.11,1.7,9),color);
      }});
    }
  }
  items.sort((a,b)=>b.depth-a.depth);
  for(const item of items) {if(item.draw) item.draw();else Polygon(context,item.points,item.color,item.stroke);}
  for(const effect of frame.effects) {
    if(effect.kind === "fire" && effect.phase<0.2) {
      const a=project([effect.a[0],1.1,effect.a[1]]),b=project([effect.b[0],0.8,effect.b[1]]);
      if(a&&b) Polyline(context,[a.p,b.p],"#ffe2a4c0",1.2);
      if(a) Circle(context,a.p,3,"#ffe3a8");
      if(b) Circle(context,b.p,2,"#e2b57b");
    }
    if(effect.kind === "grenade") {
      const point=project([Lerp(effect.a[0],effect.b[0],effect.phase),0.6+Math.sin(effect.phase*Math.PI)*3,Lerp(effect.a[1],effect.b[1],effect.phase)]);
      if(point) Circle(context,point.p,3,"#f7d58d");
    }
    if(effect.kind === "blast") {
      const point=project([effect.p[0],1,effect.p[1]]);
      if(point) Circle(context,point.p,Clamp(width/point.depth*(0.6+effect.age),4,100),"#db9b4c70");
      if(effect.age<0.15) {context.fillStyle="#f0d2a333";context.fillRect(0,0,width,height);}
    }
    if(effect.kind === "plane") {
      const p=project([effect.p[0],effect.height,effect.p[1]]);
      if(p) {Polyline(context,[[p.p[0]-7,p.p[1]],[p.p[0]+7,p.p[1]]],"#d7d3ba",2);Polyline(context,[[p.p[0],p.p[1]-3],[p.p[0],p.p[1]+5]],"#d7d3ba",2);}
    }
  }
  if(mode === "player") DrawHands(context,width,height,frame);
  const pressure=context.createRadialGradient(width/2,height/2,height*0.15,width/2,height/2,Math.max(width,height)*0.6);
  pressure.addColorStop(0,"#49170d00");
  pressure.addColorStop(1,`rgba(78,28,13,${frame.beat.intensity*0.035})`);
  context.fillStyle=pressure;context.fillRect(0,0,width,height);
  return camera;
}

function DrawHands(context,width,height,frame) {
  const pose=frame.beat.pose;
  if(["drag","plant","carry","pack","hold","melee"].includes(pose)) {
    const sway=Math.sin(frame.time*5)*2;
    Polygon(context,[[width*0.1,height],[width*0.2,height*0.72+sway],[width*0.4,height*0.79],[width*0.32,height]],"#797e66","#bac0a1");
    Polygon(context,[[width*0.9,height],[width*0.8,height*0.72-sway],[width*0.6,height*0.79],[width*0.68,height]],"#797e66","#bac0a1");
    if(pose === "drag") {
      Polygon(context,[[width*0.34,height],[width*0.42,height*0.83],[width*0.58,height*0.83],[width*0.66,height]],"#a5ad94","#d6d9bd");
      Polyline(context,[[width*0.4,height*0.87],[width*0.5,height*0.93],[width*0.6,height*0.87]],"#d5d6b8",1);
    }
    if(pose === "plant") {context.fillStyle="#706749";context.fillRect(width*0.43,height*0.76,width*0.14,height*0.16);}
    if(pose === "carry" || pose === "pack") {context.fillStyle="#766344";context.fillRect(width*0.35,height*0.8,width*0.3,height*0.2);}
    if(pose === "hold") {
      Circle(context,[width*0.5,height*0.8],height*0.16,"#bca986");
      Polyline(context,[[width*0.38,height*0.84],[width*0.62,height*0.84]],"#8b9278",height*0.07);
    }
    if(pose === "melee") {
      const swing=Math.sin(frame.progress*Math.PI*3)*width*0.15;
      Polygon(context,[[width*0.58,height],[width*0.45+swing,height*0.4],[width*0.51+swing,height*0.33],[width*0.66,height]],"#bfc1ab","#dadbc2");
    }
  } else if(["shoot","retreat","walk","run","throw"].includes(pose)) {
    const recoil=pose === "shoot"?Math.max(0,0.2-(frame.time*1.2)%1)*20:0;
    Polygon(context,[[width*0.58,height],[width*0.55,height*0.84+recoil],[width*0.52,height*0.6+recoil],[width*0.5,height*0.6+recoil],[width*0.48,height*0.85],[width*0.4,height]],"#686349","#aaa78e");
    Polyline(context,[[width/2-4,height/2],[width/2+4,height/2]],"#e6dec880",1);
    Polyline(context,[[width/2,height/2-4],[width/2,height/2+4]],"#e6dec880",1);
  }
}
