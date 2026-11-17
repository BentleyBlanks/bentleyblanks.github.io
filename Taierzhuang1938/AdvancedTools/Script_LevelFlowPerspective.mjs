import { FlowMapView, FLOW_COLORS, FLOW_MATERIAL_COLORS, FLOW_COVER_COLORS, IsEncounterCover, DrawCoverSymbol, EncounterSignals, VisibleEncounterObject, Polygon, Label } from "./Script_LevelFlowView.mjs";
import { Clamp, Distance, SampleBeatRoute } from "./Script_LevelFlowGeometry.mjs";
import { EncounterRaster } from "./Script_LevelFlowRaster.mjs";
import { FLOW_RENDERING, FLOW_ZOOM } from "../Data_Tuning_LevelFlow.mjs";
import { DrawEncounterSky } from "./Script_LevelFlowSky.mjs";
import { SpeechHeadHeight } from "./Script_LevelFlowDialogue.mjs";
import { ApplyEncounterSky } from "./Script_LevelFlowSkyBlend.mjs";
import { EncounterBoxGeometry, CachedEncounterShadows, ShadeEncounterFace } from "./Script_LevelFlowLighting.mjs";

function Normalize(vector) {const length=Math.hypot(...vector)||1;return vector.map(value=>value/length);}
function Cross(a,b) {return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
const sceneGeometry=new WeakMap();

export class FlowPerspectiveView extends FlowMapView {
  constructor(canvas,mapData,type="oblique") {
    super(canvas,mapData);
    this.type=type;this.yaw=type==="oblique"?-0.45:0;this.pitch=0.67;this.target="player";this.scale=10;
    this.far=1500;this.raster=new EncounterRaster();this.occlusion=new Map();this.freeCamera=null;
    // Camera navigation uses the same pixel density and terrain detail as rest.
    this.renderScale=1;
    let geometry=sceneGeometry.get(mapData);
    if(!geometry) {geometry={boxes:new WeakMap(),bases:new WeakMap()};sceneGeometry.set(mapData,geometry);}
    this.boxGeometry=geometry.boxes;
    this.terrainProjection=new WeakMap();this.projectionFrame=0;
    this.groundCache=new Map();this.groundTerrain=mapData.terrain;
    this.objectBases=geometry.bases;
    this.lighting=FLOW_RENDERING.lighting;
  }
  Draw(...args) {
    const start=performance.now();this.frameDrawing=true;
    try {super.Draw(...args);} finally {this.frameDrawing=false;ApplyEncounterSky(null);}
    this.drawMs=performance.now()-start;
  }
  Ground(point) {
    if(this.groundTerrain!==this.mapData.terrain) {this.groundCache.clear();this.groundTerrain=this.mapData.terrain;this.baseKey="";this.terrainBoundaries=null;}
    const key=`${point[0]},${point[1]}`;
    if(this.groundCache.has(key)) return this.groundCache.get(key);
    const height=this.mapData.terrain.heightAt(point[0],point[1]);
    if(this.groundCache.size>=4096) this.groundCache.delete(this.groundCache.keys().next().value);
    this.groundCache.set(key,height);return height;
  }
  BeforeDraw(frame,viewport=null) {
    this.depthPass=(this.depthPass||0)+1;
    this.frame=frame;this.occlusion.clear();
    const rect=viewport||this.canvas.getBoundingClientRect();this.width=rect.width;this.height=rect.height;
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
      if(actor.lookAt) heading=Math.atan2(actor.lookAt[0]-actor.p[0],actor.lookAt[1]-actor.p[1]);
      const yaw=this.yaw+heading,base=(actor.surfaceY??this.Ground(actor.p))+(actor.elevation||0);
      if(this.type==="eye") {
        const height=actor.eyeHeight ?? (actor.kind==="quilt"?0.55:["drag","kneel","crouch"].includes(actor.pose)?0.95:1.6);
        this.eye=[actor.p[0],base+height,actor.p[1]];this.aim=[actor.p[0]+Math.sin(yaw)*20,base+height-0.15,actor.p[1]+Math.cos(yaw)*20];
      } else {
        const distance=Clamp(125/this.scale,FLOW_ZOOM.minChaseDistanceM,120);
        this.eye=[this.center[0]-Math.sin(yaw+0.55)*distance,this.centerHeight+distance*0.52,this.center[1]-Math.cos(yaw+0.55)*distance];
        this.aim=[this.center[0],this.centerHeight+0.8,this.center[1]];
      }
    }
    this.forward=Normalize(this.aim.map((value,index)=>value-this.eye[index]));
    this.right=Normalize(Cross(this.forward,[0,1,0]));this.up=Cross(this.right,this.forward);
    this.fov=this.type==="eye"?Clamp(105-this.scale*4,FLOW_ZOOM.minEyeFovDeg,90):65;
    this.focal=this.width/(2*Math.tan(this.fov*Math.PI/360));
    // Offscreen vehicles must not invalidate both static camera backgrounds on
    // every timeline tick. Include carried boxes too: they also write depth.
    this.solidActors=frame.actors.filter(actor=>(["tank","cart"].includes(actor.kind)||actor.carryingAmmo)&&this.SolidInView(actor));
    const vehicles=this.solidActors.map(actor=>[actor.id,actor.kind,actor.p,actor.heading,actor.turret,actor.pose,!!actor.carryingAmmo]);
    this.cameraKey=JSON.stringify([this.type,this.yaw,this.pitch,this.eye,this.aim,this.far,this.renderScale,vehicles]);
  }
  Fit(bounds,padding=35) {
    this.freeCamera=null;super.Fit(bounds,padding);
    if(this.type==="oblique") this.far=Math.max(this.far,Math.ceil(Math.hypot(bounds[1]-bounds[0],bounds[3]-bounds[2])*1.1/100)*100);
    const {width,height}=this.canvas.getBoundingClientRect(),ground=this.Ground(this.center);
    const corners=[[bounds[0],bounds[2]],[bounds[1],bounds[2]],[bounds[1],bounds[3]],[bounds[0],bounds[3]]];
    const projected=corners.map(point=>{
      const dx=point[0]-this.center[0],dz=point[1]-this.center[1];
      return [dx*Math.cos(this.yaw)-dz*Math.sin(this.yaw),
        (dx*Math.sin(this.yaw)+dz*Math.cos(this.yaw))*Math.sin(this.pitch)-(this.Ground(point)-ground)*Math.cos(this.pitch)];
    });
    const extentX=Math.max(1,...projected.map(point=>Math.abs(point[0]))),extentY=Math.max(1,...projected.map(point=>Math.abs(point[1])));
    // Vertex places the ground center at 57% height, leaving 43% below it.
    this.scale=Clamp(Math.min((width/2-padding)/extentX,(height*0.43-padding)/extentY),0.15,12);
  }
  Follow(frame) {
    const actor=frame.actors.find(item=>item.id===this.target)||frame.actors[0];
    if(this.type==="scene") {
      const anchor=[actor.p[0],(actor.surfaceY??this.Ground(actor.p))+(actor.elevation||0),actor.p[1]];
      if(this.freeCamera&&this.followAnchor) {
        this.freeCamera.eye=this.freeCamera.eye.map((value,axis)=>value+(anchor[axis]-this.followAnchor[axis]));
      }
      this.followAnchor=anchor;this.center=[...actor.p];
      return;
    }
    this.freeCamera=null;this.center=[...actor.p];
    if(this.type==="oblique") this.scale=Clamp(Math.min(this.canvas.clientWidth,this.canvas.clientHeight)/35,3,12);
    else this.scale=this.type==="eye"?8:10;
    this.scale=Clamp(this.scale*(this.followZoom??1),FLOW_ZOOM.minScale,FLOW_ZOOM.maxScale);
  }
  CameraPoint(point,out=null) {
    const x=point[0]-this.eye[0],y=point[1]-this.eye[1],z=point[2]-this.eye[2];
    const result=out||[0,0,0];
    result[0]=x*this.right[0]+y*this.right[1]+z*this.right[2];
    result[1]=x*this.up[0]+y*this.up[1]+z*this.up[2];
    result[2]=x*this.forward[0]+y*this.forward[1]+z*this.forward[2];
    return result;
  }
  SphereInView(camera,radius) {
    if(camera[2]+radius<0.15||camera[2]-radius>this.far) return false;
    if(this.type!=="oblique"||this.freeCamera) {
      const horizontal=this.width/(2*this.focal),top=this.height*0.49/this.focal,bottom=this.height*0.51/this.focal;
      return Math.abs(camera[0])-horizontal*camera[2]<=radius*Math.hypot(1,horizontal)
        &&camera[1]-top*camera[2]<=radius*Math.hypot(1,top)&&-camera[1]-bottom*camera[2]<=radius*Math.hypot(1,bottom);
    }
    const x=this.width/2+camera[0]*this.scale,y=this.height*0.57-camera[1]*this.scale,extent=radius*this.scale;
    return x+extent>=0&&x-extent<=this.width&&y+extent>=0&&y-extent<=this.height;
  }
  SolidInView(actor) {
    // Conservative radius encloses tracks, cart rails and a rotating barrel.
    return this.SphereInView(this.CameraPoint([actor.p[0],this.Ground(actor.p)+1,actor.p[1]]),4);
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
  Project(point) {const vertex=this.Vertex(point);return vertex.depth<0.15||vertex.depth>this.far?[-100000,-100000]:[vertex.x,vertex.y];}
  ToScreen(point) {return this.Project([point[0],this.Ground(point),point[1]]);}
  ProjectPath(points) {
    const paths=[];
    let path=null;
    for(let index=1;index<points.length;index++) {
      const a=points[index-1],b=points[index];
      // Use the same near/far clipping as terrain, actors and fire strokes.
      // Hidden-point screen sentinels must never become polyline endpoints.
      const start=[a[0],this.Ground(a),a[1]],end=[b[0],this.Ground(b),b[1]];
      const vertices=this.FaceVertices([start,end,end]);
      if(vertices.length<2) {path=null;continue;}
      const first=[vertices[0].x,vertices[0].y],last=[vertices[1].x,vertices[1].y];
      if(path&&Distance(path.at(-1),first)<1e-6) path.push(last);
      else {path=[first,last];paths.push(path);}
    }
    return paths;
  }
  ToWorld(point) {
    const rasterScale=this.raster.coordinateScale||1;
    const px=Math.round(point[0]*rasterScale),py=Math.round(point[1]*rasterScale);
    const depth=this.raster.DepthAt?this.raster.DepthAt(px,py):this.raster.depth?.[py*this.raster.width+px];
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
  DrawBase(context,width,height,frame,layers={}) {
    const perspective=this.type!=="oblique"||!!this.freeCamera;
    const renderScale=this.renderScale;
    ApplyEncounterSky(this.aim[2],this.frame.nightBlend||0);
    DrawEncounterSky(context,width,height,this);
    this.raster.Begin(width*renderScale,height*renderScale,perspective,renderScale);
    this.raster.view=this;
    this.raster.resident=this.raster.accelerated;
    this.raster.terrainSurface=this.raster.accelerated?this.mapData.terrain.surfaceMaps?.():null;
    const texturedTerrain=!!this.raster.terrainSurface;
    const projectionFrame=++this.projectionFrame;
    const TerrainVertex=(point,rgb)=>{
      let cached=this.terrainProjection.get(point);
      if(!cached) {cached={frame:0,vertex:null};this.terrainProjection.set(point,cached);}
      if(cached.frame!==projectionFrame) {
        const vertex=this.Vertex(point);
        vertex.x*=renderScale;vertex.y*=renderScale;vertex.rgb=rgb;
        cached.vertex=vertex;cached.frame=projectionFrame;
      }
      return cached.vertex;
    };
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
    const terrainCells=[];
    const terrainCamera=[0,0,0],objectPoint=[0,0,0],objectCamera=[0,0,0];
    const Visit=(cell)=>{
      const heightRange=cell.maxHeight-cell.minHeight,radius=cell.radius;
      const camera=this.CameraPoint(cell.center,terrainCamera);
      if(!SphereInView(camera,radius)) return;
      const projectionScale=(perspective?this.focal/Math.max(0.15,camera[2]-radius):this.scale)*renderScale;
      let heightError=cell.heightError??heightRange;
      if(heightError*projectionScale>FLOW_RENDERING.terrainFlatHeightPixels&&this.mapData.terrain.heightErrorForCell) {
        heightError=this.mapData.terrain.heightErrorForCell(cell,FLOW_RENDERING.terrainFlatHeightPixels/projectionScale);
      }
      // Preserve projected relief error, while planar slopes can stay coarse.
      // Surface colors use a separate projected cell-size threshold.
      if(cell.children&&(heightError*projectionScale>FLOW_RENDERING.terrainFlatHeightPixels
        ||!texturedTerrain&&cell.size*projectionScale>FLOW_RENDERING.terrainCellPixels
          &&cell.size>1&&(cell.near||cell.painted&&cell.size*projectionScale>FLOW_RENDERING.terrainPaintCellPixels)
            &&(!this.mapData.terrain.colorRangeForCell||this.mapData.terrain.colorRangeForCell(cell)>1))) {
        for(const child of cell.children) Visit(child);
        return;
      }
      terrainCells.push(cell);
    };
    const DrawTerrainCell=(cell,boundaries)=>{
      if(this.raster.accelerated&&this.mapData.terrain.packedFacesForCell) {
        this.raster.WorldBatch(this.mapData.terrain.packedFacesForCell(cell,texturedTerrain,boundaries));return;
      }
      for(const triangle of this.mapData.terrain.facesForCell(cell,boundaries)) {
        if(this.raster.accelerated) {this.raster.WorldTriangle(triangle.points,triangle.vertexColors,triangle.vertexNormals);continue;}
        const a=TerrainVertex(triangle.points[0],triangle.vertexColors[0]);
        const b=TerrainVertex(triangle.points[1],triangle.vertexColors[1]);
        const c=TerrainVertex(triangle.points[2],triangle.vertexColors[2]);
        if(!perspective||(a.depth>=0.15&&a.depth<=this.far&&b.depth>=0.15&&b.depth<=this.far&&c.depth>=0.15&&c.depth<=this.far)) {
          this.raster.Triangle(a,b,c,triangle.color);
        } else Face(triangle.points,triangle.color,triangle.vertexColors);
      }
    };
    let coverBoxes=[];
    const Box=(x,z,w,d,h,color,y,yaw=0,cover=false,owner=null,part="Body")=>{
      // Roof tops and fascia share authored planes with lintels and wall piers.
      const separation=owner?.material==="Whitebox/Roof"?FLOW_RENDERING.roofSurfaceSeparationM:0;
      w+=separation*2;d+=separation*2;h+=separation;
      let boxes=owner&&this.boxGeometry.get(owner);
      if(owner&&!boxes) {boxes=new Map();this.boxGeometry.set(owner,boxes);}
      let geometry=boxes&&boxes.get(part);
      if(!geometry||geometry.x!==x||geometry.z!==z||geometry.w!==w||geometry.d!==d||geometry.h!==h||geometry.y!==y||geometry.yaw!==yaw) {
        geometry=EncounterBoxGeometry(x,y,z,w,h,d,yaw);
        geometry.shading=[];
        if(boxes) boxes.set(part,geometry);
      }
      const {cosine,sine,bottom,top}=geometry,projected=new Array(8);
      const BoxFace=(faceIndex,faceColor)=>{
        const indices=geometry.faces[faceIndex];
        let shaded=geometry.shading[faceIndex];
        if(!shaded||shaded.color!==faceColor||shaded.lit!==!!this.lighting||shaded.sky!==FLOW_RENDERING.skyBlend) {
          const rgb=this.lighting?ShadeEncounterFace(faceColor,geometry.normals[faceIndex]):[1,3,5].map(index=>parseInt(faceColor.slice(index,index+2),16));
          shaded={color:faceColor,lit:!!this.lighting,sky:FLOW_RENDERING.skyBlend,rgb};geometry.shading[faceIndex]=shaded;
        }
        const rgb=shaded.rgb;
        if(this.raster.accelerated) {
          if(!owner) {
            for(const triangle of [[0,1,2],[0,2,3]]) this.raster.WorldTriangle(triangle.map(index=>geometry.points[indices[index]]),[rgb,rgb,rgb]);
            return;
          }
          if(!shaded.vertices) {
            shaded.vertices=new Float32Array(54);
            for(const [vertex,index] of [0,1,2,0,2,3].entries()) {
              shaded.vertices.set(geometry.points[indices[index]],vertex*9);shaded.vertices.set(rgb,vertex*9+3);
            }
          }
          this.raster.WorldBatch(shaded.vertices);
          return;
        }
        const vertices=indices.map(index=>{
          if(!projected[index]) {
            const vertex=this.Vertex(geometry.points[index]);
            vertex.x*=renderScale;vertex.y*=renderScale;projected[index]=vertex;
          }
          return {...projected[index],rgb};
        });
        if(perspective&&vertices.some(vertex=>vertex.depth<0.15||vertex.depth>this.far)) Face(indices.map(index=>geometry.points[index]),faceColor,indices.map(()=>rgb));
        else this.raster.Face(vertices,faceColor);
      };
      const dx=this.eye[0]-x,dz=this.eye[2]-z,localX=dx*cosine-dz*sine,localZ=dx*sine+dz*cosine;
      const outside=this.eye[1]>=y&&(this.eye[1]>=y+h||Math.abs(localX)>w/2||Math.abs(localZ)>d/2);
      const visibleSides=[localZ<-d/2,localX>w/2,localZ>d/2,localX<-w/2];
      for(let index=0;index<4;index++) if(!outside||visibleSides[index]) BoxFace(index,color);
      if(!outside||this.eye[1]>=y+h) BoxFace(4,cover?FLOW_COVER_COLORS.top:color);
      if(this.eye[1]<y&&(owner?.meta?.holeRoof||owner?.material==="Whitebox/Roof")) {
        Face([...bottom].reverse(),color,Array(4).fill(this.lighting?ShadeEncounterFace(color,[0,-1,0]):[1,3,5].map(index=>parseInt(color.slice(index,index+2),16))));
      }
      if(cover) coverBoxes.push({bottom,top});
    };
    const signals=EncounterSignals(frame);
    const shadowKey=JSON.stringify([...signals]);
    if(this.shadowKey!==shadowKey||this.shadowTerrain!==this.mapData.terrain||this.shadowObjects!==this.mapData.objects||this.shadowFarObjects!==this.mapData.farObjects) {
      this.shadowVertices=CachedEncounterShadows(this.mapData,signals,point=>this.Ground(point));
      this.shadowKey=shadowKey;this.shadowObjects=this.mapData.objects;this.shadowFarObjects=this.mapData.farObjects;
      this.shadowTerrain=this.mapData.terrain;
    }
    this.raster.shadowVertices=this.shadowVertices;
    const staticKey=JSON.stringify([width,height,this.type,this.center,this.scale,this.yaw,this.pitch,this.eye,this.aim,this.far,renderScale,texturedTerrain,FLOW_RENDERING.skyBlend,[...signals]]);
    const cacheStatic=this.frameDrawing&&!this.navigationActive;
    const cached=cacheStatic&&staticKey===this.staticKey&&this.staticTerrain===this.mapData.terrain&&this.staticAccelerated===this.raster.accelerated&&this.staticObjects===this.mapData.objects&&this.staticFarObjects===this.mapData.farObjects;
    if(cached) {
      if(this.raster.accelerated) {
        this.raster.worldBatches=this.staticWorldBatches;
        this.raster.worldVertices.set(this.staticWorldVertices.subarray(0,this.staticWorldLength));this.raster.worldLength=this.staticWorldLength;
        this.raster.gpuVertices.set(this.staticGpuVertices.subarray(0,this.staticGpuLength));this.raster.gpuLength=this.staticGpuLength;
      } else {this.raster.image.data.set(this.staticImage);this.raster.depth.set(this.staticDepth);}
      this.terrainTriangles=this.staticTerrainTriangles;this.raster.triangles=this.staticTriangles;
      coverBoxes=this.staticCoverBoxes;
    } else {
    for(const root of this.mapData.terrain.roots) Visit(root);
    const terrainBoundaries=this.mapData.terrain.boundariesForCells?.(terrainCells,this.terrainBoundaries||{});
    this.terrainBoundaries=terrainBoundaries;
    for(const cell of terrainCells) DrawTerrainCell(cell,terrainBoundaries);
    this.terrainTriangles=this.raster.triangles;
    for(const object of [...this.mapData.objects,...this.mapData.farObjects]) {
      if(!VisibleEncounterObject(object,signals)) continue;
      const [x,y,z]=object.pos,[w,h,d]=object.size||[1,1,1];
      if(Math.max(w,h,d)<0.4&&!object.meta?.detail) continue;
      let anchor=this.objectBases.get(object);
      if(!anchor||anchor.terrain!==this.mapData.terrain||anchor.x!==x||anchor.y!==y||anchor.z!==z||anchor.planning!==object.planning) {
        const base=object.planning?this.Ground([x,z]):Number.isFinite(y)?y:this.Ground([x,z]);
        anchor={terrain:this.mapData.terrain,x,y,z,planning:object.planning,base};
        this.objectBases.set(object,anchor);
      }
      const base=anchor.base;
      objectPoint[0]=x;objectPoint[1]=base+h/2;objectPoint[2]=z;
      const camera=this.CameraPoint(objectPoint,objectCamera),radius=Math.hypot(w,h,d)/2;
      if(!SphereInView(camera,radius)) continue;
      if(perspective&&Math.max(w,h,d)*this.focal*renderScale/Math.max(1,camera[2])<0.7) continue;
      const cover=IsEncounterCover(object);
      if (object.material === "Whitebox/Foliage" && h >= FLOW_RENDERING.tree.minHeightM) {
        const tree = FLOW_RENDERING.tree, yaw = (object.yawDeg || 0) * Math.PI / 180;
        const crown = Math.min(tree.crownMaxM, h * tree.crownWidthRatio);
        Box(x,z,Math.min(w,tree.trunkMaxM),Math.min(d,tree.trunkMaxM),h,"#8b795f",base,yaw,false,object,"Trunk");
        Box(x,z,Math.max(w,crown),Math.max(d,crown),h*(1-tree.crownBaseRatio),
          FLOW_MATERIAL_COLORS["Whitebox/Foliage"],base+h*tree.crownBaseRatio,yaw,false,object,"Crown");
        continue;
      }
      if (object.meta?.obstacle === "barbedWire") {
        const yaw=(object.yawDeg||0)*Math.PI/180;
        for (const height of [0.25,0.55,0.85]) Box(x,z,w,0.055,0.045,"#5d685a",base+height,yaw,false,object,`Wire${height}`);
        for (let offset=-w/2+0.6;offset<w/2;offset+=1.3) {
          const bx=x+Math.cos(yaw)*offset,bz=z-Math.sin(yaw)*offset;
          Box(bx,bz,0.65,d,0.06,"#68705d",base+0.55,yaw+0.65,false,object,`Cross${offset}`);
        }
        continue;
      }
      Box(x,z,w,d,h,cover?FLOW_COVER_COLORS.side:object.params?.color||FLOW_MATERIAL_COLORS[object.material]||"#b8a786",base+(object.params?.lift||0),(object.yawDeg||0)*Math.PI/180,cover,object);
    }
    if(cacheStatic) {
      if(this.raster.accelerated) {
        this.staticWorldBatches=[...this.raster.worldBatches];
        this.raster.worldBatches=this.staticWorldBatches;
        if(this.staticWorldVertices?.length!==this.raster.worldVertices.length) this.staticWorldVertices=new Float32Array(this.raster.worldVertices.length);
        if(this.staticGpuVertices?.length!==this.raster.gpuVertices.length) this.staticGpuVertices=new Float32Array(this.raster.gpuVertices.length);
        this.staticWorldLength=this.raster.worldLength;this.staticGpuLength=this.raster.gpuLength;
        this.staticWorldVertices.set(this.raster.worldVertices.subarray(0,this.staticWorldLength));
        this.staticGpuVertices.set(this.raster.gpuVertices.subarray(0,this.staticGpuLength));
      } else {
      if(this.staticImage?.length!==this.raster.image.data.length) {
        this.staticImage=new Uint8ClampedArray(this.raster.image.data.length);this.staticDepth=new Float32Array(this.raster.depth.length);
      }
      this.staticImage.set(this.raster.image.data);this.staticDepth.set(this.raster.depth);
      }
      this.staticAccelerated=this.raster.accelerated;
      this.staticTerrain=this.mapData.terrain;
      this.staticKey=staticKey;this.staticObjects=this.mapData.objects;this.staticFarObjects=this.mapData.farObjects;
      this.staticCoverBoxes=coverBoxes;this.staticTerrainTriangles=this.terrainTriangles;this.staticTriangles=this.raster.triangles;
    }
    }
    for(const actor of frame.actors.filter(item=>["tank","cart"].includes(item.kind)&&this.SolidInView(item))) {
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
    for (const actor of frame.actors.filter(item => item.carryingAmmo&&this.SolidInView(item))) {
      Box(actor.p[0],actor.p[1]+0.25,0.8,0.5,0.45,"#94774f",this.Ground(actor.p)+0.8,0);
    }
    this.PrepareDepth(frame,layers,coverBoxes);
    this.raster.Flush(context,width,height);
    this.DrawWallWriting(context,frame);
    this.DrawCoverBoxes(context,coverBoxes);
    if(layers.landmarks!==false) this.DrawLandmarks(context,width,height);
  }

  PrepareDepth(frame,layers,coverBoxes=[]) {
    this.raster.CollectDepthSamples(()=>{
      this.DrawCoverBoxes(null,coverBoxes);
      for(const actor of frame.actors) {
        if(!this.ActorInView(actor)||!this.VisibleActor(actor)) continue;
        this.DrawActor(null,actor,frame);
        this.raster.Occluded(this.LabelVertex(actor));
      }
      if(layers.fire) for(const effect of frame.effects) if(effect.kind==="fire") this.DrawFire(null,effect,frame);
      if(layers.landmarks!==false)this.DrawLandmarks(null,this.width,this.height);
      this.DrawWallWriting(null,frame);
    });
    this.occlusion.clear();
    this.depthPreparedPass=this.depthPass;
  }

  LandmarkAnchor(landmark) {
    const ground=this.Ground(landmark.p);
    const y=Math.max(ground+.65,Number.isFinite(landmark.y)?landmark.y:ground);
    return this.Vertex([landmark.p[0],y,landmark.p[1]]);
  }

  DrawWallWriting(context,frame) {
    const signals=EncounterSignals(frame);
    for(const object of this.mapData.objects) {
      const text=object.meta?.slogan;if(!text||!VisibleEncounterObject(object,signals))continue;
      const [x,y,z]=object.pos,[w,h,d]=object.size,yaw=(object.yawDeg||0)*Math.PI/180;
      if(Math.hypot(x-this.eye[0],z-this.eye[2])>70)continue;
      const c=Math.cos(yaw),s=Math.sin(yaw),side=((this.eye[0]-x)*s+(this.eye[2]-z)*c)>=0?1:-1;
      const Point=(u,v)=>[x+u*c+side*(d/2+.035)*s,y+v,z-u*s+side*(d/2+.035)*c];
      const chars=[...text],step=Math.min(w/(chars.length+.5),h*.88),start=-(chars.length-1)*step/2;
      for(const [index,char] of chars.entries()) {
        const u=(start+index*step)*side,center=this.Vertex(Point(u,h*.5));
        if(center.depth<.15||center.depth>this.far)continue;
        const hidden=this.raster.Occluded(center);if(!context||this.raster.collectingDepth||hidden)continue;
        const left=this.Vertex(Point(u-side*step*.44,h*.88)),right=this.Vertex(Point(u+side*step*.44,h*.88)),bottom=this.Vertex(Point(u-side*step*.44,h*.12));
        if([left,right,bottom].some(p=>p.depth<.15))continue;
        context.save();context.transform(right.x-left.x,right.y-left.y,bottom.x-left.x,bottom.y-left.y,left.x,left.y);
        context.font='bold 1px "Microsoft YaHei",sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillStyle='#32291e';context.fillText(char,.5,.54,1);context.restore();
      }
    }
  }

  BeforeOverlays(frame,layers) {
    if(!this.raster.accelerated||!this.raster.sparseDepth) return;
    if(this.depthPreparedPass!==this.depthPass) this.PrepareDepth(frame,layers);
    this.raster.gpu.ReadDepthSamples(this.raster);
  }

  DrawCoverBoxes(context,coverBoxes) {
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
      if (vertex.depth > 0.15 && vertex.depth < this.far && !this.raster.Occluded(vertex) && span >= 8 && !this.raster.collectingDepth) {
        DrawCoverSymbol(context, [vertex.x, vertex.y]);
      }
    }
  }
  SpeechAnchor(actor) {
    const head = this.Vertex([actor.p[0], (actor.surfaceY ?? this.Ground(actor.p)) + (actor.elevation || 0) + SpeechHeadHeight(actor), actor.p[1]]);
    return head.depth > 0.15 && head.depth < this.far ? [head.x, head.y] : null;
  }
  VisibleActor(actor) {return !(this.type==="eye"&&!this.freeCamera&&actor.id===this.target);}
  EffectScreen(effect) {
    const point=this.Vertex([effect.p[0],this.Ground(effect.p)+(effect.elevation||0),effect.p[1]]);
    return point.depth>0.15&&point.depth<this.far?[point.x,point.y]:null;
  }
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

  }
  LabelVertex(actor) {return this.Vertex([actor.p[0],(actor.surfaceY??this.Ground(actor.p))+(actor.elevation||0)+(actor.kind==="tank"?1.8:actor.kind==="cart"?1.45:0.65),actor.p[1]]);}
  ActorScreen(actor) {const vertex=this.LabelVertex(actor);return vertex.depth<0.15?[-100000,-100000]:[vertex.x,vertex.y];}
  ActorInView(actor) {
    const ground=(actor.surfaceY??this.Ground(actor.p))+(actor.elevation||0),points=[this.Vertex([actor.p[0],ground,actor.p[1]]),this.Vertex([actor.p[0],ground+1.8,actor.p[1]])];
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
    const [x,z]=actor.p,base=(actor.surfaceY??this.Ground(actor.p))+(actor.elevation||0),color=FLOW_COLORS[actor.side],stats={visible:0,hidden:0};
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
      if(actor.tetherTo) Segment(Point(0,1.1,0.8),[actor.tetherTo[0],this.Ground(actor.tetherTo)+0.7,actor.tetherTo[1]],1);
      return;
    }
    if(actor.fallProgress !== undefined) {
      const angle=actor.fallProgress*Math.PI/2;
      const Point=(side,height)=>[x+side,base+0.1+height*Math.cos(angle),z-height*Math.sin(angle)];
      Segment(Point(0,0.55),Point(0,1.3),3.5);
      for(const side of [-1,1]) {
        Segment(Point(0,0.55),Point(side*0.22,0),2);
        Segment(Point(0,1.05),Point(side*0.4,0.75),2);
      }
      const head=this.Vertex(Point(0,1.55)),neck=this.Vertex(Point(0,1.3));
      if(head.depth>0.15) this.raster.Head(context,head,Clamp(Math.hypot(head.x-neck.x,head.y-neck.y)*0.75,2.5,7),color,stats,hiddenAlpha);
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
    if(actor.id==="liu" && frame.stealth?.pulling) {
      const player=frame.actors.find(item=>item.id==="player");
      Segment([x,base+1.1,z],[player.p[0]+0.15,this.Ground(player.p)+frame.stealth.eyeHeight-0.25,player.p[1]+0.3],3);
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
  Diagnostics() {return {backend:this.raster.accelerated?"webgl2":"software",renderScale:this.raster.coordinateScale,drawMs:this.drawMs,terrain:this.mapData.terrain.source,terrainTriangles:this.terrainTriangles,triangles:this.raster.triangles,far:this.far,eye:[...this.eye],aim:[...this.aim],actors:[...this.occlusion].map(([id,stats])=>({id,...stats,labelOpacity:this.ActorLabelOpacity(this.frame.actors.find(actor=>actor.id===id))}))};}
}
