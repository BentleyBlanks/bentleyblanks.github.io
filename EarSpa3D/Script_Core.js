// 渲染核心：renderer / scene / 分级画质 / 自适应分辨率 / 主循环计时。
//
// 高像素密度与抗锯齿保持接触细节；持续慢帧先关闭阴影，再小幅降分辨率。

import * as THREE from "three";
import { Clamp, Damp } from "./Script_Util.js?v=ear011-20260911";

export const QUALITY_TIERS = {
  low: {
    id: "low", pixelRatio: 2.0, minScale: 0.9, shadow: false,
    shadowSize: 0, anisotropy: 1, dustCount: 220, antialias: true,
  },
  mid: {
    id: "mid", pixelRatio: 2.0, minScale: 0.95, shadow: true,
    shadowSize: 1024, anisotropy: 2, dustCount: 520, antialias: true,
  },
  high: {
    id: "high", pixelRatio: 2.5, minScale: 0.95, shadow: true,
    shadowSize: 2048, anisotropy: 4, dustCount: 900, antialias: true,
  },
};

/** 按设备能力猜一个起始档；用户仍可在设置里覆盖。 */
export function GuessQuality() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  const mem = (typeof navigator !== "undefined" && navigator.deviceMemory) || 4;
  const dpr = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1;
  if (!mobile) return cores >= 8 ? "high" : "mid";
  if (cores >= 8 && mem >= 6 && dpr <= 3.5) return "mid";
  return "low";
}

export function CreateCore({ canvas, quality = "auto", onError, viewCamera = null } = {}) {
  let renderQuality = null;
  let tier = QUALITY_TIERS[quality] || QUALITY_TIERS[GuessQuality()];

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier.antialias,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    // 场景是近景内窥，深度精度比模板缓冲重要
    depth: true,
  });
  renderer.setClearColor(0xfff8f2, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = tier.shadow;
  // PCFSoftShadowMap 在 three 0.185 已被弃用（内部会退回 PCFShadowMap 并打警告）。
  // 直接用 VSM 之外的选项：PCF 够柔和，而且不会有弃用噪声污染验收时的 console。
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = true;
  // 只渲染需要的一侧时（内窥视角下耳道内壁是背面朝向）由各材质自己决定 side，
  // 这里不开 autoClear 之外的额外优化，避免出现「画不出来但没报错」的玄学。
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();

  // 内窥视角：近平面要小到能贴住耳道壁，远平面要能看见房间
  const camera = viewCamera || new THREE.PerspectiveCamera(52, 1, 0.05, 6000);
  const insetCamera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
  const insetScene = new THREE.Scene();

  const stats = {
    fps: 0, frameMs: 16.7, drawCalls: 0, triangles: 0,
    renderScale: 1, width: 0, height: 0, tier: tier.id,
  };

  let width = 1;
  let height = 1;
  let renderScale = 1;
  let scaleTarget = 1;
  let slowStreak = 0;
  let fastStreak = 0;
  let lastTime = 0;
  let frameAccum = 0;
  let frameCount = 0;
  let disposed = false;

  function ApplyPixelRatio() {
    const dpr = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1;
    const pr = renderQuality && renderQuality.resolution !== "auto" ? ({low:.75,mid:1,high:Math.min(2.5,dpr)}[renderQuality.resolution]) : Math.min(tier.pixelRatio,dpr);
    renderer.setPixelRatio(pr * renderScale);
    renderer.setSize(width, height, false);
    stats.pixelRatio=pr*renderScale;stats.bufferWidth=canvas.width;stats.bufferHeight=canvas.height;
    stats.renderScale = renderScale;
    stats.width = width;
    stats.height = height;
  }

  function Resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
    height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 1));
    // 竖屏手机上横向 FOV 会被裁得很窄，内窥视角需要更宽的视野才看得全管壁
    camera.aspect = width / height;
    if (camera.aspect < 0.85) {
      camera.fov = 62;
    } else if (camera.aspect > 1.6) {
      camera.fov = 48;
    } else {
      camera.fov = 52;
    }
    camera.updateProjectionMatrix();
    ApplyPixelRatio();
  }

  function SetQuality(next) {
    const spec = QUALITY_TIERS[next];
    if (!spec) return tier.id;
    tier = spec;
    stats.tier = spec.id;
    renderer.shadowMap.enabled = spec.shadow;
    renderScale = Clamp(renderScale, spec.minScale, 1);
    scaleTarget = Clamp(scaleTarget, spec.minScale, 1);
    ApplyPixelRatio();
    return tier.id;
  }

  function SetRenderQuality(next) {
    renderQuality = {...next};
    renderScale = scaleTarget = 1;slowStreak = fastStreak = 0;
    renderer.shadowMap.enabled = next.shadows === 'auto' ? tier.shadow : next.shadows !== 'off';
    const size = {off:0,auto:1024,low:512,mid:1024,high:2048}[next.shadows];
    scene.traverse(light => {
      if (!light.shadow || !size || light.shadow.mapSize.x === size) return;
      light.shadow.map?.dispose();light.shadow.map = null;
      light.shadow.mapPass?.dispose();light.shadow.mapPass = null;
      light.shadow.mapSize.set(size,size);light.shadow.needsUpdate = true;
    });
    stats.renderQuality = {...next};
    ApplyPixelRatio();
  }

  /**
   * 自适应分辨率。判定用**中位数量级**的帧时间而不是瞬时值：
   * 一次 GC 卡一下不该把画质打下去，而持续 40ms 就必须降。
   */
  function Adapt(dt) {
    const ms = dt * 1000;
    const budget = 1000 / 60;
    if (ms > budget * 1.45) {
      slowStreak += 1;
      fastStreak = 0;
    } else if (ms < budget * 1.05) {
      fastStreak += 1;
      slowStreak = 0;
    } else {
      slowStreak = 0;
      fastStreak = 0;
    }
    if (slowStreak >= 30) {
      // 先削减阴影成本，保持像素密度；不能把整张手机画面糊成低分辨率。
      if (!renderQuality || renderQuality.shadows === "auto") renderer.shadowMap.enabled=false;
      if (!renderQuality || renderQuality.resolution === "auto") scaleTarget = Math.max(tier.minScale, scaleTarget - 0.03);
      slowStreak = 0;
    } else if (fastStreak >= 180) {
      scaleTarget = Math.min(1, scaleTarget + 0.05);
      fastStreak = 0;
    }
    if (Math.abs(renderScale - scaleTarget) > 0.005) {
      renderScale = Damp(renderScale, scaleTarget, 0.6, dt);
      ApplyPixelRatio();
    }
  }

  /** 主渲染。insetRect 给单位矩形（0-1 屏幕坐标），传了就做画中画（角色小窗）。 */
  function Render({ insetRect = null, insetEvery = 3 } = {}) {
    renderer.info.reset();
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    if (insetRect) {
      const x = Math.round(insetRect.x * width);
      const y = Math.round(insetRect.y * height);
      const w = Math.max(2, Math.round(insetRect.w * width));
      const h = Math.max(2, Math.round(insetRect.h * height));
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      // 画中画要清掉自己的深度，否则会被主场景的深度挡住
      renderer.setScissorTest(true);
      renderer.setScissor(x, y, w, h);
      renderer.setViewport(x, y, w, h);
      // 主画面每帧覆盖整张画布，小窗也必须每帧清色重画，否则会闪烁、透出耳道。
      renderer.clear(true, true, false);
      const a = insetCamera.aspect;
      insetCamera.aspect = w / h;
      if (a !== insetCamera.aspect) insetCamera.updateProjectionMatrix();
      renderer.render(insetScene, insetCamera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.autoClear = prevAutoClear;
    }
    stats.drawCalls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
  }

  /** 每帧调用一次；返回 clamp 过的 dt（秒）。切标签页回来会有一个巨大的 dt，必须夹住。 */
  function Tick(now) {
    if (!lastTime) lastTime = now;
    const raw = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Clamp(raw, 0.0005, 0.05);
    stats.frameMs = raw * 1000;
    frameAccum += raw;
    frameCount += 1;
    if (frameAccum >= 0.5) {
      stats.fps = frameCount / frameAccum;
      frameAccum = 0;
      frameCount = 0;
    }
    Adapt(dt);
    return dt;
  }

  function Dispose() {
    if (disposed) return;
    disposed = true;
    renderer.dispose();
    scene.traverse((node) => {
      if (node.geometry && node.geometry.dispose) node.geometry.dispose();
    });
  }

  const observer = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(Resize)
    : null;
  if (observer) observer.observe(canvas);
  if (typeof window !== "undefined") window.addEventListener("orientationchange", Resize);
  Resize();

  return {
    THREE, renderer, scene, camera, insetCamera, insetScene, stats,
    get tier() { return tier; },
    get size() { return { width, height }; },
    Resize, SetQuality, SetRenderQuality, Tick, Render, Dispose,
    setExposure(v) { renderer.toneMappingExposure = v; },
  };
}
