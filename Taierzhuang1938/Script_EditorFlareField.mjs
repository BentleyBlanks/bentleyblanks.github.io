// Metre-scale studio references, never injected into the campaign world.
import * as THREE from 'three';
import {BuildSink} from './Script_World.mjs';
import {CloneShadedMaterial} from './Script_Materials.mjs';

export class FlarePreviewField {
 constructor(studio,library){
  this.root=new THREE.Group();this.root.name='FlarePreviewField';studio.root.add(this.root);
  this.groundGeometry=new THREE.PlaneGeometry(1200,1200,80,80).rotateX(-Math.PI/2);
  this.groundGeometry.userData.effectSurfaceRanges=[[0,this.groundGeometry.index.count]];
  const positions=this.groundGeometry.attributes.position,uv=this.groundGeometry.attributes.uv;
  for(let i=0;i<positions.count;i++){
   const x=positions.getX(i),z=positions.getZ(i),edge=THREE.MathUtils.smoothstep(Math.max(Math.abs(x),Math.abs(z)),120,220);
   positions.setY(i,edge*(3+2*Math.sin(x*.023)*Math.cos(z*.017)));
   uv.setXY(i,x/24+.5,z/24+.5);
  }this.groundGeometry.computeVertexNormals();
  const ground=CloneShadedMaterial(library.Get('Ground'));ground.color.setHex(0x827866);
  const wall=CloneShadedMaterial(library.Get('BrickWall'));wall.color.setHex(0x736b5f);wall.roughness=.95;
  const wood=CloneShadedMaterial(library.Get('WoodBeam'));wood.color.setHex(0x62533c);wood.roughness=.94;
  this.materials=[ground,wall,wood];const mats={ground,wall,wood},sink=new BuildSink();
  const Box=(mat,x,y,z,w,h,d)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);g.userData.effectSurface=true;sink.Add(mat,g);};
  // Low walls, roofed shelters and 1.7 m posts make the light's reach and the
  // moving shadows visible, without emissive rings or a painted light disc.
  for(const z of [-50,0,50,100]){
   sink.SetSector('FlareField'+z);
   for(const side of [-1,1]){
    const x=side*24;Box('wall',x,.7,z,14,1.4,.55);
    for(const dz of [-5,5])for(const dx of [-4,4])Box('wood',x+dx,1.5,z+dz,.18,3,.18);
    Box('wood',x,3.05,z,9,.18,11);
   }
   for(const x of [-50,0,50])Box('wall',x,.85,z,.25,1.7,.25);
  }
  // Rough earth banks at the perimeter keep an interpretable dark horizon.
  for(const x of [-100,100]){sink.SetSector('FlareBank'+x);Box('ground',x,1,30,12,2,170);}
  sink.Flush(this.root,{Get:key=>mats[key]});this.root.visible=false;
 }
 SetVisible(on){this.root.visible=!!on;}
 Dispose(){this.root.removeFromParent();this.root.traverse(o=>o.geometry?.dispose());for(const m of this.materials)m.dispose();}
}
