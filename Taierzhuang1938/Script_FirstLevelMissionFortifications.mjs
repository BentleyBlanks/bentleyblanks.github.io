import * as THREE from "three";
import { IsMissionSandbagBlock, MISSION_DEFENSE_ASSETS, MISSION_DEFENSE_OBJECTS,
  MISSION_DEFENSE_PACKING as PACKING } from "./Data_FirstLevelMissionFortifications.mjs";

// Templates have already been grounded, centred and rebound to the project's PBR library.
export async function LoadMissionFortifications(library) {
  const { InstantiateExternalProp }=await import("./Script_ExternalProps.mjs");
  const models=new Map();
  await Promise.all(MISSION_DEFENSE_ASSETS.map(async id=>{
    const root=await InstantiateExternalProp(id,library);
    if(!root)throw new Error(`Missing mission fortification asset: ${id}`);
    root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
    models.set(id,{root,box,size});
  }));
  return models;
}

// Bake through BuildSink sectors. One material/sector batch, not hundreds of scene nodes.
// Geometry belongs to the field; the template geometry and library materials remain shared.
export function AddMissionFortifications(sink,layout,models,groundAt,materials) {
  const replaced=new Set(),placements=[];
  function Place(id,asset,x,y,z,ry,scale,sourceBlock=null) {
    const model=models.get(asset),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),ry);
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),rotation,scale);
    sink.SetSector(`MissionDefense_${Math.floor(x/PACKING.sectorM)}_${Math.floor(z/PACKING.sectorM)}`);
    model.root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      if(Array.isArray(mesh.material))throw new Error(`Unsplit mission defense material: ${asset}`);
      const key=`MissionDefenseMaterial_${mesh.material.uuid}`;
      materials.set(key,mesh.material);
      sink.Add(key,mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix,mesh.matrixWorld)));
    });
    placements.push({id,asset,x,y,z,ry,scale:scale.toArray(),sourceBlock});
  }
  for(const block of layout.blocks) {
    if(!IsMissionSandbagBlock(block.id))continue;
    const alongX=block.w>=block.d,span=alongX?block.w:block.d,depth=alongX?block.d:block.w;
    const rows=Math.max(1,Math.round(block.h/PACKING.layerM)),columns=Math.max(1,Math.ceil(span/PACKING.spanM));
    const rowHeight=block.h/rows,slot=span/columns,ry=(block.ry||0)+(alongX?0:Math.PI/2);
    const cos=Math.cos(ry),sin=Math.sin(ry);
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
      // Alternate the three baked shapes; clip the stagger to the existing solid envelope.
      const odd=row%2===1&&columns>1,shift=odd?slot*.18:0;
      const start=-span/2+col*slot+(col===0?0:shift)- (col?PACKING.overlapM/2:0);
      const end=-span/2+(col+1)*slot+(col===columns-1?0:shift)+(col<columns-1?PACKING.overlapM/2:0);
      const asset=MISSION_DEFENSE_ASSETS[(row+col)%3],model=models.get(asset),along=(start+end)/2;
      const height=rowHeight+(row<rows-1?PACKING.overlapM:0);
      Place(`${block.id}_${row}_${col}`,asset,block.x+cos*along,block.y-block.h/2+row*rowHeight,
        block.z-sin*along,ry,new THREE.Vector3((end-start)/model.size.x,height/model.size.y,depth/model.size.z),block.id);
    }
    replaced.add(block.id);
  }
  for(const spec of MISSION_DEFENSE_OBJECTS) {
    const model=models.get(spec.asset),scale=spec.scale,cos=Math.cos(spec.ry),sin=Math.sin(spec.ry);
    const hx=model.size.x*scale/2,hz=model.size.z*scale/2;
    // Sample the footprint, not a hardcoded Y: embed downhill ends without floating feet.
    const heights=[[-1,-1],[-1,1],[1,-1],[1,1],[0,0]].map(([a,b])=>
      groundAt(spec.x+cos*a*hx+sin*b*hz,spec.z-sin*a*hx+cos*b*hz));
    const y=Math.min(...heights)-PACKING.groundEmbedM;
    Place(spec.id,spec.asset,spec.x,y,spec.z,spec.ry,new THREE.Vector3(scale,scale,scale));
    if(spec.solid)sink.Solid(spec.x,y+model.size.y*scale/2,spec.z,hx,model.size.y*scale/2,hz,
      spec.asset.includes("Wire")?"fence":"barricade",spec.ry);
  }
  sink.SetSector("FirstLevelWhitebox");
  return {replaced,placements};
}
