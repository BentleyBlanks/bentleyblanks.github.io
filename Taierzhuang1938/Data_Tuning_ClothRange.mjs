// Test-only material/solver profiles. Never imported by the campaign blanket.
export const CLOTH_LAB_PRESETS = Object.freeze({
  thin: Object.freeze({ stretch: 1, compress: 0.02, shear: 0.3, bend: 0.008, airDamping: 1.2, groundFriction: 0.3, density: 0.18, thickness: 0.008, roughness: 0.88, wind: 2 }),
  cotton: Object.freeze({ stretch: 1, compress: 0.12, shear: 0.55, bend: 0.06, airDamping: 2.6, groundFriction: 0.45, density: 0.45, thickness: 0.022, roughness: 0.95, wind: 2 }),
  quilt: Object.freeze({ stretch: 1, compress: 0.14, shear: 0.65, bend: 0.07, airDamping: 4.5, groundFriction: 0.62, density: 1.5, thickness: 0.08, roughness: 1, wind: 1.2 }),
  curtain: Object.freeze({ stretch: 1, compress: 0.18, shear: 0.65, bend: 0.09, airDamping: 3.1, groundFriction: 0.5, density: 0.8, thickness: 0.03, roughness: 0.98, wind: 1.8 }),
  banner: Object.freeze({ stretch: 1, compress: 0.035, shear: 0.42, bend: 0.018, airDamping: 1.5, groundFriction: 0.35, density: 0.24, thickness: 0.004, roughness: 0.89, wind: 3.2 }),
});
export const CLOTH_LAB_CONTROLS = Object.freeze([
  { key: 'thickness', min: 0.003, max: 0.12, step: 0.001, unit: 'mm', scale: 1000 },
  { key: 'density', min: 0.1, max: 2.5, step: 0.05, unit: 'kg/m²' },
  { key: 'bend', min: 0.001, max: 0.6, step: 0.001 },
  { key: 'stretch', min: 0.5, max: 1, step: 0.01 },
  { key: 'compress', min: 0.001, max: 0.6, step: 0.001 },
  { key: 'shear', min: 0.05, max: 1, step: 0.01 },
  { key: 'airDamping', min: 0.2, max: 8, step: 0.1, unit: '/s' },
  { key: 'groundFriction', min: 0, max: 1.5, step: 0.01 },
  { key: 'roughness', min: 0.5, max: 1, step: 0.01 },
  { key: 'wind', min: 0, max: 8, step: 0.1, unit: 'm/s' },
]);
export const CLOTH_LAB_ASSETS = Object.freeze([
  Object.freeze({ id: 'quilt', file: 'Model_DongguaQuilt.glb', x: -3, width: 1.4, length: 1.9, bindingOutsetM: 0.008, thickness: 0.08, preset: 'quilt' }),
  Object.freeze({ id: 'curtain', file: 'Model_DoorCurtain.glb', x: 0, width: 1.25, length: 1.9, bindingOutsetM: 0.002, thickness: 0.032, top: 2.5, preset: 'curtain' }),
  Object.freeze({ id: 'banner', file: 'Model_SichuanBanner.glb', x: 3, width: 1.45, length: 1.75, bindingOutsetM: 0.0008, thickness: 0.0025, top: 2.8, preset: 'banner' }),
]);
export const CLOTH_LAB_SIM = Object.freeze({ stepS: 1 / 60, maxSteps: 4, iterations: 12, maxSpeedMps: 4,
  gustS: 1.5, gustMps: 4, windAccelerationMax: 18, pressure: 0.12, bodyY: 0.46, bodyRadius: 0.28,
  frictionDynamicRatio: 0.75, frictionContactSlopM: 0.0015, frictionMaxCoefficient: 1.5, frictionMaxSurfaceSpeedMps: 6,
  slideSpeedMps: 2, slideZ: 2,
  cameraMin: 1.1, cameraMax: 15, cameraTurn: 0.006, cameraZoom: 0.001, cameraPan: 0.0015 });
export function ClampClothParameter(key, value) {
  const control = CLOTH_LAB_CONTROLS.find(item => item.key === key);
  if (!control || !Number.isFinite(value)) return null;
  return Math.max(control.min, Math.min(control.max, value));
}
