// Dedicated static menu set. Values are authored against the three approved references.
export const COMMAND_ROOM = Object.freeze({
  version: "202610040600",
  model: "./Model/Model_CommandRoom.glb",
  background: 0x373936,
  cameraNear: 0.05,
  cameraFar: 80,
  exposure: 1.4,
  // UV1 irradiance from Blender Cycles, separate from all surface albedos.
  bakedLighting: Object.freeze({ name: "CommandRoomLighting", scale: 32, intensity: 3.141592653589793 }),
  outside: Object.freeze({ color: 0xa3abb1, intensity: 0.75 }),
  brickTint: 0x70716d,
  materials: Object.freeze([
    { name: "CommandRoomWood", kind: "pbr", normal: 0.45, tint: 0xffffff },
    { name: "CommandRoomPlaster", kind: "pbr", normal: 0.55, tint: 0xb8b7b0 },
    { name: "CommandRoomCloth", kind: "pbr", normal: 0.25, tint: 0xffffff },
    { name: "CommandRoomMap", kind: "print", normal: 0, tint: 0xffffff },
    { name: "CommandRoomLetter", kind: "print", normal: 0, tint: 0xffffff },
  ]),
  dust: Object.freeze({ count: 160, color: 0xbeb5a0, opacity: 0.23, size: 0.012, drift: 0.017 }),
  // Transparent slices follow the only actual aperture and authored sunlight direction.
  windowHaze: Object.freeze({ center: [-1.67745, 2.412525, -2.50175], size: [.8645, 2.013],
    direction: [.8, -1.25, 1.6], length: 2.2, slices: 48, opacity: .0013, color: 0xc8bd9e }),
});
