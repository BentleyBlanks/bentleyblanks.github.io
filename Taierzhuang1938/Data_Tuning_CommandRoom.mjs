// Dedicated static menu set. Values are authored against the three approved references.
export const COMMAND_ROOM = Object.freeze({
  version: "202610100430",
  model: "./Model/Model_CommandRoom.glb",
  background: 0x373936,
  cameraNear: 0.05,
  cameraFar: 80,
  exposure: 2.05,
  depthOfField: Object.freeze({ focusMaterial: "CommandRoomLetter", focus: 1.3, range: .12, focusPadding: .025,
    aperture: 10, maxRadius: 3.2,
    panelBlur: 7.5, transitionSeconds: .18 }),
  parallax: Object.freeze({ horizontal: .0425, vertical: .0225, focusDistance: 1.65, aimFollow: .28, responseSeconds: .24 }),
  // UV1 irradiance from Blender Cycles, separate from all surface albedos.
  bakedLighting: Object.freeze({ name: "CommandRoomLighting", scale: 32, intensity: 3.141592653589793 }),
  outside: Object.freeze({ color: 0xffffff, intensity: .45 }),
  // A one-time capture of this room supplies the ink glass's window reflection.
  reflection: Object.freeze({ material: "CommandRoomInkGlass", size: 256, near: .02, far: 16, intensity: 1.8,
    detailMaterials: Object.freeze(["CommandRoomInkLid", "CommandRoomCapBrass", "CommandRoomCapEnamel"]), detailIntensity: .65 }),
  glass: Object.freeze({ transmission: .99, roughness: .055, thickness: .0035, attenuationColor: 0xbe781f, attenuationDistance: .018 }),
  cabinet: Object.freeze({ tint: 0xf0ede7, roughness: .98 }),
  materials: Object.freeze([
    { name: "CommandRoomFarmland", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomWood", kind: "pbr", normal: 0.45, tint: 0xffffff },
    { name: "CommandRoomPlaster", kind: "pbr", normal: 0.40, tint: 0xf2eee3 },
    { name: "CommandRoomWallSurface", kind: "pbr", normal: 0.30, tint: 0xffffff, clamp: true },
    { name: "CommandRoomCloth", kind: "pbr", normal: 0.25, tint: 0xffffff },
    { name: "CommandRoomCapCloth", kind: "pbr", normal: 0.4, tint: 0xffffff },
    { name: "CommandRoomMap", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomLetter", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomInkLabel", kind: "print", normal: 0, tint: 0xffffff },
  ]),
  dust: Object.freeze({ count: 320, color: 0xf2d8bd, opacity: .6, size: .0025, drift: .0175 }),
  // Actual Blender aperture; ray integration clips against camera and light depth.
  windowHaze: Object.freeze({ center: [-.838725, 1.5137625, -1.176775], size: [.3705, .944775],
    direction: [1.15, -1.0, 1.72], length: 1.9, density: .42, color: 0xefd1b6,
    edgeSoftness: .0175, steps: 36, resolutionScale: .5,
    shadowSize: 1024, shadowExtent: .9, shadowDistance: 1.5, shadowFar: 4, shadowBias: .00035 }),
});
