import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";

function DisposeModel(object) {
  const materials = new Set(), textures = new Set(), geometry = new Set();
  object.traverse(node => {
    if (node.geometry) geometry.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometry.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => { value.source?.data?.close?.(); value.dispose(); });
}

export async function OpenViewer(container, url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error("GLB 读取失败");
  const { scene: object } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "./");
  let renderer, observer;
  function Close() {
    observer?.disconnect();
    DisposeModel(object);
    if (!renderer) return;
    renderer.domElement.remove();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  try {
    signal.throwIfAborted();
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const canvas = renderer.domElement;
    container.replaceChildren(canvas);
    canvas.setAttribute("aria-label", "可旋转的三维模型预览");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#282b23");
    scene.add(object, new THREE.HemisphereLight(0xfff7df, 0x768395, 2.3));
    const key = new THREE.DirectionalLight(0xffedda, 2.5);
    key.position.set(4, 7, 5);
    scene.add(key);
    const fit = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    if (fit.isEmpty() || !Number.isFinite(fit.radius)) throw Error("GLB 中没有可显示的几何");
    const radius = Math.max(fit.radius, .0001);
    const camera = new THREE.PerspectiveCamera(42, 1, radius / 100, radius * 60);
    const orbit = new THREE.Spherical(3.4 * radius, 1.24, .68);
    const position = new THREE.Vector3();
    function Draw() {
      camera.position.copy(position.setFromSpherical(orbit).add(fit.center));
      camera.lookAt(fit.center);
      renderer.render(scene, camera);
    }
    function Zoom(multiplier) {
      orbit.radius = THREE.MathUtils.clamp(orbit.radius * multiplier, .55 * radius, 22 * radius);
      Draw();
    }
    const pointers = new Map();
    const distance = () => {
      const [a, b] = pointers.values();
      return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    canvas.onpointerdown = event => {
      if (event.button !== 0 || pointers.size >= 2) return;
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    canvas.onpointermove = event => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const before = distance();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (before) { Zoom(before / Math.max(distance(), 1)); return; }
      orbit.theta -= (event.clientX - previous.x) * .008;
      orbit.phi = THREE.MathUtils.clamp(orbit.phi - (event.clientY - previous.y) * .008, .06, Math.PI - .06);
      Draw();
    };
    canvas.onlostpointercapture = event => pointers.delete(event.pointerId);
    canvas.addEventListener("wheel", event => { event.preventDefault(); Zoom(Math.exp(event.deltaY * .001)); }, { passive: false });
    observer = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = container;
      if (!width || !height || signal.aborted) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      Draw();
    });
    observer.observe(container);
    signal.addEventListener("abort", Close, { once: true });
  } catch (error) {
    Close();
    throw error;
  }
}
