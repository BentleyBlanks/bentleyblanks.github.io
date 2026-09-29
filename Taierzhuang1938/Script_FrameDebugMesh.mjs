import * as THREE from 'three';

// Separate context: inspecting geometry cannot modify the captured frame.
export class FrameDebugMesh {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(720, 440, false);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x171c24);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x455066, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(3, 5, 4); this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(40, 720 / 440, 0.01, 10000);
    this.yaw = 0.5; this.pitch = 0.2; this.distance = 4; this.center = new THREE.Vector3();
    this.materials = []; this.geometry = null; this.mesh = null; this.ref = null;
    let drag = null;
    canvas.onpointerdown = event => { drag = [event.clientX, event.clientY]; canvas.setPointerCapture(event.pointerId); };
    canvas.onpointermove = event => {
      if (!drag) return;
      this.yaw -= (event.clientX - drag[0]) * 0.008;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + (event.clientY - drag[1]) * 0.008));
      drag = [event.clientX, event.clientY]; this.Render();
    };
    canvas.onpointerup = () => { drag = null; };
    canvas.onwheel = event => { event.preventDefault(); this.distance *= Math.exp(event.deltaY * 0.001); this.Render(); };
  }
  SetEvent(event, mode = 'shaded', wireframe = false, morph = 1) {
    this.Clear();
    const ref = event?._object; if (!ref?.geometry?.attributes.position) return;
    this.ref = ref;
    const geometry = ref.geometry.clone(); this.geometry = geometry;
    const position = geometry.attributes.position;
    // Bake the displayed pose, including skin and morph targets, into the preview.
    if (ref.object.getVertexPosition && (ref.object.isSkinnedMesh || ref.object.morphTargetInfluences)) {
      const p = new THREE.Vector3(), base = new THREE.Vector3(), delta = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        base.fromBufferAttribute(ref.geometry.attributes.position, i); p.copy(base);
        for (let j = 0; j < (ref.geometry.morphAttributes.position?.length || 0); j++) {
          delta.fromBufferAttribute(ref.geometry.morphAttributes.position[j], i);
          if (!ref.geometry.morphTargetsRelative) delta.sub(base);
          p.addScaledVector(delta, (ref.object.morphTargetInfluences?.[j] || 0) * morph);
        }
        if (ref.object.isSkinnedMesh) ref.object.applyBoneTransform(i, p);
        position.setXYZ(i, p.x, p.y, p.z);
      }
      geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight'); geometry.morphAttributes = {};
      geometry.computeVertexNormals();
    }
    if (ref.group) geometry.setDrawRange(ref.group.start, ref.group.count);
    let material;
    if (mode === 'uvLayout') {
      const uv = geometry.attributes.uv;
      if (!uv) throw new Error('This draw has no UV attribute');
      for (let i = 0; i < position.count; i++) position.setXYZ(i, uv.getX(i), uv.getY(i), 0);
      material = new THREE.MeshBasicMaterial({ color: 0x71bdff, wireframe: true, side: THREE.DoubleSide });
    } else if (mode === 'normals') material = new THREE.MeshNormalMaterial({ wireframe, side: THREE.DoubleSide });
    else if (mode === 'tangents') {
      const tangent = geometry.attributes.tangent; if (!tangent) throw new Error('This draw has no tangent attribute');
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) for (let c = 0; c < 3; c++) colors[i * 3 + c] = tangent.getComponent(i, c) * 0.5 + 0.5;
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe, side: THREE.DoubleSide });
    } else if (mode === 'vertexColor') {
      if (!geometry.attributes.color) throw new Error('This draw has no vertex colors');
      material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe, side: THREE.DoubleSide });
    } else if (mode === 'uvChecker') {
      if (!geometry.attributes.uv) throw new Error('This draw has no UV attribute');
      material = new THREE.ShaderMaterial({ wireframe, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'varying vec2 vUv;void main(){float c=mod(floor(vUv.x*16.)+floor(vUv.y*16.),2.);gl_FragColor=vec4(mix(vec3(.12),vec3(.75),c),1.);}' });
    } else {
      const source = ref.material;
      // Basic preview light intentionally excludes scene-specific render-target
      // dependencies (AO/SSR/cluster/shadow uniforms remain in the inspector).
      material = new THREE.MeshStandardMaterial({ color: source.color?.clone() || new THREE.Color(0xffffff),
        map: source.map, normalMap: source.normalMap, roughnessMap: source.roughnessMap, metalnessMap: source.metalnessMap,
        roughness: source.roughness ?? 0.7, metalness: source.metalness ?? 0, alphaTest: source.alphaTest,
        vertexColors: source.vertexColors, wireframe, side: THREE.DoubleSide });
    }
    this.materials.push(material); this.mesh = new THREE.Mesh(geometry, material); this.scene.add(this.mesh);
    geometry.computeBoundingBox(); const box = geometry.boundingBox;
    box.getCenter(this.center); this.radius = Math.max(0.05, box.getSize(new THREE.Vector3()).length() * 0.5);
    this.distance = this.radius * 3.2; this.yaw = mode === 'uvLayout' ? 0 : 0.5; this.pitch = mode === 'uvLayout' ? 0 : 0.2;
    this.camera.near = this.radius / 1000; this.camera.far = this.radius * 1000; this.camera.updateProjectionMatrix();
    this.Render();
  }
  Render() {
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
      .multiplyScalar(this.distance).add(this.center);
    this.camera.lookAt(this.center); this.renderer.render(this.scene, this.camera);
  }
  Clear() { if (this.mesh) this.scene.remove(this.mesh); this.geometry?.dispose(); this.materials.forEach(material => material.dispose()); this.materials = []; this.mesh = null; this.geometry = null; this.ref = null; }
  Dispose() { this.Clear(); this.renderer.dispose(); this.renderer.forceContextLoss(); }
}
