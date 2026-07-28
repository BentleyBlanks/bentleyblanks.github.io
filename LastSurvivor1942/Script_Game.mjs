import * as THREE from "three";
import {
  CreateGameState,
  FindNearbySite,
  GetActLabel,
  GetDistance,
  GetEvaluation,
  GetObjectives,
  GetSiteAction,
  InteractWithSite,
  StepGame,
  ThrowDistraction,
  UseMedicine,
  gameConfig,
  obstacleDefinitions,
  patrolVision,
  siteDefinitions,
} from "./Script_Rules.mjs";

const Element = (id) => document.getElementById(id);
const elements = {
  canvas: Element("GameCanvas"),
  topBar: Element("TopBar"),
  objectivePanel: Element("ObjectivePanel"),
  objectiveList: Element("ObjectiveList"),
  actLabel: Element("ActLabel"),
  conditionPanel: Element("ConditionPanel"),
  eventLog: Element("EventLog"),
  locationLabel: Element("LocationLabel"),
  interactionPrompt: Element("InteractionPrompt"),
  interactionText: Element("InteractionText"),
  detectedWarning: Element("DetectedWarning"),
  narrativeCaption: Element("NarrativeCaption"),
  captionTitle: Element("CaptionTitle"),
  captionText: Element("CaptionText"),
  controlHint: Element("ControlHint"),
  touchControls: Element("TouchControls"),
  moveStick: Element("MoveStick"),
  touchInteract: Element("TouchInteract"),
  touchDistract: Element("TouchDistract"),
  touchMedicine: Element("TouchMedicine"),
  startScreen: Element("StartScreen"),
  startButton: Element("StartButton"),
  startHistoryButton: Element("StartHistoryButton"),
  historyButton: Element("HistoryButton"),
  modalLayer: Element("ModalLayer"),
  historyModal: Element("HistoryModal"),
  pauseModal: Element("PauseModal"),
  resultModal: Element("ResultModal"),
  pauseButton: Element("PauseButton"),
  resumeButton: Element("ResumeButton"),
  pauseHistoryButton: Element("PauseHistoryButton"),
  restartButton: Element("RestartButton"),
  returnTitleButton: Element("ReturnTitleButton"),
  resultHistoryButton: Element("ResultHistoryButton"),
  resultRestartButton: Element("ResultRestartButton"),
  resultEyebrow: Element("ResultEyebrow"),
  resultTitle: Element("ResultTitle"),
  resultSummary: Element("ResultSummary"),
  resultScore: Element("ResultScore"),
  resultMetrics: Element("ResultMetrics"),
  resultReflection: Element("ResultReflection"),
  civilianValue: Element("CivilianValue"),
  grainValue: Element("GrainValue"),
  woundedValue: Element("WoundedValue"),
  alertValue: Element("AlertValue"),
  timeValue: Element("TimeValue"),
  conditionText: Element("ConditionText"),
  healthFill: Element("HealthFill"),
  hopeValue: Element("HopeValue"),
  loadingScreen: Element("LoadingScreen"),
  loadingFill: Element("LoadingFill"),
  loadingText: Element("LoadingText"),
  screenReaderStatus: Element("ScreenReaderStatus"),
};

const inputState = {
  keys: new Set(),
  touchX: 0,
  touchY: 0,
  stickPointerId: null,
  cameraPointerId: null,
  cameraLastX: 0,
  cameraLastY: 0,
  interact: false,
  distract: false,
  medicine: false,
};

let selectedDifficulty = "standard";
let gameState = null;
let gameMode = "menu";
let lastFrameTime = performance.now();
let lastEventId = 0;
let captionTimeout = null;
let currentModal = null;
let returnModal = null;
let resultShown = false;

const Clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const Lerp = (from, to, ratio) => from + (to - from) * ratio;

function CreateBox(width, height, depth, color, roughness = 0.88) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 }),
  );
}

function EnableShadows(object, castShadow = true, receiveShadow = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
    }
  });
  return object;
}

function CreateLabel(text, options = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = options.width || 420;
  const height = options.height || 94;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = options.background || "rgba(17,20,14,.82)";
  context.strokeStyle = options.border || "rgba(220,202,150,.5)";
  context.lineWidth = 2;
  context.fillRect(3, 3, width - 6, height - 6);
  context.strokeRect(3, 3, width - 6, height - 6);
  context.fillStyle = options.color || "#eee2c8";
  context.font = `600 ${options.fontSize || 30}px "Microsoft YaHei", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, opacity: options.opacity ?? 1 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((options.scale || 7.4), (options.scale || 7.4) * height / width, 1);
  sprite.userData.labelTexture = texture;
  return sprite;
}

function CreatePerson(options = {}) {
  const group = new THREE.Group();
  const bodyColor = options.bodyColor || 0x5e6547;
  const trouserColor = options.trouserColor || 0x31382d;
  const skinColor = options.skinColor || 0xa68161;
  const body = CreateBox(.75, 1.12, .43, bodyColor);
  body.position.y = 1.55;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.32, 10, 8),
    new THREE.MeshStandardMaterial({ color: skinColor, roughness: .95 }),
  );
  head.position.y = 2.43;
  head.scale.z = .9;
  const leftLeg = CreateBox(.25, .9, .28, trouserColor);
  leftLeg.position.set(-.2, .52, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = .2;
  const leftArm = CreateBox(.22, .92, .24, bodyColor);
  leftArm.position.set(-.52, 1.48, 0);
  leftArm.rotation.z = -.08;
  const rightArm = leftArm.clone();
  rightArm.position.x = .52;
  rightArm.rotation.z = .08;
  group.add(body, head, leftLeg, rightLeg, leftArm, rightArm);
  group.userData.parts = { leftLeg, rightLeg, leftArm, rightArm, body, head };

  if (options.headwear === "helmet") {
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(.39, 10, 6, 0, Math.PI * 2, 0, Math.PI * .58),
      new THREE.MeshStandardMaterial({ color: options.helmetColor || 0x6b6746, roughness: .9 }),
    );
    helmet.position.y = 2.51;
    helmet.scale.z = .95;
    group.add(helmet);
  } else if (options.headwear === "scarf") {
    const scarf = new THREE.Mesh(
      new THREE.CylinderGeometry(.34, .38, .28, 8),
      new THREE.MeshStandardMaterial({ color: 0x374034, roughness: .95 }),
    );
    scarf.position.y = 2.42;
    group.add(scarf);
  }

  if (options.armband) {
    const armband = CreateBox(.235, .18, .26, 0x9f3a31);
    armband.position.set(-.52, 1.67, 0);
    group.add(armband);
  }

  if (options.carryBundle) {
    const bundle = CreateBox(.82, .7, .34, 0x756544);
    bundle.position.set(0, 1.48, -.39);
    bundle.rotation.x = -.12;
    group.add(bundle);
  }

  EnableShadows(group);
  return group;
}

function CreateHouse(options = {}) {
  const group = new THREE.Group();
  const width = options.width || 5;
  const depth = options.depth || 4;
  const wall = CreateBox(width, 2.5, depth, options.wallColor || 0x867759);
  wall.position.y = 1.25;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * .71, 2, 4),
    new THREE.MeshStandardMaterial({ color: options.roofColor || 0x3f3c30, roughness: .96 }),
  );
  roof.position.y = 3.42;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = depth / width;
  const door = CreateBox(.9, 1.65, .12, 0x352e24);
  door.position.set(0, .85, depth / 2 + .07);
  group.add(wall, roof, door);
  if (options.burned) {
    wall.material.color.setHex(0x47443a);
    roof.material.color.setHex(0x252620);
    roof.scale.x = .62;
    roof.rotation.z = .28;
    for (let index = 0; index < 3; index += 1) {
      const beam = CreateBox(.22, 3.2, .22, 0x24231e);
      beam.position.set(-1.5 + index * 1.5, 2.6, 0);
      beam.rotation.z = index === 1 ? .13 : -.1;
      group.add(beam);
    }
  }
  EnableShadows(group);
  return group;
}

function CreateTree(scale = 1) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(.18 * scale, .28 * scale, 2.5 * scale, 7),
    new THREE.MeshStandardMaterial({ color: 0x4d4533, roughness: 1 }),
  );
  trunk.position.y = 1.25 * scale;
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x404a31, roughness: 1 });
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3 * scale, 0), crownMaterial);
  crown.position.y = 3.1 * scale;
  const crownTwo = crown.clone();
  crownTwo.scale.set(.76, .82, .76);
  crownTwo.position.set(.7 * scale, 3.35 * scale, .2 * scale);
  group.add(trunk, crown, crownTwo);
  EnableShadows(group);
  return group;
}

function CreateFire(size = 1) {
  const group = new THREE.Group();
  const emberMaterial = new THREE.MeshStandardMaterial({ color: 0xff7b35, emissive: 0xb63718, emissiveIntensity: 2, transparent: true, opacity: .87 });
  for (let index = 0; index < 3; index += 1) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.3 * size, 1.2 * size, 7), emberMaterial.clone());
    flame.position.set((index - 1) * .32 * size, .55 * size, (index % 2) * .18);
    flame.userData.phase = index * 1.7;
    group.add(flame);
  }
  const light = new THREE.PointLight(0xff6830, matchMedia("(pointer: coarse)").matches ? 0 : 3 * size, 16 * size, 2);
  light.position.y = 2;
  group.add(light);
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x282a25, transparent: true, opacity: .34, depthWrite: false });
  for (let index = 0; index < 5; index += 1) {
    const smoke = new THREE.Mesh(new THREE.DodecahedronGeometry(.36 * size, 0), smokeMaterial.clone());
    smoke.position.set((index % 2 ? .18 : -.14) * size, 1.2 * size + index * .55 * size, 0);
    smoke.scale.setScalar(1 + index * .18);
    smoke.userData.smokePhase = index * 1.3;
    smoke.userData.smokeBaseY = smoke.position.y;
    group.add(smoke);
  }
  group.userData.isFire = true;
  return group;
}

function CreateRoadBetween(fromX, fromZ, toX, toZ, width = 3.2, color = 0x716a51) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(width, distance),
    new THREE.MeshStandardMaterial({ color, roughness: 1, depthWrite: false }),
  );
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = -Math.atan2(toZ - fromZ, toX - fromX) + Math.PI / 2;
  road.position.set((fromX + toX) / 2, .035, (fromZ + toZ) / 2);
  road.receiveShadow = true;
  return road;
}

function CreateSiteMarker(site, color = 0xc8ad61) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.3, 1.5, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .12;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(.03, .2, 6, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 3;
  const label = CreateLabel(site.name, { scale: 5.8, fontSize: 27 });
  label.position.y = 3.6;
  group.add(ring, beam, label);
  group.position.set(site.x, 0, site.z);
  group.userData.ring = ring;
  group.userData.beam = beam;
  return group;
}

class WorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.isCoarse = matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isCoarse ? 1.1 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .83;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x656955);
    this.scene.fog = new THREE.FogExp2(0x5c604f, .016);
    this.camera = new THREE.PerspectiveCamera(54, 1, .1, 260);
    this.camera.position.set(-50, 15, -51);
    // Open northward from the ruined station so its collapsed roof frames the
    // background instead of sitting between the camera and Qin Guizhi.
    this.cameraYaw = 3.15;
    this.cameraPitch = .56;
    this.cameraDistance = 13.5;
    this.cameraTarget = new THREE.Vector3(-42, 1.4, -34);
    this.clockTime = 0;

    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.siteMarkers = new Map();
    this.patrolMeshes = new Map();
    this.patrolCones = new Map();
    this.civilianMeshes = [];
    this.liaisonMesh = null;
    this.fireGroups = [];
    this.siteVisuals = new Map();
    this.playerMesh = null;
    this.playerHalo = null;
    this.blockadeBeam = null;
    this.BuildWorld();
    this.Resize();
  }

  BuildWorld() {
    const hemisphere = new THREE.HemisphereLight(0xc8c8a4, 0x302f24, 2.1);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffe2b0, 3.2);
    sun.position.set(-42, 65, -28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.isCoarse ? 512 : 1536, this.isCoarse ? 512 : 1536);
    sun.shadow.camera.left = -75;
    sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75;
    sun.shadow.camera.bottom = -75;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.bias = -.0005;
    this.scene.add(sun);

    const terrainGeometry = new THREE.PlaneGeometry(122, 122, 40, 40);
    const positions = terrainGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const height = Math.sin(x * .18) * .34 + Math.cos(y * .14) * .28 + Math.sin((x + y) * .09) * .24;
      positions.setZ(index, height);
    }
    terrainGeometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      terrainGeometry,
      new THREE.MeshStandardMaterial({ color: 0x5c6246, roughness: 1, metalness: 0 }),
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    this.worldRoot.add(terrain);

    const roads = [
      [-56, -36, 54, -17, 4.2],
      [-31, -6, 43, 44, 3.1],
      [-8, -34, -6, 55, 2.6],
      [7, 17, 48, 41, 2.3],
    ];
    roads.forEach(([fromX, fromZ, toX, toZ, width]) => this.worldRoot.add(CreateRoadBetween(fromX, fromZ, toX, toZ, width)));

    const trenchMaterial = new THREE.MeshStandardMaterial({ color: 0x323a2e, roughness: 1 });
    const trench = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 108), trenchMaterial);
    trench.rotation.x = -Math.PI / 2;
    trench.rotation.z = -.24;
    trench.position.set(9, -.04, 8);
    this.worldRoot.add(trench);
    for (let index = -48; index <= 48; index += 6) {
      const post = CreateBox(.18, 1.1, .18, 0x4b4735);
      post.position.set(9 + index * .235, .55, 8 + index);
      post.rotation.y = -.24;
      this.worldRoot.add(post);
    }

    this.BuildRuinedStation();
    this.BuildVillage();
    this.BuildClinic();
    this.BuildGrainDepot();
    this.BuildRadioSites();
    this.BuildLandscape();
    this.BuildBlockade();

    siteDefinitions.forEach((site) => {
      if (site.type === "hide") this.BuildHideSite(site);
      if (!["hide", "memory"].includes(site.type)) {
        const marker = CreateSiteMarker(site, site.type === "exit" ? 0x9db472 : 0xc7a95b);
        this.siteMarkers.set(site.id, marker);
        this.worldRoot.add(marker);
      }
    });

    this.playerMesh = CreatePerson({ bodyColor: 0x596344, trouserColor: 0x2f372b, headwear: "scarf", carryBundle: true });
    this.playerMesh.scale.setScalar(.92);
    this.worldRoot.add(this.playerMesh);
    this.playerHalo = new THREE.Mesh(
      new THREE.RingGeometry(.72, .88, 32),
      new THREE.MeshBasicMaterial({ color: 0xdfc36c, transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.playerHalo.rotation.x = -Math.PI / 2;
    this.playerHalo.position.y = .12;
    this.worldRoot.add(this.playerHalo);

    for (let index = 0; index < 5; index += 1) {
      const person = CreatePerson({
        bodyColor: [0x6b6048, 0x4b5942, 0x6a5144, 0x535c42, 0x716148][index],
        trouserColor: 0x34352d,
        headwear: index === 0 || index === 3 ? "scarf" : null,
        carryBundle: index === 1 || index === 4,
      });
      person.scale.setScalar(index === 2 ? .72 : index === 4 ? .82 : .88);
      person.visible = false;
      this.civilianMeshes.push(person);
      this.worldRoot.add(person);
    }

    this.liaisonMesh = CreatePerson({ bodyColor: 0x4f5940, trouserColor: 0x2f352c, armband: true, carryBundle: true });
    this.liaisonMesh.scale.setScalar(.9);
    this.liaisonMesh.position.set(-8.4, 0, 31.4);
    this.liaisonMesh.rotation.y = 1.1;
    const liaisonLabel = CreateLabel("林砚 · 受伤交通员", { scale: 5.2, fontSize: 24, background: "rgba(42,48,32,.88)" });
    liaisonLabel.position.y = 3.6;
    this.liaisonMesh.add(liaisonLabel);
    this.worldRoot.add(this.liaisonMesh);
  }

  BuildRuinedStation() {
    const site = siteDefinitions.find((candidate) => candidate.id === "ruinedStation");
    const house = CreateHouse({ width: 6.8, depth: 5.2, burned: true });
    house.position.set(site.x, 0, site.z);
    house.rotation.y = .25;
    this.worldRoot.add(house);
    const fire = CreateFire(.72);
    fire.position.set(site.x + 1.3, .05, site.z - .7);
    this.fireGroups.push(fire);
    this.worldRoot.add(fire);
    const paper = CreateBox(1.1, .04, .8, 0xc9b989);
    paper.position.set(site.x - 1.2, .28, site.z + 2.8);
    paper.rotation.y = -.4;
    this.worldRoot.add(paper);
    this.siteVisuals.set(site.id, house);
  }

  BuildVillage() {
    const site = siteDefinitions.find((candidate) => candidate.id === "wujiaVillage");
    const group = new THREE.Group();
    const houses = [];
    [[-4, -2, .08], [2.4, -3.8, -.2], [4.4, 2.3, .35], [-2.3, 3.7, -.18]].forEach(([x, z, rotation], index) => {
      const house = CreateHouse({ width: index === 0 ? 5.8 : 4.6, depth: 3.7, wallColor: index === 2 ? 0x766a50 : 0x8b7b5a });
      house.position.set(x, 0, z);
      house.rotation.y = rotation;
      group.add(house);
      houses.push(house);
    });
    const tree = CreateTree(.85);
    tree.position.set(-.5, 0, .3);
    group.add(tree);
    const tiedVillagers = new THREE.Group();
    for (let index = 0; index < 5; index += 1) {
      const person = CreatePerson({ bodyColor: [0x66523e, 0x4c5b45, 0x6b614c][index % 3], trouserColor: 0x38352d });
      person.scale.setScalar(index === 2 ? .72 : .8);
      person.position.set(-2 + index, 0, 5.4 + (index % 2) * .45);
      person.rotation.y = Math.PI;
      tiedVillagers.add(person);
    }
    group.add(tiedVillagers);
    group.position.set(site.x, 0, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, { group, houses, tiedVillagers, burned: false });
  }

  BuildClinic() {
    const site = siteDefinitions.find((candidate) => candidate.id === "fieldClinic");
    const group = new THREE.Group();
    const house = CreateHouse({ width: 5.5, depth: 4.3, wallColor: 0x7d765d, roofColor: 0x48473a });
    const cross = CreateBox(.9, .18, .08, 0x8f3a31);
    cross.position.set(0, 1.75, 2.24);
    const crossBar = CreateBox(.18, .9, .08, 0x8f3a31);
    crossBar.position.copy(cross.position);
    group.add(house, cross, crossBar);
    group.position.set(site.x, 0, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, group);
  }

  BuildGrainDepot() {
    const site = siteDefinitions.find((candidate) => candidate.id === "grainDepot");
    const group = new THREE.Group();
    const shed = CreateHouse({ width: 6, depth: 4.5, wallColor: 0x70644d, roofColor: 0x36382f });
    shed.scale.y = .83;
    group.add(shed);
    for (let index = 0; index < 8; index += 1) {
      const sack = new THREE.Mesh(
        new THREE.CapsuleGeometry(.35, .6, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x9a845c, roughness: 1 }),
      );
      sack.rotation.z = Math.PI / 2;
      sack.position.set(-2.2 + (index % 4) * 1.1, .45 + Math.floor(index / 4) * .55, 2.7);
      group.add(sack);
    }
    const sign = CreateLabel("强制征粮", { scale: 4.2, fontSize: 28, color: "#f0d8c2", background: "rgba(81,32,24,.92)", border: "rgba(201,98,75,.65)" });
    sign.position.set(0, 4.6, 0);
    group.add(sign);
    group.position.set(site.x, 0, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, group);
  }

  BuildRadioSites() {
    const cache = siteDefinitions.find((candidate) => candidate.id === "radioCache");
    const cacheGroup = new THREE.Group();
    const culvert = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, .25, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x4c5143, roughness: 1 }),
    );
    culvert.rotation.z = Math.PI;
    culvert.rotation.x = Math.PI / 2;
    culvert.position.y = .2;
    const crate = CreateBox(1.25, .65, .85, 0x62513b);
    crate.position.y = .35;
    cacheGroup.add(culvert, crate);
    cacheGroup.position.set(cache.x, 0, cache.z);
    this.worldRoot.add(cacheGroup);
    this.siteVisuals.set(cache.id, cacheGroup);

    const relay = siteDefinitions.find((candidate) => candidate.id === "relayStation");
    const relayGroup = new THREE.Group();
    const house = CreateHouse({ width: 5.4, depth: 4.2, wallColor: 0x66684f, roofColor: 0x35382f });
    relayGroup.add(house);
    const mast = CreateBox(.18, 9, .18, 0x54584c);
    mast.position.set(1.8, 5, -.5);
    relayGroup.add(mast);
    for (let index = 0; index < 4; index += 1) {
      const rung = CreateBox(2.5 - index * .35, .1, .1, 0x54584c);
      rung.position.set(1.8, 3 + index * 1.45, -.5);
      relayGroup.add(rung);
    }
    relayGroup.position.set(relay.x, 0, relay.z);
    this.worldRoot.add(relayGroup);
    this.siteVisuals.set(relay.id, relayGroup);

    const exit = siteDefinitions.find((candidate) => candidate.id === "reedExit");
    const exitGroup = new THREE.Group();
    for (let index = 0; index < 55; index += 1) {
      const reed = new THREE.Mesh(
        new THREE.CylinderGeometry(.025, .04, 1.5 + (index % 4) * .25, 5),
        new THREE.MeshStandardMaterial({ color: index % 3 === 0 ? 0x7f7748 : 0x5d6843, roughness: 1 }),
      );
      const angle = index * 2.399;
      const radius = 1 + (index % 9) * .55;
      reed.position.set(Math.cos(angle) * radius, reed.geometry.parameters.height / 2, Math.sin(angle) * radius);
      exitGroup.add(reed);
    }
    exitGroup.position.set(exit.x, 0, exit.z);
    this.worldRoot.add(exitGroup);
    this.siteVisuals.set(exit.id, exitGroup);
  }

  BuildLandscape() {
    const exclusionZones = siteDefinitions.map((site) => ({ x: site.x, z: site.z, radius: site.radius + 5 }));
    const treeTransforms = [];
    for (let index = 0; index < 90; index += 1) {
      const angle = index * 2.399963;
      const radius = 12 + (index * 17) % 47;
      const x = Math.cos(angle) * radius + Math.sin(index * 1.9) * 8;
      const z = Math.sin(angle) * radius + Math.cos(index * 1.37) * 7;
      if (exclusionZones.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius)) continue;
      treeTransforms.push({ x, z, scale: .55 + (index % 5) * .12, rotation: angle });
    }

    const trunkGeometry = new THREE.CylinderGeometry(.18, .28, 2.5, 7);
    const crownGeometry = new THREE.DodecahedronGeometry(1.3, 0);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4d4533, roughness: 1 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x404a31, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeTransforms.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, treeTransforms.length);
    const crownSides = new THREE.InstancedMesh(crownGeometry, crownMaterial, treeTransforms.length);
    const transform = new THREE.Object3D();
    treeTransforms.forEach((tree, index) => {
      transform.position.set(tree.x, 1.25 * tree.scale, tree.z);
      transform.rotation.set(0, tree.rotation, 0);
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      transform.position.set(tree.x, 3.1 * tree.scale, tree.z);
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      crowns.setMatrixAt(index, transform.matrix);
      transform.position.set(tree.x + Math.cos(tree.rotation) * .7 * tree.scale, 3.35 * tree.scale, tree.z + Math.sin(tree.rotation) * .7 * tree.scale);
      transform.scale.set(tree.scale * .76, tree.scale * .82, tree.scale * .76);
      transform.updateMatrix();
      crownSides.setMatrixAt(index, transform.matrix);
    });
    [trunks, crowns, crownSides].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.worldRoot.add(mesh);
    });

    const cropMaterial = new THREE.MeshStandardMaterial({ color: 0x8f8950, roughness: 1 });
    const cropGeometry = new THREE.ConeGeometry(.08, .75, 4);
    const cropCount = 4 * 7 * 12;
    const crops = new THREE.InstancedMesh(cropGeometry, cropMaterial, cropCount);
    let cropIndex = 0;
    for (let fieldIndex = 0; fieldIndex < 4; fieldIndex += 1) {
      const baseX = [-43, -16, 17, 36][fieldIndex];
      const baseZ = [-10, -20, 4, 18][fieldIndex];
      for (let row = 0; row < 7; row += 1) {
        for (let column = 0; column < 12; column += 1) {
          transform.position.set(baseX + column * .72, .36, baseZ + row * .72);
          transform.rotation.set(0, 0, (column % 3 - 1) * .05);
          transform.scale.set(1, 1, 1);
          transform.updateMatrix();
          crops.setMatrixAt(cropIndex, transform.matrix);
          cropIndex += 1;
        }
      }
    }

    crops.receiveShadow = true;
    crops.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(crops);

    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x676858, roughness: 1 });
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 24);
    for (let index = 0; index < 24; index += 1) {
      const scale = .35 + (index % 5) * .15;
      transform.position.set(-52 + (index * 19) % 104, .2, -50 + (index * 31) % 100);
      transform.rotation.set(0, index, 0);
      transform.scale.set(scale, scale * .45, scale);
      transform.updateMatrix();
      rocks.setMatrixAt(index, transform.matrix);
    }
    rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(rocks);
  }

  BuildBlockade() {
    const group = new THREE.Group();
    for (let index = -5; index <= 5; index += 1) {
      const post = CreateBox(.22, 1.9, .22, 0x4a4639);
      post.position.set(index * 5.2, .95, 0);
      group.add(post);
    }
    for (let line = 0; line < 3; line += 1) {
      const wire = CreateBox(54, .04, .04, 0x777468);
      wire.position.set(0, .55 + line * .5, 0);
      group.add(wire);
    }
    const tower = new THREE.Group();
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => {
      const leg = CreateBox(.18, 6, .18, 0x47483e);
      leg.position.set(x, 3, z);
      leg.rotation.z = x * -.05;
      tower.add(leg);
    });
    const platform = CreateBox(3.2, .25, 3.2, 0x4f5044);
    platform.position.y = 5.5;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.3, 4),
      new THREE.MeshStandardMaterial({ color: 0x34362e, roughness: 1 }),
    );
    roof.position.y = 7;
    roof.rotation.y = Math.PI / 4;
    tower.add(platform, roof);
    tower.position.set(9, 0, 0);
    group.add(tower);
    group.position.set(13, 0, -3);
    group.rotation.y = -.24;
    this.worldRoot.add(group);

    const beamGeometry = new THREE.ConeGeometry(5.6, 32, 24, 1, true);
    beamGeometry.translate(0, -16, 0);
    beamGeometry.rotateX(Math.PI / 2);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffe6ac, transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide });
    this.blockadeBeam = new THREE.Mesh(beamGeometry, beamMaterial);
    this.blockadeBeam.position.set(15, 6, -4);
    this.blockadeBeam.rotation.y = -.6;
    this.scene.add(this.blockadeBeam);
  }

  BuildHideSite(site) {
    const group = new THREE.Group();
    if (site.id === "dryWell") {
      const well = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.6, 1.1, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x5b594b, roughness: 1, side: THREE.DoubleSide }),
      );
      well.position.y = .55;
      group.add(well);
    } else {
      for (let index = 0; index < 3; index += 1) {
        const stack = new THREE.Mesh(
          new THREE.CylinderGeometry(1.25 - index * .18, 1.5 - index * .15, 1.2, 12),
          new THREE.MeshStandardMaterial({ color: 0x9b864b, roughness: 1 }),
        );
        stack.position.y = .55 + index * .82;
        group.add(stack);
      }
    }
    group.position.set(site.x, 0, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, group);
  }

  EnsurePatrols(state) {
    state.patrols.forEach((patrol) => {
      if (this.patrolMeshes.has(patrol.id)) return;
      const group = new THREE.Group();
      for (let index = 0; index < 2; index += 1) {
        const person = CreatePerson({ bodyColor: 0x77704d, trouserColor: 0x4b4938, headwear: "helmet", helmetColor: 0x676344 });
        person.position.x = (index - .5) * 1.15;
        person.scale.setScalar(.94);
        group.add(person);
      }
      const rifle = CreateBox(.12, 1.65, .12, 0x34322a);
      rifle.rotation.z = -.5;
      rifle.position.set(.85, 1.45, .1);
      group.add(rifle);
      this.worldRoot.add(group);
      this.patrolMeshes.set(patrol.id, group);

      const coneGeometry = new THREE.CircleGeometry(
        patrolVision.distance,
        28,
        Math.PI / 2 - patrolVision.angle,
        patrolVision.angle * 2,
      );
      coneGeometry.rotateX(-Math.PI / 2);
      const cone = new THREE.Mesh(
        coneGeometry,
        new THREE.MeshBasicMaterial({ color: 0xb74735, transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.position.y = .09;
      this.worldRoot.add(cone);
      this.patrolCones.set(patrol.id, cone);
    });
  }

  UpdateCharacterAnimation(group, moving, time, phase = 0) {
    const parts = group.userData.parts;
    if (!parts) return;
    const swing = moving ? Math.sin(time * 9 + phase) * .52 : Math.sin(time * 1.5 + phase) * .025;
    parts.leftLeg.rotation.x = swing;
    parts.rightLeg.rotation.x = -swing;
    parts.leftArm.rotation.x = -swing * .7;
    parts.rightArm.rotation.x = swing * .7;
    parts.body.position.y = 1.55 + (moving ? Math.abs(Math.sin(time * 9 + phase)) * .035 : 0);
  }

  Update(state, deltaSeconds) {
    this.clockTime += deltaSeconds;
    this.EnsurePatrols(state);
    this.playerMesh.position.set(state.player.x, 0, state.player.z);
    this.playerMesh.rotation.y = state.player.yaw;
    this.playerMesh.visible = true;
    this.playerHalo.position.set(state.player.x, .11, state.player.z);
    this.playerHalo.material.opacity = state.player.hidden ? .25 : .65;
    this.UpdateCharacterAnimation(this.playerMesh, state.player.sprinting || inputState.keys.size > 0 || Math.hypot(inputState.touchX, inputState.touchY) > .1, this.clockTime);

    this.civilianMeshes.forEach((mesh, index) => {
      const civilian = state.civilians[index];
      mesh.visible = civilian && civilian.state === "following";
      if (!mesh.visible) return;
      const smoothing = 1 - Math.exp(-deltaSeconds * (3.2 - index * .16));
      const previousX = mesh.position.x;
      const previousZ = mesh.position.z;
      mesh.position.x = Lerp(mesh.position.x || civilian.x, civilian.x, smoothing);
      mesh.position.z = Lerp(mesh.position.z || civilian.z, civilian.z, smoothing);
      const moved = Math.hypot(mesh.position.x - previousX, mesh.position.z - previousZ) > .001;
      if (moved) mesh.rotation.y = Math.atan2(mesh.position.x - previousX, mesh.position.z - previousZ);
      this.UpdateCharacterAnimation(mesh, moved, this.clockTime, index * .8);
      if (civilian.wounded) mesh.rotation.z = -.08;
    });

    if (this.liaisonMesh) {
      this.liaisonMesh.visible = state.liaison.visible;
      if (state.liaison.state === "evacuating") {
        const targetX = state.player.x - Math.sin(state.player.yaw) * 4.6;
        const targetZ = state.player.z - Math.cos(state.player.yaw) * 4.6;
        this.liaisonMesh.position.x = Lerp(this.liaisonMesh.position.x, targetX, 1 - Math.exp(-deltaSeconds * 2.4));
        this.liaisonMesh.position.z = Lerp(this.liaisonMesh.position.z, targetZ, 1 - Math.exp(-deltaSeconds * 2.4));
        this.liaisonMesh.rotation.y = state.player.yaw;
        this.UpdateCharacterAnimation(this.liaisonMesh, true, this.clockTime, 1.2);
      } else {
        this.liaisonMesh.position.set(state.liaison.x, 0, state.liaison.z);
        const parts = this.liaisonMesh.userData.parts;
        if (parts) {
          parts.body.rotation.z = -.09;
          parts.leftArm.rotation.x = -.75 + Math.sin(this.clockTime * 2.3) * .12;
          parts.rightArm.rotation.x = -.92 - Math.sin(this.clockTime * 2.3) * .12;
        }
      }
    }

    state.patrols.forEach((patrol, index) => {
      const mesh = this.patrolMeshes.get(patrol.id);
      mesh.position.set(patrol.x, 0, patrol.z);
      mesh.rotation.y = patrol.yaw;
      mesh.children.forEach((child, childIndex) => {
        if (child.userData.parts) this.UpdateCharacterAnimation(child, patrol.mode !== "suspicious", this.clockTime, index + childIndex);
      });
      const cone = this.patrolCones.get(patrol.id);
      cone.position.set(patrol.x, .08, patrol.z);
      cone.rotation.y = patrol.yaw;
      cone.scale.setScalar(1);
      cone.material.opacity = patrol.alerted ? .28 : patrol.mode === "investigate" ? .2 : patrol.mode === "suspicious" ? .15 : .1;
      cone.material.color.setHex(patrol.alerted ? 0xff3e2d : patrol.mode === "patrol" ? 0xb74735 : 0xd69b45);
    });

    this.siteMarkers.forEach((marker, id) => {
      const site = siteDefinitions.find((candidate) => candidate.id === id);
      const used = Boolean(state.usedSites[id]) ||
        (site.type === "village" && state.rescued > 0) ||
        (site.type === "radioPart" && state.radioPart) ||
        (site.type === "radio" && state.radioRepaired);
      const unlocked = site.act === state.act || (site.type === "radio" && state.act === 3);
      const repeatingRadio = site.type === "radio" && state.act === 3 && state.signalsConfirmed < 3;
      marker.visible = unlocked && (repeatingRadio || !used || site.type === "exit");
      marker.userData.ring.rotation.z += deltaSeconds * .8;
      marker.userData.ring.material.opacity = .55 + Math.sin(this.clockTime * 2.4) * .2;
      marker.userData.beam.scale.y = .85 + Math.sin(this.clockTime * 1.7) * .15;
      const distance = GetDistance(state.player, site);
      marker.children.forEach((child) => {
        if (child.isSprite) child.visible = distance < 28;
      });
    });

    const villageVisual = this.siteVisuals.get("wujiaVillage");
    villageVisual.tiedVillagers.visible = state.rescued <= 0 && state.villageState !== "burned";
    if (["burned", "evacuatedBurned"].includes(state.villageState) && !villageVisual.burned) {
      villageVisual.burned = true;
      const burnedHouse = villageVisual.houses[0];
      burnedHouse.children.forEach((child, index) => {
        if (child.isMesh && child.material?.color) child.material.color.setHex(index === 1 ? 0x24251f : 0x48443a);
      });
      if (burnedHouse.children[1]) burnedHouse.children[1].rotation.z = .32;
      const fire = CreateFire(1.2);
      fire.position.set(-29, 0, -7);
      this.fireGroups.push(fire);
      this.worldRoot.add(fire);
    }

    this.fireGroups.forEach((fire, fireIndex) => {
      fire.children.forEach((child) => {
        if (child.userData.phase !== undefined) {
          child.scale.y = .82 + Math.sin(this.clockTime * 7 + child.userData.phase + fireIndex) * .2;
          child.material.opacity = .68 + Math.sin(this.clockTime * 5 + child.userData.phase) * .15;
        }
        if (child.userData.smokePhase !== undefined) {
          const cycle = (this.clockTime * .32 + child.userData.smokePhase) % 2.8;
          child.position.y = child.userData.smokeBaseY + cycle * .75;
          child.material.opacity = Math.max(0, .32 - cycle * .09);
          child.rotation.y += deltaSeconds * .18;
        }
      });
    });

    if (this.blockadeBeam) {
      this.blockadeBeam.rotation.y = -.55 + Math.sin(this.clockTime * .24) * 1.1;
      this.blockadeBeam.material.opacity = state.finalPressure ? .14 : .075;
    }
    this.UpdateCamera(state, deltaSeconds);
    this.renderer.render(this.scene, this.camera);
  }

  UpdateMenu(deltaSeconds) {
    this.clockTime += deltaSeconds;
    const orbit = this.clockTime * .035;
    this.camera.position.set(-37 + Math.sin(orbit) * 8, 13, -52 + Math.cos(orbit) * 5);
    this.camera.lookAt(-32, 1.5, -8);
    this.fireGroups.forEach((fire, fireIndex) => {
      fire.children.forEach((child) => {
        if (child.userData.phase !== undefined) child.scale.y = .85 + Math.sin(this.clockTime * 7 + child.userData.phase + fireIndex) * .2;
      });
    });
    if (this.blockadeBeam) this.blockadeBeam.rotation.y = -.5 + Math.sin(this.clockTime * .18) * .8;
    this.renderer.render(this.scene, this.camera);
  }

  UpdateCamera(state, deltaSeconds) {
    const target = new THREE.Vector3(state.player.x, 1.65, state.player.z);
    this.cameraTarget.lerp(target, 1 - Math.exp(-deltaSeconds * 7));
    const authoredDistance = state.activeInteraction ? 7.7 : state.rescued > 0 ? 12.3 : 10.6;
    this.cameraDistance = Lerp(this.cameraDistance, authoredDistance, 1 - Math.exp(-deltaSeconds * 4));
    const desiredFov = state.activeInteraction ? 50 : state.act === 3 ? 57 : 54;
    if (Math.abs(this.camera.fov - desiredFov) > .05) {
      this.camera.fov = Lerp(this.camera.fov, desiredFov, 1 - Math.exp(-deltaSeconds * 3));
      this.camera.updateProjectionMatrix();
    }
    let safeDistance = this.cameraDistance;
    const directionX = -Math.sin(this.cameraYaw);
    const directionZ = -Math.cos(this.cameraYaw);
    obstacleDefinitions.forEach((obstacle) => {
      const relativeX = obstacle.x - this.cameraTarget.x;
      const relativeZ = obstacle.z - this.cameraTarget.z;
      const along = relativeX * directionX + relativeZ * directionZ;
      if (along <= 0 || along >= safeDistance) return;
      const side = Math.abs(relativeX * directionZ - relativeZ * directionX);
      if (side < obstacle.radius + .7) safeDistance = Math.max(4.2, along - obstacle.radius - .8);
    });
    const horizontalDistance = Math.cos(this.cameraPitch) * safeDistance;
    const desired = new THREE.Vector3(
      this.cameraTarget.x + directionX * horizontalDistance,
      this.cameraTarget.y + Math.sin(this.cameraPitch) * safeDistance,
      this.cameraTarget.z + directionZ * horizontalDistance,
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-deltaSeconds * 8));
    this.camera.lookAt(this.cameraTarget);
  }

  RotateCamera(deltaX, deltaY) {
    this.cameraYaw -= deltaX * .006;
    this.cameraPitch = Clamp(this.cameraPitch + deltaY * .0045, .28, .85);
  }

  GetMovementAxes() {
    const forward = { x: Math.sin(this.cameraYaw), z: Math.cos(this.cameraYaw) };
    const right = { x: Math.cos(this.cameraYaw), z: -Math.sin(this.cameraYaw) };
    let forwardInput = 0;
    let rightInput = 0;
    if (inputState.keys.has("KeyW") || inputState.keys.has("ArrowUp")) forwardInput += 1;
    if (inputState.keys.has("KeyS") || inputState.keys.has("ArrowDown")) forwardInput -= 1;
    if (inputState.keys.has("KeyD") || inputState.keys.has("ArrowRight")) rightInput += 1;
    if (inputState.keys.has("KeyA") || inputState.keys.has("ArrowLeft")) rightInput -= 1;
    forwardInput += -inputState.touchY;
    rightInput += inputState.touchX;
    return {
      moveX: forward.x * forwardInput + right.x * rightInput,
      moveZ: forward.z * forwardInput + right.z * rightInput,
    };
  }

  Resize() {
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}

const worldRenderer = new WorldRenderer(elements.canvas);

function FormatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function EscapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function ShowCaption(event) {
  clearTimeout(captionTimeout);
  elements.captionTitle.textContent = event.title;
  elements.captionText.textContent = event.body;
  elements.narrativeCaption.classList.remove("hidden");
  captionTimeout = setTimeout(() => elements.narrativeCaption.classList.add("hidden"), event.tone === "loss" ? 7600 : 6100);
}

function ProcessEvents(state) {
  const newEvents = state.events.filter((event) => event.id > lastEventId);
  if (!newEvents.length) return;
  newEvents.forEach((event) => {
    lastEventId = Math.max(lastEventId, event.id);
    ShowCaption(event);
    elements.screenReaderStatus.textContent = `${event.title}。${event.body}`;
  });
  const recentEvents = state.events.slice(-3).reverse();
  elements.eventLog.innerHTML = recentEvents.map((event) => `
    <article class="eventCard ${EscapeHtml(event.tone)}">
      <strong>${EscapeHtml(event.title)}</strong>
      <small>${EscapeHtml(event.body)}</small>
    </article>
  `).join("");
}

function UpdateObjectives(state) {
  elements.actLabel.textContent = GetActLabel(state);
  elements.objectiveList.innerHTML = GetObjectives(state).map((objective) => `
    <div class="objectiveItem${objective.complete ? " complete" : ""}${objective.urgent ? " urgent" : ""}">
      <strong>${EscapeHtml(objective.label)}</strong>
      <small>${EscapeHtml(objective.detail)}</small>
    </div>
  `).join("");
}

function GetNearestLocation(state) {
  let nearest = siteDefinitions[0];
  let nearestDistance = Infinity;
  siteDefinitions.forEach((site) => {
    const distance = GetDistance(state.player, site);
    if (distance < nearestDistance) {
      nearest = site;
      nearestDistance = distance;
    }
  });
  if (nearestDistance > 14) return { name: "封锁线间的田野" };
  return nearest;
}

function UpdateInterface(state) {
  elements.civilianValue.textContent = String(state.rescued);
  elements.grainValue.textContent = String(state.grain);
  elements.woundedValue.textContent = String(state.wounded);
  elements.alertValue.textContent = String(Math.round(state.alert));
  elements.timeValue.textContent = FormatTime(state.remaining);
  elements.healthFill.style.width = `${state.player.health}%`;
  elements.hopeValue.textContent = String(Math.round(state.hope));
  elements.conditionText.textContent = state.activeInteraction ? `正在行动 · ${Math.round(state.activeInteraction.progress / state.activeInteraction.duration * 100)}%` : state.player.hidden ? "隐蔽中 · 呼吸放轻" : state.player.health < 35 ? "伤势严重 · 必须撤离" : state.alert > 70 ? "搜索逼近 · 不要跑上公路" : "带伤行动 · 先救乡亲";
  elements.locationLabel.querySelector("strong").textContent = GetNearestLocation(state).name;
  UpdateObjectives(state);
  ProcessEvents(state);

  const nearbySite = FindNearbySite(state);
  const action = GetSiteAction(state, nearbySite);
  const canShowAction = action && (!action.disabled || state.activeInteraction?.siteId === nearbySite?.id);
  elements.interactionPrompt.classList.toggle("hidden", !canShowAction);
  if (canShowAction) elements.interactionText.textContent = action.label;
  elements.detectedWarning.classList.toggle("hidden", !state.patrols.some((patrol) => patrol.alerted));

  if (state.ended && !resultShown) ShowResults(state);
}

function SetGameUiVisible(visible) {
  [elements.topBar, elements.objectivePanel, elements.conditionPanel, elements.eventLog, elements.locationLabel, elements.controlHint, elements.touchControls].forEach((element) => element.classList.toggle("hidden", !visible));
  if (!visible) {
    elements.interactionPrompt.classList.add("hidden");
    elements.detectedWarning.classList.add("hidden");
    elements.narrativeCaption.classList.add("hidden");
  }
}

function StartGame() {
  gameState = CreateGameState({ difficulty: selectedDifficulty });
  gameMode = "playing";
  resultShown = false;
  lastEventId = 0;
  inputState.keys.clear();
  elements.startScreen.classList.add("hidden");
  CloseModal();
  SetGameUiVisible(true);
  UpdateInterface(gameState);
  elements.canvas.focus({ preventScroll: true });
}

function ReturnToTitle() {
  gameMode = "menu";
  gameState = null;
  resultShown = false;
  CloseModal();
  SetGameUiVisible(false);
  elements.startScreen.classList.remove("hidden");
  elements.startButton.focus({ preventScroll: true });
}

function RestartGame() {
  CloseModal();
  StartGame();
}

function OpenModal(modal, options = {}) {
  if (!modal) return;
  returnModal = options.returnTo || null;
  if (currentModal) currentModal.classList.add("hidden");
  currentModal = modal;
  elements.modalLayer.classList.remove("hidden");
  modal.classList.remove("hidden");
  if (gameState && gameMode === "playing") gameState.paused = true;
  requestAnimationFrame(() => modal.querySelector("button, a")?.focus());
}

function CloseModal(options = {}) {
  if (currentModal) currentModal.classList.add("hidden");
  currentModal = null;
  elements.modalLayer.classList.add("hidden");
  if (gameState && gameMode === "playing" && !gameState.ended && options.resume !== false) gameState.paused = false;
  if (gameMode === "playing") elements.canvas.focus({ preventScroll: true });
}

function CloseArchive() {
  if (returnModal) {
    const target = returnModal;
    returnModal = null;
    OpenModal(target);
  } else {
    CloseModal();
  }
}

function PauseGame() {
  if (gameMode !== "playing" || gameState?.ended) return;
  OpenModal(elements.pauseModal);
}

function ShowResults(state) {
  resultShown = true;
  const evaluation = GetEvaluation(state);
  elements.resultEyebrow.textContent = state.success ? "群众撤离报告 / 行动完成" : "群众撤离报告 / 行动中断";
  elements.resultTitle.textContent = state.success ? (state.endingId === "network" ? "火种越过封锁线" : "有人抵达，也有人没能回来") : state.endingId === "captured" ? "封锁线吞没了消息" : "合围封闭";
  const latest = state.events[state.events.length - 1];
  elements.resultSummary.textContent = latest?.body || "这次行动已经结束。";
  elements.resultScore.textContent = state.success ? "火种续存" : state.safe >= 4 ? "人存网断" : "转移中断";
  const metrics = [
    ["群众安全", state.safe >= 4 ? "完整" : state.safe > 0 ? "受损" : "未抵达"],
    ["村际联络", state.contactsPreserved >= 2 ? "接续" : "中断"],
    ["名单保护", state.rosterDestroyed ? "完成" : "未完成"],
    ["隐蔽纪律", evaluation.discipline >= 72 ? "守住" : "暴露"],
  ];
  elements.resultMetrics.innerHTML = metrics.map(([label, value]) => `<div class="resultMetric"><small>${label}</small><strong>${value}</strong></div>`).join("");
  elements.resultReflection.textContent = state.success
    ? `王婶、赵满仓、小满、小禾、白杏逐一报了平安。受伤的共产党员林砚把联络接到下一村。没有“孤胆英雄”，只有普通人用熟悉的沟路、种粮和互助把彼此接了出去。`
    : `侵华日军的封锁截断了这次转移。${state.lost > 0 ? "仍有名字失去消息，" : "仍有人困在村中，"}结算不把他们换算成奖励或扣分；名单只记录谁还需要被寻找。`;
  OpenModal(elements.resultModal, { returnTo: null });
}

function TriggerInteract() {
  if (!gameState || gameState.paused || gameState.ended) return;
  const site = FindNearbySite(gameState);
  if (site && InteractWithSite(gameState, site.id)) UpdateInterface(gameState);
}

function TriggerDistraction() {
  if (!gameState || gameState.paused || gameState.ended) return;
  if (ThrowDistraction(gameState)) {
    elements.screenReaderStatus.textContent = "石块落地，附近巡逻会前往查看。";
  }
}

function TriggerMedicine() {
  if (!gameState || gameState.paused || gameState.ended) return;
  UseMedicine(gameState);
  UpdateInterface(gameState);
}

function HandleKeyDown(event) {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space", "KeyE", "KeyH"].includes(event.code)) event.preventDefault();
  if (event.code === "Escape") {
    if (currentModal === elements.historyModal) CloseArchive();
    else if (currentModal) CloseModal();
    else PauseGame();
    return;
  }
  if (gameMode === "menu" && event.code === "Enter") {
    StartGame();
    return;
  }
  if (currentModal) return;
  inputState.keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "KeyE") TriggerInteract();
  if (event.code === "Space") TriggerDistraction();
  if (event.code === "KeyH") TriggerMedicine();
}

function HandleKeyUp(event) {
  inputState.keys.delete(event.code);
}

function UpdateTouchStick(event) {
  const bounds = elements.moveStick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const maximum = bounds.width * .34;
  const deltaX = event.clientX - centerX;
  const deltaY = event.clientY - centerY;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const scale = Math.min(maximum, distance) / distance;
  const x = deltaX * scale;
  const y = deltaY * scale;
  inputState.touchX = x / maximum;
  inputState.touchY = y / maximum;
  elements.moveStick.querySelector("i").style.transform = `translate(${x}px, ${y}px)`;
}

function ReleaseTouchStick(event) {
  if (event.pointerId !== inputState.stickPointerId) return;
  inputState.stickPointerId = null;
  inputState.touchX = 0;
  inputState.touchY = 0;
  elements.moveStick.querySelector("i").style.transform = "translate(0,0)";
}

function HandleCanvasPointerDown(event) {
  if (gameMode !== "playing" || currentModal) return;
  if (event.pointerType === "touch" && event.clientX < innerWidth * .45) return;
  inputState.cameraPointerId = event.pointerId;
  inputState.cameraLastX = event.clientX;
  inputState.cameraLastY = event.clientY;
  elements.canvas.setPointerCapture(event.pointerId);
}

function HandleCanvasPointerMove(event) {
  if (event.pointerId !== inputState.cameraPointerId) return;
  const deltaX = event.clientX - inputState.cameraLastX;
  const deltaY = event.clientY - inputState.cameraLastY;
  inputState.cameraLastX = event.clientX;
  inputState.cameraLastY = event.clientY;
  worldRenderer.RotateCamera(deltaX, deltaY);
}

function HandleCanvasPointerUp(event) {
  if (event.pointerId === inputState.cameraPointerId) inputState.cameraPointerId = null;
}

function ResetInput() {
  inputState.keys.clear();
  inputState.touchX = 0;
  inputState.touchY = 0;
  inputState.cameraPointerId = null;
  inputState.stickPointerId = null;
  elements.moveStick.querySelector("i").style.transform = "translate(0,0)";
}

function WireInterface() {
  elements.startButton.addEventListener("click", StartGame);
  elements.startHistoryButton.addEventListener("click", () => OpenModal(elements.historyModal));
  elements.historyButton.addEventListener("click", () => OpenModal(elements.historyModal));
  elements.pauseHistoryButton.addEventListener("click", () => OpenModal(elements.historyModal, { returnTo: elements.pauseModal }));
  elements.resultHistoryButton.addEventListener("click", () => OpenModal(elements.historyModal, { returnTo: elements.resultModal }));
  elements.pauseButton.addEventListener("click", PauseGame);
  elements.resumeButton.addEventListener("click", () => CloseModal());
  elements.restartButton.addEventListener("click", RestartGame);
  elements.resultRestartButton.addEventListener("click", RestartGame);
  elements.returnTitleButton.addEventListener("click", ReturnToTitle);
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", CloseArchive));
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDifficulty = button.dataset.difficulty;
      document.querySelectorAll("[data-difficulty]").forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle("selected", selected);
        candidate.setAttribute("aria-checked", String(selected));
      });
    });
  });

  elements.touchInteract.addEventListener("pointerdown", TriggerInteract);
  elements.touchDistract.addEventListener("pointerdown", TriggerDistraction);
  elements.touchMedicine.addEventListener("pointerdown", TriggerMedicine);
  elements.moveStick.addEventListener("pointerdown", (event) => {
    inputState.stickPointerId = event.pointerId;
    elements.moveStick.setPointerCapture(event.pointerId);
    UpdateTouchStick(event);
  });
  elements.moveStick.addEventListener("pointermove", (event) => {
    if (event.pointerId === inputState.stickPointerId) UpdateTouchStick(event);
  });
  elements.moveStick.addEventListener("pointerup", ReleaseTouchStick);
  elements.moveStick.addEventListener("pointercancel", ReleaseTouchStick);
  elements.canvas.addEventListener("pointerdown", HandleCanvasPointerDown);
  elements.canvas.addEventListener("pointermove", HandleCanvasPointerMove);
  elements.canvas.addEventListener("pointerup", HandleCanvasPointerUp);
  elements.canvas.addEventListener("pointercancel", HandleCanvasPointerUp);
  elements.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  addEventListener("keydown", HandleKeyDown);
  addEventListener("keyup", HandleKeyUp);
  addEventListener("resize", () => worldRenderer.Resize());
  addEventListener("blur", ResetInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameMode === "playing" && !currentModal) PauseGame();
  });
}

function Frame(timestamp) {
  const deltaSeconds = Clamp((timestamp - lastFrameTime) / 1000, 0, .05);
  lastFrameTime = timestamp;
  if (gameMode === "playing" && gameState) {
    const movement = worldRenderer.GetMovementAxes();
    StepGame(gameState, deltaSeconds, {
      ...movement,
      sprint: inputState.keys.has("ShiftLeft") || inputState.keys.has("ShiftRight"),
      touch: Math.hypot(inputState.touchX, inputState.touchY) > .1,
    });
    worldRenderer.Update(gameState, deltaSeconds);
    UpdateInterface(gameState);
  } else {
    worldRenderer.UpdateMenu(deltaSeconds);
  }
  requestAnimationFrame(Frame);
}

function FinishLoading() {
  elements.loadingFill.style.width = "42%";
  elements.loadingText.textContent = "放置村庄、沟渠与封锁据点…";
  setTimeout(() => {
    elements.loadingFill.style.width = "78%";
    elements.loadingText.textContent = "接通群众状态与巡逻逻辑…";
  }, 180);
  setTimeout(() => {
    elements.loadingFill.style.width = "100%";
    elements.loadingText.textContent = "准备就绪";
    elements.loadingScreen.classList.add("ready");
    setTimeout(() => elements.loadingScreen.remove(), 650);
  }, 420);
}

function Bootstrap() {
  WireInterface();
  SetGameUiVisible(false);
  FinishLoading();
  requestAnimationFrame(Frame);
}

Bootstrap();
