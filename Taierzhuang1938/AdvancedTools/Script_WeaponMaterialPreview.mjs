import * as THREE from "three";

export class WeaponMaterialPreview {
  constructor(environment) {
    this.scene = new THREE.Scene();
    this.scene.environment = environment;
    this.camera = new THREE.OrthographicCamera(-1.18, 1.18, 1.18, -1.18, .1, 10);
    this.camera.position.set(0, .23, 4);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff6e7, 0x9caebe, 1.05));
    const key = new THREE.DirectionalLight(0xfff6e7, 2.55);
    key.position.set(-3, 4, 4);
    const rim = new THREE.DirectionalLight(0xcddfff, 1.3);
    rim.position.set(2, 3, -4);
    this.scene.add(key, rim);
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
    renderer.getViewport(this.viewport);
    renderer.setViewport(0, 0, viewportSize, viewportSize);
    // Copy the preview before the main viewport is drawn in the same frame.
    try {
      renderer.render(this.scene, this.camera);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, source.height - size, size, size, 0, 0, canvas.width, canvas.height);
    } finally {
      renderer.setViewport(this.viewport);
    }
  }
}
