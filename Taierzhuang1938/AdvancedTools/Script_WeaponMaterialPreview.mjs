import * as THREE from "three";
import { ApplyEditorLiteCameraProfile } from "../Script_CameraProfile.mjs";

export class WeaponMaterialPreview {
  constructor(studio, sunDirection) {
    this.scene = new THREE.Scene();
    this.scene.environment = studio.environment;
    this.scene.environmentIntensity = studio.environmentIntensity;
    this.camera = new THREE.OrthographicCamera(-1.18, 1.18, 1.18, -1.18, .1, 10);
    this.camera.position.set(0, .23, 4);
    this.camera.lookAt(0, 0, 0);
    for (const source of studio.children) {
      if (!source.isLight) continue;
      const light = source.clone();
      if (light.isDirectionalLight) {
        light.castShadow = false;
        light.position.copy(sunDirection).multiplyScalar(6);
      }
      this.scene.add(light);
    }
    const geometry = new THREE.SphereGeometry(1, 48, 32);
    const uv = geometry.getAttribute("uv");
    for (const name of ["uv1", "uv2", "uv3"]) geometry.setAttribute(name, uv);
    this.sphere = new THREE.Mesh(geometry);
    this.sphere.rotation.y = -.4;
    this.scene.add(this.sphere);
    this.viewport = new THREE.Vector4();
    this.pending = null;
  }

  Set(material, canvas) {
    this.pending = canvas ? { material, canvas } : null;
  }

  Draw(renderer) {
    if (!this.pending) return;
    const { material, canvas } = this.pending;
    this.pending = null;
    const source = renderer.domElement;
    const size = Math.min(canvas.width, source.width, source.height);
    const viewportSize = size / renderer.getPixelRatio();
    const context = canvas.getContext("2d");
    this.sphere.material = material;
    const savedTone = renderer.toneMapping;
    const savedExp = renderer.toneMappingExposure;
    const savedSpace = renderer.outputColorSpace;
    renderer.getViewport(this.viewport);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    renderer.setViewport(0, 0, viewportSize, viewportSize);
    // Copy the preview before the main viewport is drawn in the same frame.
    try {
      ApplyEditorLiteCameraProfile(renderer);
      renderer.render(this.scene, this.camera);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, source.height - size, size, size, 0, 0, canvas.width, canvas.height);
    } finally {
      renderer.toneMapping = savedTone;
      renderer.toneMappingExposure = savedExp;
      renderer.outputColorSpace = savedSpace;
      renderer.setViewport(this.viewport);
    }
  }
}
