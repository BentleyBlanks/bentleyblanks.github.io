import { FlowMapView, FLOW_COLORS, FLOW_MATERIAL_COLORS, FLOW_COVER_COLORS, IsEncounterCover, DrawCoverSymbol, EncounterSignals, VisibleEncounterObject, Polygon, Label } from "./Script_LevelFlowView.mjs";
import { Clamp, Distance, SampleBeatRoute } from "./Script_LevelFlowGeometry.mjs";
import { EncounterRaster } from "./Script_LevelFlowRaster.mjs";
import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";
import { DrawEncounterSky } from "./Script_LevelFlowSky.mjs";

function Normalize(vector) {const length=Math.hypot(...vector)||1;return vector.map(value=>value/length);}
function Cross(a,b) {return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}

export class FlowPerspectiveView extends FlowMapView {
  constructor(canvas,mapData,type="oblique") {
    super(canvas,mapData);
    this.type=type;this.yaw=type==="oblique"?-0.45:0;this.pitch=0.67;this.target="player";this.scale=10;
    this.far=1500;this.raster=new EncounterRaster();this.occlusion=new Map();this.freeCamera=null;
    this.renderScale=1;this.adaptiveScale=FLOW_RENDERING.navigation.initialScale;
    this.boxGeometry=new WeakMap();
  }
  Draw(...args) {
    const start=performance.now();this.frameDrawing=true;
    try {super.Draw(...args);} finally {this.frameDrawing=false;}
    this.drawMs=performance.now()-start;
    if(this.navigationActive) {
      const tuning=FLOW_RENDERING.navigation;
      if(this.drawMs>tuning.targetMs*1.15) this.adaptiveScale=Math.max(tuning.minScale,this.renderScale*0.9);
      else if(this.drawMs<tuning.targetMs*0.65) this.adaptiveScale=Math.min(tuning.maxScale,this.renderScale*1.08);
      this.renderScale=this.adaptiveScale;
    }
  }
  Ground(point) {return this.mapData.terrain.heightAt(point[0],point[1]);}
  BeforeDraw(frame) {
    this.frame=frame;this.occlusion.clear();
    const rect=this.canvas.getBoundingClientRect();this.width=rect.width;this.height=rect.height;
    const actor=frame.actors.find(item=>item.id===this.target)||frame.actors[0];
    if(this.type==="eye"&&!this.freeCamera) this.center=[...actor.p];
    this.centerHeight=this.Ground(this.center);
    if(this.freeCamera) {
      this.eye=[...this.freeCamera.eye];
      const {yaw,pitch}=this.freeCamera;
      this.aim=[this.eye[0]+Math.sin(yaw)*Math.cos(pitch)*20,this.eye[1]+Math.sin(pitch)*20,this.eye[2]+Math.cos(yaw)*Math.cos(pitch)*20];
    } else if(this.type==="oblique") {
      const distance=this.far/2;
      this.eye=[this.center[0]+Math.sin(this.yaw)*Math.cos(this.pitch)*distance,this.centerHeight+Math.sin(this.pitch)*distance,this.center[1]+Math.cos(this.yaw)*Math.cos(this.pitch)*distance];
      this.aim=[this.center[0],this.centerHeight,this.center[1]];
    } else {
      const next=SampleBeatRoute(frame.beat,Math.min(1,frame.progress+0.03)),previous=SampleBeatRoute(frame.beat,Math.max(0,frame.progress-0.03));
      const direction=Distance(next,frame.player)>0.01?[next[0]-frame.player[0],next[1]-frame.player[1]]:[frame.player[0]-previous[0],frame.player[1]-previous[1]];
      let heading=Math.hypot(...direction)>0.01?Math.atan2(direction[0],direction[1]):-Math.PI/2;
      const shot=frame.effects.find(effect=>effect.kind==="fire"&&Distance(effect.a,actor.p)<0.1);
      if(shot) heading=Math.atan2(shot.b[0]-actor.p[0],shot.b[1]-actor.p[1]);
      const yaw=this.yaw+heading,base=this.Ground(actor.p)+(actor.elevation||0);
      if(this.type==="eye") {
        const height=actor.kind==="quilt"?0.55:actor.pose==="drag"?0.95:1.6;
        this.eye=[actor.p[0],base+height,actor.p[1]];this.aim=[actor.p[0]+Math.sin(yaw)*20,base+1.25,actor.p[1]+Math.cos(yaw)*20];
      } else {
        const distance=Clamp(125/this.scale,8,120);
        this.eye=[this.center[0]-Math.sin(yaw+0.55)*distance,this.centerHeight+distance*0.52,this.center[1]-Math.cos(yaw+0.55)*distance];
        this.aim=[this.center[0],this.centerHeight+0.8,this.center[1]];
      }
    }
    this.forward=Normalize(this.aim.map((value,index)=>value-this.eye[index]));
    this.right=Normalize(Cross(this.forward,[0,1,0]));this.up=Cross(this.right,this.forward);
    this.fov=this.type==="eye"?Clamp(105-this.scale*4,36,90):65;
    this.focal=this.width/(2*Math.tan(this.fov*Math.PI/360));
    const vehicles=frame.actors.filter(actor=>["tank","cart"].includes(actor.kind)).map(actor=>[actor.p,actor.heading,actor.turret,actor.pose]);
    this.cameraKey=JSON.stringify([this.type,this.yaw,this.pitch,this.eye,this.aim,this.far,this.renderScale,vehicles]);
  }
  Fit(bounds,padding=35) {this.freeCamera=null;super.Fit(bounds,padding);this.scale=Clamp(this.scale,3,12);}
  Follow(frame) {
    this.freeCamera=null;const actor=frame.actors.find(item=>item.id===this.target)||frame.actors[0];this.center=[...actor.p];
    if(this.type==="oblique") this.scale=Clamp(Math.min(this.canvas.clientWidth,this.canvas.clientHeight)/35,3,12);
    else this.scale=this.type==="eye"?8:10;
  }
  CameraPoint(point) {
    const x=point[0]-this.eye[0],y=point[1]-this.eye[1],z=point[2]-this.eye[2];
    return [x*this.right[0]+y*this.right[1]+z*this.right[2],
      x*this.up[0]+y*this.up[1]+z*this.up[2],
      x*this.forward[0]+y*this.forward[1]+z*this.forward[2]];
  }
  Vertex(point) {
    const camera=this.CameraPoint(point);
    if(this.type==="oblique"&&!this.freeCamera) {
      const dx=point[0]-this.center[0],dz=point[2]-this.center[1];
      return {x:this.width/2+(dx*Math.cos(this.yaw)-dz*Math.sin(this.yaw))*this.scale,
        y:this.height*0.57+(dx*Math.sin(this.yaw)+dz*Math.cos(this.yaw))*this.scale*Math.sin(this.pitch)-(point[1]-this.centerHeight)*this.scale*Math.cos(this.pitch),depth:camera[2]};
    }
    return {x:this.width/2+camera[0]*this.focal/camera[2],y:this.height*0.49-camera[1]*this.focal/camera[2],depth:camera[2]};
  }
  Project(point) {const vertex=this.Vertex(point);return vertex.depth<0.15?[-100000,-100000]:[vertex.x,vertex.y];}
  ToScreen(point) {return this.Project([point[0],this.Ground(point),point[1]]);}
  ToWorld(point) {
    const rasterScale=this.raster.coordinateScale||1;
    const depth=this.raster.depth?.[Math.round(point[1]*rasterScale)*this.raster.width+Math.round(point[0]*rasterScale)];
    if(Number.isFinite(depth)) {
      const orthographic=this.type==="oblique"&&!this.freeCamera;
      const x=orthographic?(point[0]-this.width/2)/this.scale:(point[0]-this.width/2)/this.focal*depth;
      const y=orthographic?-(point[1]-this.height*0.57)/this.scale:-(point[1]-this.height*0.49)/this.focal*depth;
      const world=this.eye.map((value,index)=>value+this.right[index]*x+this.up[index]*y+this.forward[index]*depth);
      return [world[0],world[2]];
    }
    const orthographic=this.type==="oblique"&&!this.freeCamera;
    const x=(point[0]-this.width/2)/(orthographic?this.scale:this.focal),y=-(point[1]-this.height*(orthographic?0.57:0.49))/(orthographic?this.scale:this.focal);
    const origin=orthographic?this.eye.map((value,index)=>value+this.right[index]*x+this.up[index]*y):this.eye;
    const direction=orthographic?this.forward:Normalize(this.forward.map((value,index)=>value+this.right[index]*x+this.up[index]*y));
    let previous=0;
    for(let distance=0;distance<=this.far;distance+=distance<100?0.25:1) {
      const world=origin.map((value,index)=>value+direction[index]*distance);
      if(world[1]<=this.Ground([world[0],world[2]])) {
        let low=previous,high=distance;
        for(let iteration=0;iteration<15;iteration++) {
          const middle=(low+high)/2,sample=origin.map((value,index)=>value+direction[index]*middle);
          if(sample[1]<=this.Ground([sample[0],sample[2]])) high=middle;else low=middle;
        }
        return [origin[0]+direction[0]*high,origin[2]+direction[2]*high];
      }
      previous=distance;
    }
    return [...this.center];
  }
  Bounds() {return null;}
  NorthDirection() {return [-this.right[2],this.forward[2]];}
  DrawScale(context,width,height) {Label(context,`远裁剪 ${this.far} m`,18,height-31,"#655e4b",10);}
  FaceVertices(points, vertexColors = null) {
    const orthographic=this.type==="oblique"&&!this.freeCamera;
    const projected=points.map((point,index)=>{
      let vertex;
      if(orthographic) vertex=this.Vertex(point);
      else {
        const camera=this.CameraPoint(point);
        vertex={x:this.width/2+camera[0]*this.focal/camera[2],y:this.height*0.49-camera[1]*this.focal/camera[2],depth:camera[2]};
      }
      if (vertexColors) vertex.rgb = vertexColors[index];
      return vertex;
    });
    if(orthographic||projected.every(vertex=>vertex.depth>=0.15&&vertex.depth<=this.far)) return projected;
    let polygon=points.map((point, index) => {
      const camera = this.CameraPoint(point);
      return vertexColors ? [...camera, ...vertexColors[index]] : camera;
    });
    if(polygon.some(point=>point[2]<0.15||point[2]>this.far)) {
    for(const [edge,sign] of [[0.15,1],[this.far,-1]]) {
      if(polygon.every(point=>(point[2]-edge)*sign>=0)) continue;
      if(polygon.every(point=>(point[2]-edge)*sign<0)) return [];
      const clipped=[];
      for(let index=0;index<polygon.length;index++) {
        const a=polygon[index],b=polygon[(index+1)%polygon.length],insideA=(a[2]-edge)*sign>=0,insideB=(b[2]-edge)*sign>=0;
        if(insideA) clipped.push(a);
        if(insideA!==insideB) {const t=(edge-a[2])/(b[2]-a[2]);clipped.push(a.map((value,axis)=>value+(b[axis]-value)*t));}
      }
      polygon=clipped;if(polygon.length<3) return [];
    }
    }
    return polygon.map(point=>({x:this.width/2+point[0]*this.focal/point[2],y:this.height*0.49-point[1]*this.focal/point[2],depth:point[2],
      ...(vertexColors ? {rgb:point.slice(3)} : {})}));
  }
  DrawBase(context,width,height,frame) {
    const perspective=this.type!=="oblique"||!!this.freeCamera;
    const renderScale=this.renderScale;
    DrawEncounterSky(context,width,height,this);
    this.raster.Begin(width*renderScale,height*renderScale,perspective,renderScale);
    const horizontal=width/(2*this.focal),top=height*0.49/this.focal,bottom=height*0.51/this.focal;
    const horizontalNormal=Math.hypot(1,horizontal),topNormal=Math.hypot(1,top),bottomNormal=Math.hypot(1,bottom);
    const SphereInView=(camera,radius)=>{
      if(camera[2]+radius<0.15||camera[2]-radius>this.far) return false;
      if(perspective) return Math.abs(camera[0])-horizontal*camera[2]<=radius*horizontalNormal
        &&camera[1]-top*camera[2]<=radius*topNormal&&-camera[1]-bottom*camera[2]<=radius*bottomNormal;
      const x=width/2+camera[0]*this.scale,y=height*0.57-camera[1]*this.scale,extent=radius*this.scale;
      return x+extent>=0&&x-extent<=width&&y+extent>=0&&y-extent<=height;
    };
    const Face=(points,color,vertexColors=null)=>{
      const vertices=this.FaceVertices(points,vertexColors);
      if(renderScale!==1) for(const vertex of vertices) {vertex.x*=renderScale;vertex.y*=renderScale;}
      if(vertices.length>=3) this.raster.Face(vertices,color);
    };
    const Visit=(cell)=>{
      const heightRange=cell.maxHeight-cell.minHeight;
      const cx=cell.x+cell.size/2,cz=cell.z+cell.size/2,cy=(cell.minHeight+cell.maxHeight)/2,radius=Math.hypot(cell.size/Math.SQRT2,heightRange/2);
      const camera=this.CameraPoint([cx,cy,cz]);
      if(!SphereInView(camera,radius)) return;
      const projectionScale=(perspective?this.focal/Math.max(0.15,camera[2]-radius):this.scale)*renderScale;
      // Corridor color transitions need detail even where the floor is flat.
      // Shared edge vertices keep both height and shading continuous across LODs.
      if(cell.children&&cell.size*projectionScale>FLOW_RENDERING.terrainCellPixels
        &&(cell.near||heightRange*projectionScale>FLOW_RENDERING.terrainFlatHeightPixels)) {
        for(const child of cell.children) Visit(child);
        return;
      }
      for(const triangle of this.mapData.terrain.facesForCell(cell)) {
        Face(triangle.points,triangle.color,triangle.vertexColors);
      }
    };
    let coverBoxes=[];
    const Box=(x,z,w,d,h,color,y,yaw=0,cover=false,owner=null)=>{
      let geometry=owner&&this.boxGeometry.get(owner);
      if(!geometry||geometry.x!==x||geometry.z!==z||geometry.w!==w||geometry.d!==d||geometry.h!==h||geometry.y!==y||geometry.yaw!==yaw) {
        const cosine=Math.cos(yaw),sine=Math.sin(yaw);
        const Point=(dx,dy,dz)=>[x+dx*cosine+dz*sine,y+dy,z-dx*sine+dz*cosine];
        const bottom=[Point(-w/2,0,-d/2),Point(w/2,0,-d/2),Point(w/2,0,d/2),Point(-w/2,0,d/2)];
        const top=bottom.map(point=>[point[0],point[1]+h,point[2]]);
        geometry={x,z,w,d,h,y,yaw,cosine,sine,bottom,top,points:[...bottom,...top],faces:[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]]};
        if(owner) this.boxGeometry.set(owner,geometry);
      }
      const {cosine,sine,bottom,top}=geometry,projected=new Array(8);
      const BoxFace=(indices,faceColor)=>{
        const vertices=indices.map(index=>{
          if(!projected[index]) {
            const vertex=this.Vertex(geometry.points[index]);
            vertex.x*=renderScale;vertex.y*=renderScale;projected[index]=vertex;
          }
          return projected[index];
        });
        if(perspective&&vertices.some(vertex=>vertex.depth<0.15||vertex.depth>this.far)) Face(indices.map(index=>geometry.points[index]),faceColor);
        else this.raster.Face(vertices,faceColor);
      };
      const dx=this.eye[0]-x,dz=this.eye[2]-z,localX=dx*cosine-dz*sine,localZ=dx*sine+dz*cosine;
      const outside=this.eye[1]>=y&&(this.eye[1]>=y+h||Math.abs(localX)>w/2||Math.abs(localZ)>d/2);
      const visibleSides=[localZ<-d/2,localX>w/2,localZ>d/2,localX<-w/2];
      for(let index=0;index<4;index++) if(!outside||visibleSides[index]) BoxFace(geometry.faces[index],color);
      if(!outside||this.eye[1]>=y+h) BoxFace(geometry.faces[4],cover?FLOW_COVER_COLORS.top:color);
      if(cover) coverBoxes.push({bottom,top});
    };
    const signals=EncounterSignals(frame);
    const staticKey=JSON.stringify([width,height,this.type,this.center,this.scale,this.yaw,this.pitch,this.eye,this.aim,this.far,renderScale,[...signals]]);
    const cacheStatic=this.frameDrawing&&!this.navigationActive;
    const cached=cacheStatic&&staticKey===this.staticKey&&this.staticObjects===this.mapData.objects&&this.staticFarObjects===this.mapData.farObjects;
    if(cached) {
      this.raster.image.data.set(this.staticImage);this.raster.depth.set(this.staticDepth);
      this.terrainTriangles=this.staticTerrainTriangles;this.raster.triangles=this.staticTriangles;
      coverBoxes=this.staticCoverBoxes;
    } else {
    for(const root of this.mapData.terrain.roots) Visit(root);
    this.terrainTriangles=this.raster.triangles;
    for(const object of [...this.mapData.objects,...this.mapData.farObjects]) {
      if(!VisibleEncounterObject(object,signals)) continue;
      const [x,y,z]=object.pos,[w,h,d]=object.size||[1,1,1];
      if(Math.max(w,d)<0.4) continue;
      const base=object.planning?this.Ground([x,z]):Number.isFinite(y)?y-h/2:this.Ground([x,z]);
      const camera=this.CameraPoint([x,base+h/2,z]),radius=Math.hypot(w,h,d)/2;
      if(!SphereInView(camera,radius)) continue;
      if(perspective&&Math.max(w,h,d)*this.focal*renderScale/Math.max(1,camera[2])<0.7) continue;
      const cover=IsEncounterCover(object);
      Box(x,z,w,d,h,cover?FLOW_COVER_COLORS.side:FLOW_MATERIAL_COLORS[object.material]||"#b8a786",base,(object.yawDeg||0)*Math.PI/180,cover,object);
    }
    if(cacheStatic) {
      if(this.staticImage?.length!==this.raster.image.data.length) {
        this.staticImage=new Uint8ClampedArray(this.raster.image.data.length);this.staticDepth=new Float32Array(this.raster.depth.length);
      }
      this.staticImage.set(this.raster.image.data);this.staticDepth.set(this.raster.depth);
      this.staticKey=staticKey;this.staticObjects=this.mapData.objects;this.staticFarObjects=this.mapData.farObjects;
      this.staticCoverBoxes=coverBoxes;this.staticTerrainTriangles=this.terrainTriangles;this.staticTriangles=this.raster.triangles;
    }
    }
    for(const actor of frame.actors.filter(item=>["tank","cart"].includes(item.kind))) {
      const [x,z]=actor.p,ground=this.Ground(actor.p),yaw=-(actor.heading||0);
      if(actor.kind==="cart") {
        Box(x,z,1.4,2.5,0.22,"#ad8e65",ground+0.72,yaw);
        for(const side of [-1,1]) {
          const sx=x+Math.cos(actor.heading||0)*side*0.66,sz=z+Math.sin(actor.heading||0)*side*0.66;
          Box(sx,sz,0.08,2.5,0.28,"#9b7952",ground+0.94,yaw);
          Box(x+Math.cos(actor.heading||0)*side*0.79,z+Math.sin(actor.heading||0)*side*0.79,0.16,0.92,0.92,"#776b55",ground+0.05,yaw);
        }
      } else {
        Box(x,z,1.62,3.08,0.85,actor.pose==="burn"?"#99623e":"#747d58",ground+0.2,yaw);
        for(const side of [-1,1]) Box(x+Math.cos(actor.heading||0)*side*0.8,z+Math.sin(actor.heading||0)*side*0.8,0.3,3.1,0.5,"#50583f",ground+0.05,yaw);
        Box(x,z,0.9,0.9,0.55,"#949d72",ground+1.05,-(actor.turret||0));
        const turret=actor.turret||0;
        Box(x+Math.sin(turret)*0.9,z-Math.cos(turret)*0.9,0.13,1.8,0.13,"#696f59",ground+1.28,-turret);
      }
    }
    for (const actor of frame.actors.filter(item => item.carryingAmmo)) {
      Box(actor.p[0],actor.p[1]+0.25,0.8,0.5,0.45,"#94774f",this.Ground(actor.p)+0.8,0);
    }
    this.raster.Flush(context,width,height);
    for (const {bottom, top} of coverBoxes) {
      const Stroke = (a, b, color, lineWidth) => {
        const vertices = this.FaceVertices([a, b, b]);
        if (vertices.length >= 2) {
          this.raster.Stroke(context, vertices[0], vertices[1], color, lineWidth, {visible:0, hidden:0}, 0);
        }
      };
      for (let index = 0; index < 4; index++) {
        Stroke(top[index], top[(index + 1) % 4], FLOW_COVER_COLORS.edge, 1.6);
        Stroke(bottom[index], top[index], FLOW_COVER_COLORS.edge, 1.2);
      }
      for (const fraction of [0.25, 0.5, 0.75]) {
        const a = top[0].map((value, axis) => value + (top[1][axis] - value) * fraction);
        const b = top[3].map((value, axis) => value + (top[2][axis] - value) * fraction);
        Stroke(a, b, FLOW_COVER_COLORS.mark, 1.5);
      }
      const center = top[0].map((value, axis) => (value + top[2][axis]) / 2);
      const vertex = this.Vertex(center);
      const corners = top.map(point => this.Vertex(point));
      const span = Math.max(...corners.map(point => point.x)) - Math.min(...corners.map(point => point.x));
      if (vertex.depth > 0.15 && vertex.depth < this.far && !this.raster.Occluded(vertex) && span >= 8) {
        DrawCoverSymbol(context, [vertex.x, vertex.y]);
      }
    }
  }
  VisibleActor(actor) {return !(this.type==="eye"&&!this.freeCamera&&actor.id===this.target);}
  DrawArea(context,area,color,label,selection,hit) {
    const [x,z]=area.center,[w,d]=area.size;
    const corners=area.shape==="circle"?Array.from({length:48},(_,index)=>[x+Math.cos(index/48*Math.PI*2)*w/2,z+Math.sin(index/48*Math.PI*2)*w/2])
      :[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
    const outline=corners.flatMap((a,index)=>{
      const b=corners[(index+1)%corners.length],steps=Math.max(1,Math.min(64,Math.ceil(Distance(a,b)/2)));
      return Array.from({length:steps},(_,step)=>[a[0]+(b[0]-a[0])*step/steps,a[1]+(b[1]-a[1])*step/steps]);
    });
    const vertices=this.FaceVertices(outline.map(point=>[point[0],this.Ground(point)+0.03,point[1]]));
    if(vertices.length<3) return;
    const points=vertices.map(point=>[point.x,point.y]),p=this.ToScreen(area.center);
    context.setLineDash(selection?[]:[5,4]);Polygon(context,points,color+"12",color);context.setLineDash([]);
    this.hits.push({...hit,screen:p,radius:12,area});
    if(label) Label(context,label,p[0]+10,p[1]-10,color,11,true);
    if(selection) for(const [index,point] of [[0,area.center],[1,[x+w/2,z+d/2]]]) {
      const screen=this.ToScreen(point);context.fillStyle="#ac7a16";context.fillRect(screen[0]-4,screen[1]-4,8,8);
      this.hits.push({...hit,objectType:hit.type,type:"areaHandle",handle:index,screen,radius:9});
    }
  }
  LabelVertex(actor) {return this.Vertex([actor.p[0],this.Ground(actor.p)+(actor.elevation||0)+(actor.kind==="tank"?1.8:actor.kind==="cart"?1.45:0.65),actor.p[1]]);}
  ActorScreen(actor) {const vertex=this.LabelVertex(actor);return vertex.depth<0.15?[-100000,-100000]:[vertex.x,vertex.y];}
  ActorInView(actor) {
    const ground=this.Ground(actor.p)+(actor.elevation||0),points=[this.Vertex([actor.p[0],ground,actor.p[1]]),this.Vertex([actor.p[0],ground+1.8,actor.p[1]])];
    return points.some(point=>point.depth>0.15&&point.depth<this.far&&point.x>-25&&point.x<this.width+25&&point.y>-100&&point.y<this.height+100);
  }
  ActorLabelOpacity(actor) {
    const stats=this.occlusion.get(actor.id);
    const hidden=this.type==="eye"&&!this.freeCamera?0:0.22;
    if(stats&&stats.hidden>0) return stats.visible===0?hidden:0.7;
    const point=this.LabelVertex(actor);
    return this.raster.Occluded(point)?hidden:1;
  }
  OrderActors(actors) {return [...actors].sort((a,b)=>Distance(b.p,this.center)-Distance(a.p,this.center));}
  DrawActor(context,actor,frame) {
    const [x,z]=actor.p,base=this.Ground(actor.p)+(actor.elevation||0),color=FLOW_COLORS[actor.side],stats={visible:0,hidden:0};
    const hiddenAlpha=this.type==="eye"&&!this.freeCamera?0:0.2;
    this.occlusion.set(actor.id,stats);
    const Segment=(a,b,width=2)=>{
      const vertices=this.FaceVertices([a,b,b]);
      if(vertices.length>=2) this.raster.Stroke(context,vertices[0],vertices[1],color,width,stats,hiddenAlpha);
    };
    if(["tank","cart"].includes(actor.kind)) return;
    if(actor.kind==="quilt") {
      const heading=actor.heading||0,Point=(dx,dz)=>[x+dx*Math.cos(heading)-dz*Math.sin(heading),base+0.12,z+dx*Math.sin(heading)+dz*Math.cos(heading)];
      const vertices=this.FaceVertices([Point(-0.4,-0.9),Point(0.4,-0.9),Point(0.4,0.9),Point(-0.4,0.9)]);
      if(vertices.length>=3) this.raster.OverlayFace(context,vertices,"#ba9e7a",stats,hiddenAlpha);return;
    }
    if(actor.kind==="donkey") {
      const heading=actor.heading||0,Point=(side,y,forward)=>[x+Math.cos(heading)*side+Math.sin(heading)*forward,base+y,z+Math.sin(heading)*side-Math.cos(heading)*forward];
      Segment(Point(0,0.8,-0.6),Point(0,0.8,0.6),7);
      for(const side of [-0.2,0.2]) for(const end of [-0.4,0.4]) Segment(Point(side,0.7,end),Point(side,0,end),2);
      Segment(Point(0,0.8,0.5),Point(0,1.25,0.8),4);
      for(const side of [-0.1,0.1]) Segment(Point(side,1.2,0.8),Point(side,1.5,0.75),2);
      return;
    }
    if(actor.pose==="dead") {Segment([x-0.5,base+0.1,z],[x+0.5,base+0.1,z]);return;}
    if(actor.heavy) {
      Segment([x,base+0.85,z],[x,base+0.85,z-1.5],3);
      for(const side of [-0.35,0.35]) Segment([x,base+0.8,z-0.5],[x+side,base,z-0.8]);
    }
    const crouch=actor.heavy||["kneel","drag","down"].includes(actor.pose)?0.65:1,height=actor.kind==="child"?1.05:1.65;
    const gait=["walk","run","drag"].includes(actor.pose)?Math.sin(frame.time*5+x)*0.2:0;
    Segment([x,base+0.55*crouch,z],[x,base+height*0.8*crouch,z],3.5);
    Segment([x,base+0.55*crouch,z],[x-0.2,base+0.02,z+gait],2);Segment([x,base+0.55*crouch,z],[x+0.2,base+0.02,z-gait],2);
    if(actor.pose==="melee") {
      const forward=[Math.sin(actor.heading),-Math.cos(actor.heading)];
      const thrust=0.5+Math.sin(frame.time*12)*0.2;
      const hand=[x+forward[0]*thrust,base+1.05,z+forward[1]*thrust];
      for(const side of [-0.25,0.25]) Segment([x+forward[1]*side,base+1.25,z-forward[0]*side],hand,2);
      Segment([x-forward[0]*0.2,base+1.05,z-forward[1]*0.2],
        [hand[0]+forward[0]*0.45,hand[1],hand[2]+forward[1]*0.45],2);
    } else {
      Segment([x,base+height*0.65*crouch,z],[x-0.4,base+height*0.47*crouch,z+0.15],2);Segment([x,base+height*0.65*crouch,z],[x+0.4,base+height*0.47*crouch,z+0.15],2);
    }
    const head=this.Vertex([x,base+height*0.94*crouch,z]),neck=this.Vertex([x,base+height*0.8*crouch,z]);
    if(head.depth>0.15) this.raster.Head(context,head,Clamp(Math.hypot(head.x-neck.x,head.y-neck.y)*0.75,2.5,7),color,stats,hiddenAlpha);
  }
  DrawFire(context,effect,frame) {
    if(effect.phase>=0.3) return;
    const source=frame.actors.find(actor=>Distance(actor.p,effect.a)<0.1),target=frame.actors.find(actor=>Distance(actor.p,effect.b)<0.1);
    const a=[effect.a[0],this.Ground(effect.a)+(source?.elevation||0)+1.1,effect.a[1]];
    const b=[effect.b[0],this.Ground(effect.b)+(target?.elevation||0)+0.8,effect.b[1]];
    const vertices=this.FaceVertices([a,b,b]);
    if(vertices.length>=2) this.raster.Stroke(context,vertices[0],vertices[1],"#c47b34",1.2,{visible:0,hidden:0},0);
  }
  Diagnostics() {return {renderScale:this.raster.coordinateScale,drawMs:this.drawMs,terrain:this.mapData.terrain.source,terrainTriangles:this.terrainTriangles,triangles:this.raster.triangles,far:this.far,eye:[...this.eye],aim:[...this.aim],actors:[...this.occlusion].map(([id,stats])=>({id,...stats,labelOpacity:this.ActorLabelOpacity(this.frame.actors.find(actor=>actor.id===id))}))};}
}
