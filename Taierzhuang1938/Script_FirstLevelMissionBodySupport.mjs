import * as THREE from "three";
import { MISSION_BODY_SUPPORT as C } from "./Data_Tuning_FirstLevel.mjs";

// Load-time contact solver. Shared posed geometry stays shared; each casualty only
// receives a rigid instance matrix. The temporary support field is discarded at boot.
export function CreateBodyContactShape(parts) {
  const cells=new Map(),bounds=new THREE.Box3(),vertices=[];
  for(const part of parts){
    const geometry=part.tiers?.[0]||part.geometry,pos=geometry.attributes.position;
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox);vertices.push(pos);
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),key=`${Math.floor(x/C.sampleCellM)},${Math.floor(z/C.sampleCellM)}`;
      const old=cells.get(key);
      if(!old||y<old.y)cells.set(key,new THREE.Vector3(x,y,z));
    }
  }
  return {samples:[...cells.values()],vertices,bounds};
}

export class MissionBodySupport {
  constructor(groundAt){this.groundAt=groundAt;this.cells=new Map();this.point=new THREE.Vector3();}
  Key(x,z){return `${Math.floor(x/C.stackCellM)},${Math.floor(z/C.stackCellM)}`;}
  Height(x,z){return Math.max(this.groundAt(x,z),this.cells.get(this.Key(x,z))??-Infinity);}
  Settle(shape,spec){
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),euler=new THREE.Euler(),scale=new THREE.Vector3().setScalar(spec.scale);
    const position=new THREE.Vector3(spec.x,0,spec.z),point=this.point,center=shape.bounds.getCenter(new THREE.Vector3());
    let potential=0;
    const Evaluate=(pitch,roll,attributes=false)=>{
      rotation.setFromEuler(euler.set(pitch,spec.yaw,roll,"YXZ"));matrix.compose(position,rotation,scale);
      let lift=-Infinity;
      const Sample=()=>{point.applyMatrix4(matrix);const height=spec.pile?this.Height(point.x,point.z):this.groundAt(point.x,point.z);
        lift=Math.max(lift,height-point.y);};
      if(attributes){for(const pos of shape.vertices)for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i);Sample();}}
      else for(const sample of shape.samples){point.copy(sample);Sample();}
      // The model origin is at the floor, below its mass. Minimising the origin
      // alone rewards excessive tipping; minimise the body centre's height.
      potential=lift+point.copy(center).applyMatrix4(matrix).y;
      return lift;
    };
    // Minimise gravitational potential with a non-penetration constraint. Bounded
    // coordinate descent fits the mesh's lower envelope to several support points.
    let pitch=0,roll=0,lift=Evaluate(0,0),energy=potential;
    for(const step of C.angleStepsRad){
      const startPitch=pitch,startRoll=roll;
      for(const dx of [-step,0,step])for(const dz of [-step,0,step]){
        const px=startPitch+dx,rz=startRoll+dz;
        if(Math.abs(px)>C.maxTiltRad||Math.abs(rz)>C.maxTiltRad)continue;
        const candidate=Evaluate(px,rz);
        if(potential<energy-1e-6){pitch=px;roll=rz;lift=candidate;energy=potential;}
      }
    }
    // The coarse cloud accelerates the search; every real vertex determines final clearance.
    lift=Evaluate(pitch,roll,true)+C.clearanceM;
    matrix.elements[13]=lift;
    const sphere=shape.bounds.clone().applyMatrix4(matrix).getBoundingSphere(new THREE.Sphere());
    return {matrix,center:sphere.center,radius:sphere.radius};
  }
  Add(shape,matrix){
    // Vertical upper envelope of occupied body cells. Empty space adds no support.
    const point=this.point;
    for(const pos of shape.vertices)for(let i=0;i<pos.count;i++){
      point.fromBufferAttribute(pos,i).applyMatrix4(matrix);
      const key=this.Key(point.x,point.z);
      if(point.y>(this.cells.get(key)??-Infinity))this.cells.set(key,point.y);
    }
  }
}
