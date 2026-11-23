import * as THREE from "three";
import { GLTFLoader } from "./three/examples/jsm/loaders/GLTFLoader.js";

function clipForCharacter(clip, hipsScale = 1) {
  const copy = clip.clone();
  if (Math.abs(hipsScale - 1) < 1e-4) return copy;
  copy.tracks = copy.tracks.filter((t) => !t.name.endsWith(".position") || t.name === "Hips.position");
  for (const t of copy.tracks) {
    if (t.name === "Hips.position") {
      for (let i = 0; i < t.values.length; i++) t.values[i] *= hipsScale;
    }
  }
  return copy;
}

function buildStudioEnvTexture(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0xc8d4e0);

  // Overhead daylight softbox
  const topBox = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  topBox.position.set(0, 7, 0);
  topBox.rotation.x = Math.PI / 2;
  envScene.add(topBox);

  // Warm key softbox (front-right)
  const keyBox = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff3de, side: THREE.DoubleSide })
  );
  keyBox.position.set(5, 3, 6);
  keyBox.lookAt(0, 0, 0);
  envScene.add(keyBox);

  // Cool sky fill softbox (front-left)
  const fillBox = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 8),
    new THREE.MeshBasicMaterial({ color: 0xdcebff, side: THREE.DoubleSide })
  );
  fillBox.position.set(-6, 2.5, 5);
  fillBox.lookAt(0, 0, 0);
  envScene.add(fillBox);

  // Low bright bounce card so faces under cap brims & chins get even light
  const bounceFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: 0xd5cfc2, side: THREE.DoubleSide })
  );
  bounceFloor.position.set(0, -4, 0);
  bounceFloor.rotation.x = -Math.PI / 2;
  envScene.add(bounceFloor);

  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return rt;
}

function createSkyDome() {
  const geo = new THREE.SphereGeometry(28, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x7ca2c7) },
      uHorizon: { value: new THREE.Color(0xe2e8ee) },
      uGround: { value: new THREE.Color(0xb2b6ba) },
      uSunDir: { value: new THREE.Vector3(0.45, 0.62, 0.64).normalize() },
      uSunColor: { value: new THREE.Color(0xfff7e4) },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec3 vWorldDir;
      void main() {
        vec3 d = normalize(vWorldDir);
        float h = d.y;
        vec3 col = h >= 0.0
          ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55))
          : mix(uHorizon, uGround, pow(clamp(-h * 2.4, 0.0, 1.0), 0.7));
        float sunAmt = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sunAmt, 24.0) * 0.25 + pow(sunAmt, 160.0) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

export class RetargetViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.loader = new GLTFLoader();
    this.clipCache = new Map();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.lightingMode = "daylight";

    // Procedural IBL so PBR skin/cloth never crushes into black shadow
    this._envRT = buildStudioEnvTexture(this.renderer);
    this.scene.environment = this._envRT.texture;

    // Daylight Sky Dome
    this.skyDome = createSkyDome();
    this.scene.add(this.skyDome);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 65);
    this.orbit = { yaw: 0.42, pitch: 0.2, dist: 2.65, targetX: 0, targetY: 0.85, targetZ: 0 };
    this._hipsPos = new THREE.Vector3();
    this.hipsBone = null;

    // Bright daylight studio 4-point rig + soft ground shadows
    this.hemiLight = new THREE.HemisphereLight(0xf6faff, 0xc5bfb2, 1.35);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff6e8, 2.25);
    this.keyLight.position.set(2.8, 4.6, 3.6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 16;
    const d = 2.6;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.scene.add(this.keyLight);

    // Low front face-fill light: keeps eyes/chin/hands bright even under military cap brims & downward gaze
    this.faceFillLight = new THREE.DirectionalLight(0xedf4ff, 1.25);
    this.faceFillLight.position.set(0.4, 0.95, 3.4);
    this.scene.add(this.faceFillLight);

    // Rim back light for crisp silhouette separation
    this.rimLight = new THREE.DirectionalLight(0xd4e6ff, 1.0);
    this.rimLight.position.set(-2.8, 2.8, -3.0);
    this.scene.add(this.rimLight);

    // Studio floor + dual grids (daylight vs dark studio)
    this.dayGrid = new THREE.GridHelper(10, 20, 0x868f9a, 0xb2b8c0);
    this.dayGrid.position.y = 0.001;
    this.scene.add(this.dayGrid);

    this.darkGrid = new THREE.GridHelper(10, 20, 0x6a6349, 0x2a2c25);
    this.darkGrid.position.y = 0.001;
    this.darkGrid.visible = false;
    this.scene.add(this.darkGrid);

    const floorGeo = new THREE.CircleGeometry(14, 64);
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.92, metalness: 0.0 });
    this.floor = new THREE.Mesh(floorGeo, this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.001;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.setLightingMode("daylight");

    this.modelRoot = null;
    this.skeletonHelper = null;
    this.showSkeleton = false;
    this.mixer = null;
    this.action = null;
    this.duration = 0;
    this.currentModelUrl = null;
    this.currentClipUrl = null;
    this.currentHipsScale = 1;
    this.loadToken = 0;

    this._bindOrbit();
    this._updateCamera();
    this._startLoop();
  }

  _bindOrbit() {
    let dragging = false;
    let lx = 0;
    let ly = 0;
    this.canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      this.orbit.yaw -= dx * 0.008;
      this.orbit.pitch = Math.max(-0.15, Math.min(1.2, this.orbit.pitch + dy * 0.006));
      this._updateCamera();
    });
    const endDrag = () => {
      dragging = false;
    };
    this.canvas.addEventListener("pointerup", endDrag);
    this.canvas.addEventListener("pointercancel", endDrag);
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.orbit.dist = Math.max(1.2, Math.min(6.0, this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08)));
        this._updateCamera();
      },
      { passive: false }
    );
  }

  _updateCamera() {
    const { yaw, pitch, dist, targetX, targetY, targetZ } = this.orbit;
    const cy = Math.cos(pitch);
    this.camera.position.set(
      targetX + Math.sin(yaw) * cy * dist,
      targetY + Math.sin(pitch) * dist,
      targetZ + Math.cos(yaw) * cy * dist
    );
    this.camera.lookAt(targetX, targetY, targetZ);
  }

  _syncCameraTargetToHips() {
    if (!this.hipsBone) return;
    this.hipsBone.getWorldPosition(this._hipsPos);
    if (!Number.isFinite(this._hipsPos.x)) return;
    this.orbit.targetX = this._hipsPos.x;
    this.orbit.targetY = Math.max(0.42, this._hipsPos.y + 0.14);
    this.orbit.targetZ = this._hipsPos.z;
    this._updateCamera();
  }

  setCameraPreset(preset) {
    if (preset === "front") Object.assign(this.orbit, { yaw: 0.0, pitch: 0.14, dist: 2.55 });
    else if (preset === "oblique") Object.assign(this.orbit, { yaw: 0.42, pitch: 0.2, dist: 2.65 });
    else if (preset === "side") Object.assign(this.orbit, { yaw: Math.PI / 2, pitch: 0.14, dist: 2.65 });
    else if (preset === "back") Object.assign(this.orbit, { yaw: Math.PI, pitch: 0.18, dist: 2.65 });
    this._updateCamera();
  }

  setShowSkeleton(show) {
    this.showSkeleton = Boolean(show);
    if (this.skeletonHelper) this.skeletonHelper.visible = this.showSkeleton;
  }

  setLightingMode(mode = "daylight") {
    this.lightingMode = mode === "dark" ? "dark" : "daylight";
    const isDay = this.lightingMode === "daylight";
    this.skyDome.visible = isDay;
    this.scene.background = new THREE.Color(isDay ? 0xdbe3ec : 0x181a17);
    this.scene.fog = new THREE.Fog(isDay ? 0xdbe3ec : 0x181a17, isDay ? 10 : 8, isDay ? 28 : 20);
    this.dayGrid.visible = isDay;
    this.darkGrid.visible = !isDay;
    this.floorMat.color.setHex(isDay ? 0xc9cdd2 : 0x232520);
    this.renderer.toneMappingExposure = isDay ? 1.22 : 1.3;
    this.hemiLight.intensity = isDay ? 1.35 : 1.15;
    this.keyLight.intensity = isDay ? 2.25 : 2.1;
    this.faceFillLight.intensity = isDay ? 1.25 : 1.1;
    this.rimLight.intensity = isDay ? 1.0 : 1.1;
    this.scene.environmentIntensity = isDay ? 0.9 : 0.65;
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect || rect.width < 10 || rect.height < 10) return;
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  async _loadClip(clipUrl) {
    if (this.clipCache.has(clipUrl)) return this.clipCache.get(clipUrl);
    const gltf = await this.loader.loadAsync(clipUrl);
    const clip = gltf.animations?.[0] || null;
    if (clip) this.clipCache.set(clipUrl, clip);
    return clip;
  }

  async load({ modelUrl, clipUrl, hipsScale = 1, onStatus = null }) {
    const token = ++this.loadToken;
    const sameModel = this.currentModelUrl === modelUrl && this.modelRoot;
    const sameClip = this.currentClipUrl === clipUrl && this.currentHipsScale === hipsScale && this.action;
    if (sameModel && sameClip) return { duration: this.duration };

    onStatus?.("载入角色与重定向骨骼…");
    if (!sameModel) {
      if (this.modelRoot) {
        this.scene.remove(this.modelRoot);
        this.modelRoot = null;
      }
      if (this.skeletonHelper) {
        this.scene.remove(this.skeletonHelper);
        this.skeletonHelper = null;
      }
      const gltf = await this.loader.loadAsync(modelUrl);
      if (token !== this.loadToken) return null;
      this.modelRoot = gltf.scene;
      this.modelRoot.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material && "envMapIntensity" in obj.material) {
            obj.material.envMapIntensity = 0.85;
          }
        }
      });
      this.scene.add(this.modelRoot);
      this.hipsBone = this.modelRoot.getObjectByName("Hips") || null;

      this.skeletonHelper = new THREE.SkeletonHelper(this.modelRoot);
      this.skeletonHelper.visible = this.showSkeleton;
      this.scene.add(this.skeletonHelper);
      this.currentModelUrl = modelUrl;

      // Auto-adjust look target height based on hipsScale
      this.orbit.targetX = 0;
      this.orbit.targetY = Math.max(0.45, 0.85 * hipsScale);
      this.orbit.targetZ = 0;
      this._updateCamera();
    }

    this.currentClipUrl = clipUrl;
    this.currentHipsScale = hipsScale;

    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
      this.action = null;
    }

    if (clipUrl && this.modelRoot) {
      const rawClip = await this._loadClip(clipUrl);
      if (token !== this.loadToken) return null;
      if (rawClip) {
        const adapted = clipForCharacter(rawClip, hipsScale);
        this.mixer = new THREE.AnimationMixer(this.modelRoot);
        this.action = this.mixer.clipAction(adapted);
        this.action.play();
        this.duration = adapted.duration || 0;
        this.setTime(0);
      }
    }

    onStatus?.("");
    return { duration: this.duration };
  }

  setTime(sec) {
    if (!this.mixer || !this.action) return;
    const t = this.duration > 0 ? Math.max(0, Math.min(this.duration, sec % Math.max(this.duration, 0.001))) : 0;
    this.action.paused = false;
    this.mixer.setTime(t);
    this.modelRoot?.updateMatrixWorld(true);
    this._syncCameraTargetToHips();
  }

  sampleLiveFootY() {
    if (!this.modelRoot) return null;
    let minY = Infinity;
    const v = new THREE.Vector3();
    for (const name of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) {
      const bone = this.modelRoot.getObjectByName(name);
      if (bone) {
        bone.getWorldPosition(v);
        if (v.y < minY) minY = v.y;
      }
    }
    return Number.isFinite(minY) ? Number(minY.toFixed(3)) : null;
  }

  _startLoop() {
    const tick = () => {
      requestAnimationFrame(tick);
      if (this.canvas.offsetParent === null) return;
      this.resize();
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }
}
