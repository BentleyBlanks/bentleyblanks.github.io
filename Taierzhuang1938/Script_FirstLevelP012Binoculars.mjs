// P012-only first-person presentation. Main owns inventory, input, weapon visibility
// and FOV. This component never rotates or reparents the camera, or changes its
// projection. The camera must already belong to the supplied scene (Viewmodel contract).
// Movable foreground meshes are not static environment BuildSink geometry.
import * as THREE from "three";
import { MarkForegroundPrepass } from "./Script_Post.mjs";

// Screen coordinates are NDC; keep recognition inside the same clear lens union
// drawn below, including portrait/ultrawide aspect ratios and the soft rim.
export function P012BinocularLensContains(x,y,aspect=1) {
  if(!Number.isFinite(aspect)||aspect<=0)return false;
  const px=x*Math.max(1,aspect)/2,py=y*Math.max(1,1/aspect)/2;
  return [-.13,.13].some(center=>Math.hypot(px-center,py)<.44*.98);
}

export class FirstLevelP012Binoculars {
  constructor({camera,scene}) {
    if(!camera || !scene)throw new TypeError("Binoculars require camera and scene");
    this.camera=camera;this.disposed=false;this.lift=0;
    this.root=new THREE.Group();this.root.name="P012Binoculars";
    this.geometries=[];this.materials=[];
    const shell=new THREE.MeshBasicMaterial({color:0x454a50});
    const rim=new THREE.MeshBasicMaterial({color:0x22262a});
    this.materials.push(shell,rim);
    const Add=(geometry,material,x,y,z)=>{
      this.geometries.push(geometry);
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
      mesh.frustumCulled=false;mesh.renderOrder=20;this.root.add(mesh);return mesh;
    };
    for(const x of [-.065,.065]){
      const barrel=Add(new THREE.CylinderGeometry(.044,.038,.19,12),shell,x,0,0);
      barrel.rotation.x=Math.PI/2;
      const eyepiece=Add(new THREE.CylinderGeometry(.028,.028,.04,12),rim,x,0,.115);
      eyepiece.rotation.x=Math.PI/2;
    }
    Add(new THREE.BoxGeometry(.13,.035,.075),shell,0,0,.025);
    MarkForegroundPrepass(this.root);
    this.root.visible=false;camera.add(this.root);
    // Intersect the opaque outsides of two overlapping circles: their union is
    // clear, including the centre. No centre seam, target marker, image or input trap.
    if(typeof document!=="undefined"){
      this.mask=document.createElement("div");this.mask.className="p012BinocularMask";
      this.mask.setAttribute("aria-hidden","true");
      const circles="radial-gradient(circle 44vmin at calc(50% - 13vmin) 50%, transparent 98%, black 100%), radial-gradient(circle 44vmin at calc(50% + 13vmin) 50%, transparent 98%, black 100%)";
      Object.assign(this.mask.style,{position:"fixed",inset:"0",pointerEvents:"none",zIndex:"auto",
        background:"#101214",display:"none",maskImage:circles,maskComposite:"intersect",
        webkitMaskImage:circles,webkitMaskComposite:"source-in"});
      // HUD itself has z-index:auto. Insert before it, rather than using a
      // positive overlay z-index that would cover its ordinary subtitle children.
      const hud=document.getElementById?.("hud");
      if(hud?.parentNode===document.body)document.body.insertBefore(this.mask,hud);
      else document.body.appendChild(this.mask);
    }
    this.Update({owned:false,raised:false},0);
  }
  Update({owned=false,raised=false}={},dt=0){
    if(this.disposed)return;
    const target=owned&&raised?1:0;
    this.lift+=(target-this.lift)*(1-Math.exp(-14*Math.max(0,Math.min(.1,Number(dt)||0))));
    // A visible lowered prop, not a claimed hand animation. Scale only our model
    // against camera FOV so zoom changes cannot enlarge it over the clear view.
    const scale=Math.tan((this.camera.fov||55)*Math.PI/360)/Math.tan(55*Math.PI/360);
    this.root.scale.set(scale,scale,1);
    this.root.position.set((.16*(1-this.lift))*scale,(-.19+.12*this.lift)*scale,-.58);
    this.root.rotation.set(-.18*(1-this.lift),-.12*(1-this.lift),.06*(1-this.lift));
    this.root.visible=!!owned&&!raised;
    if(this.mask)this.mask.style.display=owned&&raised?"block":"none";
  }
  Dispose(){
    if(this.disposed)return;
    this.disposed=true;this.root.removeFromParent();
    for(const geometry of this.geometries)geometry.dispose();
    for(const material of this.materials)material.dispose();
    this.mask?.remove();this.mask=null;
  }
}
