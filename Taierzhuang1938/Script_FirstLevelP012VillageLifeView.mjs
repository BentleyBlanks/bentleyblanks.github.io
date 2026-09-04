// Pure-colour procedural props only. Each articulated part is BuildSink-batched;
// no downloaded environment, textures, audio, or actor animation changes.
import * as THREE from "three";
import {BuildSink} from "./Script_World.mjs";
export class FirstLevelP012VillageLifeView {
 constructor(scene,groundAt){
  this.scene=scene;this.groundAt=groundAt;this.root=new THREE.Group();this.root.name="P012VillageLife";scene.add(this.root);
  this.material=new THREE.MeshStandardMaterial({color:0xbcb9ad,roughness:1});this.dark=new THREE.MeshStandardMaterial({color:0x555957,roughness:1});
  this.door=this.Part(this.root,[[0,0,0,.85,2.05,.09],[-.47,0,-.07,.09,2.6,.12],[.47,0,-.07,.09,2.6,.12]]);
  this.mule=new THREE.Group();this.root.add(this.mule);
  this.Part(this.mule,[[0,1.02,0,.55,.55,1.15],[0,1.38,-.65,.38,.65,.35],[0,1.53,-.94,.34,.3,.55],[-.14,1.91,-.69,.11,.5,.13],[.14,1.91,-.69,.11,.5,.13],[0,1.05,.71,.09,.1,.5]]);
  this.legs=[];for(const x of [-.22,.22])for(const z of [-.4,.4]){const leg=this.Part(this.mule,[[0,-.3,0,.13,.6,.15]]);leg.position.set(x,.74,z);this.legs.push(leg);}
  this.Part(this.mule,[[-.51,.73,1.05,.09,.09,2.9],[.51,.73,1.05,.09,.09,2.9],[0,.76,1.95,1.2,.15,1.5],[0,1.02,2.65,1.2,.45,.08],[-.57,1.02,1.95,.08,.45,1.5],[.57,1.02,1.95,.08,.45,1.5],[-.27,1.08,1.55,.45,.45,.5],[.27,1.08,1.55,.45,.45,.5],[-.27,1.08,2.15,.45,.45,.5],[.27,1.08,2.15,.45,.45,.5]]);
  this.muleWheels=[-.73,.73].map(x=>{const wheel=this.Part(this.mule,[[0,0,0,.13,.75,.75]],true);wheel.position.set(x,.42,2);return wheel;});
  this.cart=this.Part(this.root,[[0,.62,0,.95,.12,1],[-.45,.82,0,.08,.38,1],[.45,.82,0,.08,.38,1],[0,.82,.48,.95,.38,.08],[-.32,.64,.9,.08,.08,1.2],[.32,.64,.9,.08,.08,1.2],[0,.94,0,.7,.5,.65],[-.59,.36,0,.14,.65,.65],[.59,.36,0,.14,.65,.65]]);
  this.reel=this.Part(this.root,[[-.23,0,0,.09,.55,.55],[.23,0,0,.09,.55,.55],[0,0,0,.46,.28,.28]],true);
  this.wireGeometry=new THREE.BufferGeometry();this.wirePositions=new THREE.BufferAttribute(new Float32Array(2048*3),3);this.wireGeometry.setAttribute("position",this.wirePositions);this.wireGeometry.setDrawRange(0,0);
  this.wireMaterial=new THREE.LineBasicMaterial({color:0x252a29});this.wire=new THREE.Line(this.wireGeometry,this.wireMaterial);this.root.add(this.wire);
 }
 Part(parent,boxes,dark=false){const group=new THREE.Group(),sink=new BuildSink();for(const [x,y,z,w,h,d] of boxes){const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);sink.Add("VillageProp",geometry);}sink.Flush(group,{Get:()=>dark?this.dark:this.material});parent.add(group);return group;}
 Place(group,p,height=0){group.visible=!!p;if(p)group.position.set(p.x,this.groundAt(p.x,p.z)+height,p.z);}
 Update(snapshot){
  this.Place(this.door,snapshot.door.position,snapshot.door.height);this.door.rotation.x=snapshot.door.rotationX;
  this.Place(this.mule,snapshot.mule.position);this.mule.rotation.y=snapshot.mule.yaw;
  this.legs.forEach((leg,index)=>leg.rotation.x=Math.sin(snapshot.mule.travel*5+(index===0||index===3?0:Math.PI))*.28);
  this.muleWheels.forEach(wheel=>wheel.rotation.x=-snapshot.mule.travel/.375);
  const p=snapshot.cart.position,yaw=snapshot.cart.yaw;this.Place(this.cart,p?{x:p.x-Math.sin(yaw)*1.3,z:p.z-Math.cos(yaw)*1.3}:null);this.cart.rotation.y=yaw;
  this.Place(this.reel,snapshot.telephone.position?{x:snapshot.telephone.position.x+.38,z:snapshot.telephone.position.z}:null,1.05);
  const points=snapshot.telephone.wire;
  if(points.length>this.wirePositions.count)throw new Error("Finite village telephone wire exceeds declared vertex capacity");
  points.forEach((point,index)=>this.wirePositions.setXYZ(index,point.x,this.groundAt(point.x,point.z)+.055,point.z));
  this.wirePositions.needsUpdate=true;this.wireGeometry.setDrawRange(0,points.length);this.wireGeometry.computeBoundingSphere();
 }
 Dispose(){this.root.traverse(object=>object.geometry?.dispose());this.material.dispose();this.dark.dispose();this.wireMaterial.dispose();this.root.removeFromParent();}
}
