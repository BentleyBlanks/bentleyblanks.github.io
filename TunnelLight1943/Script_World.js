// 《地道里的光》 —— Three.js 白盒渲染层。
// 只消费 Script_Core.mjs 的布局数据与状态，不持有任何玩法逻辑。

import * as THREE from "three";
import { LAYOUTS, CHAPTERS, GetBeatTarget, CurrentBeatDef, NodeSmoked } from "./Script_Core.mjs";

const PALETTE = {
  earthDay: 0x8a7a55, earthNight: 0x3a3f47, earthDawn: 0x7d786a,
  wallDay: 0xa89577, roof: 0x7d6a52, burnt: 0x35302b, rubble: 0x413a32,
  fortWall: 0x7d7565, blockhouse: 0x6b6357,
  tunnelFloor: 0x8a7458, tunnelWall: 0x5c4a34, tunnelDark: 0x0b0907,
  hay: 0xb09a58, tree: 0x4a5c38, trunk: 0x5d4a33, crops: 0x7c8a4a,
  zhuzi: 0xc8863c, sister: 0xb0616a, mother: 0x8a6a58, father: 0x6b4f3a,
  militia: 0x4a5d68, soldier: 0x6f6b42, villager: 0x8d8272,
  lamp: 0xffb356, marker: 0xe8c15a, visionCalm: 0xd8b83c, visionAlert: 0xd8543c,
  smoke: 0x8f8d85,
};

function Mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function AddBox(group, w, h, d, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), Mat(color, opts));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function AddCylinder(group, rTop, rBottom, h, color, x, y, z, seg = 10, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), Mat(color, opts));
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
export function CreateWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 400);

  const envGroup = new THREE.Group();
  const actorGroup = new THREE.Group();
  const fxGroup = new THREE.Group();
  scene.add(envGroup, actorGroup, fxGroup);

  const lights = { hemi: null, sun: null, lamp: null, points: [] };
  const actorMeshes = new Map();
  const coneMeshes = new Map();
  const smokeMeshes = new Map();
  let carveMark = null;
  let collapseMeshes = {};
  let planksMeshes = [];
  let markerRing = null;
  let builtKey = "";

  // -------------------------------------------------------------------------
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
      scene.background = new THREE.Color(0xd9ccab);
      scene.fog = new THREE.Fog(0xd9ccab, 70, 190);
      lights.hemi = new THREE.HemisphereLight(0xf4e8cd, 0x6b5b3f, 1.05);
      lights.sun = new THREE.DirectionalLight(0xffe8bb, 1.2);
      lights.sun.position.set(-40, 60, -30);
    } else if (kind === "night") {
      scene.background = new THREE.Color(0x101625);
      scene.fog = new THREE.Fog(0x101625, 50, 150);
      lights.hemi = new THREE.HemisphereLight(0x6a7a9e, 0x2c2930, 1.15);
      lights.sun = new THREE.DirectionalLight(0x9fb3d8, 0.9);
      lights.sun.position.set(30, 70, -20);
    } else if (kind === "dawn") {
      scene.background = new THREE.Color(0xb6ac9c);
      scene.fog = new THREE.Fog(0xb6ac9c, 60, 170);
      lights.hemi = new THREE.HemisphereLight(0xe0d2b8, 0x5c5448, 1.15);
      lights.sun = new THREE.DirectionalLight(0xe8b98a, 0.95);
      lights.sun.position.set(60, 30, 20);
    } else if (kind === "tunnel") {
      scene.background = new THREE.Color(0x070605);
      scene.fog = new THREE.Fog(0x070605, 16, 60);
      lights.hemi = new THREE.HemisphereLight(0x7a6850, 0x1d1810, 1.3);
      lights.sun = new THREE.DirectionalLight(0x000000, 0);
      lights.sun.position.set(0, 50, 0);
    } else { // dark：第七章据点地道，压暗留给煤油灯，但轮廓要能读出来
      scene.background = new THREE.Color(0x050404);
      scene.fog = new THREE.Fog(0x050404, 9, 40);
      lights.hemi = new THREE.HemisphereLight(0x4a3a28, 0x0a0705, 0.55);
      lights.sun = new THREE.DirectionalLight(0x000000, 0);
      lights.sun.position.set(0, 50, 0);
    }
    scene.add(lights.hemi, lights.sun);
  }

  function AddPointLamp(x, y, z, intensity = 0.9, distance = 14, color = PALETTE.lamp) {
    const p = new THREE.PointLight(color, intensity, distance, 1.6);
    p.position.set(x, y, z);
    scene.add(p);
    lights.points.push(p);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    bulb.position.copy(p.position);
    envGroup.add(bulb);
    return p;
  }

  // -------------------------------------------------------------------------
  function BuildVillage(light, ruined) {
    const L = LAYOUTS.village;
    const groundColor = light === "night" ? PALETTE.earthNight : (light === "dawn" ? PALETTE.earthDawn : PALETTE.earthDay);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.size + 60, L.size + 60), Mat(groundColor));
    ground.rotation.x = -Math.PI / 2;
    envGroup.add(ground);

    for (const b of L.buildings) {
      const isBurnt = ruined && b.burnable;
      if (isBurnt) {
        // 烧毁：只剩矮墙和瓦砾
        AddBox(envGroup, b.w, 1.0, 0.4, PALETTE.burnt, b.x, 0.5, b.z - b.d / 2);
        AddBox(envGroup, 0.4, 1.3, b.d, PALETTE.burnt, b.x - b.w / 2, 0.65, b.z);
        AddBox(envGroup, b.w * 0.5, 0.6, b.d * 0.5, PALETTE.rubble, b.x + b.w * 0.1, 0.3, b.z + b.d * 0.1);
        if (b.id === "homeHouse") {
          // 残墙 + 门框：故事的锚点，必须立着
          AddBox(envGroup, 0.4, 2.6, b.d * 0.8, PALETTE.burnt, b.x + b.w / 2 - 0.2, 1.3, b.z);
        }
      } else {
        AddBox(envGroup, b.w, b.h, b.d, PALETTE.wallDay, b.x, b.h / 2, b.z);
        AddBox(envGroup, b.w + 0.6, 0.5, b.d + 0.6, PALETTE.roof, b.x, b.h + 0.25, b.z);
      }
    }
    for (const w of L.walls) {
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      const wall = AddBox(envGroup, len, w.h, 0.5, ruined ? PALETTE.burnt : 0x968465,
        (w.x1 + w.x2) / 2, w.h / 2, (w.z1 + w.z2) / 2);
      wall.rotation.y = -Math.atan2(w.z2 - w.z1, w.x2 - w.x1);
    }
    for (const h of L.haystacks) {
      const hs = new THREE.Mesh(new THREE.ConeGeometry(h.r, 2.2, 8), Mat(ruined ? 0x6e6350 : PALETTE.hay));
      hs.position.set(h.x, 1.1, h.z);
      envGroup.add(hs);
    }
    for (const t of L.trees) {
      AddCylinder(envGroup, 0.25, 0.35, t.big ? 3.4 : 2.2, PALETTE.trunk, t.x, (t.big ? 3.4 : 2.2) / 2, t.z, 6);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(t.big ? 2.8 : 1.6, 8, 6), Mat(ruined ? 0x5c5a48 : PALETTE.tree));
      crown.position.set(t.x, t.big ? 4.6 : 3.0, t.z);
      envGroup.add(crown);
    }
    planksMeshes = [];
    for (const p of L.props) {
      if (p.kind === "well") {
        AddCylinder(envGroup, 1.1, 1.1, 0.9, 0x7d7568, p.x, 0.45, p.z, 10);
      } else if (p.kind === "bench") {
        AddBox(envGroup, 2.2, 0.9, 0.9, 0x8a6f4d, p.x, 0.45, p.z);
      } else if (p.kind === "doorframe") {
        // 门框与身高线：第一章与第八章的情感锚点
        AddBox(envGroup, 0.22, 2.3, 0.22, 0x9c7c50, p.x - 0.6, 1.15, p.z);
        AddBox(envGroup, 0.22, 2.3, 0.22, 0x9c7c50, p.x + 0.6, 1.15, p.z);
        AddBox(envGroup, 1.42, 0.22, 0.22, 0x9c7c50, p.x, 2.35, p.z);
        const mark1 = AddBox(envGroup, 0.06, 0.03, 0.26, 0xe8d9a8, p.x - 0.6, 1.32, p.z);
        mark1.material = new THREE.MeshBasicMaterial({ color: 0xe8d9a8 });
        carveMark = AddBox(envGroup, 0.06, 0.03, 0.26, 0xf4e6b4, p.x - 0.6, 1.62, p.z);
        carveMark.material = new THREE.MeshBasicMaterial({ color: 0xf4e6b4 });
        carveMark.visible = false;
      } else if (p.kind === "cellar") {
        AddBox(envGroup, 1.6, 0.25, 1.6, 0x4f4436, p.x, 0.12, p.z);
      } else if (p.kind === "millstone") {
        AddCylinder(envGroup, 1.3, 1.3, 0.5, 0x8d867c, p.x, 0.25, p.z, 12);
      } else if (p.kind === "woodpile") {
        AddBox(envGroup, 2.4, 1.1, 1.4, 0x7a5f3e, p.x, 0.55, p.z);
      } else if (p.kind === "stool" && ruined) {
        AddBox(envGroup, 0.5, 0.45, 0.35, 0x8a6f4d, p.x, 0.22, p.z);
      }
    }
    if (light === "night") {
      AddPointLamp(56, 2.4, 4, 0.8, 12, 0xffc978); // 村东口的马灯（第二章伏击的伏笔）
    }
  }

  function BuildFields() {
    const L = LAYOUTS.fields;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.size + 60, L.size + 60), Mat(0x3a4149));
    ground.rotation.x = -Math.PI / 2;
    envGroup.add(ground);

    for (const b of L.buildings) {
      const color = b.id === "blockhouse" ? PALETTE.blockhouse : PALETTE.fortWall;
      AddBox(envGroup, b.w, b.h, b.d, color, b.x, b.h / 2, b.z);
      if (b.id === "blockhouse") {
        AddBox(envGroup, b.w * 0.7, 1.2, b.d * 0.7, 0x57503f, b.x, b.h + 0.6, b.z);
      }
      if (b.id === "prisonShed") {
        // 牢房窗上的一点灯：柱子在第三章远远看到的方向
        AddPointLamp(b.x, 2.2, b.z + b.d / 2 + 0.3, 0.55, 8, 0xd8b56a);
        for (let i = 0; i < 3; i += 1) {
          AddBox(envGroup, 0.08, 1.0, 0.08, 0x2a2620, b.x - 2 + i * 2, 1.6, b.z + b.d / 2 + 0.05);
        }
      }
    }
    for (const w of L.walls) {
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      const wall = AddBox(envGroup, len, w.h, 0.6, PALETTE.fortWall, (w.x1 + w.x2) / 2, w.h / 2, (w.z1 + w.z2) / 2);
      wall.rotation.y = -Math.atan2(w.z2 - w.z1, w.x2 - w.x1);
    }
    // 角楼
    AddCylinder(envGroup, 1.4, 1.6, 5.2, 0x615a4b, -20, 2.6, -26, 8);
    AddCylinder(envGroup, 1.4, 1.6, 5.2, 0x615a4b, 20, 2.6, -26, 8);
    AddPointLamp(-20, 5.6, -26, 0.7, 16, 0xffdf9a);
    AddPointLamp(20, 5.6, -26, 0.7, 16, 0xffdf9a);
    AddPointLamp(0, 3.0, 3, 0.7, 10, 0xffc978); // 南门岗哨灯

    for (const h of L.haystacks) {
      const hs = new THREE.Mesh(new THREE.ConeGeometry(h.r, 2.2, 8), Mat(0x6e6448));
      hs.position.set(h.x, 1.1, h.z);
      envGroup.add(hs);
    }
    for (const t of L.trees) {
      AddCylinder(envGroup, 0.25, 0.35, 2.2, PALETTE.trunk, t.x, 1.1, t.z, 6);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), Mat(0x39442e));
      crown.position.set(t.x, 3.0, t.z);
      envGroup.add(crown);
    }
    for (const p of L.props) {
      if (p.kind === "crops") {
        // 庄稼地：一片片矮秆
        for (let i = 0; i < 24; i += 1) {
          const gx = p.x + ((i * 37) % 14) - 7;
          const gz = p.z + ((i * 53) % 12) - 6;
          AddBox(envGroup, 0.14, 1.5, 0.14, PALETTE.crops, gx, 0.75, gz);
        }
      } else if (p.kind === "ditch") {
        AddBox(envGroup, 26, 0.3, 3.4, 0x191d22, p.x, 0.05, p.z);
      }
    }
  }

  function BuildTunnel(envKey) {
    const L = LAYOUTS[envKey];
    const depth = L.depth;
    // 覆土层：让画面读出“我们在地下”
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), Mat(PALETTE.tunnelDark));
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = depth - 0.2;
    envGroup.add(cap);

    const wallH = 1.9;
    for (const [a, b] of L.edges) {
      const na = L.nodes[a], nb = L.nodes[b];
      const len = Math.hypot(nb.x - na.x, nb.z - na.z);
      const cx = (na.x + nb.x) / 2, cz = (na.z + nb.z) / 2;
      const ang = -Math.atan2(nb.z - na.z, nb.x - na.x);
      const hw = L.corridorHalfWidth;
      const floor = AddBox(envGroup, len + hw * 2, 0.16, hw * 2, PALETTE.tunnelFloor, cx, depth, cz);
      floor.rotation.y = ang;
      const wallN = AddBox(envGroup, len + hw * 2, wallH, 0.3, PALETTE.tunnelWall, cx, depth + wallH / 2, cz);
      wallN.rotation.y = ang;
      wallN.translateZ(-(hw + 0.15));
      const wallS = AddBox(envGroup, len + hw * 2, wallH, 0.3, PALETTE.tunnelWall, cx, depth + wallH / 2, cz);
      wallS.rotation.y = ang;
      wallS.translateZ(hw + 0.15);
    }
    for (const key of Object.keys(L.nodes)) {
      const n = L.nodes[key];
      AddCylinder(envGroup, n.r + 0.4, n.r + 0.4, 0.18, PALETTE.tunnelFloor, n.x, depth + 0.02, n.z, 14);
      if (n.name) {
        // 洞室矮墙一圈（留通道口不封）
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(n.r + 0.6, n.r + 0.6, wallH * 0.8, 12, 1, true),
          new THREE.MeshLambertMaterial({ color: PALETTE.tunnelWall, side: THREE.BackSide, transparent: true, opacity: 0.7 }),
        );
        ring.position.set(n.x, depth + wallH * 0.4, n.z);
        envGroup.add(ring);
      }
    }
    if (envKey === "tunnelVillage") {
      // 村地道常备的油灯：微弱但活着
      AddPointLamp(L.nodes.chamberA.x, depth + 1.4, L.nodes.chamberA.z, 1.3, 12);
      AddPointLamp(L.nodes.chamberB.x, depth + 1.4, L.nodes.chamberB.z, 1.3, 12);
      AddPointLamp(L.nodes.entW.x, depth + 1.4, L.nodes.entW.z, 0.9, 9);
      AddPointLamp(L.nodes.juncE.x, depth + 1.4, L.nodes.juncE.z, 0.8, 9);
    }
    // 出入口竖井微光
    const entKeys = envKey === "tunnelVillage" ? ["entE", "entW"] : ["fieldEnt", "cellHatch"];
    for (const key of entKeys) {
      const n = L.nodes[key];
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, -depth, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x2e3140, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      );
      shaft.position.set(n.x, depth / 2, n.z);
      envGroup.add(shaft);
    }
    // 据点地道的塌方堆
    collapseMeshes = {};
    if (envKey === "tunnelFort") {
      for (const key of ["collapse1", "collapse2"]) {
        const n = L.nodes[key];
        const pile = new THREE.Group();
        for (let i = 0; i < 5; i += 1) {
          const rock = new THREE.Mesh(
            new THREE.BoxGeometry(0.7 - i * 0.08, 0.5, 0.7 - i * 0.06),
            Mat(PALETTE.rubble),
          );
          rock.position.set(n.x + ((i * 31) % 10) / 10 - 0.5, depth + 0.25 + i * 0.28, n.z + ((i * 17) % 10) / 10 - 0.5);
          rock.rotation.y = i * 0.7;
          pile.add(rock);
        }
        envGroup.add(pile);
        collapseMeshes[key] = pile;
      }
    }
  }

  function BuildEnvironment(state) {
    const ch = CHAPTERS[state.chapterIndex];
    const key = `${ch.env}:${ch.light}:${state.flags.ruined ? 1 : 0}`;
    if (key === builtKey) return;
    builtKey = key;
    ClearGroup(envGroup);
    for (const p of lights.points) scene.remove(p);
    lights.points = [];
    carveMark = null;
    SetLights(ch.light);
    if (ch.env === "village") BuildVillage(ch.light, state.flags.ruined);
    else if (ch.env === "fields") BuildFields();
    else BuildTunnel(ch.env);
  }

  // -------------------------------------------------------------------------
  const ACTOR_COLORS = {
    player: PALETTE.zhuzi, sister: PALETTE.sister, family: PALETTE.mother,
    militia: PALETTE.militia, soldier: PALETTE.soldier, villager: PALETTE.villager,
  };

  function MakeActorMesh(kind, id) {
    const group = new THREE.Group();
    let color = ACTOR_COLORS[kind] ?? PALETTE.villager;
    if (id === "father") color = PALETTE.father;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.15, 8), Mat(color));
    body.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), Mat(0xc9a276));
    head.position.y = 1.55;
    group.add(body, head);
    if (kind === "soldier") {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.16, 8), Mat(0x55522f));
      cap.position.y = 1.72;
      group.add(cap);
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), Mat(0x3d3126));
      rifle.position.set(0.42, 1.0, 0);
      rifle.rotation.z = 0.25;
      group.add(rifle);
    }
    if (kind === "militia") {
      const towel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8), Mat(0xd8d2c0));
      towel.position.y = 1.7;
      group.add(towel);
    }
    group.userData = { kind, id, body, head };
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

  function MakeVisionCone() {
    const geo = new THREE.CircleGeometry(10.5, 20, Math.PI / 2 - 0.61, 1.22);
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.visionCalm, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  function GroundY(state) {
    const env = CHAPTERS[state.chapterIndex].env;
    return (env === "tunnelVillage" || env === "tunnelFort") ? LAYOUTS[env].depth : 0;
  }

  function UpdateActors(state, time) {
    const gy = GroundY(state);
    const seen = new Set(["player"]);
    // 玩家
    const playerMesh = EnsureActorMesh("player", "player");
    playerMesh.position.set(state.player.x, gy, state.player.z);
    playerMesh.rotation.y = state.player.heading;
    playerMesh.scale.y = state.player.crouch ? 0.68 : 1;
    // 搬木料
    let carryMesh = playerMesh.userData.carryMesh;
    if (state.player.carry && !carryMesh) {
      carryMesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.24), Mat(0x9a7a4d));
      carryMesh.position.set(0, 1.9, 0);
      playerMesh.add(carryMesh);
      playerMesh.userData.carryMesh = carryMesh;
    } else if (!state.player.carry && carryMesh) {
      playerMesh.remove(carryMesh);
      playerMesh.userData.carryMesh = null;
    }
    // 煤油灯
    if (state.player.lamp) {
      if (!lights.lamp) {
        lights.lamp = new THREE.PointLight(PALETTE.lamp, 1.5, 13, 1.4);
        scene.add(lights.lamp);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: PALETTE.lamp }));
        bulb.position.set(0.4, 1.0, 0.2);
        playerMesh.add(bulb);
        playerMesh.userData.lampBulb = bulb;
      }
      const flicker = 1.35 + Math.sin(time * 9.7) * 0.12 + Math.sin(time * 23.3) * 0.06;
      lights.lamp.intensity = flicker;
      lights.lamp.position.set(state.player.x, gy + 1.2, state.player.z);
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
      mesh.position.set(a.x, gy, a.z);
      mesh.rotation.y = a.heading || 0;
      // 士兵视锥
      if (a.kind === "soldier") {
        let cone = coneMeshes.get(a.id);
        if (!cone) {
          cone = MakeVisionCone();
          coneMeshes.set(a.id, cone);
          fxGroup.add(cone);
        }
        cone.visible = mesh.visible && state.stealthActive;
        cone.position.set(a.x, gy + 0.06, a.z);
        cone.rotation.z = -(a.heading || 0);
        const alert = state.detection.spotter === a.id ? state.detection.level : 0;
        cone.material.color.setHex(alert > 0.15 ? PALETTE.visionAlert : PALETTE.visionCalm);
        cone.material.opacity = 0.13 + alert * 0.25;
      }
    }
    // 清理离场角色
    for (const [id, mesh] of actorMeshes) {
      if (id !== "player" && !seen.has(id)) {
        actorGroup.remove(mesh);
        actorMeshes.delete(id);
        const cone = coneMeshes.get(id);
        if (cone) { fxGroup.remove(cone); coneMeshes.delete(id); }
      }
    }
    for (const [id, cone] of coneMeshes) {
      if (!seen.has(id)) { fxGroup.remove(cone); coneMeshes.delete(id); }
    }
  }

  function UpdateProps(state, time) {
    const gy = GroundY(state);
    // 木料（第一章）
    const def = CurrentBeatDef(state);
    if (def?.kind === "collect" && state.beat.itemStates) {
      while (planksMeshes.length < state.beat.itemStates.length) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.24), Mat(0x9a7a4d));
        fxGroup.add(m);
        planksMeshes.push(m);
      }
      state.beat.itemStates.forEach((it, i) => {
        const m = planksMeshes[i];
        m.visible = !it.carried && !it.delivered;
        m.position.set(it.x, gy + 0.4, it.z);
        m.rotation.y = i * 0.6;
      });
    } else if (planksMeshes.length) {
      for (const m of planksMeshes) fxGroup.remove(m);
      planksMeshes = [];
    }
    // 烟（第四章）
    if (state.smoke) {
      const L = LAYOUTS.tunnelVillage;
      for (const key of state.smoke.filled) {
        if (!smokeMeshes.has(key)) {
          const n = L.nodes[key];
          const cluster = new THREE.Group();
          for (let i = 0; i < 3; i += 1) {
            const s = new THREE.Mesh(
              new THREE.SphereGeometry(0.7 + i * 0.35, 8, 6),
              new THREE.MeshLambertMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.4 - i * 0.08 }),
            );
            s.position.set(((i * 13) % 5) / 3 - 0.7, 0.6 + i * 0.5, ((i * 7) % 5) / 3 - 0.7);
            cluster.add(s);
          }
          cluster.position.set(n.x, L.depth + 0.4, n.z);
          fxGroup.add(cluster);
          smokeMeshes.set(key, cluster);
        }
      }
      for (const [, cluster] of smokeMeshes) {
        cluster.children.forEach((s, i) => { s.position.y = 0.6 + i * 0.5 + Math.sin(time * 1.4 + i) * 0.12; });
      }
    } else if (smokeMeshes.size) {
      for (const [, m] of smokeMeshes) fxGroup.remove(m);
      smokeMeshes.clear();
    }
    // 塌方（第七章）
    if (state.collapses) {
      for (const key of Object.keys(state.collapses)) {
        const pile = collapseMeshes[key];
        if (!pile) continue;
        const c = state.collapses[key];
        pile.visible = !c.cleared;
        if (!c.cleared && c.progress > 0) {
          pile.scale.setScalar(Math.max(0.25, 1 - (c.progress / 3.5) * 0.75));
        }
      }
    }
    // 第八章新刻痕
    if (carveMark) carveMark.visible = !!state.flags.carved;
    // 目标指示环
    const target = state.phase === "playing" ? GetBeatTarget(state) : null;
    const showRing = target && target.x !== undefined && CurrentBeatDef(state)?.kind !== "cinematic";
    if (showRing) {
      if (!markerRing) {
        markerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.8, 1.05, 24),
          new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
        );
        markerRing.rotation.x = -Math.PI / 2;
        fxGroup.add(markerRing);
      }
      markerRing.visible = true;
      markerRing.position.set(target.x, gy + 0.08, target.z);
      const pulse = 1 + Math.sin(time * 3.2) * 0.18;
      markerRing.scale.setScalar(pulse);
    } else if (markerRing) {
      markerRing.visible = false;
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
    BuildEnvironment, UpdateActors, UpdateProps, Resize, Render, GroundY,
    GetActorMesh: (id) => actorMeshes.get(id),
  };
}
