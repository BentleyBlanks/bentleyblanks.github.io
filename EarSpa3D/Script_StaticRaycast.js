import * as THREE from 'three';
// 静态耳道 BVH 保留真实三角面交点，只排除射线不可能命中的包围盒。
export function AccelerateStaticRaycast(mesh){
 const g=mesh.geometry,p=g.attributes.position,index=g.index,triangles=[];
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<(index?index.count:p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);const box=new THREE.Box3().setFromPoints([a,b,c]);triangles.push({ids,box,center:box.getCenter(new THREE.Vector3()),faceIndex:i/3});}
 function Build(items){const box=new THREE.Box3();items.forEach(t=>box.union(t.box));if(items.length<=12)return{box,items};const size=box.getSize(new THREE.Vector3()),axis=size.x>size.y&&size.x>size.z?'x':size.y>size.z?'y':'z';items.sort((a,b)=>a.center[axis]-b.center[axis]);const middle=items.length>>1;return{box,left:Build(items.slice(0,middle)),right:Build(items.slice(middle))};}
 const root=Build(triangles),inverse=new THREE.Matrix4(),ray=new THREE.Ray(),point=new THREE.Vector3(),boxPoint=new THREE.Vector3();
 mesh.raycast=function(raycaster,intersects){
  inverse.copy(mesh.matrixWorld).invert();ray.copy(raycaster.ray).applyMatrix4(inverse);let best=Infinity,winner=null;
  function Visit(node){if(!ray.intersectBox(node.box,boxPoint)||(!node.box.containsPoint(ray.origin)&&boxPoint.distanceToSquared(ray.origin)>best))return;
   if(node.items){for(const t of node.items){a.fromBufferAttribute(p,t.ids[0]);b.fromBufferAttribute(p,t.ids[1]);c.fromBufferAttribute(p,t.ids[2]);const back=mesh.material.side===THREE.BackSide,hit=back?ray.intersectTriangle(c,b,a,true,point):ray.intersectTriangle(a,b,c,mesh.material.side!==THREE.DoubleSide,point);if(!hit)continue;const world=point.clone().applyMatrix4(mesh.matrixWorld),distance=world.distanceTo(raycaster.ray.origin);if(distance<raycaster.near||distance>raycaster.far)continue;const localDistance=point.distanceToSquared(ray.origin);if(localDistance<best){best=localDistance;winner={distance,point:world,object:mesh,face:{a:t.ids[0],b:t.ids[1],c:t.ids[2],normal:THREE.Triangle.getNormal(a,b,c,new THREE.Vector3()),materialIndex:0},faceIndex:t.faceIndex};}}
   }else{Visit(node.left);Visit(node.right);}
  }Visit(root);if(winner)intersects.push(winner);
 };
 return{triangles:triangles.length};
}
