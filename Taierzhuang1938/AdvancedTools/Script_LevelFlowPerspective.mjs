import { FlowMapView, FLOW_COLORS, EncounterSignals, VisibleEncounterObject, Polygon, Line, Circle, Label } from "./Script_LevelFlowView.mjs";
import { Clamp, Distance, SampleBeatRoute } from "./Script_LevelFlowGeometry.mjs";
import { EncounterFloorConnections } from "./Script_LevelFlowMap.mjs";

function Normalize(vector) {
  const length=Math.hypot(...vector)||1;
  return vector.map((value)=>value/length);
}
function Cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function Dot(a,b) { return a.reduce((sum,value,index)=>sum+value*b[index],0); }

const bankCache=new WeakMap();
function TrenchBanks(map) {
  if(bankCache.has(map)) return bankCache.get(map);
  const banks=new Map();
  for(const trench of map.trenches) for(let index=1;index<trench.points.length;index++) {
    const a=trench.points[index-1],b=trench.points[index],length=Distance(a,b);
    const normal=[-(b[1]-a[1])/length,(b[0]-a[0])/length];
    for(const side of [-1,1]) {
      const offset=trench.width/2*side,runs=[];
      let start=null;
      for(let distance=0;distance<length;distance+=0.5) {
        const end=Math.min(length,distance+0.5),middle=(distance+end)/(2*length);
        const point=[a[0]+(b[0]-a[0])*middle+normal[0]*offset,a[1]+(b[1]-a[1])*middle+normal[1]*offset];
        const portal=EncounterFloorConnections(point,map,trench.id).some((connection)=>connection!=="road");
        if(!portal&&start===null) start=distance;
        if(portal&&start!==null) {runs.push([start/length,distance/length]);start=null;}
      }
      if(start!==null) runs.push([start/length,1]);
      banks.set(`${trench.id}:${index}:${side}`,runs);
    }
  }
  bankCache.set(map,banks);return banks;
}

export class FlowPerspectiveView extends FlowMapView {
  constructor(canvas,mapData,type="oblique") {
    super(canvas,mapData);
    this.type=type;
    this.yaw=type==="oblique"?-0.45:0;
    this.pitch=0.67;
    this.target="player";
    this.scale=10;
    this.bankRuns=TrenchBanks(mapData);
  }

  BeforeDraw(frame) {
    this.frame=frame;
    const rect=this.canvas.getBoundingClientRect();
    this.width=rect.width;this.height=rect.height;
    const actor=frame.actors.find((item)=>item.id===this.target)||frame.actors[0];
    if(this.type==="eye") this.center=[...actor.p];
    const next=SampleBeatRoute(frame.beat,Math.min(1,frame.progress+0.03));
    let heading=Distance(next,frame.player)>0.01?Math.atan2(next[0]-frame.player[0],next[1]-frame.player[1]):-Math.PI/2;
    const shot=frame.effects.find((effect)=>effect.kind==="fire"&&Distance(effect.a,actor.p)<0.1);
    if(shot) heading=Math.atan2(shot.b[0]-actor.p[0],shot.b[1]-actor.p[1]);
    const yaw=this.yaw+heading;
    if(this.type==="eye") {
      const eyeHeight=actor.kind==="quilt"?0.55:actor.pose==="drag"?0.95:1.6;
      this.eye=[actor.p[0],eyeHeight,actor.p[1]];
      this.aim=[actor.p[0]+Math.sin(yaw)*20,1.25,actor.p[1]+Math.cos(yaw)*20];
    } else {
      const distance=Clamp(125/this.scale,8,42);
      this.eye=[this.center[0]-Math.sin(yaw+0.55)*distance,distance*0.52,this.center[1]-Math.cos(yaw+0.55)*distance];
      this.aim=[this.center[0],0.6,this.center[1]];
    }
    this.forward=Normalize(this.aim.map((value,index)=>value-this.eye[index]));
    this.right=Normalize(Cross(this.forward,[0,1,0]));
    this.up=Cross(this.right,this.forward);
    this.fov=this.type==="eye"?Clamp(105-this.scale*4,36,90):65;
    this.focal=this.width/(2*Math.tan(this.fov*Math.PI/360));
    this.cameraKey=[this.type,this.yaw,this.pitch,this.eye,this.aim].flat().join(",");
  }

  Fit(bounds,padding=35) {
    super.Fit(bounds,padding);
    this.scale=Clamp(this.scale,3,12);
  }

  Follow(frame) {
    const actor=frame.actors.find((item)=>item.id===this.target)||frame.actors[0];
    this.center=[...actor.p];
    if(this.type==="oblique") this.scale=Clamp(Math.min(this.canvas.clientWidth,this.canvas.clientHeight)/35,3,12);
    else if(this.type==="chase") this.scale=10;
    else if(this.type==="eye") this.scale=8;
  }

  CameraPoint(point) {
    const delta=point.map((value,index)=>value-this.eye[index]);
    return [Dot(delta,this.right),Dot(delta,this.up),Dot(delta,this.forward)];
  }

  Project(point) {
    if(this.type==="oblique") {
      const dx=point[0]-this.center[0],dz=point[2]-this.center[1];
      return [this.width/2+(dx*Math.cos(this.yaw)-dz*Math.sin(this.yaw))*this.scale,
        this.height*0.57+(dx*Math.sin(this.yaw)+dz*Math.cos(this.yaw))*this.scale*Math.sin(this.pitch)-point[1]*this.scale*Math.cos(this.pitch)];
    }
    const camera=this.CameraPoint(point);
    if(camera[2]<0.15) return [-100000,-100000];
    return [this.width/2+camera[0]*this.focal/camera[2],this.height*0.49-camera[1]*this.focal/camera[2]];
  }

  ToScreen(point) { return this.Project([point[0],0,point[1]]); }

  ToWorld(point) {
    if(this.type==="oblique") {
      const x=(point[0]-this.width/2)/this.scale;
      const z=(point[1]-this.height*0.57)/(this.scale*Math.sin(this.pitch));
      return [this.center[0]+x*Math.cos(this.yaw)+z*Math.sin(this.yaw),this.center[1]-x*Math.sin(this.yaw)+z*Math.cos(this.yaw)];
    }
    const x=(point[0]-this.width/2)/this.focal,y=-(point[1]-this.height*0.49)/this.focal;
    const direction=Normalize(this.forward.map((value,index)=>value+x*this.right[index]+y*this.up[index]));
    const distance=direction[1]<-0.001?Math.min(200,-this.eye[1]/direction[1]):60;
    return [this.eye[0]+direction[0]*distance,this.eye[2]+direction[2]*distance];
  }

  Bounds() {
    if(this.type!=="oblique") return null;
    const corners=[[0,0],[this.width,0],[this.width,this.height],[0,this.height]].map((point)=>this.ToWorld(point));
    return [Math.min(...corners.map((point)=>point[0])),Math.max(...corners.map((point)=>point[0])),Math.min(...corners.map((point)=>point[1])),Math.max(...corners.map((point)=>point[1]))];
  }

  NorthDirection() {
    if(this.type==="oblique") return [Math.sin(this.yaw),-Math.cos(this.yaw)*Math.sin(this.pitch)];
    return [-this.right[2],this.forward[2]];
  }

  DrawScale(context,width,height) {
    if(this.type!=="oblique") {Label(context,`视高 ${this.eye[1].toFixed(1)} m`,18,height-31,"#655e4b",10);return;}
    const start=this.ToScreen(this.center),end=this.ToScreen([this.center[0]+10,this.center[1]]);
    const length=Distance(start,end);
    Line(context,[[18,height-30],[18+length,height-30]],"#655e4b",2);
    Label(context,"10 m · X",18,height-43,"#655e4b",10);
  }

  DrawBase(context,width,height,frame) {
    context.fillStyle="#dce2db";context.fillRect(0,0,width,height);
    const faces=[],signals=EncounterSignals(frame);
    const Face=(points,color,stroke="#7d81644a")=>{
      let projected;
      if(this.type==="oblique") projected=points.map((point)=>this.Project(point));
      else {
        const camera=points.map((point)=>this.CameraPoint(point)),clipped=[];
        for(let index=0;index<camera.length;index++) {
          const a=camera[index],b=camera[(index+1)%camera.length];
          const insideA=a[2]>=0.15,insideB=b[2]>=0.15;
          if(insideA) clipped.push(a);
          if(insideA!==insideB) {
            const t=(0.15-a[2])/(b[2]-a[2]);
            clipped.push(a.map((value,axis)=>value+(b[axis]-value)*t));
          }
        }
        if(clipped.length<3) return;
        projected=clipped.map((point)=>[width/2+point[0]*this.focal/point[2],height*0.49-point[1]*this.focal/point[2]]);
      }
      const center=points[0].map((_,axis)=>points.reduce((sum,point)=>sum+point[axis],0)/points.length);
      const depth=this.type==="oblique"?(center[0]-this.center[0])*Math.sin(this.yaw)+(center[2]-this.center[1])*Math.cos(this.yaw):this.CameraPoint(center)[2];
      const ground=points.every((point)=>point[1]<=0.08);
      faces.push({points:projected,color,stroke,depth:ground?1000000:depth});
    };
    const Box=(x,z,w,d,h,color,y=0,yaw=0)=>{
      const Point=(dx,dy,dz)=>[x+dx*Math.cos(yaw)+dz*Math.sin(yaw),y+dy,z-dx*Math.sin(yaw)+dz*Math.cos(yaw)];
      const a=Point(-w/2,0,-d/2),b=Point(w/2,0,-d/2),c=Point(w/2,0,d/2),e=Point(-w/2,0,d/2);
      const top=[a,b,c,e].map((point)=>[point[0],point[1]+h,point[2]]);
      Face([a,b,top[1],top[0]],color);Face([b,c,top[2],top[1]],color);
      Face([c,e,top[3],top[2]],color);Face([e,a,top[0],top[3]],color);
      Face(top,"#d9d0b8");
    };
    const extent=this.type==="eye"?90:65;
    const [cx,cz]=this.center;
    Face([[cx-extent,-0.08,cz-extent],[cx+extent,-0.08,cz-extent],[cx+extent,-0.08,cz+extent],[cx-extent,-0.08,cz+extent]],"#d8ddc4",null);
    for(const floor of this.mapData.floors) if(floor.points.some((point)=>Distance(point,this.center)<90)) Face(floor.points.map((point)=>[point[0],0.03,point[1]]),"#efe3c9");
    for(const road of this.mapData.roads) for(let index=1;index<road.points.length;index++) {
      const a=road.points[index-1],b=road.points[index];
      if(Math.min(Distance(a,this.center),Distance(b,this.center))>90) continue;
      const length=Distance(a,b),normal=[-(b[1]-a[1])/length*road.width/2,(b[0]-a[0])/length*road.width/2];
      Face([[a[0]+normal[0],0,a[1]+normal[1]],[b[0]+normal[0],0,b[1]+normal[1]],[b[0]-normal[0],0,b[1]-normal[1]],[a[0]-normal[0],0,a[1]-normal[1]]],"#e9ddc1",null);
    }
    for(const trench of this.mapData.trenches) for(let index=1;index<trench.points.length;index++) {
      const a=trench.points[index-1],b=trench.points[index];
      if(Math.min(Distance(a,this.center),Distance(b,this.center))>75) continue;
      const length=Distance(a,b),normal=[-(b[1]-a[1])/length,(b[0]-a[0])/length],half=trench.width/2;
      Face([[a[0]+normal[0]*half,0.02,a[1]+normal[1]*half],[b[0]+normal[0]*half,0.02,b[1]+normal[1]*half],[b[0]-normal[0]*half,0.02,b[1]-normal[1]*half],[a[0]-normal[0]*half,0.02,a[1]-normal[1]*half]],"#e6d4af");
      for(const side of [-1,1]) {
        const offset=half*side,top=trench.id==="SunkenLane"?2:1.5;
        for(const [from,to] of this.bankRuns.get(`${trench.id}:${index}:${side}`)||[]) {
          const start=[a[0]+(b[0]-a[0])*from,a[1]+(b[1]-a[1])*from];
          const end=[a[0]+(b[0]-a[0])*to,a[1]+(b[1]-a[1])*to];
          Face([[start[0]+normal[0]*offset,0,start[1]+normal[1]*offset],[end[0]+normal[0]*offset,0,end[1]+normal[1]*offset],[end[0]+normal[0]*offset,top,end[1]+normal[1]*offset],[start[0]+normal[0]*offset,top,start[1]+normal[1]*offset]],"#bba480");
          const outer=(half+0.7)*side;
          Face([[start[0]+normal[0]*offset,top,start[1]+normal[1]*offset],[end[0]+normal[0]*offset,top,end[1]+normal[1]*offset],[end[0]+normal[0]*outer,top,end[1]+normal[1]*outer],[start[0]+normal[0]*outer,top,start[1]+normal[1]*outer]],"#d2c094");
        }
      }
    }
    for(let index=1;index<this.mapData.river.length;index++) {
      const a=this.mapData.river[index-1],b=this.mapData.river[index];
      if(Math.min(Distance(a,this.center),Distance(b,this.center))>95) continue;
      const length=Distance(a,b),normal=[-(b[1]-a[1])/length*3,(b[0]-a[0])/length*3];
      Face([[a[0]+normal[0],0.04,a[1]+normal[1]],[b[0]+normal[0],0.04,b[1]+normal[1]],[b[0]-normal[0],0.04,b[1]-normal[1]],[a[0]-normal[0],0.04,a[1]-normal[1]]],"#a6c5cf","#779da366");
    }
    this.visibleBoxes=[];
    for(const object of this.mapData.objects) {
      if(!VisibleEncounterObject(object,signals)||/Lintel|Bridge/.test(object.id)||["Whitebox/Roof","Whitebox/Foliage"].includes(object.material)) continue;
      const [x,,z]=object.pos,[w,h,d]=object.size||[1,1,1];
      if(Distance([x,z],this.center)>65||Math.max(w,d)<0.7) continue;
      const heightValue=Clamp(h||0.4,0.2,5);
      Box(x,z,w,d,heightValue,object.material==="Whitebox/Plaster"?"#c7bfaa":"#b8a786",0,(object.yawDeg||0)*Math.PI/180);
      if(heightValue>0.6) this.visibleBoxes.push({x,z,w,d,h:heightValue});
    }
    faces.sort((a,b)=>b.depth-a.depth);
    for(const face of faces) Polygon(context,face.points,face.color,face.stroke);
  }

  VisibleActor(actor) {
    if(this.type!=="eye") return true;
    if(actor.id===this.target) return false;
    const target=[actor.p[0],1.5,actor.p[1]],delta=target.map((value,index)=>value-this.eye[index]);
    for(const box of this.visibleBoxes) {
      const min=[box.x-box.w/2,0,box.z-box.d/2],max=[box.x+box.w/2,box.h,box.z+box.d/2];
      let entry=0,exit=1;
      for(let axis=0;axis<3;axis++) {
        if(Math.abs(delta[axis])<1e-8) {if(this.eye[axis]<min[axis]||this.eye[axis]>max[axis]) {entry=2;break;}}
        else {const a=(min[axis]-this.eye[axis])/delta[axis],b=(max[axis]-this.eye[axis])/delta[axis];entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
      }
      if(entry>0.01&&entry<0.98&&entry<=exit) return false;
    }
    return true;
  }

  OrderActors(actors) {
    return [...actors].sort((a,b)=>Distance(b.p,this.center)-Distance(a.p,this.center));
  }

  DrawActor(context,actor,frame) {
    const [x,z]=actor.p,color=FLOW_COLORS[actor.side];
    const Segment=(a,b,width=2)=>{
      const start=this.Project(a),end=this.Project(b);
      if(start[0]>-10000&&end[0]>-10000) Line(context,[start,end],color,width);
    };
    if(actor.kind==="tank"||actor.kind==="cart") {
      const yaw=actor.heading||0,w=actor.kind==="tank"?1.62:1.4,d=actor.kind==="tank"?3.08:2.5;
      const Point=(dx,y,dz)=>[x+dx*Math.cos(yaw)+dz*Math.sin(yaw),y,z-dx*Math.sin(yaw)+dz*Math.cos(yaw)];
      const bottom=[Point(-w/2,0,-d/2),Point(w/2,0,-d/2),Point(w/2,0,d/2),Point(-w/2,0,d/2)];
      const top=bottom.map((point)=>[point[0],0.95,point[2]]);
      for(let index=0;index<4;index++) Polygon(context,[bottom[index],bottom[(index+1)%4],top[(index+1)%4],top[index]].map((point)=>this.Project(point)),"#9d9d7e",color);
      Polygon(context,top.map((point)=>this.Project(point)),actor.pose==="burn"?"#a86a39":"#b8b395",color);
      if(actor.kind==="tank") Segment([x,1.2,z],[x+Math.sin(actor.turret||0)*1.8,1.2,z-Math.cos(actor.turret||0)*1.8],3);
      return;
    }
    if(actor.kind==="quilt") {
      Polygon(context,[[x-0.4,0.1,z-0.9],[x+0.4,0.1,z-0.9],[x+0.4,0.1,z+0.9],[x-0.4,0.1,z+0.9]].map((point)=>this.Project(point)),"#d8c5ab",color);return;
    }
    if(actor.pose==="dead") {Segment([x-0.5,0.1,z],[x+0.5,0.1,z]);return;}
    const crouch=["kneel","drag","down"].includes(actor.pose)?0.65:1;
    const height=actor.kind==="child"?1.05:1.65;
    const gait=["walk","run","drag"].includes(actor.pose)?Math.sin(frame.time*5+x)*0.2:0;
    Segment([x,0.55*crouch,z],[x,height*0.8*crouch,z],3.5);
    Segment([x,0.55*crouch,z],[x-0.2,0.02,z+gait],2);
    Segment([x,0.55*crouch,z],[x+0.2,0.02,z-gait],2);
    Segment([x,height*0.65*crouch,z],[x-0.4,height*0.47*crouch,z+0.15],2);
    Segment([x,height*0.65*crouch,z],[x+0.4,height*0.47*crouch,z+0.15],2);
    const head=this.Project([x,height*0.94*crouch,z]),neck=this.Project([x,height*0.8*crouch,z]);
    Circle(context,head,Clamp(Distance(head,neck)*0.75,2.5,7),color,"#f6f0de");
  }

  DrawArea(context,area,color,label,selected,hit) {
    const points=area.shape==="circle"?Array.from({length:32},(_,index)=>[area.center[0]+Math.cos(index*Math.PI/16)*area.size[0]/2,area.center[1]+Math.sin(index*Math.PI/16)*area.size[0]/2])
      :[[area.center[0]-area.size[0]/2,area.center[1]-area.size[1]/2],[area.center[0]+area.size[0]/2,area.center[1]-area.size[1]/2],[area.center[0]+area.size[0]/2,area.center[1]+area.size[1]/2],[area.center[0]-area.size[0]/2,area.center[1]+area.size[1]/2]];
    const projected=points.map((point)=>this.ToScreen(point));
    if(projected.some((point)=>point[0]<-10000)) return;
    Polygon(context,projected,color+"13",color);
    const center=this.ToScreen(area.center);this.hits.push({...hit,screen:center,radius:12,area});
    if(selected) for(const [handle,point] of [[0,area.center],[1,points[2]||points[0]]]) {
      const screen=this.ToScreen(point);Circle(context,screen,4,color);
      this.hits.push({...hit,type:"areaHandle",objectType:hit.type,handle,screen,radius:9});
    }
  }
}
