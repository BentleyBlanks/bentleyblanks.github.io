// Dedicated static menu set. Values are authored against the three approved references.
export const COMMAND_ROOM = Object.freeze({
  version: "202610052230",
  model: "./Model/Model_CommandRoom.glb",
  background: 0x373936,
  cameraNear: 0.05,
  cameraFar: 80,
  exposure: 2.65,
  depthOfField: Object.freeze({ focus: 3.0, range: 1.0, aperture: 5.5, maxRadius: 1.5 }),
  parallax: Object.freeze({ horizontal: .085, vertical: .045, focusDistance: 3.3, aimFollow: .28, responseSeconds: .24 }),
  // UV1 irradiance from Blender Cycles, separate from all surface albedos.
  bakedLighting: Object.freeze({ name: "CommandRoomLighting", scale: 32, intensity: 3.141592653589793 }),
  outside: Object.freeze({ color: 0xa3abb1, intensity: 0.75 }),
  // A one-time capture of this room supplies the ink glass's window reflection.
  reflection: Object.freeze({ material: "CommandRoomInkGlass", size: 256, near: .02, far: 16, intensity: 1.8 }),
  glass: Object.freeze({ transmission: .99, roughness: .055, thickness: .0035, attenuationColor: 0xbe781f, attenuationDistance: .018 }),
  brickTint: 0x70716d,
  materials: Object.freeze([
    { name: "CommandRoomWood", kind: "pbr", normal: 0.45, tint: 0xffffff },
    { name: "CommandRoomPlaster", kind: "pbr", normal: 0.55, tint: 0xb8b7b0 },
    { name: "CommandRoomCloth", kind: "pbr", normal: 0.25, tint: 0xffffff },
    { name: "CommandRoomMap", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomLetter", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomInkLabel", kind: "print", normal: 0, tint: 0xffffff },
  ]),
  dust: Object.freeze({ count: 460, color: 0xf1dfb7, opacity: .6, size: .0035, drift: .035 }),
  // Actual Blender aperture; ray integration clips against camera and light depth.
  windowHaze: Object.freeze({ center: [-1.67745, 2.412525, -2.35355], size: [.741, 1.88955],
    direction: [.8, -1.25, 1.6], length: 3.25, density: .19, color: 0xecd5af,
    edgeSoftness: .035, steps: 36, resolutionScale: .5,
    shadowSize: 1024, shadowExtent: 1.8, shadowDistance: 3, shadowFar: 8, shadowBias: .0007 }),
});
