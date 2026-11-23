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

export class RetargetViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.loader = new GLTFLoader();
    this.clipCache = new Map();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c0a);
    this.scene.fog = new THREE.Fog(0x0b0c0a, 6.5, 16);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 50);
    this.orbit = { yaw: 0.42, pitch: 0.2, dist: 2.65, targetX: 0, targetY: 0.85, targetZ: 0 };
    this._hipsPos = new THREE.Vector3();
    this.hipsBone = null;

    // 3-point warm-key / cool-rim lighting matching Taierzhuang1938 ToolStudio
    const hemi = new THREE.HemisphereLight(0xeef2f5, 0x26241d, 1.15);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1d6, 2.1);
    key.position.set(2.4, 4.2, 3.2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9dc0e4, 0.95);
    rim.position.set(-2.8, 2.5, -2.5);
    this.scene.add(rim);

    // Subtle olive-brass studio floor grid
    const grid = new THREE.GridHelper(6, 18, 0x6a6349, 0x262721);
    grid.position.y = 0;
    this.scene.add(grid);

    const floorGeo = new THREE.CircleGeometry(3.2, 48);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x11120f, roughness: 0.95, metalness: 0.0 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(floor);

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
