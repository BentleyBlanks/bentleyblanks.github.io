import { FLOW_RENDERING } from "../Data_Tuning_LevelFlow.mjs";
import { VisibleEncounterObject } from "./Script_LevelFlowView.mjs";

export function EncounterBoxGeometry(x,y,z,w,h,d,yaw=0) {
  const cosine=Math.cos(yaw),sine=Math.sin(yaw);
  const Point=(dx,dy,dz)=>[x+dx*cosine+dz*sine,y+dy,z-dx*sine+dz*cosine];
  const bottom=[Point(-w/2,0,-d/2),Point(w/2,0,-d/2),Point(w/2,0,d/2),Point(-w/2,0,d/2)];
  const top=bottom.map(point=>[point[0],point[1]+h,point[2]]);
  return {x,y,z,w,h,d,yaw,cosine,sine,bottom,top,points:[...bottom,...top],
    faces:[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]],
    normals:[[0,0,-1],[1,0,0],[0,0,1],[-1,0,0],[0,1,0]].map(([nx,ny,nz])=>[nx*cosine+nz*sine,ny,-nx*sine+nz*cosine])};
}

export function ShadeEncounterFace(color,normal) {
  const sun=FLOW_RENDERING.sky.sunDirection,length=Math.hypot(...sun);
  const diffuse=Math.max(0,normal.reduce((sum,value,axis)=>sum+value*sun[axis]/length,0));
  const light=FLOW_RENDERING.lighting.ambient+FLOW_RENDERING.lighting.direct*diffuse;
  return [1,3,5].map(index=>parseInt(color.slice(index,index+2),16)*light);
}

// Include offscreen walls and roofs, so a doorway or an interior stays shaded
// when its occluder leaves the camera. Event visibility uses the drawing rules.
export function EncounterShadowGeometry(objects,signals,ground) {
  const vertices=[];
  for(const object of objects) {
    if(!VisibleEncounterObject(object,signals)||object.material==="Whitebox/Water"||object.meta?.obstacle==="barbedWire") continue;
    const [x,y,z]=object.pos,[w,h,d]=object.size||[1,1,1];
    if(h<0.15||Math.max(w,h,d)<0.4) continue;
    const base=(object.planning?ground([x,z]):Number.isFinite(y)?y:ground([x,z]))+(object.params?.lift||0);
    const yaw=(object.yawDeg||0)*Math.PI/180,tree=FLOW_RENDERING.tree;
    const boxes=[];
    if(object.material==="Whitebox/Foliage"&&h>=tree.minHeightM) {
      const crown=Math.min(tree.crownMaxM,h*tree.crownWidthRatio);
      boxes.push(EncounterBoxGeometry(x,base,z,Math.min(w,tree.trunkMaxM),h,Math.min(d,tree.trunkMaxM),yaw));
      boxes.push(EncounterBoxGeometry(x,base+h*tree.crownBaseRatio,z,Math.max(w,crown),h*(1-tree.crownBaseRatio),Math.max(d,crown),yaw));
    } else {
      const separation=object.material==="Whitebox/Roof"?FLOW_RENDERING.roofSurfaceSeparationM:0;
      boxes.push(EncounterBoxGeometry(x,base,z,w+separation*2,h+separation,d+separation*2,yaw));
    }
    for(const box of boxes) for(const [a,b,c,d] of box.faces) for(const index of [a,b,c,a,c,d]) vertices.push(...box.points[index]);
  }
  return new Float32Array(vertices);
}
