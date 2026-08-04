// 《地道里的光》 —— Three.js 横版 2.5D 渲染层（勇敢的心式分层视差 + 地道剖面）。
// 只消费 Script_Core.mjs 的场景数据与状态，不持有玩法逻辑。
// 层次：z=0 玩法层；z<0 背景视差层；地下以剖面呈现（地表条带 + 掏空的地道内壁）。

import * as THREE from "three";
import { SCENES, CHAPTERS, SURFACE_Y, UNDER_Y, GetBeatTarget, CurrentBeatDef, SmokeCovers } from "./Script_Core.mjs";

const PALETTE = {
  zhuzi: 0xc8863c, sister: 0xb0616a, mother: 0x8a6a58, father: 0x6b4f3a,
  militia: 0x4a5d68, soldier: 0x6f6b42, villager: 0x8d8272, puppet: 0x8d8060,
  lamp: 0xffb356, marker: 0xe8c15a, beamCalm: 0xd8b83c, beamAlert: 0xd8543c,
  smoke: 0x8f8d85,
};

function Mat(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, ...opts }); }

function AddBox(group, w, h, d, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Mat(color, opts));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
export function CreateWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 300);

  const envGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  const fxGroup = new THREE.Group();
  scene.add(envGroup, actorGroup, fxGroup);

  const lights = { hemi: null, sun: null, lamp: null, points: [] };
  const actorMeshes = new Map();
  const beamMeshes = new Map();
  let smokeMesh = null;
  let smokePuffs = null;
  let carveMark = null;
  let collapseMeshes = {};
  let planksMeshes = [];
  let markerArrow = null;
  let probeRods = [];
  let builtKey = "";

  function ClearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse?.((o) => { o.geometry?.dispose?.(); });
      group.remove(child);
    }
  }

  function SetLights(kind) {
    for (const p of lights.points) scene.remove(p);
    lights.points = [];
    if (lights.hemi) scene.remove(lights.hemi);
    if (lights.sun) scene.remove(lights.sun);
    if (kind === "day") {
      scene.background = new THREE.Color(0xd9cba6);
      scene.fog = new THREE.Fog(0xd9cba6, 55, 140);
      lights.hemi = new THREE.HemisphereLight(0xf4e8cd, 0x6b5b3f, 1.1);
      lights.sun = new THREE.DirectionalLight(0xffe8bb, 1.15);
      lights.sun.position.set(-30, 50, 40);
    } else if (kind === "night") {
      scene.background = new THREE.Color(0x131a2c);
      scene.fog = new THREE.Fog(0x131a2c, 45, 130);
      lights.hemi = new THREE.HemisphereLight(0x6a7a9e, 0x2c2930, 1.1);
      lights.sun = new THREE.DirectionalLight(0x9fb3d8, 0.85);
      lights.sun.position.set(20, 60, 45);
    } else if (kind === "dawn") {
      scene.background = new THREE.Color(0xbcae97);
      scene.fog = new THREE.Fog(0xbcae97, 55, 140);
      lights.hemi = new THREE.HemisphereLight(0xe0d2b8, 0x5c5448, 1.1);
      lights.sun = new THREE.DirectionalLight(0xe8b98a, 0.9);
      lights.sun.position.set(60, 25, 40);
    } else if (kind === "tunnel") {
      scene.background = new THREE.Color(0x1a1712);
      scene.fog = new THREE.Fog(0x1a1712, 45, 120);
      lights.hemi = new THREE.HemisphereLight(0x9a866a, 0x241d12, 1.5);
      lights.sun = new THREE.DirectionalLight(0xc8b490, 0.7);
      lights.sun.position.set(0, 40, 50);
    } else { // dark：第七章
      scene.background = new THREE.Color(0x0b0908);
      scene.fog = new THREE.Fog(0x0b0908, 16, 70);
      lights.hemi = new THREE.HemisphereLight(0x54432e, 0x0c0906, 0.78);
      lights.sun = new THREE.DirectionalLight(0x000000, 0);
      lights.sun.position.set(0, 40, 50);
    }
    scene.add(lights.hemi, lights.sun);
  }

  function AddPointLamp(x, y, z, intensity = 0.9, distance = 12, color = PALETTE.lamp) {
    const p = new THREE.PointLight(color, intensity, distance, 1.6);
    p.position.set(x, y, z);
    scene.add(p);
    lights.points.push(p);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color }));
    bulb.position.copy(p.position);
    envGroup.add(bulb);
    return p;
  }

  // -------------------------------------------------------------------------
  // 视差背景：一排排剪影
  // -------------------------------------------------------------------------
  function AddParallaxHouses(xFrom, xTo, z, color, hBase = 3) {
    for (let x = xFrom; x < xTo; x += 14 + ((x * 7) % 9)) {
      const w = 8 + ((x * 13) % 6);
      const h = hBase + ((x * 5) % 3) * 0.5;
      AddBox(envGroup, w, h, 2, color, x, h / 2, z);
      AddBox(envGroup, w + 1, 0.5, 2.4, color, x, h + 0.2, z);
    }
  }

  function AddParallaxTrees(xFrom, xTo, z, color) {
    for (let x = xFrom; x < xTo; x += 17 + ((x * 11) % 13)) {
      AddBox(envGroup, 0.5, 2.6, 0.5, color, x, 1.3, z);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.9 + ((x * 3) % 3) * 0.4, 7, 6), Mat(color));
      crown.position.set(x, 3.6, z);
      envGroup.add(crown);
    }
  }

  function AddHills(length, z, color) {
    for (let x = -20; x < length + 40; x += 46) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(26, 10, 8), Mat(color));
      hill.scale.set(1.6, 0.32, 1);
      hill.position.set(x, 0, z);
      envGroup.add(hill);
    }
  }

  // -------------------------------------------------------------------------
  // 地表道具
  // -------------------------------------------------------------------------
  function BuildProp(p, light, ruined) {
    switch (p.kind) {
      case "house": {
        if (ruined && p.burnable) {
          AddBox(envGroup, p.w * 0.9, 1.1, 1.6, 0x35302b, p.x + 1, 0.55, -0.8);
          AddBox(envGroup, 0.5, 2.6, 1.4, 0x3d3630, p.x - p.w / 2 + 1, 1.3, -0.8);
          AddBox(envGroup, p.w * 0.4, 0.5, 1.4, 0x413a32, p.x + 2, 0.25, -0.4);
        } else {
          AddBox(envGroup, p.w, p.h, 3, 0xa89577, p.x, p.h / 2, -1.6);
          AddBox(envGroup, p.w + 1.2, 0.55, 3.6, 0x7d6a52, p.x, p.h + 0.27, -1.6);
          // 立面细节：窗与檐下阴影线，破掉大色块
          AddBox(envGroup, 1.1, 1.1, 0.2, 0x4a3f30, p.x - p.w / 4, 1.9, -0.08);
          AddBox(envGroup, 1.1, 1.1, 0.2, 0x4a3f30, p.x + p.w / 4, 1.9, -0.08);
          AddBox(envGroup, p.w, 0.18, 0.2, 0x6b5b45, p.x, p.h - 0.2, -0.08);
        }
        break;
      }
      case "doorframe": {
        AddBox(envGroup, 0.22, 2.3, 0.3, 0x9c7c50, p.x - 0.62, 1.15, 0.1);
        AddBox(envGroup, 0.22, 2.3, 0.3, 0x9c7c50, p.x + 0.62, 1.15, 0.1);
        AddBox(envGroup, 1.5, 0.22, 0.3, 0x9c7c50, p.x, 2.35, 0.1);
        const mark1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.1), new THREE.MeshBasicMaterial({ color: 0xe8d9a8 }));
        mark1.position.set(p.x - 0.62, 1.32, 0.28);
        envGroup.add(mark1);
        carveMark = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.1), new THREE.MeshBasicMaterial({ color: 0xf4e6b4 }));
        carveMark.position.set(p.x - 0.62, 1.62, 0.28);
        carveMark.visible = false;
        envGroup.add(carveMark);
        break;
      }
      case "bench": AddBox(envGroup, 2.2, 0.9, 1, 0x8a6f4d, p.x, 0.45, 0); break;
      case "stool": AddBox(envGroup, 0.5, 0.45, 0.4, 0x8a6f4d, p.x, 0.22, 0.3); break;
      case "wallSeg": AddBox(envGroup, p.w || 1, p.h || 1.8, 0.5, 0x968465, p.x, (p.h || 1.8) / 2, 0); break;
      case "hatch": AddBox(envGroup, 1.8, 0.18, 1.4, 0x4f4436, p.x, 0.09, 0); break;
      case "well": {
        AddBox(envGroup, 2.2, 0.9, 1.6, 0x7d7568, p.x, 0.45, -0.4);
        AddBox(envGroup, 0.14, 2.2, 0.14, 0x6b5a45, p.x - 0.9, 1.1, -0.4);
        AddBox(envGroup, 0.14, 2.2, 0.14, 0x6b5a45, p.x + 0.9, 1.1, -0.4);
        AddBox(envGroup, 2.0, 0.12, 0.12, 0x6b5a45, p.x, 2.2, -0.4);
        break;
      }
      case "millstone": {
        const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 12), Mat(0x8d867c));
        stone.position.set(p.x, 0.25, -0.2);
        envGroup.add(stone);
        break;
      }
      case "woodpile": AddBox(envGroup, 2.6, 1.1, 1.4, 0x7a5f3e, p.x, 0.55, 0); break;
      case "tree": {
        AddBox(envGroup, 0.6, 3.6, 0.6, 0x5d4a33, p.x, 1.8, -0.6);
        const crown = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), Mat(0x4a5c38));
        crown.position.set(p.x, 4.9, -0.6);
        envGroup.add(crown);
        break;
      }
      case "lamppost": {
        AddBox(envGroup, 0.16, 2.6, 0.16, 0x5a4a38, p.x, 1.3, -0.3);
        if (light === "night") AddPointLamp(p.x, 2.5, 0, 0.8, 10, 0xffc978);
        break;
      }
      case "ditch": AddBox(envGroup, p.w, 0.9, 3.4, 0x22262b, p.x, -0.42, 0.2); break;
      case "crops": {
        for (let x = p.x - p.w / 2; x < p.x + p.w / 2; x += 1.4) {
          AddBox(envGroup, 0.16, 1.5 + ((x * 7) % 4) * 0.1, 0.16, 0x6e7a42, x, 0.75, ((x * 5) % 3) * 0.5 - 0.5);
        }
        break;
      }
      case "fortWall": AddBox(envGroup, p.w, p.h, 2, 0x7d7565, p.x, p.h / 2, -1); break;
      case "fortGate": {
        AddBox(envGroup, 0.4, 3, 0.8, 0x6b6357, p.x - 1.6, 1.5, -0.8);
        AddBox(envGroup, 0.4, 3, 0.8, 0x6b6357, p.x + 1.6, 1.5, -0.8);
        AddPointLamp(p.x, 2.8, 0, 0.7, 10, 0xffc978);
        break;
      }
      case "blockhouse": {
        AddBox(envGroup, 6, 8.5, 5, 0x6b6357, p.x, 4.25, -6);
        AddBox(envGroup, 6.8, 1, 5.6, 0x57503f, p.x, 8.9, -6);
        AddPointLamp(p.x - 2, 8.2, -3, 0.9, 16, 0xffdf9a);
        break;
      }
      case "prison": {
        AddBox(envGroup, 8, 3, 4, 0x746c5c, p.x, 1.5, -4);
        for (let i = 0; i < 3; i += 1) AddBox(envGroup, 0.1, 1, 0.1, 0x2a2620, p.x - 2 + i * 2, 1.7, -1.9);
        AddPointLamp(p.x, 2.2, -1.5, 0.6, 8, 0xd8b56a);
        break;
      }
      case "fortSilhouette": {
        AddBox(envGroup, p.w, 3, 3, 0x3a352c, p.x, 1.5, -8);
        AddBox(envGroup, 5, 7.5, 4, 0x332f27, p.x + 18, 3.75, -9);
        break;
      }
      default: break;
    }
  }

  function BuildCover(c, light) {
    switch (c.kind) {
      case "haystack": {
        const hs = new THREE.Mesh(new THREE.ConeGeometry(c.w / 2 + 0.4, 2.3, 8), Mat(light === "day" ? 0xb09a58 : 0x6e6448));
        hs.position.set(c.x, 1.15, 0.3);
        envGroup.add(hs);
        break;
      }
      case "firewood": AddBox(envGroup, c.w, 1.2, 1, 0x6e5638, c.x, 0.6, 0.3); break;
      case "wallSeg": AddBox(envGroup, c.w, 1.5, 0.5, 0x968465, c.x, 0.75, 0.3); break;
      case "bush": {
        const b = new THREE.Mesh(new THREE.SphereGeometry(c.w / 2 + 0.5, 7, 6), Mat(0x44523a));
        b.scale.y = 0.75;
        b.position.set(c.x, 0.9, 0.3);
        envGroup.add(b);
        break;
      }
      case "ridge": AddBox(envGroup, c.w, 0.9, 1.4, 0x4a4438, c.x, 0.45, 0.3); break;
      default: break;
    }
  }

  // -------------------------------------------------------------------------
  // 地下剖面
  // -------------------------------------------------------------------------
  function BuildUnderground(sceneDef, state) {
    const range = sceneDef.walk.under;
    if (!range) return;
    const tunnelTop = UNDER_Y + 2.1;
    // 地道内壁背板（暖土色）
    AddBox(envGroup, range[1] - range[0] + 3, 2.3, 0.3, 0x94764e, (range[0] + range[1]) / 2, UNDER_Y + 1.05, -1.3);
    // 地道地板与顶沿
    AddBox(envGroup, range[1] - range[0] + 3, 0.25, 2.6, 0x75593a, (range[0] + range[1]) / 2, UNDER_Y - 0.12, -0.2);
    AddBox(envGroup, range[1] - range[0] + 3, 0.3, 2.6, 0x3a2f22, (range[0] + range[1]) / 2, tunnelTop + 0.15, -0.2);
    // 地表与地道之间的土层
    AddBox(envGroup, range[1] - range[0] + 20, -tunnelTop - 0.5, 2.2, 0x2b2318,
      (range[0] + range[1]) / 2, (tunnelTop + (-0.5)) / 2, -0.9);
    // 地道两端的封土
    AddBox(envGroup, 3, 2.6, 2.4, 0x2b2318, range[0] - 2, UNDER_Y + 1.2, -0.4);
    AddBox(envGroup, 3, 2.6, 2.4, 0x2b2318, range[1] + 2, UNDER_Y + 1.2, -0.4);
    // 深处的底土
    AddBox(envGroup, range[1] - range[0] + 30, 2.5, 3, 0x1c1610, (range[0] + range[1]) / 2, UNDER_Y - 1.6, -0.9);

    // 支撑木柱（每隔一段一组，地道战剖面的标志性画面）
    for (let x = range[0] + 4; x < range[1] - 2; x += 9) {
      AddBox(envGroup, 0.22, 2.1, 0.22, 0x7a5f3e, x, UNDER_Y + 1.05, -1.0);
      AddBox(envGroup, 1.4, 0.18, 0.22, 0x7a5f3e, x, tunnelTop - 0.1, -1.0);
    }

    // 竖井（爬梯口）
    for (const shaft of sceneDef.shafts) {
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      AddBox(envGroup, 1.7, -UNDER_Y - 2.0 + 2.4, 0.3, 0x5c4a34, shaft.x, (tunnelTop + 0.3) / 2 + 0.4, -1.25);
      for (let y = UNDER_Y + 0.6; y < 0; y += 0.55) {
        AddBox(envGroup, 1.1, 0.09, 0.12, 0x8a6f4d, shaft.x, y, -0.9);
      }
      AddBox(envGroup, 2.2, 0.16, 1.2, 0x4f4436, shaft.x, 0.08, 0);
    }
  }

  function BuildTunnelExtras(sceneDef, state, sceneKey) {
    collapseMeshes = {};
    for (const p of sceneDef.props) {
      if (p.kind === "chamber") {
        // 藏人洞：更高的拱室 + 木框
        AddBox(envGroup, p.w, 3.1, 0.3, 0xa0805a, p.x, UNDER_Y + 1.45, -1.28);
        AddBox(envGroup, 0.25, 2.9, 0.25, 0x7a5f3e, p.x - p.w / 2 + 0.4, UNDER_Y + 1.45, -1.0);
        AddBox(envGroup, 0.25, 2.9, 0.25, 0x7a5f3e, p.x + p.w / 2 - 0.4, UNDER_Y + 1.45, -1.0);
        AddBox(envGroup, p.w - 0.4, 0.2, 0.25, 0x7a5f3e, p.x, UNDER_Y + 2.8, -1.0);
        AddBox(envGroup, 1.6, 0.5, 1.2, 0x5a4a38, p.x - p.w / 2 + 1.4, UNDER_Y + 0.25, -0.5);
        if (sceneKey === "tunnelVillage") AddPointLamp(p.x, UNDER_Y + 1.9, 0, 1.1, 10);
      } else if (p.kind === "pocket") {
        AddBox(envGroup, 5.5, 2.6, 0.3, 0x8a6c48, p.x, UNDER_Y + 1.2, -1.28);
        AddBox(envGroup, 0.22, 2.3, 0.22, 0x7a5f3e, p.x - 2.4, UNDER_Y + 1.15, -1.0);
        AddBox(envGroup, 0.22, 2.3, 0.22, 0x7a5f3e, p.x + 2.4, UNDER_Y + 1.15, -1.0);
      } else if (p.kind === "vent") {
        // 通风眼：从地道顶通到井壁的暗管
        AddBox(envGroup, 0.55, -UNDER_Y - 1.4, 0.4, 0x4a3c2c, p.x, (UNDER_Y + 2.1) / 2 + 0.7, -1.2);
      } else if (p.kind === "bell") {
        const bell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), Mat(0xb8a15c));
        bell.position.set(p.x, UNDER_Y + 1.9, -0.6);
        envGroup.add(bell);
        AddBox(envGroup, 0.04, 0.5, 0.04, 0x8d8272, p.x, UNDER_Y + 2.2, -0.6);
      } else if (p.kind === "collapse") {
        const pile = new THREE.Group();
        for (let i = 0; i < 6; i += 1) {
          const rock = new THREE.Mesh(new THREE.BoxGeometry(0.8 - i * 0.07, 0.55, 0.9), Mat(0x413a32));
          rock.position.set(p.x + ((i * 31) % 10) / 12 - 0.4, UNDER_Y + 0.28 + i * 0.34, ((i * 17) % 8) / 10 - 0.4);
          rock.rotation.z = i * 0.4;
          pile.add(rock);
        }
        envGroup.add(pile);
        collapseMeshes[p.id] = pile;
      } else {
        BuildProp(p, "night", false);
      }
    }
  }

  // -------------------------------------------------------------------------
  function BuildEnvironment(state) {
    const ch = CHAPTERS[state.chapterIndex];
    const key = `${ch.scene}:${ch.light}:${state.flags.ruined ? 1 : 0}:${state.flags.hiddenBuilt ? 1 : 0}`;
    if (key === builtKey) return;
    builtKey = key;
    ClearGroup(envGroup);
    for (const p of lights.points) scene.remove(p);
    lights.points = [];
    carveMark = null;
    SetLights(ch.light);

    const sceneDef = SCENES[ch.scene];
    const groundColor = ch.light === "day" ? 0x8a7a55 : (ch.light === "dawn" ? 0x7d786a : (ch.light === "night" ? 0x3d434d : 0x3a3126));
    // 地表条带
    AddBox(envGroup, sceneDef.length + 120, 0.6, 14, groundColor, sceneDef.length / 2, -0.3, -3);

    if (ch.scene === "village") {
      AddHills(sceneDef.length, -46, ch.light === "day" ? 0x9a8c68 : 0x232b3a);
      AddParallaxHouses(-10, sceneDef.length + 10, -22, ch.light === "day" ? 0x8d7c60 : (state.flags.ruined ? 0x3a352c : 0x2e3442), 2.6);
      AddParallaxTrees(6, sceneDef.length, -12, ch.light === "day" ? 0x5c6b42 : 0x28323c);
      for (const p of sceneDef.props) BuildProp(p, ch.light, state.flags.ruined);
      for (const c of sceneDef.covers) BuildCover(c, ch.light);
      BuildUnderground(sceneDef, state); // 地窖
    } else if (ch.scene === "fields") {
      AddHills(sceneDef.length, -46, 0x1e2733);
      AddParallaxTrees(0, sceneDef.length - 60, -18, 0x252e28);
      for (const p of sceneDef.props) BuildProp(p, ch.light, false);
      for (const c of sceneDef.covers) BuildCover(c, ch.light);
    } else {
      // 地道剖面场景：地表建筑 + 地下网络
      AddHills(sceneDef.length, -46, ch.scene === "tunnelFort" ? 0x141210 : 0x1c1a14);
      if (ch.scene === "tunnelVillage") {
        AddParallaxHouses(0, sceneDef.length, -20, 0x2a251c, 2.6);
      }
      for (const p of sceneDef.props.filter((x) => ["millstone", "well", "house", "fortSilhouette"].includes(x.kind))) {
        BuildProp(p, "night", false);
      }
      BuildUnderground(sceneDef, state);
      BuildTunnelExtras(sceneDef, state, ch.scene);
    }
  }

  // -------------------------------------------------------------------------
  // 角色
  // -------------------------------------------------------------------------
  const ACTOR_COLORS = {
    player: PALETTE.zhuzi, sister: PALETTE.sister, family: PALETTE.mother,
    militia: PALETTE.militia, soldier: PALETTE.soldier, villager: PALETTE.villager,
    puppet: PALETTE.puppet,
  };

  function MakeActorMesh(kind, id) {
    const group = new THREE.Group();
    let color = ACTOR_COLORS[kind] ?? PALETTE.villager;
    if (id === "father") color = PALETTE.father;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.15, 8), Mat(color));
    body.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), Mat(0xc9a276));
    head.position.y = 1.55;
    group.add(body, head);
    if (kind === "soldier") {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.16, 8), Mat(0x55522f));
      cap.position.y = 1.72;
      group.add(cap);
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), Mat(0x3d3126));
      rifle.position.set(0, 1.0, -0.42);
      rifle.rotation.x = 0.25;
      group.add(rifle);
    }
    if (kind === "puppet") {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.14, 8), Mat(0x2e2a24));
      hat.position.y = 1.72;
      group.add(hat);
    }
    if (kind === "militia") {
      const towel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8), Mat(0xd8d2c0));
      towel.position.y = 1.7;
      group.add(towel);
    }
    group.userData = { kind, id };
    return group;
  }

  function EnsureActorMesh(id, kind) {
    let mesh = actorMeshes.get(id);
    if (!mesh) {
      mesh = MakeActorMesh(kind, id);
      actorMeshes.set(id, mesh);
      actorGroup.add(mesh);
    }
    return mesh;
  }

  function LevelY(level) { return level === "under" ? UNDER_Y : SURFACE_Y; }

  function UpdateActors(state, time) {
    const seen = new Set(["player"]);
    const p = state.player;
    const playerMesh = EnsureActorMesh("player", "player");
    playerMesh.position.set(p.x, LevelY(p.level), 0);
    playerMesh.rotation.y = (p.heading || 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
    playerMesh.scale.y = p.crouch ? 0.68 : 1;

    let carryMesh = playerMesh.userData.carryMesh;
    if (p.carry && !carryMesh) {
      carryMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 1.7), Mat(0x9a7a4d));
      carryMesh.position.set(0, 1.95, 0);
      playerMesh.add(carryMesh);
      playerMesh.userData.carryMesh = carryMesh;
    } else if (!p.carry && carryMesh) {
      playerMesh.remove(carryMesh);
      playerMesh.userData.carryMesh = null;
    }

    if (p.lamp) {
      if (!lights.lamp) {
        lights.lamp = new THREE.PointLight(PALETTE.lamp, 1.6, 12, 1.4);
        scene.add(lights.lamp);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: PALETTE.lamp }));
        bulb.position.set(0, 1.0, 0.4);
        playerMesh.add(bulb);
        playerMesh.userData.lampBulb = bulb;
      }
      lights.lamp.intensity = 1.5 + Math.sin(time * 9.7) * 0.14 + Math.sin(time * 23.3) * 0.07;
      lights.lamp.position.set(p.x, LevelY(p.level) + 1.2, 0.5);
    } else if (lights.lamp) {
      scene.remove(lights.lamp);
      lights.lamp = null;
      if (playerMesh.userData.lampBulb) {
        playerMesh.remove(playerMesh.userData.lampBulb);
        playerMesh.userData.lampBulb = null;
      }
    }

    for (const a of state.actors) {
      seen.add(a.id);
      const mesh = EnsureActorMesh(a.id, a.kind);
      mesh.visible = a.visible !== false;
      mesh.position.set(a.x, LevelY(a.level || "surface"), 0);
      mesh.rotation.y = (a.heading || 1) > 0 ? Math.PI / 2 : -Math.PI / 2;
      // 提灯
      if (a.lantern && !mesh.userData.lanternLight) {
        const ll = new THREE.PointLight(0xffc978, 0.9, 9, 1.6);
        ll.position.set(0, 1.1, 0.5);
        mesh.add(ll);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffc978 }));
        bulb.position.copy(ll.position);
        mesh.add(bulb);
        mesh.userData.lanternLight = ll;
      }
      // 视线光束（横向）
      if (a.kind === "soldier" || a.kind === "puppet") {
        let beam = beamMeshes.get(a.id);
        if (!beam) {
          beam = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.55, 0.4),
            new THREE.MeshBasicMaterial({ color: PALETTE.beamCalm, transparent: true, opacity: 0.14, depthWrite: false }),
          );
          beamMeshes.set(a.id, beam);
          fxGroup.add(beam);
        }
        const len = 15 * 0.8;
        beam.visible = mesh.visible && state.stealthActive;
        beam.scale.x = len;
        beam.position.set(a.x + (a.heading || 1) * len / 2, LevelY(a.level || "surface") + 1.2, 0.3);
        const alert = state.detection.spotter === a.id ? state.detection.level : 0;
        beam.material.color.setHex(alert > 0.15 ? PALETTE.beamAlert : PALETTE.beamCalm);
        beam.material.opacity = 0.1 + alert * 0.3;
      }
    }
    for (const [id, mesh] of actorMeshes) {
      if (id !== "player" && !seen.has(id)) {
        actorGroup.remove(mesh);
        actorMeshes.delete(id);
        const beam = beamMeshes.get(id);
        if (beam) { fxGroup.remove(beam); beamMeshes.delete(id); }
      }
    }
    for (const [id, beam] of beamMeshes) {
      if (!seen.has(id)) { fxGroup.remove(beam); beamMeshes.delete(id); }
    }
  }

  // -------------------------------------------------------------------------
  function UpdateProps(state, time) {
    const def = CurrentBeatDef(state);
    // 木料/水桶
    if (def?.kind === "collect" && state.beat.itemStates) {
      while (planksMeshes.length < state.beat.itemStates.length) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 1.7), Mat(0x9a7a4d));
        fxGroup.add(m);
        planksMeshes.push(m);
      }
      state.beat.itemStates.forEach((it, i) => {
        const m = planksMeshes[i];
        m.visible = !it.carried && !it.delivered;
        m.position.set(it.x, 0.4 + i * 0.18, 0.3);
      });
    } else if (planksMeshes.length) {
      for (const m of planksMeshes) fxGroup.remove(m);
      planksMeshes = [];
    }

    // 烟：从东侧充满到 frontX
    if (state.smoke?.active) {
      const sceneDef = SCENES[CHAPTERS[state.chapterIndex].scene];
      const range = sceneDef.walk.under;
      if (range) {
        const east = range[1] + 2;
        const w = Math.max(0.1, east - state.smoke.frontX);
        if (!smokeMesh) {
          smokeMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 2.3, 2.2),
            new THREE.MeshLambertMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.5 }),
          );
          fxGroup.add(smokeMesh);
          smokePuffs = new THREE.Group();
          for (let i = 0; i < 3; i += 1) {
            const s = new THREE.Mesh(
              new THREE.SphereGeometry(0.5 + i * 0.25, 7, 6),
              new THREE.MeshLambertMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.38 - i * 0.08 }),
            );
            smokePuffs.add(s);
          }
          fxGroup.add(smokePuffs);
        }
        smokeMesh.scale.x = w;
        smokeMesh.position.set(state.smoke.frontX + w / 2, UNDER_Y + 1.05, 0);
        smokePuffs.children.forEach((s, i) => {
          s.position.set(state.smoke.frontX - 0.3 - i * 0.7, UNDER_Y + 0.8 + i * 0.5 + Math.sin(time * 1.6 + i * 2) * 0.15, 0.2);
        });
      }
    } else if (smokeMesh) {
      fxGroup.remove(smokeMesh);
      fxGroup.remove(smokePuffs);
      smokeMesh = null;
      smokePuffs = null;
    }

    // 塌方
    if (state.collapses) {
      for (const key of Object.keys(state.collapses)) {
        const pile = collapseMeshes[key];
        if (!pile) continue;
        const c = state.collapses[key];
        pile.visible = !c.cleared;
        if (!c.cleared && c.progress > 0) pile.scale.setScalar(Math.max(0.3, 1 - (c.progress / 3.5) * 0.7));
      }
    }

    // 探杆：预兆/响动时从地表往下戳
    const quakeOn = state.beat && (state.beat.quakeWarn || state.beat.quakeActive)
      && (def?.kind === "digSeq" || def?.kind === "rescueLoop");
    if (quakeOn) {
      if (!probeRods.length) {
        for (let i = 0; i < 3; i += 1) {
          const rod = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.6, 0.09), Mat(0x4a4438));
          fxGroup.add(rod);
          probeRods.push(rod);
        }
      }
      probeRods.forEach((rod, i) => {
        rod.visible = true;
        const jab = state.beat.quakeActive ? Math.abs(Math.sin(time * 5 + i * 1.7)) : 0.2;
        rod.position.set(state.player.x - 3 + i * 3 + Math.sin(i * 7) * 1.2, 0.6 - jab * 1.8, -0.4);
      });
    } else {
      for (const rod of probeRods) rod.visible = false;
    }

    // 第八章新刻痕
    if (carveMark) carveMark.visible = !!state.flags.carved;

    // 目标指示：跳动的小箭头
    const target = state.phase === "playing" ? GetBeatTarget(state) : null;
    const showMarker = target && target.x !== undefined && def?.kind !== "cinematic" && !state.microCine;
    if (showMarker) {
      if (!markerArrow) {
        markerArrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.32, 0.6, 4),
          new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.85 }),
        );
        markerArrow.rotation.x = Math.PI;
        fxGroup.add(markerArrow);
      }
      markerArrow.visible = true;
      const baseY = LevelY(target.level || "surface");
      markerArrow.position.set(target.x, baseY + 2.5 + Math.sin(time * 4) * 0.18, 0);
    } else if (markerArrow) {
      markerArrow.visible = false;
    }
  }

  function Resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function Render() { renderer.render(scene, camera); }

  return {
    THREE, renderer, scene, camera,
    BuildEnvironment, UpdateActors, UpdateProps, Resize, Render,
    LevelY,
  };
}
