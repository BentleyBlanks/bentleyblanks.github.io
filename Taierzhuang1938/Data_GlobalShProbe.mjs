// 通用室外 Global SH Probe。
//
// 源数据：three.js examples / venice_sunset_1k.hdr（MIT License）
// 下载地址：https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr
// SHA-256：0e72ed46b5316cb5fb67fc81ff85b024a09146fd89ef3811a8d2299647ada118
//
// 系数由原始 1024×512 Radiance HDR 在经纬球面上积分得到，采用 three.js
// SphericalHarmonics3 / LightProbe 的 L2 顺序。运行时只需 27 个 float，不加载
// 1.4 MB HDR，也不会把一张环境贴图重新作为 IBL 叠回画面。

export const GLOBAL_SH_PROBE_SOURCE = Object.freeze({
  name: "Venice Sunset 1k",
  license: "MIT",
  sha256: "0e72ed46b5316cb5fb67fc81ff85b024a09146fd89ef3811a8d2299647ada118",
});

export const GLOBAL_SH_PROBE_COEFFICIENTS = Object.freeze([
  1.81134991, 1.70984223, 2.17327192,
  0.65308945, 0.86558153, 1.43316492,
 -1.25095122,-0.82649949,-0.65878937,
  0.77902160, 0.39985898, 0.19223845,
  0.32692791, 0.19744311, 0.10172974,
 -0.49138112,-0.35268019,-0.29225373,
  0.74478966, 0.32763884, 0.04137677,
 -0.98199686,-0.49647619,-0.28980981,
  0.57455040, 0.30879523, 0.07877488,
]);
