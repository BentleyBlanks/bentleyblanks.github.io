// Dedicated static menu set. Values are authored against the three approved references.
export const COMMAND_ROOM = Object.freeze({
  version: "202611260142",
  model: "./Model/Model_CommandRoom.glb",
  background: 0x26292c,
  cameraNear: 0.05,
  cameraFar: 80,
  // 后处理固化走 CAMERA_PROFILES.standard（Hill ACES exposure = 0.78）；
  // 原先使用 Three ACESFilmic exposure = 2.05（等价 Hill ACES 3.4167），按 3.4167 / 0.78 ≈ 4.38 标定室内线性光能量。
  radianceScale: 4.38,
  depthOfField: Object.freeze({ focusMaterial: "CommandRoomLetter", focus: 1.3, range: .12, focusPadding: .025,
    aperture: 10, maxRadius: 3.2,
    panelBlur: 7.5, transitionSeconds: .18 }),
  parallax: Object.freeze({ horizontal: .0425, vertical: .0225, focusDistance: 1.65, aimFollow: .28, responseSeconds: .045 }),
  // UV1 irradiance from Blender Cycles, separate from all surface albedos.
  bakedLighting: Object.freeze({ name: "CommandRoomLighting", scale: 16, intensity: 3.141592653589793 }),
  outside: Object.freeze({ color: 0xdce4ee, intensity: .45 }),
  // A one-time capture of this room supplies the ink glass's window reflection.
  reflection: Object.freeze({ material: "CommandRoomInkGlass", size: 256, near: .02, far: 16, intensity: 2.4,
    detailMaterials: Object.freeze(["CommandRoomInkLid", "CommandRoomCapBrass", "CommandRoomCapEnamel"]), detailIntensity: 1.35 }),
  glass: Object.freeze({ transmission: .99, roughness: .055, thickness: .0035, attenuationColor: 0xbe781f, attenuationDistance: .018 }),
  cabinet: Object.freeze({ tint: 0xeeece6, roughness: .98 }),
  materials: Object.freeze([
    { name: "CommandRoomFarmland", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomWood", kind: "pbr", normal: 0.45, tint: 0xffffff },
    { name: "CommandRoomPlaster", kind: "pbr", normal: 0.16, tint: 0xebe8e0 },
    { name: "CommandRoomWallSurface", kind: "pbr", normal: 0.28, tint: 0xffffff, clamp: true },
    { name: "CommandRoomCloth", kind: "pbr", normal: 0.18, tint: 0xffffff },
    { name: "CommandRoomCapCloth", kind: "pbr", normal: 0.28, tint: 0xffffff },
    { name: "CommandRoomMap", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomLetter", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomInkLabel", kind: "print", normal: 0, tint: 0xffffff },
  ]),
  dust: Object.freeze({ count: 480, color: 0xffe8c6, opacity: .68, size: .0028, drift: .016,
    brightness: 1.65, glint: Object.freeze([4.2, 1.55, 14]) }),
  // Actual Blender aperture; ray integration clips against camera and light depth.
  windowHaze: Object.freeze({ center: [-.838725, 1.5137625, -1.176775], size: [.3705, .944775],
    direction: [1.15, -1.0, 1.72], length: 1.9, density: .44, color: 0xffdfba,
    scatterGain: 1.15, anisotropy: .26, variation: .20, noiseScale: 9,
    edgeSoftness: .022, steps: 48, resolutionScale: .5,
    shadowSize: 1024, shadowExtent: .9, shadowDistance: 1.5, shadowFar: 4, shadowBias: .00035 }),
});
