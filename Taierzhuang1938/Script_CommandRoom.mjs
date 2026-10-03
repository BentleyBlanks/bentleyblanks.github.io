import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { COMMAND_ROOM as DATA } from "./Data_Tuning_CommandRoom.mjs";

/** A real, batched Blender scene; uses the existing renderer only during title menu frames.
 * All geometry is static. Transparent moving dust is excluded from depth/velocity passes.
 * Gameplay camera, render targets, tone mapping and shadow settings are restored after every draw.
 */
export class CommandRoom {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DATA.background);
    this.camera = null;
    this.ready = false;
    this.time = 0;
    this.frames = 0;
    this.textures = [];
    this.stats = null;
    this.savedViewport = new THREE.Vector4();
    this.savedScissor = new THREE.Vector4();
    this.drawSize = new THREE.Vector2();
  }
  Load() {
    this.loadingPromise ??= this.LoadAssets();
    return this.loadingPromise;
  }
  async LoadAssets() {
    const loader = new THREE.TextureLoader();
    const LoadTexture = async (name, channel) => {
      const texture = await loader.loadAsync("./Texture/Texture_" + name + channel + ".webp?v=" + DATA.version);
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
        if (mat.name === "CommandRoomOutside") {
          mat.emissive.setHex(DATA.outside.color);
          mat.emissiveIntensity = DATA.outside.intensity;
        }
        const set = byName.get(mat.name) || (mat.name === "CommandRoomBrick" ? byName.get("CommandRoomPlaster") : null);
        if (!set) continue;
        mat.color.setHex(set.spec.tint);
        if (mat.name === "CommandRoomBrick") mat.color.setHex(DATA.brickTint);
        mat.map = set.textures[0];
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
    this.BuildDust();
    this.stats = { meshes, triangles, textureCount: this.textures.length, model: DATA.model, version: DATA.version, lighting: "Cycles diffuse UV1" };
    this.ready = true;
    return this;
  }
  BuildDust() {
    const positions = new Float32Array(DATA.dust.count * 3);
    let seed = 1938;
    const Rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < DATA.dust.count; i++) {
      positions[i * 3] = -1.95 + Rand() * 1.55;
      positions[i * 3 + 1] = 0.8 + Rand() * 1.9;
      positions[i * 3 + 2] = -1.20 + Rand() * 1.85;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { clock: { value: 0 }, tint: { value: new THREE.Color(DATA.dust.color) },
        opacity: { value: DATA.dust.opacity }, size: { value: DATA.dust.size }, drift: { value: DATA.dust.drift } },
      vertexShader: `uniform float clock; uniform float size; uniform float drift;
        void main() { vec3 p=position; p.x+=sin(clock*.19+p.y*3.)*drift;
          p.y+=sin(clock*.23+p.z*4.)*drift; vec4 mv=modelViewMatrix*vec4(p,1.);
          gl_PointSize=clamp(size*550./-mv.z,1.,3.); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 tint; uniform float opacity;
        void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.12,.5,d))*opacity;
          if(a<.005)discard;gl_FragColor=vec4(tint,a);}`,
    });
    this.dust = new THREE.Points(geometry, mat);
    this.dust.name = "CommandRoomWindowDust";
    this.scene.add(this.dust);
    const haze = DATA.windowHaze;
    const hazeMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { tint: { value: new THREE.Color(haze.color) }, opacity: { value: haze.opacity } },
      vertexShader: `varying vec2 fogUv; void main(){fogUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 fogUv; uniform vec3 tint; uniform float opacity;
        void main(){vec2 d=min(fogUv,1.-fogUv);float edge=smoothstep(0.,.13,min(d.x,d.y));
          gl_FragColor=vec4(tint,opacity*edge);}`,
    });
    const shafts = new THREE.InstancedMesh(new THREE.PlaneGeometry(...haze.size), hazeMaterial, haze.slices);
    const start = new THREE.Vector3().fromArray(haze.center), direction = new THREE.Vector3().fromArray(haze.direction).normalize();
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < haze.slices; i++) {
      const p = start.clone().addScaledVector(direction, (i + .5) / haze.slices * haze.length);
      shafts.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z));
    }
    shafts.instanceMatrix.needsUpdate = true;
    shafts.name = "CommandRoomWindowHaze";
    shafts.frustumCulled = false;
    this.scene.add(shafts);
  }
  Update(dt) {
    this.time += Math.min(dt, 0.1);
    if (this.dust) this.dust.material.uniforms.clock.value = this.time;
  }
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
      r.render(this.scene, this.camera);
      this.frames++;
    } finally {
      r.autoClear = autoClear; r.toneMapping = tone; r.toneMappingExposure = exposure;
      r.shadowMap.enabled = shadowEnabled; r.shadowMap.autoUpdate = shadowAuto; r.shadowMap.needsUpdate = shadowUpdate;
      r.setRenderTarget(target, cubeFace, mip); r.setViewport(this.savedViewport); r.setScissor(this.savedScissor); r.setScissorTest(scissorTest);
    }
  }
  State() {
    return { ready: this.ready, frames: this.frames, ...this.stats,
      camera: this.camera ? { position: this.camera.getWorldPosition(new THREE.Vector3()).toArray(), fov: this.camera.fov } : null };
  }
  Dispose() {
    this.scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) mat.dispose();
    });
    for (const texture of this.textures) texture.dispose();
    this.ready = false;
  }
}
