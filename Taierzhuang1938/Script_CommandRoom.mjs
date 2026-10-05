import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { COMMAND_ROOM as DATA } from "./Data_Tuning_CommandRoom.mjs";
import { CommandRoomAtmosphere } from "./Script_CommandRoomAtmosphere.mjs";
import { CommandRoomPapers, CommandRoomPaperUrl } from "./Data_CommandRoomPapers.mjs";

/** A real, batched Blender scene; uses the existing renderer only during title menu frames.
 * All geometry is static. Transparent moving dust is excluded from depth/velocity passes.
 * Gameplay camera, render targets, tone mapping and shadow settings are restored after every draw.
 */
export class CommandRoom {
  constructor(renderer, { isActive = () => true, getMenuMode = null } = {}) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DATA.background);
    this.camera = null;
    this.ready = false;
    this.time = 0;
    this.frames = 0;
    this.textures = [];
    this.paperCache = new Map();
    this.paperMaterials = new Map();
    this.paperRequest = 0;
    this.disposed = false;
    this.stats = null;
    this.savedViewport = new THREE.Vector4();
    this.savedScissor = new THREE.Vector4();
    this.drawSize = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.pointer = new THREE.Vector2();
    this.isActive = isActive;
    this.getMenuMode = getMenuMode;
    this.menuMode = "title";
    this.panelFocus = 0;
    this.basePosition = new THREE.Vector3();
    this.baseQuaternion = new THREE.Quaternion();
    this.cameraRight = new THREE.Vector3();
    this.cameraUp = new THREE.Vector3();
    this.baseAim = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.OnPointerMove = event => {
      if (event.pointerType === "touch" || this.motionQuery.matches || !this.isActive() || document.pointerLockElement) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.pointerTarget.set(THREE.MathUtils.clamp((event.clientX-rect.left)/rect.width*2-1,-1,1),
        THREE.MathUtils.clamp(1-(event.clientY-rect.top)/rect.height*2,-1,1));
    };
    this.ResetPointer = () => this.pointerTarget.set(0,0);
    this.OnMotionPreference = () => { this.ResetPointer(); if (this.motionQuery.matches) this.pointer.set(0,0); };
    document.addEventListener("pointermove",this.OnPointerMove,{passive:true});
    document.addEventListener("pointerleave",this.ResetPointer);
    window.addEventListener("blur",this.ResetPointer);
    window.addEventListener("resize",this.ResetPointer);
    this.motionQuery.addEventListener("change",this.OnMotionPreference);
  }
  Load(progress = {}) {
    this.loadingPromise ??= this.LoadAssets(progress);
    return this.loadingPromise.then(() => this.SetProgress(progress)).then(() => this);
  }
  async LoadAssets(progress) {
    const papers = CommandRoomPapers(progress);
    const loader = new THREE.TextureLoader();
    const LoadTexture = this.LoadTexture = async (name, channel, url) => {
      const texture = await loader.loadAsync(url || "./Texture/Texture_" + name + channel + ".webp?v=" + DATA.version);
      if (this.disposed) { texture.dispose(); throw new Error("Command room disposed during texture load"); }
      texture.colorSpace = channel === "Base" || channel === "Image" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = channel === "Image" ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.textures.push(texture);
      return texture;
    };
    const [gltf, materialSets, irradiance] = await Promise.all([
      new GLTFLoader().loadAsync(DATA.model + "?v=" + DATA.version),
      Promise.all(DATA.materials.map(async spec => {
        const paperName = spec.name === "CommandRoomMap" ? papers.map : spec.name === "CommandRoomLetter" ? papers.letter : null;
        if (paperName) return { spec, textures: [await this.LoadPaper(paperName)] };
        const channels = spec.kind === "print" ? ["Image"] : ["Base", "Normal", "Orm"];
        const textures = await Promise.all(channels.map(channel => LoadTexture(spec.name, channel)));
        return { spec, textures };
      })),
      LoadTexture(DATA.bakedLighting.name, "Image"),
    ]);
    irradiance.channel = 1;
    this.scene.add(gltf.scene);
    this.camera = gltf.cameras[0];
    if (!this.camera) throw new Error("Command room GLB is missing its authored camera");
    this.camera.near = DATA.cameraNear;
    this.camera.far = DATA.cameraFar;
    this.basePosition.copy(this.camera.position);
    this.baseQuaternion.copy(this.camera.quaternion);
    this.cameraRight.set(1,0,0).applyQuaternion(this.baseQuaternion);
    this.cameraUp.set(0,1,0).applyQuaternion(this.baseQuaternion);
    this.baseAim.set(0,0,-DATA.parallax.focusDistance).applyQuaternion(this.baseQuaternion).add(this.basePosition);
    const byName = new Map(materialSets.map(set => [set.spec.name, set]));
    let meshes = 0, triangles = 0;
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      meshes++;
      if (!object.geometry.attributes.uv1) throw new Error("Command room lighting needs authored UV1: " + object.name);
      triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
      object.castShadow = object.receiveShadow = true;
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        mat.lightMap = irradiance;
        mat.lightMapIntensity = DATA.bakedLighting.scale * DATA.bakedLighting.intensity;
        if (mat.name === DATA.reflection.material) {
          mat.color.setHex(0xffffff);mat.lightMap=null;
          mat.transmission=DATA.glass.transmission;mat.roughness=DATA.glass.roughness;
          mat.thickness=DATA.glass.thickness;mat.attenuationColor.setHex(DATA.glass.attenuationColor);
          mat.attenuationDistance=DATA.glass.attenuationDistance;mat.side=THREE.FrontSide;
        }
        if (mat.name === "CommandRoomOutside") {
          // An emissive courtyard card has no diffuse room irradiance. Keeping
          // both washes out its restrained rose tint under title exposure.
          mat.lightMap = null;mat.color.setHex(0x000000);
          mat.emissive.setHex(DATA.outside.color);
          mat.emissiveIntensity = DATA.outside.intensity;
        }
        const set = byName.get(mat.name) || (mat.name === "CommandRoomBrick" ? byName.get("CommandRoomPlaster") : null);
        if (!set) continue;
        mat.color.setHex(set.spec.tint);
        if (mat.name === "CommandRoomBrick") mat.color.setHex(DATA.brickTint);
        mat.map = set.textures[0];
        if (mat.name === "CommandRoomMap" || mat.name === "CommandRoomLetter") this.paperMaterials.set(mat.name, mat);
        mat.roughness = 1;
        mat.metalness = 0;
        if (set.spec.kind === "pbr") {
          mat.normalMap = set.textures[1];
          mat.normalScale.set(set.spec.normal, -set.spec.normal);
          mat.roughnessMap = set.textures[2];
          mat.aoMap = set.textures[2];
          mat.aoMapIntensity = 0;
        } else {
          mat.side = THREE.DoubleSide;
        }
        mat.needsUpdate = true;
      }
    });
    // Static direct and indirect diffuse lighting is already in the UV1 atlas.
    // Do not add a second sun or multiply baked shadows by another AO term.
    this.CaptureGlassReflection();
    this.atmosphere = new CommandRoomAtmosphere(this.renderer,this.scene,DATA.windowHaze,DATA.depthOfField);
    this.dust = this.atmosphere.BuildDust(DATA.dust);
    this.stats = { meshes, triangles, textureCount: this.textures.length, model: DATA.model, version: DATA.version, lighting: "Cycles diffuse UV1" };
    this.papers = papers;
    this.ready = true;
    return this;
  }
  LoadPaper(name) {
    if (!this.paperCache.has(name)) {
      this.paperCache.set(name, this.LoadTexture(name, "Image", CommandRoomPaperUrl(name)).catch(error => {
        this.paperCache.delete(name);
        throw error;
      }));
    }
    return this.paperCache.get(name);
  }
  async SetProgress(progress) {
    const request = ++this.paperRequest, papers = CommandRoomPapers(progress);
    if (this.disposed || papers.stage === this.papers?.stage) return;
    const [map, letter] = await Promise.all([this.LoadPaper(papers.map), this.LoadPaper(papers.letter)]);
    if (this.disposed || request !== this.paperRequest) return;
    this.paperMaterials.get("CommandRoomMap").map = map;
    this.paperMaterials.get("CommandRoomLetter").map = letter;
    this.papers = papers;
  }
  CaptureGlassReflection() {
    const glass=[], bottle=[];
    this.scene.traverse(object=>{
      if(object.isMesh && object.material?.name===DATA.reflection.material) glass.push(object);
      if(object.isMesh && object.material?.name?.startsWith("CommandRoomInk")) bottle.push(object);
    });
    if(!glass.length) return;
    this.scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(glass[0]);
    const cube=new THREE.WebGLCubeRenderTarget(DATA.reflection.size,{type:THREE.HalfFloatType});
    const camera=new THREE.CubeCamera(DATA.reflection.near,DATA.reflection.far,cube);
    bounds.getCenter(camera.position);
    const generator=new THREE.PMREMGenerator(this.renderer),r=this.renderer;
    const target=r.getRenderTarget(),face=r.getActiveCubeFace(),mip=r.getActiveMipmapLevel();
    const viewport=r.getViewport(new THREE.Vector4()),scissor=r.getScissor(new THREE.Vector4());
    const scissorTest=r.getScissorTest(),autoClear=r.autoClear;
    const visible=bottle.map(object=>object.visible);
    try {
      bottle.forEach(object=>{object.visible=false;});
      r.setScissorTest(false);r.autoClear=true;
      camera.update(r,this.scene);
      this.reflection=generator.fromCubemap(cube.texture);
      for(const object of glass){object.material.envMap=this.reflection.texture;
        object.material.envMapIntensity=DATA.reflection.intensity;object.material.needsUpdate=true;}
      for(const object of bottle.filter(o=>o.material.name==="CommandRoomInkLid")){
        object.material.envMap=this.reflection.texture;object.material.envMapIntensity=.65;object.material.needsUpdate=true;
      }
    } finally {
      bottle.forEach((object,i)=>{object.visible=visible[i];});
      cube.dispose();generator.dispose();
      r.setRenderTarget(target,face,mip);r.setViewport(viewport);r.setScissor(scissor);
      r.setScissorTest(scissorTest);r.autoClear=autoClear;
    }
  }
  Update(dt) {
    this.time += Math.min(dt, 0.1);
    if(this.getMenuMode)this.SetMenuMode(this.getMenuMode());
    const target=this.menuMode === "title" ? 0 : 1;
    this.panelFocus=this.motionQuery.matches ? target : THREE.MathUtils.lerp(this.panelFocus,target,
      1-Math.exp(-Math.max(0,Math.min(dt,.1))/DATA.depthOfField.transitionSeconds));
    this.atmosphere?.SetPanelFocus(this.panelFocus);
    if (!this.camera) return;
    if (!this.isActive() || this.motionQuery.matches) this.ResetPointer();
    this.pointer.lerp(this.pointerTarget,1-Math.exp(-Math.max(0,Math.min(dt,.1))/DATA.parallax.responseSeconds));
    if (this.motionQuery.matches) this.pointer.set(0,0);
    this.offset.copy(this.cameraRight).multiplyScalar(this.pointer.x*DATA.parallax.horizontal);
    this.offset.addScaledVector(this.cameraUp,this.pointer.y*DATA.parallax.vertical);
    this.camera.position.copy(this.basePosition).add(this.offset);
    this.aim.copy(this.baseAim).addScaledVector(this.offset,DATA.parallax.aimFollow);
    this.camera.lookAt(this.aim);
  }
  SetMenuMode(mode) { this.menuMode=mode || "title"; }
  Render() {
    if (!this.ready) return;
    const r = this.renderer;
    const target = r.getRenderTarget(), autoClear = r.autoClear, tone = r.toneMapping, exposure = r.toneMappingExposure;
    const scissorTest = r.getScissorTest(), shadowEnabled = r.shadowMap.enabled, shadowAuto = r.shadowMap.autoUpdate;
    const shadowUpdate = r.shadowMap.needsUpdate, cubeFace = r.getActiveCubeFace(), mip = r.getActiveMipmapLevel();
    r.getViewport(this.savedViewport); r.getScissor(this.savedScissor);
    try {
      r.setRenderTarget(null);
      const size = r.getSize(this.drawSize);
      r.setViewport(0, 0, size.x, size.y); r.setScissorTest(false);
      this.camera.aspect = size.x / size.y;
      this.camera.updateProjectionMatrix();
      r.autoClear = true;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = DATA.exposure;
      r.shadowMap.enabled = false;
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = this.frames === 0;
      this.atmosphere.Render(this.camera,this.time);
      this.frames++;
    } finally {
      r.autoClear = autoClear; r.toneMapping = tone; r.toneMappingExposure = exposure;
      r.shadowMap.enabled = shadowEnabled; r.shadowMap.autoUpdate = shadowAuto; r.shadowMap.needsUpdate = shadowUpdate;
      r.setRenderTarget(target, cubeFace, mip); r.setViewport(this.savedViewport); r.setScissor(this.savedScissor); r.setScissorTest(scissorTest);
    }
  }
  State() {
    return { ready: this.ready, frames: this.frames, ...this.stats, textureCount: this.textures.length,
      papers: this.papers ? { ...this.papers } : null,
      camera: this.camera ? { position: this.camera.getWorldPosition(new THREE.Vector3()).toArray(), fov: this.camera.fov } : null,
      parallax: { pointer: this.pointer.toArray(), target: this.pointerTarget.toArray(), reducedMotion: this.motionQuery.matches },
      presentation: { mode: this.menuMode, panelFocus: this.panelFocus, blur: this.panelFocus*DATA.depthOfField.panelBlur,
        depthOfField: { ...DATA.depthOfField }, outsideColor: DATA.outside.color },
      atmosphere: { particles: DATA.dust.count, depthOcclusion: !!this.atmosphere, lightShadow: !!this.atmosphere && !this.atmosphere.shadowDirty } };
  }
  Dispose() {
    this.disposed = true;
    this.paperRequest++;
    document.removeEventListener("pointermove",this.OnPointerMove);
    document.removeEventListener("pointerleave",this.ResetPointer);
    window.removeEventListener("blur",this.ResetPointer);
    window.removeEventListener("resize",this.ResetPointer);
    this.motionQuery.removeEventListener("change",this.OnMotionPreference);
    this.atmosphere?.Dispose();
    this.reflection?.dispose();
    this.scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose();
    });
    for (const texture of this.textures) texture.dispose();
    this.ready = false;
  }
}
